import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBackend } from '../src/backend/demo';
import type { Backend, ClawRound, ClawSettings, LedgerEntry, Member, Order } from '../src/backend/types';
import {
  DEFAULT_CLAW,
  DEFAULT_PRESETS,
  LAG_MS,
  caughtBox,
  chooseWin,
  clawAt,
  cleanClaw,
  estimateCatch,
  expectedCoins,
  isCatch,
  makeRound,
  normalizeClaw,
  pickPrize,
  placeBoxes,
  playsToday,
  practiceLeft,
  savePreset,
  seededRandom,
  type RoundSpec,
} from '../src/domain/claw';
import { DEFAULT_SETTINGS } from '../src/domain/settings';
import { STICKER_PACKS } from '../src/domain/stickers';
import { WARDROBE_ENTRIES } from '../src/domain/wardrobe';
import { dateKey } from '../src/lib/dates';

/** 상자 (50, 40)과 (80, 70), 잡히는 범위 9칸, 가로·세로 20칸/초, 흔들림 없음: 2.5초에 오른쪽 50, 그 뒤 2초 위로 가면 40 */
const round: RoundSpec = {
  targets: [
    { x: 50, y: 40 },
    { x: 80, y: 70 },
  ],
  reach: 9,
  wobble: 0,
  glow: false,
  grabMs: 900,
  carryMs: 2800,
  openMs: 3600,
  vx: 20,
  vy: 20,
  wobblePeriod: 1000,
  wobblePhase: 0,
  seed: 1,
};

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

  it('흔들림이 있으면 위로 갈 때 좌우로 흔들린다', () => {
    const shaky: RoundSpec = {
      ...round,
      wobble: 3.5,
      wobblePhase: Math.PI / 2,
    };
    expect(clawAt(shaky, 3000, 2500, null).x).not.toBe(50);
    expect(clawAt(round, 3000, 2500, null).x).toBe(50);
  });
});

describe('잡기 판정', () => {
  it('아무 상자의 네모 안에 멈추면 그 상자를 잡고, 많이 벗어나면 못 잡는다', () => {
    expect(caughtBox(round, 2500, 4500, 0)).toBe(0);
    expect(caughtBox(round, 4000, 7500, 0)).toBe(1); // 두 번째 상자 (80, 70)
    expect(isCatch(round, 3300, 5300)).toBe(false); // 오른쪽으로 너무 감(x=66)
    expect(isCatch(round, 2500, 7000)).toBe(false); // 위로 너무 감(y=90)
  });

  it('잡히는 범위는 판에 적힌 값으로 본다', () => {
    const t = 2500 + (7 / 20) * 1000; // x=57, 상자에서 7칸
    expect(isCatch(round, t, t + 2000, 0)).toBe(true);
    expect(isCatch({ ...round, reach: 5 }, t, t + 2000, 0)).toBe(false);
  });

  it('통신이 조금 늦어 늦게 잡힌 버튼은 봐준다', () => {
    const late = 2500 + (round.reach / 20) * 1000 + 100; // 네모를 0.1초 지나친 시각
    expect(isCatch(round, late, late + 2000, 0)).toBe(false);
    expect(isCatch(round, late, late + 2000)).toBe(true);
    expect(isCatch(round, late + LAG_MS + 100, late + LAG_MS + 2100)).toBe(false); // 봐주는 시간보다 더 늦으면 안 됨
  });

  it('누른 시각이 이상하면 못 잡은 것', () => {
    expect(isCatch(round, -1, 100)).toBe(false);
    expect(isCatch(round, 3000, 3000)).toBe(false);
  });

  it('상자는 정한 개수만큼, 서로 겹치지 않게 놓인다', () => {
    for (let seed = 1; seed < 40; seed++) {
      const boxes = placeBoxes(8, seededRandom(seed));
      expect(boxes).toHaveLength(8);
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) expect(Math.abs(boxes[i].x - boxes[j].x) >= 16 || Math.abs(boxes[i].y - boxes[j].y) >= 14).toBe(true);
    }
  });

  it('판에는 시작할 때의 옵션이 적히고, 속도는 ±15% 안에서 달라진다', () => {
    const random = seededRandom(7);
    for (const { tune } of DEFAULT_PRESETS) {
      const r = makeRound(tune, random);
      expect(r).toMatchObject({
        reach: tune.reach,
        wobble: tune.wobble,
        glow: tune.glow,
      });
      expect(r.targets).toHaveLength(tune.boxes);
      expect(r.vx).toBeGreaterThanOrEqual(tune.speed * 0.85 - 0.1);
      expect(r.vy).toBeLessThanOrEqual(tune.speed * 1.15 + 0.1);
    }
  });

  it('잡을 확률 참고값은 네모가 클수록, 느릴수록 높다', () => {
    const [easy, normal, hard] = DEFAULT_PRESETS.map((p) => estimateCatch(p.tune));
    expect(easy).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(hard);
    expect(easy).toBeLessThanOrEqual(1);
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
    expect(one).toEqual({
      kind: 'wardrobe',
      itemId: allWardrobe[0],
      name: WARDROBE_ENTRIES[0].name,
    });
    expect(chooseWin({ kind: 'wardrobe', weight: 1 }, { wardrobe: allWardrobe, stickerPacks: [] }, none, 20, random)).toEqual({ kind: 'coin', amount: 20, converted: true });
    expect(chooseWin({ kind: 'sticker', weight: 1 }, { wardrobe: [], stickerPacks: allPacks.slice(1) }, { wardrobe: [], stickerPacks: [allPacks[0]] }, 7, random)).toEqual({
      kind: 'coin',
      amount: 7,
      converted: true,
    });
    expect(chooseWin({ kind: 'reward', title: '게임 30분', weight: 1 }, none, none, 20, random)).toMatchObject({ kind: 'reward', title: '게임 30분' });
  });

  it('평균 돌려받는 코인', () => {
    const s: ClawSettings = {
      ...DEFAULT_CLAW,
      dropRate: 50,
      fallbackCoins: 10,
      prizes: [
        { kind: 'coin', amount: 20, weight: 50 },
        { kind: 'sticker', weight: 50 },
      ],
    };
    expect(expectedCoins(s, 0.4)).toBeCloseTo(0.4 * 0.5 * 15);
  });
});

describe('설정 검사', () => {
  it('확률의 합은 100%, 현실 보상은 이름이 있어야 한다', () => {
    expect(cleanClaw(DEFAULT_CLAW)).toEqual(DEFAULT_CLAW);
    expect(() =>
      cleanClaw({
        ...DEFAULT_CLAW,
        prizes: [{ kind: 'coin', amount: 5, weight: 90 }],
      }),
    ).toThrow('100%');
    expect(() =>
      cleanClaw({
        ...DEFAULT_CLAW,
        prizes: [{ kind: 'reward', title: ' ', weight: 100 }],
      }),
    ).toThrow('이름');
    expect(() => cleanClaw({ ...DEFAULT_CLAW, dropRate: 95 })).toThrow('떨어뜨릴');
    expect(() => cleanClaw({ ...DEFAULT_CLAW, prizes: [] })).toThrow('하나 이상');
  });

  it('저장된 값이 없거나 이상해도 기본값으로 채운다', () => {
    expect(normalizeClaw(undefined)).toEqual(DEFAULT_CLAW);
    expect(normalizeClaw({ on: true, level: 'nope', price: -3 })).toMatchObject({ on: true, tune: DEFAULT_CLAW.tune, price: 10 });
  });

  it('예전 난이도 값은 같은 이름의 기본 세팅으로 옮긴다', () => {
    expect(normalizeClaw({ level: 'easy' }).tune).toEqual(DEFAULT_PRESETS[0].tune);
    expect(normalizeClaw({ level: 'hard' }).tune).toEqual(DEFAULT_PRESETS[2].tune);
  });

  it('세부 옵션과 세팅 이름을 검사한다', () => {
    expect(() => cleanClaw({ ...DEFAULT_CLAW, tune: { ...DEFAULT_CLAW.tune, reach: 30 } })).toThrow('네모 크기');
    expect(() =>
      cleanClaw({
        ...DEFAULT_CLAW,
        tune: { ...DEFAULT_CLAW.tune, wobble: 1.3 },
      }),
    ).toThrow('네모 크기');
    expect(() =>
      cleanClaw({
        ...DEFAULT_CLAW,
        presets: [...DEFAULT_PRESETS, DEFAULT_PRESETS[0]],
      }),
    ).toThrow('같은 이름');
    expect(() =>
      cleanClaw({
        ...DEFAULT_CLAW,
        presets: [{ name: ' ', tune: DEFAULT_CLAW.tune }],
      }),
    ).toThrow('이름');
  });

  it('네모는 0.5칸 단위로 1칸까지, 연출 시간은 0.1초 단위로 정할 수 있다', () => {
    expect(cleanClaw({ ...DEFAULT_CLAW, tune: { ...DEFAULT_CLAW.tune, reach: 1.5 } }).tune.reach).toBe(1.5);
    expect(() => cleanClaw({ ...DEFAULT_CLAW, tune: { ...DEFAULT_CLAW.tune, reach: 0.5 } })).toThrow('네모 크기');
    expect(cleanClaw({ ...DEFAULT_CLAW, tune: { ...DEFAULT_CLAW.tune, carryMs: 6300 } }).tune.carryMs).toBe(6300);
    expect(() => cleanClaw({ ...DEFAULT_CLAW, tune: { ...DEFAULT_CLAW.tune, openMs: 9000 } })).toThrow('연출 시간');
    expect(() => cleanClaw({ ...DEFAULT_CLAW, practicePerDay: 11 })).toThrow('연습 횟수');
  });

  it('연출 시간이 없던 예전 세팅에는 기본 연출 시간을 채운다', () => {
    const old = { reach: 5, speed: 20, wobble: 1, boxes: 4, glow: false };
    const n = normalizeClaw({ tune: old, presets: [{ name: '옛날', tune: old }] });
    expect(n.tune).toMatchObject({ ...old, grabMs: 900, carryMs: 2800, openMs: 3600 });
    expect(n.presets[0].tune.openMs).toBe(3600);
    expect(n.practicePerDay).toBe(3);
  });

  it('세팅 저장: 같은 이름은 덮어쓰고, 5개가 넘으면 막는다', () => {
    const tune = { reach: 8, speed: 20, wobble: 1, boxes: 4, glow: true, grabMs: 1500, carryMs: 4000, openMs: 5000 };
    const saved = savePreset(DEFAULT_PRESETS, ' 동생용 ', tune);
    expect(saved).toHaveLength(4);
    expect(saved[3]).toEqual({ name: '동생용', tune });
    expect(savePreset(saved, '쉽게', tune)[0]).toEqual({ name: '쉽게', tune });
    const full = savePreset(saved, '주말', tune);
    expect(() => savePreset(full, '하나 더', tune)).toThrow('5개');
    expect(() => savePreset(full, '', tune)).toThrow('이름');
  });
});

// ── 체험 모드 ─────────────────────────────────────────────────────────────────

const FAMILY = 'demo-family';
let backend: Backend;
const snapshot = <T>(subscribe: (cb: (value: T) => void) => () => void): T => {
  let value!: T;
  subscribe((v) => (value = v))();
  return value;
};
const kid = () => snapshot<Member[]>((cb) => backend.watchMembers(FAMILY, cb)).find((m) => m.uid === 'demo-kid')!;
const ledger = () => snapshot<LedgerEntry[]>((cb) => backend.watchLedger(FAMILY, cb));
const orders = () => snapshot<Order[]>((cb) => backend.watchOrders(FAMILY, '2000-01-01', cb));
const as = (uid: string) => backend.demo!.loginAs(uid);
const kidSum = () =>
  ledger()
    .filter((e) => e.uid === 'demo-kid')
    .reduce((sum, e) => sum + e.amount, 0);

/** 상자 하나(기본은 첫 상자) 위에 정확히 멈추는 버튼 시각 */
function perfect(r: ClawRound, box = 0): [number, number] {
  const t1 = (r.targets[box].x / r.vx) * 1000;
  // 흔들림과 이웃 상자의 네모 때문에 어긋날 수 있으니, 위로 가는 시간을 조금씩 바꿔 가며 판정이 그 상자를 고르는 시각을 찾는다.
  for (let t2 = t1 + 1; t2 < t1 + 10_000; t2 += 5) if (caughtBox(r, t1, t2) === box) return [t1, t2];
  throw new Error('상자에 닿는 시각을 못 찾음');
}

async function setClaw(patch: Partial<ClawSettings>) {
  as('demo-dad');
  const family = snapshot<{ settings: typeof DEFAULT_SETTINGS } | null>((cb) => backend.watchFamily(FAMILY, cb))!;
  await backend.updateSettings(FAMILY, {
    ...family.settings,
    claw: { ...family.settings.claw, ...patch },
  });
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
    expect(ledger().find((e) => e.refId === r.id)).toMatchObject({
      type: 'claw',
      amount: -10,
    });
    const done = await backend.finishClaw(FAMILY, r.id, [100, 200]);
    expect(done).toMatchObject({ status: 'done', outcome: 'miss' });
    expect(kid().coins).toBe(before - 10);
    // 같은 판은 다시 끝내도 결과가 바뀌지 않는다.
    expect((await backend.finishClaw(FAMILY, r.id, perfect(r))).outcome).toBe('miss');
  });

  it('정확히 멈추면 잡고, 떨어뜨리지 않으면 상자를 열어 상품을 받는다', async () => {
    await setClaw({
      dropRate: 0,
      prizes: [{ kind: 'coin', amount: 50, weight: 100 }],
    });
    const before = kid().coins;
    const r = await backend.startClaw(FAMILY, 'demo-kid');
    const done = await backend.finishClaw(FAMILY, r.id, perfect(r));
    expect(done).toMatchObject({
      outcome: 'win',
      caught: 0,
      prize: { kind: 'coin', amount: 50 },
    });
    expect(kid().coins).toBe(before - 10 + 50);
    expect(kid().coins).toBe(kidSum());
    expect(ledger().find((e) => e.type === 'clawPrize')).toMatchObject({
      amount: 50,
      refId: r.id,
    });
  });

  it('목표가 따로 없고 어느 상자든 잡을 수 있다', async () => {
    await setClaw({
      dropRate: 0,
      prizes: [{ kind: 'coin', amount: 5, weight: 100 }],
    });
    const r = await backend.startClaw(FAMILY, 'demo-kid');
    const last = r.targets.length - 1;
    expect(await backend.finishClaw(FAMILY, r.id, perfect(r, last))).toMatchObject({ outcome: 'win', caught: last });
  });

  it('떨어뜨리면 상품이 없다', async () => {
    await setClaw({
      dropRate: 90,
      prizes: [{ kind: 'coin', amount: 50, weight: 100 }],
    });
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
    await setClaw({
      dropRate: 0,
      perDay: 0,
      prizes: [{ kind: 'wardrobe', weight: 100 }],
    });
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

    await setClaw({
      prizes: [{ kind: 'reward', title: '게임 30분', weight: 100 }],
    });
    r = await backend.startClaw(FAMILY, 'demo-kid');
    const g = await backend.finishClaw(FAMILY, r.id, perfect(r));
    expect(orders().find((o) => o.id === (g.prize as { orderId: string }).orderId)).toMatchObject({
      rewardTitle: '게임 30분',
      status: 'approved',
      price: 0,
      uid: 'demo-kid',
    });
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
    await setClaw({
      on: false,
      dropRate: 0,
      prizes: [{ kind: 'coin', amount: 50, weight: 100 }],
    });
    as('demo-dad');
    const count = ledger().length;
    const r = await backend.startClaw(FAMILY, 'demo-dad');
    expect(r.practice).toBe(true);
    const done = await backend.finishClaw(FAMILY, r.id, perfect(r));
    expect(done.outcome).toBe('win');
    expect(ledger().length).toBe(count);
  });

  it('자녀는 하루 정해진 횟수만큼 공짜로 연습하고, 연습은 빈 상자에 하루 횟수에도 세지 않는다', async () => {
    await setClaw({ dropRate: 0, practicePerDay: 2, prizes: [{ kind: 'coin', amount: 50, weight: 100 }] });
    const before = kid().coins;
    const count = ledger().length;
    for (let i = 0; i < 2; i++) {
      const r = await backend.startClaw(FAMILY, 'demo-kid', true);
      expect(r.practice).toBe(true);
      const done = await backend.finishClaw(FAMILY, r.id, perfect(r));
      expect(done.outcome).toBe('win');
      expect(done.prize).toBeUndefined();
    }
    expect(kid().coins).toBe(before);
    expect(ledger().length).toBe(count);
    await expect(backend.startClaw(FAMILY, 'demo-kid', true)).rejects.toThrow('연습은 다 했어요');
    // 진짜 판은 그대로 3번 할 수 있다(연습은 세지 않음).
    const rounds = () => snapshot<ClawRound[]>((cb) => backend.watchMyClawRounds(FAMILY, 'demo-kid', dateKey(), cb));
    expect(playsToday(rounds(), 'demo-kid', dateKey())).toBe(0);
    expect(practiceLeft({ ...DEFAULT_CLAW, practicePerDay: 2 }, rounds(), 'demo-kid', dateKey())).toBe(0);
    await backend.startClaw(FAMILY, 'demo-kid');
    expect(playsToday(rounds(), 'demo-kid', dateKey())).toBe(1);
  });

  it('판에는 시작할 때의 연출 시간이 적힌다', async () => {
    await setClaw({ tune: { ...DEFAULT_CLAW.tune, grabMs: 2000, carryMs: 5000, openMs: 6000 } });
    const r = await backend.startClaw(FAMILY, 'demo-kid');
    expect(r).toMatchObject({ grabMs: 2000, carryMs: 5000, openMs: 6000 });
  });

  it('남의 판은 끝낼 수 없다', async () => {
    as('demo-kid');
    const r = await backend.startClaw(FAMILY, 'demo-kid');
    as('demo-dad');
    await expect(backend.finishClaw(FAMILY, r.id, [1, 2])).rejects.toThrow('찾을 수 없어요');
  });
});
