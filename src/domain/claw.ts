import { AppError, type ClawLevel, type ClawPrize, type ClawRound, type ClawSettings, type ClawWin } from '../backend/types';
import { STICKER_PACKS } from './stickers';
import { WARDROBE_ENTRIES } from './wardrobe';

/**
 * 인형뽑기: 순발력과 타이밍 게임.
 * 집게가 왼쪽 아래(0, 0)에서 출발해 오른쪽으로 가다가, 버튼을 누르면 그 자리에서 위로 간다.
 * 다시 누르면 멈추고 집는다. 목표 상자 위에 멈췄을 때만 잡고, 옮기다 떨어뜨릴 수 있으며,
 * 출구까지 오면 상자가 열려 내용물(코인, 꾸미기, 스티커 팩, 현실 보상)을 받는다.
 *
 * 판정 계산은 여기 순수 함수로 두고, 화면·체험 모드·서버(Cloud Functions)·테스트가 함께 쓴다.
 * 판(round)의 목표 위치와 속도는 서버가 정하고, 폰은 "버튼을 누른 시각(ms)"만 보낸다.
 */

/** 게임판 크기(가로·세로 0~100) */
export const BOARD = 100;
/** 판이 시작된 뒤 이 시간이 지나면 끝내지 못한 것으로 친다 */
export const ROUND_TIMEOUT_MS = 2 * 60_000;
export const MAX_CLAW_PRICE = 1000;
export const MAX_CLAW_PER_DAY = 20;
export const MAX_CLAW_PRIZES = 8;
export const MAX_CLAW_COINS = 1000;
export const MAX_CLAW_TITLE = 20;
export const MAX_DROP_RATE = 90;

export interface LevelSpec {
  name: string;
  /** 목표 상자 중심에서 이만큼(가로·세로 각각) 안에 멈추면 잡는다 */
  reach: number;
  /** 가로·세로 속도(칸/초)의 범위. 판마다 이 안에서 정해진다 */
  speed: [number, number];
  /** 위로 갈 때 좌우로 흔들리는 폭(칸) */
  wobble: number;
  /** 통신이 늦어 버튼 누른 시각이 늦게 잡혀도 봐주는 시간(ms) */
  lagMs: number;
}

export const LEVELS: Record<ClawLevel, LevelSpec> = {
  easy: { name: '쉬움', reach: 9, speed: [18, 24], wobble: 0, lagMs: 150 },
  normal: { name: '보통', reach: 6, speed: [24, 34], wobble: 2, lagMs: 120 },
  hard: { name: '어려움', reach: 4, speed: [32, 44], wobble: 3.5, lagMs: 90 },
};
export const LEVEL_ORDER: ClawLevel[] = ['easy', 'normal', 'hard'];

export const DEFAULT_CLAW: ClawSettings = {
  on: false,
  price: 10,
  perDay: 3,
  level: 'normal',
  dropRate: 20,
  fallbackCoins: 20,
  prizes: [
    { kind: 'coin', amount: 5, weight: 40 },
    { kind: 'coin', amount: 20, weight: 25 },
    { kind: 'coin', amount: 50, weight: 10 },
    { kind: 'wardrobe', weight: 15 },
    { kind: 'sticker', weight: 10 },
  ],
};

// ── 난수 ─────────────────────────────────────────────────────────────────────

/** 씨앗값으로 늘 같은 순서를 내는 난수(0 이상 1 미만). 테스트와 화면 장식에 쓴다. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (random: () => number, min: number, max: number) => min + (max - min) * random();

// ── 판 만들기와 집게 위치 ───────────────────────────────────────────────────

export type RoundSpec = Pick<ClawRound, 'level' | 'target' | 'vx' | 'vy' | 'wobblePeriod' | 'wobblePhase' | 'seed'>;

/** 새 판의 목표 위치와 속도를 정한다(서버나 체험 모드가 부른다). */
export function makeRound(level: ClawLevel, random: () => number): RoundSpec {
  const spec = LEVELS[level];
  return {
    level,
    // 목표는 출발점과 벽에서 조금 떨어진 곳에
    target: { x: Math.round(between(random, 28, 88)), y: Math.round(between(random, 28, 88)) },
    vx: Math.round(between(random, spec.speed[0], spec.speed[1]) * 10) / 10,
    vy: Math.round(between(random, spec.speed[0], spec.speed[1]) * 10) / 10,
    wobblePeriod: Math.round(between(random, 700, 1100)),
    wobblePhase: Math.round(between(random, 0, 628)) / 100,
    seed: Math.floor(random() * 2 ** 31),
  };
}

const clampBoard = (v: number) => Math.max(0, Math.min(BOARD, v));

/** 위로 갈 때의 좌우 흔들림(칸). up = 위로 가기 시작한 뒤 지난 시간(ms) */
function sway(round: RoundSpec, upMs: number): number {
  const amp = LEVELS[round.level].wobble;
  if (amp === 0 || upMs <= 0) return 0;
  return amp * Math.sin((2 * Math.PI * upMs) / round.wobblePeriod + round.wobblePhase);
}

/**
 * 시각 t(ms)의 집게 위치. press1 = 첫 번째 버튼(오른쪽→위로 바꿈), press2 = 두 번째 버튼(멈춤).
 * 아직 누르지 않은 버튼은 null.
 */
export function clawAt(round: RoundSpec, t: number, press1: number | null, press2: number | null): { x: number; y: number } {
  const turn = press1 ?? t;
  const x0 = clampBoard((round.vx * Math.max(0, Math.min(t, turn))) / 1000);
  if (press1 === null || t <= press1) return { x: x0, y: 0 };
  const end = press2 === null ? t : Math.min(t, press2);
  const upMs = end - press1;
  return { x: clampBoard(x0 + sway(round, upMs)), y: clampBoard((round.vy * upMs) / 1000) };
}

/** 집게가 목표 위에 멈췄는지(꼭 맞는 시각 기준) */
export function onTarget(round: RoundSpec, press1: number, press2: number): boolean {
  const { x, y } = clawAt(round, press2, press1, press2);
  const reach = LEVELS[round.level].reach;
  return Math.abs(x - round.target.x) <= reach && Math.abs(y - round.target.y) <= reach;
}

/**
 * 잡았는지 판정. 버튼 누른 시각은 통신 때문에 늦게 잡힐 수 있으므로,
 * 각 버튼을 0~lagMs 만큼 앞당긴 경우 가운데 하나라도 목표 위면 잡은 것으로 본다.
 */
export function isCatch(round: RoundSpec, press1: number, press2: number, lagMs = LEVELS[round.level].lagMs): boolean {
  if (!(press1 >= 0 && press2 > press1)) return false;
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const p1 = Math.max(0, press1 - (lagMs * i) / steps);
    for (let j = 0; j <= steps; j++) {
      const p2 = press2 - (lagMs * j) / steps;
      if (p2 > p1 && onTarget(round, p1, p2)) return true;
    }
  }
  return false;
}

// ── 상품 ─────────────────────────────────────────────────────────────────────

/** 가중치에 따라 상품 하나를 고른다. 가중치 합이 0이면 null */
export function pickPrize(prizes: ClawPrize[], random: () => number): ClawPrize | null {
  const total = prizes.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  if (total <= 0) return null;
  let roll = random() * total;
  for (const prize of prizes) {
    roll -= Math.max(0, prize.weight);
    if (roll < 0) return prize;
  }
  return prizes[prizes.length - 1];
}

/** 이 상품 칸의 이름(부모 설정 화면과 결과 화면) */
export function prizeLabel(prize: ClawPrize): string {
  switch (prize.kind) {
    case 'coin':
      return `코인 ${prize.amount ?? 0}개`;
    case 'wardrobe':
      return '꾸미기 아이템';
    case 'sticker':
      return '스티커 팩';
    case 'reward':
      return prize.title ?? '현실 보상';
  }
}

/** 한 판 했을 때 평균으로 돌려받는 코인(부모 화면 참고용). 꾸미기·스티커·현실 보상은 대신 주는 코인으로 셈한다 */
export function expectedCoins(settings: ClawSettings, catchRate: number): number {
  const total = settings.prizes.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0) return 0;
  const perBox = settings.prizes.reduce((sum, p) => sum + (p.weight / total) * (p.kind === 'coin' ? (p.amount ?? 0) : settings.fallbackCoins), 0);
  return catchRate * (1 - settings.dropRate / 100) * perBox;
}

// ── 설정 ─────────────────────────────────────────────────────────────────────

const isInt = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

/** 저장된 값이 없거나 일부만 있어도 완전한 설정을 돌려준다. */
export function normalizeClaw(raw: unknown): ClawSettings {
  const r = (raw ?? {}) as Partial<ClawSettings>;
  const prizes = Array.isArray(r.prizes)
    ? r.prizes
        .filter((p): p is ClawPrize => !!p && typeof p === 'object' && ['coin', 'wardrobe', 'sticker', 'reward'].includes((p as ClawPrize).kind))
        .slice(0, MAX_CLAW_PRIZES)
        .map((p) => ({
          kind: p.kind,
          weight: isInt(p.weight, 0, 100) ? p.weight : 0,
          ...(p.kind === 'coin' ? { amount: isInt(p.amount, 1, MAX_CLAW_COINS) ? p.amount : 1 } : {}),
          ...(p.kind === 'reward' ? { title: typeof p.title === 'string' ? p.title.slice(0, MAX_CLAW_TITLE) : '현실 보상' } : {}),
        }))
    : DEFAULT_CLAW.prizes;
  return {
    on: r.on === true,
    price: isInt(r.price, 0, MAX_CLAW_PRICE) ? r.price : DEFAULT_CLAW.price,
    perDay: isInt(r.perDay, 0, MAX_CLAW_PER_DAY) ? r.perDay : DEFAULT_CLAW.perDay,
    level: r.level && r.level in LEVELS ? r.level : DEFAULT_CLAW.level,
    dropRate: isInt(r.dropRate, 0, MAX_DROP_RATE) ? r.dropRate : DEFAULT_CLAW.dropRate,
    fallbackCoins: isInt(r.fallbackCoins, 1, MAX_CLAW_COINS) ? r.fallbackCoins : DEFAULT_CLAW.fallbackCoins,
    prizes,
  };
}

/** 부모가 설정을 저장하기 전에 검사한다. */
export function cleanClaw(input: ClawSettings): ClawSettings {
  if (!isInt(input.price, 0, MAX_CLAW_PRICE)) throw new AppError(`한 판 가격은 0부터 ${MAX_CLAW_PRICE} 코인 사이로 정해 주세요.`);
  if (!isInt(input.perDay, 0, MAX_CLAW_PER_DAY)) throw new AppError(`하루 횟수는 0(제한 없음)부터 ${MAX_CLAW_PER_DAY}번 사이로 정해 주세요.`);
  if (!(input.level in LEVELS)) throw new AppError('난이도를 골라 주세요.');
  if (!isInt(input.dropRate, 0, MAX_DROP_RATE)) throw new AppError(`떨어뜨릴 확률은 0부터 ${MAX_DROP_RATE}% 사이로 정해 주세요.`);
  if (!isInt(input.fallbackCoins, 1, MAX_CLAW_COINS)) throw new AppError(`대신 줄 코인은 1부터 ${MAX_CLAW_COINS} 사이로 정해 주세요.`);
  if (input.prizes.length === 0) throw new AppError('상품을 하나 이상 넣어 주세요.');
  if (input.prizes.length > MAX_CLAW_PRIZES) throw new AppError(`상품은 ${MAX_CLAW_PRIZES}개까지 넣을 수 있어요.`);
  const prizes = input.prizes.map((p): ClawPrize => {
    if (!isInt(p.weight, 0, 100)) throw new AppError('확률은 0부터 100% 사이로 적어 주세요.');
    if (p.kind === 'coin') {
      if (!isInt(p.amount, 1, MAX_CLAW_COINS)) throw new AppError(`상품 코인은 1부터 ${MAX_CLAW_COINS} 사이로 적어 주세요.`);
      return { kind: 'coin', amount: p.amount, weight: p.weight };
    }
    if (p.kind === 'reward') {
      const title = (p.title ?? '').trim();
      if (!title) throw new AppError('현실 보상의 이름을 적어 주세요.');
      if (title.length > MAX_CLAW_TITLE) throw new AppError(`현실 보상 이름은 ${MAX_CLAW_TITLE}자까지 쓸 수 있어요.`);
      return { kind: 'reward', title, weight: p.weight };
    }
    return { kind: p.kind, weight: p.weight };
  });
  const total = prizes.reduce((sum, p) => sum + p.weight, 0);
  if (total !== 100) throw new AppError(`상품 확률의 합이 100%가 되어야 해요. 지금 ${total}%예요.`);
  return { on: input.on === true, price: input.price, perDay: input.perDay, level: input.level, dropRate: input.dropRate, fallbackCoins: input.fallbackCoins, prizes };
}

/** 오늘 이 사람이 한 판 수 */
export const playsToday = (rounds: Pick<ClawRound, 'uid' | 'day'>[], uid: string, day: string) =>
  rounds.filter((r) => r.uid === uid && r.day === day).length;

/** 새 판을 시작할 수 없는 이유(없으면 null). 부모는 연습이라 막지 않는다 */
export function cannotStart(settings: ClawSettings, isParent: boolean, freeCoins: number, todayPlays: number): string | null {
  if (isParent) return null;
  if (!settings.on) return '지금은 인형뽑기를 할 수 없어요.';
  if (settings.perDay > 0 && todayPlays >= settings.perDay) return `오늘은 ${settings.perDay}번 다 했어요. 내일 또 해요!`;
  if (freeCoins < settings.price) return `코인이 ${settings.price - freeCoins}개 모자라요.`;
  return null;
}

/**
 * 뽑힌 상품 칸을 실제로 줄 것으로 바꾼다.
 * 꾸미기·스티커는 아직 없고 숨기지 않은 것 가운데 하나, 다 가졌으면 대신 코인.
 * 현실 보상의 주문 번호(orderId)는 지급하는 쪽이 채운다.
 */
export function chooseWin(
  prize: ClawPrize,
  owned: { wardrobe: string[]; stickerPacks: string[] },
  hidden: { wardrobe: string[]; stickerPacks: string[] },
  fallbackCoins: number,
  random: () => number,
): ClawWin {
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  if (prize.kind === 'coin') return { kind: 'coin', amount: prize.amount ?? 0 };
  if (prize.kind === 'reward') return { kind: 'reward', title: prize.title ?? '현실 보상', orderId: '' };
  if (prize.kind === 'wardrobe') {
    const left = WARDROBE_ENTRIES.filter((e) => !owned.wardrobe.includes(e.id) && !hidden.wardrobe.includes(e.id));
    if (left.length > 0) {
      const entry = pick(left);
      return { kind: 'wardrobe', itemId: entry.id, name: entry.name };
    }
  } else {
    const left = STICKER_PACKS.filter((p) => !owned.stickerPacks.includes(p.id) && !hidden.stickerPacks.includes(p.id));
    if (left.length > 0) {
      const pack = pick(left);
      return { kind: 'sticker', packId: pack.id, name: pack.name };
    }
  }
  return { kind: 'coin', amount: fallbackCoins, converted: true };
}

/** 결과 화면의 이름 */
export function winLabel(win: ClawWin): string {
  switch (win.kind) {
    case 'coin':
      return `${win.amount}코인`;
    case 'wardrobe':
    case 'sticker':
      return win.name;
    case 'reward':
      return win.title;
  }
}
