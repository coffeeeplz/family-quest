import { AppError, type ClawPrize, type ClawPreset, type ClawRound, type ClawSettings, type ClawTune, type ClawWin } from '../backend/types';
import { STICKER_PACKS } from './stickers';
import { WARDROBE_ENTRIES } from './wardrobe';

/**
 * 인형뽑기: 순발력과 타이밍 게임.
 * 집게가 왼쪽 아래(0, 0)에서 출발해 오른쪽으로 가다가, 버튼을 누르면 그 자리에서 위로 간다.
 * 다시 누르면 멈추고 집는다. 집게 조준점이 아무 상자의 잡히는 범위(점선 네모) 안에 멈췄을 때만 잡고,
 * 옮기다 떨어뜨릴 수 있으며, 출구까지 오면 상자가 열려 내용물(코인, 꾸미기, 스티커 팩, 현실 보상)을 받는다.
 *
 * 판정 계산은 여기 순수 함수로 두고, 화면·체험 모드·서버(Cloud Functions)·테스트가 함께 쓴다.
 * 판(round)의 상자 자리·속도·잡히는 범위는 시작할 때 정해 판에 적고, 폰은 "버튼을 누른 시각(ms)"만 보낸다.
 */

/** 게임판 크기(가로·세로 0~100) */
export const BOARD = 100;
/** 판이 시작된 뒤 이 시간이 지나면 끝내지 못한 것으로 친다 */
export const ROUND_TIMEOUT_MS = 2 * 60_000;
/** 통신이 늦어 버튼 누른 시각이 늦게 잡혀도 봐주는 시간(ms) */
export const LAG_MS = 130;
export const MAX_CLAW_PRICE = 1000;
export const MAX_CLAW_PER_DAY = 20;
export const MAX_CLAW_PRIZES = 8;
export const MAX_CLAW_COINS = 1000;
export const MAX_CLAW_TITLE = 20;
export const MAX_DROP_RATE = 90;
export const MAX_PRESETS = 5;
export const MAX_PRESET_NAME = 10;
export const MAX_PRACTICE_PER_DAY = 99;
/** 연습 횟수 무제한 */
export const PRACTICE_UNLIMITED = -1;

/** 세부 옵션의 범위(설정 화면의 슬라이더와 검사에 같이 쓴다) */
export const TUNE_LIMITS = {
  reach: { min: 1, max: 15, step: 0.5 },
  speed: { min: 8, max: 50, step: 1 },
  wobble: { min: 0, max: 6, step: 0.5 },
  boxes: { min: 3, max: 8, step: 1 },
  grabMs: { min: 500, max: 4000, step: 100 },
  carryMs: { min: 1500, max: 8000, step: 100 },
  openMs: { min: 2000, max: 8000, step: 100 },
} as const;

/** 연출 시간 기본값(ms) */
const SHOW = { grabMs: 900, carryMs: 2800, openMs: 3600 };

export const DEFAULT_PRESETS: ClawPreset[] = [
  {
    name: '쉽게',
    tune: { reach: 10, speed: 16, wobble: 0, boxes: 6, glow: true, ...SHOW },
  },
  {
    name: '보통',
    tune: { reach: 6, speed: 24, wobble: 2, boxes: 6, glow: false, ...SHOW },
  },
  {
    name: '어렵게',
    tune: { reach: 4, speed: 34, wobble: 3.5, boxes: 5, glow: false, ...SHOW },
  },
];
/** 예전 난이도 값(level)을 세부 옵션으로 옮길 때 */
const OLD_LEVELS: Record<string, ClawTune> = {
  easy: DEFAULT_PRESETS[0].tune,
  normal: DEFAULT_PRESETS[1].tune,
  hard: DEFAULT_PRESETS[2].tune,
};

export const DEFAULT_CLAW: ClawSettings = {
  on: false,
  price: 10,
  perDay: 3,
  tune: DEFAULT_PRESETS[1].tune,
  presets: DEFAULT_PRESETS,
  practicePerDay: 3,
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

/** 씨앗값으로 늘 같은 순서를 내는 난수(0 이상 1 미만). 테스트와 화면(상자 색, 미리보기)에 쓴다. */
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

export type RoundSpec = Pick<ClawRound, 'targets' | 'reach' | 'wobble' | 'glow' | 'grabMs' | 'carryMs' | 'openMs' | 'vx' | 'vy' | 'wobblePeriod' | 'wobblePhase' | 'seed'>;

/** 상자 자리: 출발점·출구·벽에서 떨어진 곳에, 서로 겹치지 않게(가로 16칸이나 세로 14칸 이상) */
export function placeBoxes(count: number, random: () => number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; out.length < count && i < 400; i++) {
    const x = Math.round(between(random, 22, 92));
    const y = Math.round(between(random, 14, 80));
    if (x < 30 && y > 66) continue; // 출구 앞은 비운다
    if (out.some((b) => Math.abs(b.x - x) < 16 && Math.abs(b.y - y) < 14)) continue;
    out.push({ x, y });
  }
  return out;
}

/** 상자 자리 씨앗값으로 쓸 수 있는 값인지(폰이 보낸 값을 그대로 믿지 않는다) */
export const validLayout = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 2 ** 31;

/** 대기 화면에 보여 줄 상자 자리(판을 시작하면 같은 씨앗값으로 같은 자리가 된다) */
export const layoutBoxes = (boxes: number, layout: number) => placeBoxes(boxes, seededRandom(layout));

/** 새 판의 상자 자리와 속도를 정한다(서버나 체험 모드가 부른다). layout 이 있으면 그 씨앗값의 상자 자리를 쓴다 */
export function makeRound(tune: ClawTune, random: () => number, layout?: number): RoundSpec {
  const speed = () => Math.round(tune.speed * between(random, 0.85, 1.15) * 10) / 10;
  return {
    targets: validLayout(layout) ? layoutBoxes(tune.boxes, layout) : placeBoxes(tune.boxes, random),
    reach: tune.reach,
    wobble: tune.wobble,
    glow: tune.glow,
    grabMs: tune.grabMs,
    carryMs: tune.carryMs,
    openMs: tune.openMs,
    vx: speed(),
    vy: speed(),
    wobblePeriod: Math.round(between(random, 700, 1100)),
    wobblePhase: Math.round(between(random, 0, 628)) / 100,
    seed: Math.floor(random() * 2 ** 31),
  };
}

const clampBoard = (v: number) => Math.max(0, Math.min(BOARD, v));

/** 위로 갈 때의 좌우 흔들림(칸). up = 위로 가기 시작한 뒤 지난 시간(ms) */
function sway(round: Pick<RoundSpec, 'wobble' | 'wobblePeriod' | 'wobblePhase'>, upMs: number): number {
  if (round.wobble === 0 || upMs <= 0) return 0;
  return round.wobble * Math.sin((2 * Math.PI * upMs) / round.wobblePeriod + round.wobblePhase);
}

/**
 * 시각 t(ms)의 집게 위치. press1 = 첫 번째 버튼(오른쪽→위로 바꿈), press2 = 두 번째 버튼(멈춤).
 * 아직 누르지 않은 버튼은 null.
 */
export function clawAt(
  round: Pick<RoundSpec, 'vx' | 'vy' | 'wobble' | 'wobblePeriod' | 'wobblePhase'>,
  t: number,
  press1: number | null,
  press2: number | null,
): { x: number; y: number } {
  const turn = press1 ?? t;
  const x0 = clampBoard((round.vx * Math.max(0, Math.min(t, turn))) / 1000);
  if (press1 === null || t <= press1) return { x: x0, y: 0 };
  const end = press2 === null ? t : Math.min(t, press2);
  const upMs = end - press1;
  return {
    x: clampBoard(x0 + sway(round, upMs)),
    y: clampBoard((round.vy * upMs) / 1000),
  };
}

/** 이 자리의 조준점이 들어간 상자 번호(여럿이면 가장 가까운 것). 없으면 null */
export function boxAt(round: Pick<RoundSpec, 'targets' | 'reach'>, at: { x: number; y: number }): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  round.targets.forEach((b, i) => {
    const d = Math.max(Math.abs(at.x - b.x), Math.abs(at.y - b.y));
    if (d <= round.reach && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/**
 * 잡은 상자 번호(못 잡았으면 null). 버튼 누른 시각은 통신 때문에 늦게 잡힐 수 있으므로,
 * 각 버튼을 0~lagMs 만큼 앞당긴 경우도 살펴 가장 가까이 맞은 상자를 고른다.
 */
export function caughtBox(round: RoundSpec, press1: number, press2: number, lagMs = LAG_MS): number | null {
  if (!(press1 >= 0 && press2 > press1)) return null;
  const steps = 6;
  let best: number | null = null;
  let bestD = Infinity;
  for (let i = 0; i <= steps; i++) {
    const p1 = Math.max(0, press1 - (lagMs * i) / steps);
    for (let j = 0; j <= steps; j++) {
      const p2 = press2 - (lagMs * j) / steps;
      if (p2 <= p1) continue;
      const at = clawAt(round, p2, p1, p2);
      const box = boxAt(round, at);
      if (box === null) continue;
      const d = Math.max(Math.abs(at.x - round.targets[box].x), Math.abs(at.y - round.targets[box].y));
      if (d < bestD) {
        best = box;
        bestD = d;
      }
    }
  }
  return best;
}

export const isCatch = (round: RoundSpec, press1: number, press2: number, lagMs = LAG_MS) => caughtBox(round, press1, press2, lagMs) !== null;

/**
 * 대략의 잡을 확률(부모 화면의 참고값). 버튼 누르는 시각이 0.25초쯤 어긋난다고 보고,
 * 가로·세로 각각 1 - e^(-네모 반쪽 / 어긋나는 거리)를 곱한다. 흔들림은 가로 범위를 줄인다.
 */
export function estimateCatch(tune: ClawTune): number {
  const spread = 0.25 * tune.speed; // 어긋나는 거리(칸)
  const axis = (half: number) => 1 - Math.exp(-Math.max(0, half) / spread);
  return Math.round(axis(tune.reach - tune.wobble * 0.6) * axis(tune.reach) * 100) / 100;
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

const isNum = (n: unknown, min: number, max: number, step: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max && Math.abs(n / step - Math.round(n / step)) < 1e-9;

function validTune(t: unknown): t is ClawTune {
  const r = (t ?? {}) as Partial<ClawTune>;
  const L = TUNE_LIMITS;
  return (
    isNum(r.reach, L.reach.min, L.reach.max, L.reach.step) &&
    isNum(r.speed, L.speed.min, L.speed.max, L.speed.step) &&
    isNum(r.wobble, L.wobble.min, L.wobble.max, L.wobble.step) &&
    isNum(r.boxes, L.boxes.min, L.boxes.max, L.boxes.step) &&
    typeof r.glow === 'boolean' &&
    isNum(r.grabMs, L.grabMs.min, L.grabMs.max, L.grabMs.step) &&
    isNum(r.carryMs, L.carryMs.min, L.carryMs.max, L.carryMs.step) &&
    isNum(r.openMs, L.openMs.min, L.openMs.max, L.openMs.step)
  );
}
const copyTune = (t: ClawTune): ClawTune => ({
  reach: t.reach,
  speed: t.speed,
  wobble: t.wobble,
  boxes: t.boxes,
  glow: t.glow,
  grabMs: t.grabMs,
  carryMs: t.carryMs,
  openMs: t.openMs,
});
/** 연출 시간이 없던 예전 값에는 기본 연출 시간을 채운다 */
const withShow = (t: unknown): unknown => (t && typeof t === 'object' && !('grabMs' in t) ? { ...SHOW, ...t } : t);

/** 저장된 값이 없거나 일부만 있어도 완전한 설정을 돌려준다. 예전 난이도(level)는 같은 이름의 기본 세팅으로 옮긴다. */
export function normalizeClaw(raw: unknown): ClawSettings {
  const r = (raw ?? {}) as Partial<ClawSettings> & { level?: string };
  const prizes = Array.isArray(r.prizes)
    ? r.prizes
        .filter((p): p is ClawPrize => !!p && typeof p === 'object' && ['coin', 'wardrobe', 'sticker', 'reward'].includes((p as ClawPrize).kind))
        .slice(0, MAX_CLAW_PRIZES)
        .map((p) => ({
          kind: p.kind,
          weight: isInt(p.weight, 0, 100) ? p.weight : 0,
          ...(p.kind === 'coin' ? { amount: isInt(p.amount, 1, MAX_CLAW_COINS) ? p.amount : 1 } : {}),
          ...(p.kind === 'reward'
            ? {
                title: typeof p.title === 'string' ? p.title.slice(0, MAX_CLAW_TITLE) : '현실 보상',
              }
            : {}),
        }))
    : DEFAULT_CLAW.prizes;
  const rawTune = withShow(r.tune);
  const tune = validTune(rawTune) ? copyTune(rawTune) : r.level && OLD_LEVELS[r.level] ? OLD_LEVELS[r.level] : DEFAULT_CLAW.tune;
  const presets = Array.isArray(r.presets)
    ? r.presets
        .map((p) => (p && typeof p === 'object' ? { ...p, tune: withShow(p.tune) } : p) as ClawPreset)
        .filter((p): p is ClawPreset => !!p && typeof p.name === 'string' && p.name.trim() !== '' && validTune(p.tune))
        .slice(0, MAX_PRESETS)
        .map((p) => ({
          name: p.name.trim().slice(0, MAX_PRESET_NAME),
          tune: copyTune(p.tune),
        }))
    : DEFAULT_PRESETS;
  return {
    on: r.on === true,
    price: isInt(r.price, 0, MAX_CLAW_PRICE) ? r.price : DEFAULT_CLAW.price,
    perDay: isInt(r.perDay, 0, MAX_CLAW_PER_DAY) ? r.perDay : DEFAULT_CLAW.perDay,
    tune,
    presets,
    practicePerDay: isInt(r.practicePerDay, PRACTICE_UNLIMITED, MAX_PRACTICE_PER_DAY) ? r.practicePerDay : DEFAULT_CLAW.practicePerDay,
    dropRate: isInt(r.dropRate, 0, MAX_DROP_RATE) ? r.dropRate : DEFAULT_CLAW.dropRate,
    fallbackCoins: isInt(r.fallbackCoins, 1, MAX_CLAW_COINS) ? r.fallbackCoins : DEFAULT_CLAW.fallbackCoins,
    prizes,
  };
}

/** 부모가 설정을 저장하기 전에 검사한다. */
export function cleanClaw(input: ClawSettings): ClawSettings {
  if (!isInt(input.price, 0, MAX_CLAW_PRICE)) throw new AppError(`한 판 가격은 0부터 ${MAX_CLAW_PRICE} 코인 사이로 정해 주세요.`);
  if (!isInt(input.perDay, 0, MAX_CLAW_PER_DAY)) throw new AppError(`하루 횟수는 0(제한 없음)부터 ${MAX_CLAW_PER_DAY}번 사이로 정해 주세요.`);
  if (!validTune(input.tune)) throw new AppError('네모 크기, 집게 속도, 흔들림, 상자 수, 연출 시간을 다시 확인해 주세요.');
  if (!isInt(input.practicePerDay, PRACTICE_UNLIMITED, MAX_PRACTICE_PER_DAY)) throw new AppError(`연습 횟수는 0부터 ${MAX_PRACTICE_PER_DAY}번 사이나 무제한으로 정해 주세요.`);
  if (!Array.isArray(input.presets) || input.presets.length > MAX_PRESETS) throw new AppError(`세팅은 ${MAX_PRESETS}개까지 저장할 수 있어요.`);
  const presets = input.presets.map((p) => {
    const name = (p.name ?? '').trim();
    if (!name) throw new AppError('세팅 이름을 적어 주세요.');
    if (name.length > MAX_PRESET_NAME) throw new AppError(`세팅 이름은 ${MAX_PRESET_NAME}자까지 쓸 수 있어요.`);
    if (!validTune(p.tune)) throw new AppError(`"${name}" 세팅의 값을 다시 확인해 주세요.`);
    return { name, tune: copyTune(p.tune) };
  });
  if (new Set(presets.map((p) => p.name)).size !== presets.length) throw new AppError('같은 이름의 세팅이 두 개 있어요.');
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
  return {
    on: input.on === true,
    price: input.price,
    perDay: input.perDay,
    tune: copyTune(input.tune),
    presets,
    practicePerDay: input.practicePerDay,
    dropRate: input.dropRate,
    fallbackCoins: input.fallbackCoins,
    prizes,
  };
}

/** 같은 이름이면 덮어쓰고, 없으면 끝에 더한 세팅 목록(최대 개수를 넘으면 오류) */
export function savePreset(presets: ClawPreset[], name: string, tune: ClawTune): ClawPreset[] {
  const clean = name.trim();
  if (!clean) throw new AppError('세팅 이름을 적어 주세요.');
  if (clean.length > MAX_PRESET_NAME) throw new AppError(`세팅 이름은 ${MAX_PRESET_NAME}자까지 쓸 수 있어요.`);
  if (presets.some((p) => p.name === clean)) return presets.map((p) => (p.name === clean ? { name: clean, tune: copyTune(tune) } : p));
  if (presets.length >= MAX_PRESETS) throw new AppError(`세팅은 ${MAX_PRESETS}개까지 저장할 수 있어요. 하나를 지우고 저장해 주세요.`);
  return [...presets, { name: clean, tune: copyTune(tune) }];
}

/** 두 세부 옵션이 같은지(지금 값이 어느 세팅과 같은지 표시할 때) */
const TUNE_KEYS: Record<keyof ClawTune, true> = { reach: true, speed: true, wobble: true, boxes: true, glow: true, grabMs: true, carryMs: true, openMs: true };
export const sameTune = (a: ClawTune, b: ClawTune) => (Object.keys(TUNE_KEYS) as (keyof ClawTune)[]).every((k) => a[k] === b[k]);

/** 오늘 이 사람이 코인을 내고 한 판 수(연습 판은 세지 않는다) */
export const playsToday = (rounds: Pick<ClawRound, 'uid' | 'day' | 'practice'>[], uid: string, day: string) =>
  rounds.filter((r) => r.uid === uid && r.day === day && !r.practice).length;

/** 오늘 남은 연습 판 수(자녀). 무제한이면 Infinity */
export function practiceLeft(settings: ClawSettings, rounds: Pick<ClawRound, 'uid' | 'day' | 'practice'>[], uid: string, day: string): number {
  if (settings.practicePerDay === PRACTICE_UNLIMITED) return Infinity;
  return Math.max(0, settings.practicePerDay - rounds.filter((r) => r.uid === uid && r.day === day && r.practice).length);
}

/** 새 판을 시작할 수 없는 이유(없으면 null). 부모는 연습이라 막지 않는다 */
export function cannotStart(settings: ClawSettings, isParent: boolean, freeCoins: number, todayPlays: number): string | null {
  if (isParent) return null;
  if (!settings.on) return '지금은 인형뽑기를 할 수 없어요.';
  if (settings.perDay > 0 && todayPlays >= settings.perDay) return `오늘은 ${settings.perDay}번 다 했어요. 내일 또 해요!`;
  if (freeCoins < settings.price) return `코인이 ${settings.price - freeCoins}개 모자라요.`;
  return null;
}

/** 자녀가 연습 판을 시작할 수 없는 이유(없으면 null) */
export function cannotPractice(settings: ClawSettings, left: number): string | null {
  if (!settings.on) return '지금은 인형뽑기를 할 수 없어요.';
  if (left <= 0) return '오늘 연습은 다 했어요.';
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
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
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
