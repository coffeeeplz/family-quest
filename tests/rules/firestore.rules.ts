// 서버 규칙(firestore.rules) 테스트. Firestore 에뮬레이터가 있어야 한다: npm run test:rules
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, increment, arrayUnion, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const FID = 'f1';
const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;

/** 한국 시각 기준 날짜 키(오늘에서 offset 일) */
function kstKey(offset = 0): string {
  return new Date(Date.now() + KST_MS + offset * DAY_MS).toISOString().slice(0, 10);
}
/** 한국 시각 기준 날짜 번호(lib/dates 의 dayNumber 와 같은 값) */
function kstDayNum(offset = 0): number {
  return Math.floor((Date.now() + KST_MS) / DAY_MS) + offset;
}

/** 한국 시각 자정 앞뒤 15분: 규칙의 10분 여유와 겹쳐 날짜 검사 결과가 달라질 수 있어 날짜 테스트를 건너뛴다. */
const minuteOfDay = Math.floor(((Date.now() + KST_MS) % DAY_MS) / 60_000);
const nearMidnight = minuteOfDay < 15 || minuteOfDay >= 24 * 60 - 15;

let env: RulesTestEnvironment;

const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const path = (rest: string) => `families/${FID}/${rest}`;

async function seed(docs: Record<string, object>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    for (const [p, data] of Object.entries(docs)) await setDoc(doc(db, p), data);
  });
}

function quest(overrides: object = {}) {
  return { title: '숙제', reward: 10, active: true, assigneeUid: 'kid', important: false, repeat: { type: 'none', date: kstKey() }, ...overrides };
}

function run(questId: string, dateKey: string, overrides: object = {}) {
  return {
    questId,
    questTitle: '숙제',
    reward: 10,
    assigneeUid: 'kid',
    dateKey,
    oneOff: true,
    late: false,
    status: 'submitted',
    submittedAt: Date.now(),
    decidedBy: null,
    decidedAt: null,
    rejectReason: '',
    praise: '',
    ...overrides,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-family-quest',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed({
    [`families/${FID}`]: { name: '우리집', createdBy: 'mom', settings: {} },
    [path('members/mom')]: { uid: 'mom', role: 'parent', coins: 0, displayName: '엄마' },
    [path('members/dad')]: { uid: 'dad', role: 'parent', coins: 0, displayName: '아빠' },
    [path('members/kid')]: { uid: 'kid', role: 'child', coins: 100, displayName: '딸' },
  });
});

describe.skipIf(nearMidnight)('완료 요청(runs)', () => {
  it('오늘 기한인 한 번짜리 퀘스트는 제때 낼 수 있다', async () => {
    await seed({ [path('quests/q1')]: quest() });
    await assertSucceeds(setDoc(doc(as('kid'), path(`runs/q1_${kstKey()}`)), run('q1', kstKey())));
  });

  it('한 번짜리 퀘스트를 기한과 다른 날짜로 낼 수 없다(두 번 받기 막기)', async () => {
    await seed({ [path('quests/q1')]: quest() });
    await assertFails(setDoc(doc(as('kid'), path(`runs/q1_${kstKey(-3)}`)), run('q1', kstKey(-3))));
    await assertFails(setDoc(doc(as('kid'), path(`runs/q1_${kstKey(1)}`)), run('q1', kstKey(1))));
  });

  it('기한이 지난 한 번짜리 퀘스트는 절반으로만 낼 수 있다', async () => {
    const due = kstKey(-5);
    await seed({ [path('quests/q1')]: quest({ reward: 11, repeat: { type: 'none', date: due } }) });
    await assertFails(setDoc(doc(as('kid'), path(`runs/q1_${due}`)), run('q1', due, { reward: 11, late: false })));
    await assertSucceeds(setDoc(doc(as('kid'), path(`runs/q1_${due}`)), run('q1', due, { reward: 6, late: true })));
  });

  it('반복 퀘스트는 미래 날짜로 낼 수 없고, 어제 것은 절반만', async () => {
    await seed({ [path('quests/d1')]: quest({ repeat: { type: 'daily' } }) });
    const base = { oneOff: false };
    await assertFails(setDoc(doc(as('kid'), path(`runs/d1_${kstKey(1)}`)), run('d1', kstKey(1), base)));
    await assertFails(setDoc(doc(as('kid'), path(`runs/d1_${kstKey(-1)}`)), run('d1', kstKey(-1), base)));
    await assertSucceeds(setDoc(doc(as('kid'), path(`runs/d1_${kstKey(-1)}`)), run('d1', kstKey(-1), { ...base, late: true, reward: 5 })));
    await assertSucceeds(setDoc(doc(as('kid'), path(`runs/d1_${kstKey()}`)), run('d1', kstKey(), base)));
  });

  it('남의 퀘스트는 낼 수 없다', async () => {
    await seed({ [path('quests/q1')]: quest({ assigneeUid: 'mom' }) });
    await assertFails(setDoc(doc(as('kid'), path(`runs/q1_${kstKey()}`)), run('q1', kstKey())));
  });

  it('포기: 내 퀘스트를 코인 없이 포기할 수 있고, 코인을 붙이면 안 된다', async () => {
    const due = kstKey(-2);
    await seed({ [path('quests/q1')]: quest({ repeat: { type: 'none', date: due } }) });
    const skip = run('q1', due, { status: 'skipped', reward: 0 });
    await assertFails(setDoc(doc(as('kid'), path(`runs/q1_${due}`)), { ...skip, reward: 5 }));
    await assertSucceeds(setDoc(doc(as('kid'), path(`runs/q1_${due}`)), skip));
  });

  it('포기한 기록은 다시 바꿀 수 없다', async () => {
    const due = kstKey(-2);
    await seed({
      [path('quests/q1')]: quest({ repeat: { type: 'none', date: due } }),
      [path(`runs/q1_${due}`)]: run('q1', due, { status: 'skipped', reward: 0 }),
    });
    await assertFails(setDoc(doc(as('kid'), path(`runs/q1_${due}`)), run('q1', due, { late: true, reward: 5 })));
  });
});

describe.skipIf(nearMidnight)('자주 쓰는 퀘스트 버튼', () => {
  beforeEach(async () => {
    await seed({ [path('presets/p1')]: { title: '설거지', reward: 5, childCanAdd: true } });
  });

  const presetQuest = (day: string) => ({ ...quest({ title: '설거지', reward: 5, repeat: { type: 'none', date: day } }), presetId: 'p1' });

  it('오늘 날짜로는 만들 수 있다', async () => {
    await assertSucceeds(setDoc(doc(as('kid'), path(`quests/p1_kid_${kstKey()}`)), presetQuest(kstKey())));
  });

  it('다른 날짜로 하루 한 번 제한을 우회할 수 없다', async () => {
    await assertFails(setDoc(doc(as('kid'), path(`quests/p1_kid_${kstKey(-1)}`)), presetQuest(kstKey(-1))));
    await assertFails(setDoc(doc(as('kid'), path(`quests/p1_kid_${kstKey(1)}`)), presetQuest(kstKey(1))));
  });
});

describe.skipIf(nearMidnight)('위치 공유 코인', () => {
  function checkinBatch(db: Firestore, dayNum: number, count: number) {
    const batch = writeBatch(db);
    batch.set(doc(db, path(`ledger/checkin_kid_${dayNum}_${count}`)), {
      uid: 'kid', amount: 1, type: 'checkin', refId: 'loc1', memo: '위치 공유', note: '', by: 'kid', at: Date.now(),
    });
    batch.update(doc(db, path('members/kid')), { coins: increment(1), checkin: { dayNum, count } });
    return batch.commit();
  }

  it('오늘 날짜로 받을 수 있다', async () => {
    await assertSucceeds(checkinBatch(as('kid'), kstDayNum(), 1));
  });

  it('하루 횟수(기본 3번)를 넘을 수 없다', async () => {
    await seed({ [path('members/kid')]: { uid: 'kid', role: 'child', coins: 100, checkin: { dayNum: kstDayNum(), count: 3 } } });
    await assertFails(checkinBatch(as('kid'), kstDayNum(), 4));
  });

  it('내일 날짜로 미리 받을 수 없다', async () => {
    await seed({ [path('members/kid')]: { uid: 'kid', role: 'child', coins: 100, checkin: { dayNum: kstDayNum(), count: 3 } } });
    await assertFails(checkinBatch(as('kid'), kstDayNum(1), 1));
  });

  it('금액을 부풀릴 수 없다', async () => {
    const db = as('kid');
    const batch = writeBatch(db);
    const dayNum = kstDayNum();
    batch.set(doc(db, path(`ledger/checkin_kid_${dayNum}_1`)), { uid: 'kid', amount: 5, type: 'checkin', refId: 'x', memo: '', note: '', by: 'kid', at: 1 });
    batch.update(doc(db, path('members/kid')), { coins: increment(5), checkin: { dayNum, count: 1 } });
    await assertFails(batch.commit());
  });
});

describe('스티커 구매', () => {
  function buy(db: Firestore, packId: string, price: number) {
    const batch = writeBatch(db);
    batch.set(doc(db, path(`ledger/sticker-kid-${packId}`)), {
      uid: 'kid', amount: -price, type: 'sticker', refId: packId, memo: '스티커', note: '', by: 'kid', at: Date.now(),
    });
    batch.update(doc(db, path('members/kid')), { coins: increment(-price), stickerPacks: arrayUnion(packId) });
    return batch.commit();
  }

  it('정해진 가격으로 살 수 있다', async () => {
    await assertSucceeds(buy(as('kid'), 'animal', 100));
  });

  it('가격을 깎을 수 없다', async () => {
    await assertFails(buy(as('kid'), 'animal', 10));
  });

  it('코인이 모자라면 살 수 없다', async () => {
    await seed({ [path('members/kid')]: { uid: 'kid', role: 'child', coins: 30 } });
    await assertFails(buy(as('kid'), 'animal', 100));
  });

  it('숨긴 팩은 살 수 없다', async () => {
    await seed({ [path('stickerPrices/animal')]: { price: 100, hidden: true } });
    await assertFails(buy(as('kid'), 'animal', 100));
  });

  it('부모가 정한 가격을 따른다', async () => {
    await seed({ [path('stickerPrices/animal')]: { price: 20, hidden: false } });
    await assertFails(buy(as('kid'), 'animal', 100));
    await assertSucceeds(buy(as('kid'), 'animal', 20));
  });

  it('없는 팩은 살 수 없다', async () => {
    await assertFails(buy(as('kid'), 'nothing', 100));
  });

  it('이미 가진 팩은 다시 살 수 없다', async () => {
    await seed({ [path('members/kid')]: { uid: 'kid', role: 'child', coins: 300, stickerPacks: ['animal'] } });
    await assertFails(buy(as('kid'), 'animal', 100));
  });
});

describe('보상 사용 완료(orders)', () => {
  const order = (status: string) => ({
    rewardId: 'r1', rewardTitle: '게임 30분', icon: 'game', price: 30, uid: 'kid', status,
    requestedAt: 1, requestedDay: kstKey(), decidedBy: status === 'requested' ? null : 'mom', decidedAt: null,
    rejectReason: '', deliveredBy: null, deliveredAt: null,
  });
  const deliver = (by: string) => ({ status: 'delivered', deliveredBy: by, deliveredAt: Date.now() });

  it('자녀는 상점의 보상을 적힌 이름과 가격 그대로 신청할 수 있다', async () => {
    await seed({ [path('rewards/r1')]: { title: '게임 30분', price: 30, active: true } });
    await assertSucceeds(setDoc(doc(as('kid'), path('orders/new1')), order('requested')));
    await assertFails(setDoc(doc(as('kid'), path('orders/new2')), { ...order('requested'), price: 1 }));
    await assertFails(setDoc(doc(as('kid'), path('orders/new3')), { ...order('requested'), rewardTitle: '게임 3시간' }));
    await assertFails(setDoc(doc(as('kid'), path('orders/new4')), { ...order('requested'), extra: true }));
  });

  it('가진 코인보다 비싼 보상은 신청할 수 없다', async () => {
    await seed({ [path('rewards/r1')]: { title: '게임 30분', price: 300, active: true } });
    await assertFails(setDoc(doc(as('kid'), path('orders/new1')), { ...order('requested'), price: 300 }));
  });

  it('신청 날짜는 오늘이어야 한다', async () => {
    await seed({ [path('rewards/r1')]: { title: '게임 30분', price: 30, active: true } });
    await assertFails(setDoc(doc(as('kid'), path('orders/new1')), { ...order('requested'), requestedDay: kstKey(-3) }));
  });

  it('승인된 보상은 자녀 본인이 사용 완료할 수 있다', async () => {
    await seed({ [path('orders/o1')]: order('approved') });
    await assertSucceeds(updateDoc(doc(as('kid'), path('orders/o1')), deliver('kid')));
  });

  it('부모도 사용 완료할 수 있다', async () => {
    await seed({ [path('orders/o1')]: order('approved') });
    await assertSucceeds(updateDoc(doc(as('dad'), path('orders/o1')), deliver('dad')));
  });

  it('승인 전에는 사용 완료할 수 없다', async () => {
    await seed({ [path('orders/o1')]: order('requested') });
    await assertFails(updateDoc(doc(as('kid'), path('orders/o1')), deliver('kid')));
  });

  it('사용 완료하면서 다른 칸을 바꿀 수 없다', async () => {
    await seed({ [path('orders/o1')]: order('approved') });
    await assertFails(updateDoc(doc(as('kid'), path('orders/o1')), { ...deliver('kid'), price: 0 }));
  });
});

describe('가족 메모', () => {
  const note = (toUids: string[]) => ({ text: '우유 사 와', toUids, until: kstKey(1), readBy: [], createdBy: 'mom', createdAt: 1, hiddenAt: 0 });

  it('받은 사람은 확인 표시를 할 수 있다', async () => {
    await seed({ [path('notes/n1')]: note(['kid']) });
    await assertSucceeds(updateDoc(doc(as('kid'), path('notes/n1')), { readBy: ['kid'] }));
  });

  it('가족 모두에게 쓴 메모는 누구나 확인할 수 있다', async () => {
    await seed({ [path('notes/n1')]: note([]) });
    await assertSucceeds(updateDoc(doc(as('kid'), path('notes/n1')), { readBy: ['kid'] }));
  });

  it('받지 않은 사람은 확인 표시를 할 수 없다', async () => {
    await seed({ [path('notes/n1')]: note(['dad']) });
    await assertFails(updateDoc(doc(as('kid'), path('notes/n1')), { readBy: ['kid'] }));
  });

  it('받은 사람은 메모를 숨기거나 고칠 수 없다', async () => {
    await seed({ [path('notes/n1')]: note(['kid']) });
    await assertFails(updateDoc(doc(as('kid'), path('notes/n1')), { hiddenAt: Date.now() }));
    await assertFails(updateDoc(doc(as('kid'), path('notes/n1')), { text: '바꿈' }));
  });

  it('쓴 사람은 숨길 수 있다', async () => {
    await seed({ [path('notes/n1')]: note(['kid']) });
    await assertSucceeds(updateDoc(doc(as('mom'), path('notes/n1')), { hiddenAt: Date.now() }));
  });
});

describe('꾸미기 상품 구매', () => {
  function buy(db: Firestore, itemId: string, price: number) {
    const batch = writeBatch(db);
    batch.set(doc(db, path(`ledger/wardrobe-kid-${itemId}`)), {
      uid: 'kid', amount: -price, type: 'wardrobe', refId: itemId, memo: '꾸미기', note: '', by: 'kid', at: Date.now(),
    });
    batch.update(doc(db, path('members/kid')), { coins: increment(-price), wardrobe: arrayUnion(itemId) });
    return batch.commit();
  }

  it('정해진 가격으로 아이템과 캐릭터를 살 수 있다', async () => {
    await seed({ [path('members/kid')]: { uid: 'kid', role: 'child', coins: 1000, avatar: { id: 'rabbit', color: 'pink' } } });
    await assertSucceeds(buy(as('kid'), 'crown', 200));
    await assertSucceeds(buy(as('kid'), 'whale', 300));
  });

  it('가격을 깎거나 없는 상품을 살 수 없다', async () => {
    await assertFails(buy(as('kid'), 'crown', 20));
    await assertFails(buy(as('kid'), 'nothing', 10));
  });

  it('코인이 모자라면 살 수 없다', async () => {
    await assertFails(buy(as('kid'), 'crown', 200));
  });

  it('숨긴 상품은 살 수 없고, 부모가 정한 가격을 따른다', async () => {
    await seed({
      [path('members/kid')]: { uid: 'kid', role: 'child', coins: 1000 },
      [path('wardrobePrices/crown')]: { price: 200, hidden: true },
      [path('wardrobePrices/cape')]: { price: 30, hidden: false },
    });
    await assertFails(buy(as('kid'), 'crown', 200));
    await assertFails(buy(as('kid'), 'cape', 150));
    await assertSucceeds(buy(as('kid'), 'cape', 30));
  });

  it('부모만 가격을 정할 수 있다', async () => {
    await assertFails(setDoc(doc(as('kid'), path('wardrobePrices/crown')), { price: 1, hidden: false }));
    await assertSucceeds(setDoc(doc(as('mom'), path('wardrobePrices/crown')), { price: 10, hidden: false }));
    await assertFails(setDoc(doc(as('mom'), path('wardrobePrices/nothing')), { price: 10, hidden: false }));
  });
});

describe('캐릭터 꾸미기(입기)', () => {
  const kidWith = (wardrobe: string[]) => ({ uid: 'kid', role: 'child', coins: 0, avatar: { id: 'rabbit', color: 'pink' }, wardrobe });

  it('자녀는 가진 아이템과 캐릭터만 입을 수 있다', async () => {
    await seed({ [path('members/kid')]: kidWith(['crown', 'whale']) });
    await assertSucceeds(updateDoc(doc(as('kid'), path('members/kid')), { avatar: { id: 'whale', color: 'sky', wear: { hat: 'crown' } } }));
    await assertFails(updateDoc(doc(as('kid'), path('members/kid')), { avatar: { id: 'whale', color: 'sky', wear: { hat: 'crown', face: 'sunglasses' } } }));
    await assertFails(updateDoc(doc(as('kid'), path('members/kid')), { avatar: { id: 'panda', color: 'sky' } }));
  });

  it('무료 캐릭터는 누구나 고를 수 있다', async () => {
    await seed({ [path('members/kid')]: kidWith([]) });
    await assertSucceeds(updateDoc(doc(as('kid'), path('members/kid')), { avatar: { id: 'cat', color: 'peach' } }));
  });

  it('부모는 무엇이든 입을 수 있다', async () => {
    await seed({ [path('members/mom')]: { uid: 'mom', role: 'parent', coins: 0, avatar: { id: 'rabbit', color: 'pink' } } });
    await assertSucceeds(updateDoc(doc(as('mom'), path('members/mom')), { avatar: { id: 'astronaut', color: 'peach', wear: { hat: 'crown', hand: 'wand' } } }));
  });

  it('새로 들어오는 자녀는 산 것을 가지고 들어올 수 없다', async () => {
    await seed({ ['invites/ABC234']: { familyId: FID, role: 'child', createdBy: 'mom', expiresAt: Date.now() + DAY_MS } });
    const join = (data: object) => setDoc(doc(as('kid2'), path('members/kid2')), {
      uid: 'kid2', role: 'child', coins: 0, displayName: '둘째', inviteCode: 'ABC234', avatar: { id: 'cat', color: 'peach' }, ...data,
    });
    await assertFails(join({ wardrobe: ['crown'] }));
    await assertFails(join({ stickerPacks: ['animal'] }));
    await assertFails(join({ avatar: { id: 'whale', color: 'sky' } }));
    await assertSucceeds(join({}));
  });
});

describe.skipIf(nearMidnight)('보상 구매 제한(번호표)', () => {
  const today = kstKey();
  const slotId = (periodKey: string, slot: number) => `limit_kid_r1_${periodKey}_${slot}`;
  const order = (periodKey: string, slot: number, overrides: object = {}) => ({
    rewardId: 'r1', rewardTitle: '게임 30분', icon: 'game', price: 30, uid: 'kid', status: 'requested',
    requestedAt: 1, requestedDay: today, decidedBy: null, decidedAt: null,
    rejectReason: '', deliveredBy: null, deliveredAt: null, periodKey, slot, ...overrides,
  });
  const reward = (period: string, count: number) => ({ title: '게임 30분', price: 30, active: true, limit: { period, count } });
  /** 오늘이 든 주의 월요일 */
  const monday = (() => {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    return kstKey(weekday === 0 ? -6 : 1 - weekday);
  })();

  it('하루 1번 보상은 번호 1만 신청할 수 있다', async () => {
    await seed({ [path('rewards/r1')]: reward('day', 1) });
    await assertFails(setDoc(doc(as('kid'), path('orders/random')), order(today, 1)));
    await assertFails(setDoc(doc(as('kid'), path(`orders/${slotId(today, 2)}`)), order(today, 2)));
    await assertFails(setDoc(doc(as('kid'), path(`orders/${slotId(kstKey(-1), 1)}`)), order(kstKey(-1), 1)));
    await assertSucceeds(setDoc(doc(as('kid'), path(`orders/${slotId(today, 1)}`)), order(today, 1)));
  });

  it('같은 번호로 다시 신청할 수 없다', async () => {
    await seed({ [path('rewards/r1')]: reward('day', 1), [path(`orders/${slotId(today, 1)}`)]: order(today, 1) });
    await assertFails(setDoc(doc(as('kid'), path(`orders/${slotId(today, 1)}`)), order(today, 1)));
  });

  it('거절된 번호가 있으면 다음 번호를 쓸 수 있다', async () => {
    await seed({ [path('rewards/r1')]: reward('day', 1), [path(`orders/${slotId(today, 1)}`)]: order(today, 1, { status: 'rejected' }) });
    await assertSucceeds(setDoc(doc(as('kid'), path(`orders/${slotId(today, 2)}`)), order(today, 2)));
  });

  it('승인된 번호 다음 번호는 쓸 수 없다', async () => {
    await seed({ [path('rewards/r1')]: reward('day', 1), [path(`orders/${slotId(today, 1)}`)]: order(today, 1, { status: 'approved' }) });
    await assertFails(setDoc(doc(as('kid'), path(`orders/${slotId(today, 2)}`)), order(today, 2)));
  });

  it('일주일 제한은 그 주 월요일 번호표를 쓴다', async () => {
    await seed({ [path('rewards/r1')]: reward('week', 2) });
    // 월요일이면 오늘이 곧 주의 첫날이라 이 확인은 건너뛴다.
    if (today !== monday) await assertFails(setDoc(doc(as('kid'), path(`orders/${slotId(today, 1)}`)), order(today, 1)));
    await assertSucceeds(setDoc(doc(as('kid'), path(`orders/${slotId(monday, 2)}`)), order(monday, 2)));
    await assertFails(setDoc(doc(as('kid'), path(`orders/${slotId(monday, 3)}`)), order(monday, 3)));
  });

  it('제한 없는 보상에는 번호표를 붙일 수 없다', async () => {
    await seed({ [path('rewards/r1')]: { title: '게임 30분', price: 30, active: true } });
    await assertFails(setDoc(doc(as('kid'), path(`orders/${slotId(today, 1)}`)), order(today, 1)));
  });
});

describe('인형뽑기(clawRounds, 장부)', () => {
  const round = { uid: 'kid', day: kstKey(), startedAt: Date.now(), status: 'playing', practice: false, targets: [{ x: 50, y: 40 }], reach: 6 };
  const entry = (type: string, amount: number) => ({ uid: 'kid', amount, type, refId: 'r1', memo: '인형뽑기', note: '', by: 'mom', at: Date.now() });

  it('가족은 판을 읽을 수 있고, 가족이 아니면 못 읽는다', async () => {
    await seed({ [path('clawRounds/r1')]: round });
    await assertSucceeds(getDoc(doc(as('kid'), path('clawRounds/r1'))));
    await assertSucceeds(getDoc(doc(as('mom'), path('clawRounds/r1'))));
    await assertFails(getDoc(doc(as('stranger'), path('clawRounds/r1'))));
  });

  it('판은 폰에서 만들거나 고칠 수 없다(서버 함수만)', async () => {
    await assertFails(setDoc(doc(as('kid'), path('clawRounds/r2')), round));
    await assertFails(setDoc(doc(as('mom'), path('clawRounds/r2')), round));
    await seed({ [path('clawRounds/r1')]: round });
    await assertFails(updateDoc(doc(as('kid'), path('clawRounds/r1')), { status: 'done', outcome: 'win' }));
  });

  it('부모도 인형뽑기 장부(판값, 상품)는 직접 쓸 수 없다', async () => {
    await assertFails(setDoc(doc(as('mom'), path('ledger/claw-r1')), entry('claw', -10)));
    await assertFails(setDoc(doc(as('mom'), path('ledger/clawwin-r1')), entry('clawPrize', 50)));
    await assertFails(setDoc(doc(as('kid'), path('ledger/clawwin-r1')), { ...entry('clawPrize', 50), by: 'kid' }));
    // 다른 장부는 그대로 쓸 수 있다
    await assertSucceeds(setDoc(doc(as('mom'), path('ledger/g1')), { ...entry('gift', 5), refId: 'g1', memo: '칭찬 코인' }));
  });
});
