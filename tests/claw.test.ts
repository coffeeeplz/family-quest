import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBackend } from '../src/backend/demo';
import type { Backend, ClawRound, ClawSettings, LedgerEntry, Member, Order } from '../src/backend/types';
import {
  DEFAULT_CLAW,
  LEVELS,
  chooseWin,
  clawAt,
  cleanClaw,
  expectedCoins,
  isCatch,
  makeRound,
  normalizeClaw,
  onTarget,
  pickPrize,
  seededRandom,
  type RoundSpec,
} from '../src/domain/claw';
import { DEFAULT_SETTINGS } from '../src/domain/settings';
import { STICKER_PACKS } from '../src/domain/stickers';
import { WARDROBE_ENTRIES } from '../src/domain/wardrobe';
import { dateKey } from '../src/lib/dates';

/** 목표 (50, 40), 가로·세로 20칸/초, 흔들림 없음: 2.5초에 오른쪽 50, 그 뒤 2초 위로 가면 40 */
const round: RoundSpec = { level: 'easy', target: { x: 50, y: 40 }, vx: 20, vy: 20, wobblePeriod: 1000, wobblePhase: 0, seed: 1 };

describe('집게 위치', () => {
  it('오른쪽으로만 가다가, 첫 버튼 뒤에는 그 자리에서 위로만 간다', () => {
    expect(clawAt(round, 1000, null, null)).toEqual({ x: 20, y: 0 });
    expect(clawAt(round, 2500, 2500, null)).toEqual({ x: 50, y: 0 });
    expect(clawAt(round, 3500, 2500, null)).toEqual({ x: 50, y: 20 });
    expect(clawAt(round, 9000, 2500, 4500)).toEqual({ x: 50, y: 40 }); // 두 번째 버튼에서 멈춤
  });

  it('벽에 닿으면 더 가지 않는다', () => {
    expect(clawAt(round, 20_000, null, null).x).toBe(100);
    expect(clawAt(round, 30_000, 1000, null).y).toBe(100);
  });

  it('어려울수록 위로 갈 때 좌우로 흔들린다', () => {
    const hard: RoundSpec = { ...round, level: 'hard', wobblePhase: Math.PI / 2 };
    expect(clawAt(hard, 3000, 2500, null).x).not.toBe(50);
    expect(clawAt(round, 3000, 2500, null).x).toBe(50);
  });
});

describe('잡기 판정', () => {
  it('목표 위에 멈추면 잡고, 많이 벗어나면 못 잡는다', () => {
    expect(onTarget(round, 2500, 4500)).toBe(true);
    expect(isCatch(round, 2500, 4500)).toBe(true);
    expect(isCatch(round, 4000, 6000)).toBe(false); // 오른쪽으로 너무 감(x=80)
    expect(isCatch(round, 2500, 7000)).toBe(false); // 위로 너무 감(y=90)
  });

  it('통신이 조금 늦어 늦게 잡힌 버튼은 봐준다', () => {
    const reach = LEVELS.easy.reach; // 9칸 = 0.45초
    const late = 2500 + (reach / 20) * 1000 + 100; // 목표를 0.1초 지나친 시각
    expect(onTarget(round, late, late + 2000)).toBe(false);
    expect(isCatch(round, late, late + 2000)).toBe(true);
    expect(isCatch(round, late + 400, late + 2400)).toBe(false); // 봐주는 시간보다 더 늦으면 안 됨
  });

  it('누른 시각이 이상하면 못 잡은 것', () => {
    expect(isCatch(round, -1, 100)).toBe(false);
    expect(isCatch(round, 3000, 3000)).toBe(false);
  });

  it('판마다 목표와 속도가 난이도 범위 안에서 정해진다', () => {
    const random = seededRandom(7);
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const r = makeRound(level, random);
      expect(r.target.x).toBeGreaterThanOrEqual(28);
      expect(r.target.y).toBeLessThanOrEqual(88);
      expect(r.vx).toBeGreaterThanOrEqual(LEVELS[level].speed[0]);
      expect(r.vy).toBeLessThanOrEqual(LEVELS[level].speed[1]);
    }
  });
});

describe('상품', () => {
  it('확률(가중치)대로 뽑힌다', () => {
    const random = seededRandom(42);
    const counts = { a: 0, b: 0 };
    const prizes = [
      { kind: 'coin' as const, amount: 1, weight: 80 },
      { kind: 'coin' as const, amount: 2, weight: 20 },
    ];
    for (let i = 0; i < 5000; i++) counts[pickPrize(prizes, random)!.amount === 1 ? 'a' : 'b'] += 1;
    expect(counts.a / 5000).toBeGreaterThan(0.76);
    expect(counts.a / 5000).toBeLessThan(0.84);
    expect(pickPrize([{ kind: 'coin', amount: 1, weight: 0 }], random)).toBeNull();
  });

  it('꾸미기·스티커는 아직 없고 숨기지 않은 것만, 다 가졌으면 대신 코인', () => {
    const random = seededRandom(3);
    const none = { wardrobe: [], stickerPacks: [] };
    const allWardrobe = WARDROBE_ENTRIES.map((e) => e.id);
    const allPacks = STICKER_PACKS.map((p) => p.id);
    const one = chooseWin({ kind: 'wardrobe', weight: 1 }, { wardrobe: allWardrobe.slice(1), stickerPacks: [] }, none, 20, random);
    expect(one).toEqual({ kind: 'wardrobe', itemId: allWardrobe[0], name: WARDROBE_ENTRIES[0].name });
    expect(chooseWin({ kind: 'wardrobe', weight: 1 }, { wardrobe: allWardrobe, stickerPacks: [] }, none, 20, random)).toEqual({ kind: 'coin', amount: 20, converted: true });
    expect(chooseWin({ kind: 'sticker', weight: 1 }, { wardrobe: [], stickerPacks: allPacks.slice(1) }, { wardrobe: [], stickerPacks: [allPacks[0]] }, 7, random)).toEqual({ kind: 'coin', amount: 7, converted: true });
    expect(chooseWin({ kind: 'reward', title: '게임 30분', weight: 1 }, none, none, 20, random)).toMatchObject({ kind: 'reward', title: '게임 30분' });
  });

  it('평균 돌려받는 코인', () => {
    const s: ClawSettings = { ...DEFAULT_CLAW, dropRate: 50, fallbackCoins: 10, prizes: [{ kind: 'coin', amount: 20, weight: 50 }, { kind: 'sticker', weight: 50 }] };
    expect(expectedCoins(s, 0.4)).toBeCloseTo(0.4 * 0.5 * 15);
  });
});

describe('설정 검사', () => {
  it('확률의 합은 100%, 현실 보상은 이름이 있어야 한다', () => {
    expect(cleanClaw(DEFAULT_CLAW)).toEqual(DEFAULT_CLAW);
    expect(() => cleanClaw({ ...DEFAULT_CLAW, prizes: [{ kind: 'coin', amount: 5, weight: 90 }] })).toThrow('100%');
    expect(() => cleanClaw({ ...DEFAULT_CLAW, prizes: [{ kind: 'reward', title: ' ', weight: 100 }] })).toThrow('이름');
    expect(() => cleanClaw({ ...DEFAULT_CLAW, dropRate: 95 })).toThrow('떨어뜨릴');
    expect(() => cleanClaw({ ...DEFAULT_CLAW, prizes: [] })).toThrow('하나 이상');
  });

  it('저장된 값이 없거나 이상해도 기본값으로 채운다', () => {
    expect(normalizeClaw(undefined)).toEqual(DEFAULT_CLAW);
    expect(normalizeClaw({ on: true, level: 'nope', price: -3 })).toMatchObject({ on: true, level: 'normal', price: 10 });
  });
});

// ── 체험 모드 ─────────────────────────────────────────────────────────────────

const FAMILY = 'demo-family';
let backend: Backend;
const snapshot = <T,>(subscribe: (cb: (value: T) => void) => () => void): T => {
  let value!: T;
  subscribe((v) => (value = v))();
  return value;
};
const kid = () => snapshot<Member[]>((cb) => backend.watchMembers(FAMILY, cb)).find((m) => m.uid === 'demo-kid')!;
const ledger = () => snapshot<LedgerEntry[]>((cb) => backend.watchLedger(FAMILY, cb));
const orders = () => snapshot<Order[]>((cb) => backend.watchOrders(FAMILY, '2000-01-01', cb));
const as = (uid: string) => backend.demo!.loginAs(uid);
const kidSum = () => ledger().filter((e) => e.uid === 'demo-kid').reduce((sum, e) => sum + e.amount, 0);

/** 목표 위에 정확히 멈추는 버튼 시각 */
function perfect(r: ClawRound): [number, number] {
  const t1 = (r.target.x / r.vx) * 1000;
  // 흔들림 때문에 가로가 조금 어긋날 수 있으니, 위로 가는 시간을 조금씩 바꿔 가며 목표 위인 시각을 찾는다.
  for (let t2 = t1 + 1; t2 < t1 + 10_000; t2 += 5) if (isCatch(r, t1, t2, 0)) return [t1, t2];
  throw new Error('목표에 닿는 시각을 못 찾음');
}

async function setClaw(patch: Partial<ClawSettings>) {
  as('demo-dad');
  const family = snapshot<{ settings: typeof DEFAULT_SETTINGS } | null>((cb) => backend.watchFamily(FAMILY, cb))!;
  await backend.updateSettings(FAMILY, { ...family.settings, claw: { ...family.settings.claw, ...patch } });
  as('demo-kid');
}

beforeEach(() => {
  backend = createDemoBackend(null);
});

describe('인형뽑기(체험 모드)', () => {
  it('시작하면 가격만큼 코인이 빠지고, 놓치면 아무것도 받지 않는다', async () => {
    as('demo-kid');
    const before = kid().coins;
    const r = await backend.startClaw(FAMILY, 'demo-kid');
    expect(kid().coins).toBe(before - 10);
    expect(ledger().find((e) => e.refId === r.id)).toMatchObject({ type: 'claw', amount: -10 });
    const done = await backend.finishClaw(FAMILY, r.id, [100, 200]);
    expect(done).toMatchObject({ status: 'done', outcome: 'miss' });
    expect(kid().coins).toBe(before - 10);
    // 같은 판은 다시 끝내도 결과가 바뀌지 않는다.
    expect((await backend.finishClaw(FAMILY, r.id, perfect(r))).outcome).toBe('miss');
  });

  it('정확히 멈추면 잡고, 떨어뜨리지 않으면 상자를 열어 상품을 받는다', async () => {
    await setClaw({ dropRate: 0, prizes: [{ kind: 'coin', amount: 50, weight: 100 }] });
    const before = kid().coins;
    const r = await backend.startClaw(FAMILY, 'demo-kid');
    const done = await backend.finishClaw(FAMILY, r.id, perfect(r));
    expect(done).toMatchObject({ outcome: 'win', prize: { kind: 'coin', amount: 50 } });
    expect(kid().coins).toBe(before - 10 + 50);
    expect(kid().coins).toBe(kidSum());
    expect(ledger().find((e) => e.type === 'clawPrize')).toMatchObject({ amount: 50, refId: r.id });
  });

  it('떨어뜨리면 상품이 없다', async () => {
    await setClaw({ dropRate: 90, prizes: [{ kind: 'coin', amount: 50, weight: 100 }] });
    let drops = 0;
    await backend.demo!.loginAs('demo-dad');
    await backend.giveCoins(FAMILY, 'demo-kid', 500, '', 'demo-dad');
    as('demo-kid');
    await setClaw({ perDay: 0 });
    for (let i = 0; i < 20; i++) {
      const r = await backend.startClaw(FAMILY, 'demo-kid');
      if ((await backend.finishClaw(FAMILY, r.id, perfect(r))).outcome === 'drop') drops += 1;
    }
    expect(drops).toBeGreaterThan(10);
    expect(kid().coins).toBe(kidSum());
  });

  it('꾸미기·스티커는 가진 것에, 현실 보상은 인벤토리(승인된 보상)에 들어간다', async () => {
    await setClaw({ dropRate: 0, perDay: 0, prizes: [{ kind: 'wardrobe', weight: 100 }] });
    as('demo-dad');
    await backend.giveCoins(FAMILY, 'demo-kid', 100, '', 'demo-dad');
    as('demo-kid');
    let r = await backend.startClaw(FAMILY, 'demo-kid');
    const w = await backend.finishClaw(FAMILY, r.id, perfect(r));
    expect(w.prize?.kind).toBe('wardrobe');
    expect(kid().wardrobe).toContain((w.prize as { itemId: string }).itemId);

    await setClaw({ prizes: [{ kind: 'sticker', weight: 100 }] });
    r = await backend.startClaw(FAMILY, 'demo-kid');
    const s = await backend.finishClaw(FAMILY, r.id, perfect(r));
    expect(kid().stickerPacks).toContain((s.prize as { packId: string }).packId);

    await setClaw({ prizes: [{ kind: 'reward', title: '게임 30분', weight: 100 }] });
    r = await backend.startClaw(FAMILY, 'demo-kid');
    const g = await backend.finishClaw(FAMILY, r.id, perfect(r));
    expect(orders().find((o) => o.id === (g.prize as { orderId: string }).orderId)).toMatchObject({ rewardTitle: '게임 30분', status: 'approved', price: 0, uid: 'demo-kid' });
    expect(kid().coins).toBe(kidSum());
  });

  it('하루 횟수, 꺼짐, 코인 부족이면 시작할 수 없다', async () => {
    as('demo-kid');
    for (let i = 0; i < 3; i++) await backend.startClaw(FAMILY, 'demo-kid'); // 30코인 → 0
    await expect(backend.startClaw(FAMILY, 'demo-kid')).rejects.toThrow('3번 다 했어요');
    expect(snapshot<ClawRound[]>((cb) => backend.watchMyClawRounds(FAMILY, 'demo-kid', dateKey(), cb))).toHaveLength(3);
    await setClaw({ perDay: 0 });
    await expect(backend.startClaw(FAMILY, 'demo-kid')).rejects.toThrow('모자라요');
    await setClaw({ on: false });
    await expect(backend.startClaw(FAMILY, 'demo-kid')).rejects.toThrow('할 수 없어요');
  });

  it('부모는 공짜로 연습만 하고, 상품도 받지 않는다', async () => {
    await setClaw({ on: false, dropRate: 0, prizes: [{ kind: 'coin', amount: 50, weight: 100 }] });
    as('demo-dad');
    const count = ledger().length;
    const r = await backend.startClaw(FAMILY, 'demo-dad');
    expect(r.practice).toBe(true);
    const done = await backend.finishClaw(FAMILY, r.id, perfect(r));
    expect(done.outcome).toBe('win');
    expect(ledger().length).toBe(count);
  });

  it('남의 판은 끝낼 수 없다', async () => {
    as('demo-kid');
    const r = await backend.startClaw(FAMILY, 'demo-kid');
    as('demo-dad');
    await expect(backend.finishClaw(FAMILY, r.id, [1, 2])).rejects.toThrow('찾을 수 없어요');
  });
});
