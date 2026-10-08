import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBackend } from '../src/backend/demo';
import type {
  ApproveOptions,
  Backend,
  CalendarEvent,
  Family,
  Food,
  LedgerEntry,
  LocationRecord,
  Member,
  Order,
  Place,
  Preset,
  Proposal,
  Quest,
  Reward,
  Run,
  Wish,
} from '../src/backend/types';
import { categoryOf, ratingSummary } from '../src/domain/foods';
import { DEFAULT_SETTINGS } from '../src/domain/settings';
import { planStreak } from '../src/domain/streak';
import { addDays, dateKey } from '../src/lib/dates';

const FAMILY = 'demo-family';
const today = dateKey();
const profile = { displayName: '동생', avatar: { id: 'chick', color: 'yellow' } };
const plain: ApproveOptions = { praise: '', streak: null };

let backend: Backend;

function snapshot<T>(subscribe: (cb: (value: T) => void) => () => void): T {
  let value!: T;
  subscribe((v) => (value = v))();
  return value;
}
const family = () => snapshot<Family | null>((cb) => backend.watchFamily(FAMILY, cb))!;
const members = () => snapshot<Member[]>((cb) => backend.watchMembers(FAMILY, cb));
const quests = () => snapshot<Quest[]>((cb) => backend.watchQuests(FAMILY, cb));
const runs = () => snapshot<Run[]>((cb) => backend.watchRuns(FAMILY, '2000-01-01', cb));
const ledger = () => snapshot<LedgerEntry[]>((cb) => backend.watchLedger(FAMILY, cb));
const presets = () => snapshot<Preset[]>((cb) => backend.watchPresets(FAMILY, cb));
const proposals = () => snapshot<Proposal[]>((cb) => backend.watchProposals(FAMILY, today, cb));
const kid = () => members().find((m) => m.uid === 'demo-kid')!;
const rewards = () => snapshot<Reward[]>((cb) => backend.watchRewards(FAMILY, cb));
const orders = () => snapshot<Order[]>((cb) => backend.watchOrders(FAMILY, addDays(today, -7), cb));
const rewardById = (id: string) => rewards().find((r) => r.id === id)!;
const foods = () => snapshot<Food[]>((cb) => backend.watchFoods(FAMILY, cb));
const foodById = (id: string) => foods().find((f) => f.id === id);
const wishes = () => snapshot<Wish[]>((cb) => backend.watchWishes(FAMILY, cb));
const wishById = (id: string) => wishes().find((w) => w.id === id);
const events = () => snapshot<CalendarEvent[]>((cb) => backend.watchEvents(FAMILY, cb));
const eventById = (id: string) => events().find((e) => e.id === id);
const locations = () => snapshot<LocationRecord[]>((cb) => backend.watchLocations(FAMILY, 0, cb));
const places = () => snapshot<Place[]>((cb) => backend.watchPlaces(FAMILY, cb));
const questById = (id: string) => quests().find((q) => q.id === id)!;
const runById = (id: string) => runs().find((r) => r.id === id)!;
const proposalById = (id: string) => proposals().find((p) => p.id === id)!;
const as = (uid: string) => backend.demo!.loginAs(uid);
const ledgerSum = () =>
  ledger()
    .filter((e) => e.uid === 'demo-kid')
    .reduce((total, e) => total + e.amount, 0);

beforeEach(() => {
  backend = createDemoBackend(null);
});

describe('예시 데이터', () => {
  it('잔액이 장부 합계와 같다', () => {
    expect(kid().coins).toBe(30);
    expect(ledgerSum()).toBe(30);
  });
});

describe('승인과 코인 적립', () => {
  it('부모가 승인하면 코인, 장부, 기록, 한마디가 함께 반영된다', async () => {
    as('demo-kid');
    await backend.submitRun(FAMILY, questById('q-math'), today, 'demo-kid', false);
    expect(kid().coins).toBe(30); // 승인 전에는 적립되지 않는다

    as('demo-dad');
    await backend.approveRun(FAMILY, `q-math_${today}`, 'demo-dad', { praise: '최고야!', streak: null });
    expect(kid().coins).toBe(40);
    expect(ledger().find((e) => e.id === `q-math_${today}`)).toMatchObject({
      uid: 'demo-kid',
      amount: 10,
      by: 'demo-dad',
      type: 'quest',
      note: '최고야!',
    });
    expect(runById(`q-math_${today}`)).toMatchObject({ status: 'approved', praise: '최고야!' });
  });

  it('부모 중 한 명만 승인하면 되고, 두 번 지급되지 않는다', async () => {
    const pendingId = `q-read_${today}`;
    as('demo-mom');
    await backend.approveRun(FAMILY, pendingId, 'demo-mom', plain);
    as('demo-dad');
    await expect(backend.approveRun(FAMILY, pendingId, 'demo-dad', plain)).rejects.toThrow('이미');
    expect(kid().coins).toBe(40);
    expect(ledger().filter((e) => e.refId === pendingId)).toHaveLength(1);
  });

  it('한 번짜리 퀘스트는 승인되면 목록에서 빠진다', async () => {
    as('demo-kid');
    await backend.submitRun(FAMILY, questById('q-piano'), today, 'demo-kid', false);
    as('demo-dad');
    await backend.approveRun(FAMILY, `q-piano_${today}`, 'demo-dad', plain);
    expect(quests().some((q) => q.id === 'q-piano')).toBe(false);
  });
});

describe('놓친 일은 절반', () => {
  it('늦게 한 반복 퀘스트는 절반(올림)만 받는다', async () => {
    const twoDaysAgo = addDays(today, -2);
    as('demo-dad');
    await backend.updateQuest(FAMILY, 'q-read', { ...questById('q-read'), reward: 15 });
    as('demo-kid');
    await backend.submitRun(FAMILY, questById('q-read'), twoDaysAgo, 'demo-kid', true);
    expect(runById(`q-read_${twoDaysAgo}`)).toMatchObject({ late: true, reward: 8 });
    as('demo-dad');
    await backend.approveRun(FAMILY, `q-read_${twoDaysAgo}`, 'demo-dad', plain);
    expect(kid().coins).toBe(38);
  });
});

describe('연속 달성 보너스', () => {
  async function finishToday() {
    // 요일에 따라 결과가 달라지지 않도록 주 1회 퀘스트는 빼고 본다.
    as('demo-dad');
    await backend.archiveQuest(FAMILY, 'q-room');
    as('demo-kid');
    await backend.submitRun(FAMILY, questById('q-math'), today, 'demo-kid', false);
    as('demo-dad');
    for (const id of [`q-math_${today}`, `q-read_${today}`]) {
      const streak = planStreak(quests(), runs(), kid(), runById(id), family().settings);
      await backend.approveRun(FAMILY, id, 'demo-dad', { praise: '', streak });
    }
  }

  it('오늘의 반복 퀘스트를 모두 승인받으면 3일 연속 보너스가 한 번 지급된다', async () => {
    await finishToday();
    expect(kid().streak).toEqual({ count: 3, lastDate: today });
    const bonus = ledger().filter((e) => e.type === 'bonus');
    expect(bonus).toHaveLength(1);
    expect(bonus[0]).toMatchObject({ amount: 10, memo: '3일 연속 달성 보너스' });
    expect(kid().coins).toBe(30 + 10 + 10 + 10);
    expect(kid().coins).toBe(ledgerSum());
  });

  it('보너스를 꺼 두면 연속 기록만 늘고 코인은 그대로다', async () => {
    as('demo-dad');
    await backend.updateSettings(FAMILY, { ...DEFAULT_SETTINGS, streakOn: false });
    await finishToday();
    expect(kid().streak).toEqual({ count: 3, lastDate: today });
    expect(ledger().some((e) => e.type === 'bonus')).toBe(false);
    expect(kid().coins).toBe(50);
  });
});

describe('칭찬 코인', () => {
  it('부모가 한마디와 함께 바로 줄 수 있다', async () => {
    as('demo-mom');
    await backend.giveCoins(FAMILY, 'demo-kid', 5, '동생을 잘 돌봤어', 'demo-mom');
    expect(kid().coins).toBe(35);
    expect(ledger()[0]).toMatchObject({ type: 'gift', amount: 5, note: '동생을 잘 돌봤어', by: 'demo-mom' });
    expect(kid().coins).toBe(ledgerSum());
  });
  it('자녀는 줄 수 없고, 금액은 1 이상이어야 한다', async () => {
    as('demo-kid');
    await expect(backend.giveCoins(FAMILY, 'demo-kid', 100, '', 'demo-kid')).rejects.toThrow('부모만');
    as('demo-dad');
    await expect(backend.giveCoins(FAMILY, 'demo-kid', 0, '', 'demo-dad')).rejects.toThrow('1부터');
    expect(kid().coins).toBe(30);
  });
});

describe('권한', () => {
  it('자녀는 승인하거나 퀘스트, 초대코드, 버튼, 설정을 만들 수 없다', async () => {
    as('demo-kid');
    const input = { title: '게임하기', note: '', assigneeUid: 'demo-kid', reward: 999, repeat: { type: 'daily' as const }, important: false };
    await expect(backend.approveRun(FAMILY, `q-read_${today}`, 'demo-kid', plain)).rejects.toThrow('부모만');
    await expect(backend.createQuest(FAMILY, input, 'demo-kid')).rejects.toThrow('부모만');
    await expect(backend.createInvite(FAMILY, 'parent', 'demo-kid')).rejects.toThrow('부모만');
    await expect(backend.createPreset(FAMILY, { title: '게임', reward: 500, childCanAdd: true })).rejects.toThrow('부모만');
    await expect(backend.updateSettings(FAMILY, { ...DEFAULT_SETTINGS, maxProposalCoins: 1000 })).rejects.toThrow('부모만');
  });

  it('다른 사람 이름으로는 처리할 수 없다', async () => {
    as('demo-kid');
    await expect(backend.approveRun(FAMILY, `q-read_${today}`, 'demo-dad', plain)).rejects.toThrow('본인만');
  });

  it('같은 퀘스트를 하루에 두 번 완료 요청할 수 없다', async () => {
    as('demo-kid');
    await expect(backend.submitRun(FAMILY, questById('q-read'), today, 'demo-kid', false)).rejects.toThrow('이미');
  });
});

describe('반려와 다시 도전', () => {
  it('반려되면 코인 없이 돌아오고, 다시 제출해 승인받을 수 있다', async () => {
    const id = `q-read_${today}`;
    as('demo-dad');
    await backend.rejectRun(FAMILY, id, 'demo-dad', '조금만 더 해 보자');
    expect(runById(id)).toMatchObject({ status: 'rejected', rejectReason: '조금만 더 해 보자' });
    expect(kid().coins).toBe(30);

    as('demo-kid');
    await backend.submitRun(FAMILY, questById('q-read'), today, 'demo-kid', false);
    expect(runById(id).status).toBe('submitted');

    as('demo-mom');
    await backend.approveRun(FAMILY, id, 'demo-mom', plain);
    expect(kid().coins).toBe(40);
  });

  it('확인 전에는 자녀가 완료 요청을 취소할 수 있다', async () => {
    as('demo-kid');
    await backend.cancelRun(FAMILY, `q-read_${today}`);
    expect(runs().some((r) => r.id === `q-read_${today}`)).toBe(false);
  });
});

describe('코인 협상', () => {
  // 예시 데이터: 딸이 "신발장 정리하기"에 20코인을 제안해 둔 상태
  it('세 번까지 주고받고, 부모가 수락하면 그 금액의 퀘스트가 된다', async () => {
    as('demo-dad');
    await backend.counterProposal(FAMILY, 'n-shoes', 10, '10이면 어때?', 'demo-dad');
    expect(proposalById('n-shoes')).toMatchObject({ lastAmount: 10, lastRole: 'parent', offerCount: 2 });

    as('demo-kid');
    await backend.counterProposal(FAMILY, 'n-shoes', 15, '', 'demo-kid');
    expect(proposalById('n-shoes')).toMatchObject({ lastAmount: 15, lastRole: 'child', offerCount: 3 });

    as('demo-dad');
    await expect(backend.counterProposal(FAMILY, 'n-shoes', 12, '', 'demo-dad')).rejects.toThrow('더는');
    await backend.acceptProposal(FAMILY, 'n-shoes', 'demo-dad');
    expect(questById('n-shoes')).toMatchObject({
      title: '신발장 정리하기',
      reward: 15,
      assigneeUid: 'demo-kid',
      repeat: { type: 'none', date: today },
    });
    expect(proposals().some((p) => p.id === 'n-shoes')).toBe(false); // 합의된 제안은 목록에서 빠진다
    expect(kid().coins).toBe(30); // 합의만으로는 코인이 생기지 않는다
  });

  it('자녀가 부모의 제안을 수락하면 부모가 낸 금액으로 정해진다', async () => {
    as('demo-dad');
    await backend.counterProposal(FAMILY, 'n-shoes', 8, '', 'demo-dad');
    as('demo-kid');
    await backend.acceptProposal(FAMILY, 'n-shoes', 'demo-kid');
    expect(questById('n-shoes').reward).toBe(8);
  });

  it('자기 제안을 스스로 수락하거나 차례가 아닐 때 다시 제안할 수 없다', async () => {
    as('demo-kid');
    await expect(backend.acceptProposal(FAMILY, 'n-shoes', 'demo-kid')).rejects.toThrow('상대가 답할 차례');
    await expect(backend.counterProposal(FAMILY, 'n-shoes', 50, '', 'demo-kid')).rejects.toThrow('상대가 답할 차례');
    expect(quests().some((q) => q.id === 'n-shoes')).toBe(false);
  });

  it('자녀는 설정한 상한까지만 제안할 수 있다', async () => {
    as('demo-kid');
    const input = { title: '창문 닦기', note: '', date: today, important: false, amount: 51 };
    await expect(backend.createProposal(FAMILY, input, 'demo-kid')).rejects.toThrow('50까지');
    const id = await backend.createProposal(FAMILY, { ...input, amount: 50 }, 'demo-kid');
    expect(proposalById(id)).toMatchObject({ status: 'negotiating', lastAmount: 50, lastRole: 'child', offerCount: 1 });
  });

  it('횟수를 1번으로 줄이면 부모는 수락하거나 거절만 할 수 있다', async () => {
    as('demo-dad');
    await backend.updateSettings(FAMILY, { ...DEFAULT_SETTINGS, maxRounds: 1 });
    await expect(backend.counterProposal(FAMILY, 'n-shoes', 10, '', 'demo-dad')).rejects.toThrow('더는');
    await backend.declineProposal(FAMILY, 'n-shoes', 'demo-dad');
    expect(proposalById('n-shoes')).toMatchObject({ status: 'memo', declined: true });
    expect(quests().some((q) => q.id === 'n-shoes')).toBe(false);
  });

  it('자녀는 답을 기다리는 동안 제안을 그만둘 수 있다', async () => {
    as('demo-kid');
    await backend.declineProposal(FAMILY, 'n-shoes', 'demo-kid');
    expect(proposalById('n-shoes')).toMatchObject({ status: 'memo', declined: false });
  });
});

describe('내가 적은 메모', () => {
  it('코인 없이 추가하고, 끝냄 표시와 되돌리기, 지우기를 할 수 있다', async () => {
    as('demo-kid');
    const id = await backend.createProposal(
      FAMILY,
      { title: '체육복 챙기기', note: '', date: today, important: true, amount: null },
      'demo-kid',
    );
    expect(proposalById(id)).toMatchObject({ status: 'memo', important: true, lastAmount: null });
    await backend.setMemoDone(FAMILY, id, true, today);
    expect(proposalById(id)).toMatchObject({ status: 'done', doneDay: today });
    await backend.setMemoDone(FAMILY, id, false, today);
    expect(proposalById(id).status).toBe('memo');
    await backend.deleteProposal(FAMILY, id);
    expect(proposals().some((p) => p.id === id)).toBe(false);
    expect(kid().coins).toBe(30);
  });

  it('다른 사람의 메모는 바꾸거나 지울 수 없다', async () => {
    as('demo-dad');
    await expect(backend.setMemoDone(FAMILY, 'm-bag', true, today)).rejects.toThrow('내가 적은');
    await expect(backend.deleteProposal(FAMILY, 'm-bag')).rejects.toThrow('내가 적은');
  });
});

describe('자주 쓰는 퀘스트 버튼', () => {
  it('부모가 만들고 지운다', async () => {
    as('demo-dad');
    const id = await backend.createPreset(FAMILY, { title: ' 빨래 개기 ', reward: 10, childCanAdd: false });
    expect(presets().find((p) => p.id === id)).toMatchObject({ title: '빨래 개기', reward: 10, childCanAdd: false });
    await backend.deletePreset(FAMILY, id);
    expect(presets().some((p) => p.id === id)).toBe(false);
  });

  it('허용된 버튼은 자녀가 하루 한 번 스스로 추가할 수 있다', async () => {
    as('demo-kid');
    const dish = presets().find((p) => p.id === 'p-dish')!;
    await backend.addPresetQuestAsChild(FAMILY, dish, 'demo-kid', today);
    const added = quests().find((q) => q.title === '설거지 돕기')!;
    expect(added).toMatchObject({ reward: 10, assigneeUid: 'demo-kid', repeat: { type: 'none', date: today } });
    await expect(backend.addPresetQuestAsChild(FAMILY, dish, 'demo-kid', today)).rejects.toThrow('이미 추가');
    expect(kid().coins).toBe(30); // 추가만으로는 코인이 생기지 않는다
  });

  it('부모 전용 버튼이나 고친 금액으로는 추가할 수 없다', async () => {
    as('demo-kid');
    const errand = presets().find((p) => p.id === 'p-errand')!;
    await expect(backend.addPresetQuestAsChild(FAMILY, errand, 'demo-kid', today)).rejects.toThrow('스스로 추가할 수 없는');
    const forged = { ...presets().find((p) => p.id === 'p-dish')!, reward: 999 };
    await backend.addPresetQuestAsChild(FAMILY, forged, 'demo-kid', today);
    expect(quests().find((q) => q.title === '설거지 돕기')!.reward).toBe(10); // 저장된 금액을 쓴다
  });
});

describe('가족 설정', () => {
  it('부모가 바꾸면 저장되고, 잘못된 값은 거절된다', async () => {
    as('demo-mom');
    await backend.updateSettings(FAMILY, { ...DEFAULT_SETTINGS, maxRounds: 5, praises: ['멋져!'] });
    expect(family().settings).toMatchObject({ maxRounds: 5, praises: ['멋져!'] });
    await expect(backend.updateSettings(FAMILY, { ...DEFAULT_SETTINGS, maxRounds: 9 })).rejects.toThrow('협상 횟수');
  });
});

describe('가족 초대', () => {
  it('초대코드에 적힌 역할로 들어온다', async () => {
    as('demo-dad');
    const invite = await backend.createInvite(FAMILY, 'child', 'demo-dad');
    as('demo-new');
    await backend.joinFamily('demo-new', invite.code.toLowerCase(), profile);
    expect(members().find((m) => m.uid === 'demo-new')).toMatchObject({ role: 'child', displayName: '동생', coins: 0 });
  });

  it('틀린 코드는 거절한다', async () => {
    as('demo-new');
    await expect(backend.joinFamily('demo-new', 'ZZZZZZ', profile)).rejects.toThrow('찾을 수 없어요');
    await expect(backend.joinFamily('demo-new', '12', profile)).rejects.toThrow('6자리');
  });

  it('새 가족을 만들면 만든 사람이 부모가 되고 기본 설정이 들어간다', async () => {
    as('demo-new');
    const familyId = await backend.createFamily('demo-new', '새 가족', profile);
    const created = snapshot<Member[]>((cb) => backend.watchMembers(familyId, cb));
    expect(created).toHaveLength(1);
    expect(created[0].role).toBe('parent');
    expect(snapshot<Family | null>((cb) => backend.watchFamily(familyId, cb))!.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('퀘스트 관리', () => {
  it('부모는 만들고, 고치고, 지울 수 있다', async () => {
    as('demo-mom');
    const id = await backend.createQuest(
      FAMILY,
      { title: '식탁 차리기', note: '', assigneeUid: 'demo-kid', reward: 5, repeat: { type: 'weekly', days: [1, 3] }, important: true },
      'demo-mom',
    );
    expect(questById(id)).toMatchObject({ title: '식탁 차리기', important: true });
    await backend.updateQuest(FAMILY, id, { ...questById(id), reward: 15 });
    expect(questById(id).reward).toBe(15);
    await backend.archiveQuest(FAMILY, id);
    expect(quests().some((q) => q.id === id)).toBe(false);
  });
});

describe('상점', () => {
  // 예시 데이터: 딸 30코인. 간식 30, 게임 50(하루 1번), 늦게 자기 80, 영화 150, 선물 300
  async function buy(rewardId: string) {
    as('demo-kid');
    return backend.requestReward(FAMILY, rewardById(rewardId), 'demo-kid', today);
  }

  it('신청만으로는 코인이 빠지지 않고, 부모가 승인하면 빠진다', async () => {
    const id = await buy('r-snack');
    expect(kid().coins).toBe(30);
    expect(orders().find((o) => o.id === id)).toMatchObject({ status: 'requested', price: 30, rewardTitle: '먹고 싶은 간식' });

    as('demo-mom');
    await backend.approveOrder(FAMILY, id, 'demo-mom');
    expect(kid().coins).toBe(0);
    expect(ledger().find((e) => e.id === id)).toMatchObject({ type: 'reward', amount: -30, uid: 'demo-kid', by: 'demo-mom' });
    expect(kid().coins).toBe(ledgerSum());
    expect(orders().find((o) => o.id === id)!.status).toBe('approved');
  });

  it('승인은 한 번만 되고, 준 뒤에는 마무리할 수 있다', async () => {
    const id = await buy('r-snack');
    as('demo-dad');
    await backend.approveOrder(FAMILY, id, 'demo-dad');
    await expect(backend.approveOrder(FAMILY, id, 'demo-dad')).rejects.toThrow('이미');
    expect(kid().coins).toBe(0);
    await backend.deliverOrder(FAMILY, id, 'demo-dad');
    expect(orders().find((o) => o.id === id)).toMatchObject({ status: 'delivered', deliveredBy: 'demo-dad' });
    await expect(backend.deliverOrder(FAMILY, id, 'demo-dad')).rejects.toThrow('승인된 보상만');
  });

  it('코인이 모자라면 신청할 수 없고, 신청 중인 코인은 묶인다', async () => {
    await expect(buy('r-game')).rejects.toThrow('코인이 20개 모자라요');
    await buy('r-snack'); // 30코인이 묶임
    await expect(buy('r-snack')).rejects.toThrow('코인이 30개 모자라요');
  });

  it('묶인 코인까지만 신청할 수 있어서 잔액이 0 아래로 내려가지 않는다', async () => {
    as('demo-dad');
    await backend.giveCoins(FAMILY, 'demo-kid', 30, '', 'demo-dad'); // 60코인
    const first = await buy('r-snack');
    const second = await buy('r-snack');
    await expect(buy('r-snack')).rejects.toThrow('모자라요'); // 세 번째는 60코인을 넘는다
    as('demo-dad');
    await backend.approveOrder(FAMILY, first, 'demo-dad');
    await backend.approveOrder(FAMILY, second, 'demo-dad');
    expect(kid().coins).toBe(0);
    expect(kid().coins).toBe(ledgerSum());
  });

  it('거절하면 코인은 그대로이고, 자녀는 승인 전에 취소할 수 있다', async () => {
    const id = await buy('r-snack');
    as('demo-dad');
    await backend.rejectOrder(FAMILY, id, 'demo-dad', '숙제 먼저 하자');
    expect(orders().find((o) => o.id === id)).toMatchObject({ status: 'rejected', rejectReason: '숙제 먼저 하자' });
    expect(kid().coins).toBe(30);
    expect(ledger().some((e) => e.id === id)).toBe(false);

    const again = await buy('r-snack'); // 거절된 신청은 코인을 묶지 않는다
    await backend.cancelOrder(FAMILY, again);
    expect(orders().some((o) => o.id === again)).toBe(false);
  });

  it('하루 1번 제한이 걸린 보상은 같은 날 다시 신청할 수 없다', async () => {
    as('demo-dad');
    await backend.giveCoins(FAMILY, 'demo-kid', 100, '', 'demo-dad'); // 130코인
    const id = await buy('r-game');
    await expect(buy('r-game')).rejects.toThrow('오늘은 더 바꿀 수 없어요');
    as('demo-dad');
    await backend.approveOrder(FAMILY, id, 'demo-dad');
    await backend.deliverOrder(FAMILY, id, 'demo-dad');
    await expect(buy('r-game')).rejects.toThrow('오늘은 더 바꿀 수 없어요'); // 받은 뒤에도 오늘은 끝
  });

  it('자녀는 승인하거나 보상을 올릴 수 없고, 남의 신청을 취소할 수 없다', async () => {
    const id = await buy('r-snack');
    const input = { title: '무제한 게임', note: '', price: 1, icon: 'game', limit: { period: 'none' as const, count: 1 } };
    await expect(backend.approveOrder(FAMILY, id, 'demo-kid')).rejects.toThrow('부모만');
    await expect(backend.createReward(FAMILY, input, 'demo-kid')).rejects.toThrow('부모만');
    await expect(backend.updateReward(FAMILY, 'r-gift', { ...rewardById('r-gift'), price: 1 })).rejects.toThrow('부모만');
    as('demo-dad');
    await expect(backend.cancelOrder(FAMILY, id)).rejects.toThrow('내 신청만');
  });

  it('부모는 보상을 올리고, 고치고, 내린다. 이미 한 신청은 원래 가격 그대로다', async () => {
    const id = await buy('r-snack');
    as('demo-dad');
    await backend.updateReward(FAMILY, 'r-snack', { ...rewardById('r-snack'), price: 45 });
    expect(rewardById('r-snack').price).toBe(45);
    expect(orders().find((o) => o.id === id)!.price).toBe(30);
    const created = await backend.createReward(
      FAMILY,
      { title: '보드게임 하기', note: '', price: 20, icon: 'balloon', limit: { period: 'week', count: 3 } },
      'demo-dad',
    );
    expect(rewards()[0].id).toBe(created); // 싼 것부터
    await backend.archiveReward(FAMILY, created);
    expect(rewards().some((r) => r.id === created)).toBe(false);
  });

  it('목표 저금통을 정하고 없앨 수 있다', async () => {
    expect(kid().goalRewardId).toBe('r-game');
    as('demo-kid');
    await backend.setGoal(FAMILY, 'demo-kid', 'r-movie');
    expect(kid().goalRewardId).toBe('r-movie');
    await backend.setGoal(FAMILY, 'demo-kid', null);
    expect(kid().goalRewardId).toBeNull();
    await expect(backend.setGoal(FAMILY, 'demo-kid', '없는보상')).rejects.toThrow('찾을 수 없어요');
  });
});

describe('뭐먹지', () => {
  const pizza = { name: '피자', category: 'etc', link: 'pizza.example.com/menu', memo: '' };

  it('가족 누구나 메뉴를 올리고, 올린 사람이 먹고 싶은 것으로 시작한다', async () => {
    as('demo-kid');
    const id = await backend.createFood(FAMILY, pizza, 'demo-kid');
    const created = foodById(id)!;
    expect(created).toMatchObject({ name: '피자', addedBy: 'demo-kid', wantedBy: ['demo-kid'], eaten: [] });
    expect(created.link).toBe('https://pizza.example.com/menu');
    await expect(backend.createFood(FAMILY, { ...pizza, name: ' 피자 ' }, 'demo-kid')).rejects.toThrow('이미 올라와');
    await expect(backend.createFood(FAMILY, { ...pizza, name: '' }, 'demo-kid')).rejects.toThrow('메뉴 이름');
    await expect(backend.createFood(FAMILY, { ...pizza, name: '탕수육' }, 'demo-dad')).rejects.toThrow('본인만');
  });

  it('"나도!"는 누구나 켜고 끌 수 있다', async () => {
    as('demo-mom');
    await backend.setFoodWant(FAMILY, 'f-chicken', 'demo-mom', true);
    expect(foodById('f-chicken')!.wantedBy.sort()).toEqual(['demo-dad', 'demo-kid', 'demo-mom']);
    await backend.setFoodWant(FAMILY, 'f-chicken', 'demo-mom', true); // 두 번 눌러도 한 번만
    expect(foodById('f-chicken')!.wantedBy).toHaveLength(3);
    await backend.setFoodWant(FAMILY, 'f-chicken', 'demo-mom', false);
    expect(foodById('f-chicken')!.wantedBy.sort()).toEqual(['demo-dad', 'demo-kid']);
    await expect(backend.setFoodWant(FAMILY, 'f-chicken', 'demo-kid', false)).rejects.toThrow('본인만');
  });

  it('먹으면 횟수와 날짜가 남고 보관함으로 간다. 보관함에서 다시 올릴 수 있다', async () => {
    as('demo-kid');
    await backend.addFoodEaten(FAMILY, 'f-chicken', today);
    const eaten = foodById('f-chicken')!;
    expect(eaten.wantedBy).toEqual([]);
    expect(eaten.eaten).toEqual([addDays(today, -9), today]);
    await expect(backend.addFoodEaten(FAMILY, 'f-chicken', today)).rejects.toThrow('이미 기록');
    await expect(backend.addFoodEaten(FAMILY, 'f-chicken', addDays(today, 1))).rejects.toThrow('아직 오지 않은');

    await backend.addFoodEaten(FAMILY, 'f-chicken', addDays(today, -3)); // 지난 날도 기록
    expect(foodById('f-chicken')!.eaten).toEqual([addDays(today, -9), addDays(today, -3), today]);
    await backend.removeFoodEaten(FAMILY, 'f-chicken', addDays(today, -3)); // 잘못 누른 기록 지우기
    expect(foodById('f-chicken')!.eaten).toEqual([addDays(today, -9), today]);

    await backend.setFoodWant(FAMILY, 'f-chicken', 'demo-kid', true); // 또 먹고 싶어
    expect(foodById('f-chicken')!.wantedBy).toEqual(['demo-kid']);
    expect(foodById('f-chicken')!.eaten).toHaveLength(2); // 기록은 그대로
  });

  it('고치기와 지우기는 올린 사람과 부모만 할 수 있다', async () => {
    const edit = { name: '모둠 초밥', category: 'japanese', link: '', memo: '바꿈' };
    as('demo-kid'); // 엄마가 올린 메뉴
    await expect(backend.updateFood(FAMILY, 'f-sushi', edit)).rejects.toThrow('올린 사람과 부모만');
    await expect(backend.archiveFood(FAMILY, 'f-sushi')).rejects.toThrow('올린 사람과 부모만');
    await backend.updateFood(FAMILY, 'f-bread', { name: '버터 소금빵', category: 'bread', link: '', memo: '' }); // 내가 올린 메뉴
    expect(foodById('f-bread')!.name).toBe('버터 소금빵');
    await expect(backend.updateFood(FAMILY, 'f-bread', { name: '치킨', category: 'bread', link: '', memo: '' })).rejects.toThrow('같은 이름');

    as('demo-dad'); // 부모는 남이 올린 것도
    await backend.updateFood(FAMILY, 'f-sushi', edit);
    expect(foodById('f-sushi')!.memo).toBe('바꿈');
    await backend.archiveFood(FAMILY, 'f-bread');
    expect(foodById('f-bread')).toBeUndefined();
    await expect(backend.addFoodEaten(FAMILY, 'f-bread', today)).rejects.toThrow('찾을 수 없어요');
    // 지운 메뉴와 같은 이름은 다시 올릴 수 있다
    await backend.createFood(FAMILY, { name: '버터 소금빵', category: 'bread', link: '', memo: '' }, 'demo-dad');
  });

  it('별점은 각자 하나씩 주고, 다시 주면 바뀐다. 평균은 최신 점수로 계산된다', async () => {
    expect(ratingSummary(foodById('f-chicken')!)).toEqual({ average: 4.5, count: 2 }); // 딸 5, 아빠 4
    as('demo-mom');
    await backend.rateFood(FAMILY, 'f-chicken', 'demo-mom', 3);
    expect(ratingSummary(foodById('f-chicken')!)).toEqual({ average: 4, count: 3 });
    await backend.rateFood(FAMILY, 'f-chicken', 'demo-mom', 5); // 다시 먹고 점수를 바꿈
    expect(foodById('f-chicken')!.ratings).toEqual({ 'demo-kid': 5, 'demo-dad': 4, 'demo-mom': 5 });
    expect(ratingSummary(foodById('f-chicken')!)).toEqual({ average: 4.7, count: 3 });
    await expect(backend.rateFood(FAMILY, 'f-chicken', 'demo-mom', 6)).rejects.toThrow('1개부터 5개');
    await expect(backend.rateFood(FAMILY, 'f-chicken', 'demo-kid', 1)).rejects.toThrow('본인만');
    // 먹었다고 기록해도 별점은 그대로 남는다
    await backend.addFoodEaten(FAMILY, 'f-chicken', today);
    expect(foodById('f-chicken')!.ratings['demo-mom']).toBe(5);
    as('demo-new');
    await expect(backend.rateFood(FAMILY, 'f-chicken', 'demo-new', 5)).rejects.toThrow('구성원이 아니에요');
  });

  it('부모가 분류를 바꾸면 지워진 분류의 메뉴는 기타로 보인다', async () => {
    as('demo-kid');
    await expect(backend.updateSettings(FAMILY, family().settings)).rejects.toThrow('부모만');
    as('demo-dad');
    const etc = family().settings.foodCategories.find((c) => c.id === 'etc')!;
    await backend.updateSettings(FAMILY, { ...family().settings, foodCategories: [{ id: 'west', name: '양식', icon: 'fork' }, etc] });
    const categories = family().settings.foodCategories;
    expect(categories.map((c) => c.name)).toEqual(['양식', '기타']);
    expect(categoryOf(categories, foodById('f-kimchi')!.category).name).toBe('기타'); // 한식이 지워짐
    expect(foodById('f-kimchi')!.category).toBe('korean'); // 저장된 값은 그대로라서 분류를 되살리면 돌아온다
    await expect(
      backend.updateSettings(FAMILY, { ...family().settings, foodCategories: [{ id: 'a', name: '', icon: 'fork' }, etc] }),
    ).rejects.toThrow('분류 이름');
  });

  it('가족이 아닌 사람은 아무것도 못 한다', async () => {
    as('demo-new');
    await expect(backend.createFood(FAMILY, pizza, 'demo-new')).rejects.toThrow('구성원이 아니에요');
    await expect(backend.addFoodEaten(FAMILY, 'f-chicken', today)).rejects.toThrow('구성원이 아니에요');
  });
});

describe('위치', () => {
  const here = { lat: 35.2476, lng: 129.2192, accuracy: 20 };

  it('직접 알리면 1코인을 받고, 하루 3번까지만 받는다', async () => {
    as('demo-kid');
    const before = kid().coins;
    for (const expected of [1, 1, 1, 0, 0]) {
      expect((await backend.shareLocation(FAMILY, 'demo-kid', here, 'button')).coins).toBe(expected);
    }
    expect(kid().coins).toBe(before + 3);
    expect(kid().checkin?.count).toBe(3);
    expect(ledgerSum()).toBe(kid().coins); // 잔액은 여전히 장부 합계와 같다
    expect(ledger().filter((e) => e.type === 'checkin').map((e) => e.amount)).toEqual([1, 1, 1]);
    // 한도를 넘긴 공유도 위치는 남는다.
    const mine = locations().filter((r) => r.uid === 'demo-kid' && r.trigger === 'button');
    expect(mine).toHaveLength(5);
    expect(mine.filter((r) => r.coins === 1)).toHaveLength(3);
  });

  it('자동 기록은 코인을 주지 않고, 최근 것이 먼저 온다', async () => {
    as('demo-kid');
    const before = kid().coins;
    expect((await backend.shareLocation(FAMILY, 'demo-kid', here, 'open')).coins).toBe(0);
    expect((await backend.shareLocation(FAMILY, 'demo-kid', here, 'quest')).coins).toBe(0);
    expect(kid().coins).toBe(before);
    expect(kid().checkin).toBeNull();
    const all = locations();
    expect(all[0].at).toBeGreaterThanOrEqual(all[all.length - 1].at);
  });

  it('설정에서 코인과 하루 횟수를 바꾸면 바로 반영된다', async () => {
    as('demo-dad');
    await backend.updateSettings(FAMILY, { ...family().settings, checkinCoins: 5, checkinPerDay: 1 });
    as('demo-kid');
    const before = kid().coins;
    expect((await backend.shareLocation(FAMILY, 'demo-kid', here, 'button')).coins).toBe(5);
    expect((await backend.shareLocation(FAMILY, 'demo-kid', here, 'button')).coins).toBe(0);
    expect(kid().coins).toBe(before + 5);
    as('demo-dad');
    await backend.updateSettings(FAMILY, { ...family().settings, checkinCoins: 0, checkinPerDay: 3 });
    as('demo-mom');
    expect((await backend.shareLocation(FAMILY, 'demo-mom', here, 'button')).coins).toBe(0); // 코인을 꺼 둠
  });

  it('남의 위치는 남길 수 없고, 잘못된 좌표는 막는다', async () => {
    as('demo-dad');
    await expect(backend.shareLocation(FAMILY, 'demo-kid', here, 'button')).rejects.toThrow('본인만');
    as('demo-kid');
    await expect(backend.shareLocation(FAMILY, 'demo-kid', { lat: 999, lng: 0, accuracy: 1 }, 'button')).rejects.toThrow('위치를 알 수 없어요');
    as('demo-new');
    await expect(backend.shareLocation(FAMILY, 'demo-new', here, 'button')).rejects.toThrow('구성원이 아니에요');
  });

  it('장소는 부모만 등록하고 지운다', async () => {
    expect(places().map((p) => p.name)).toEqual(['집', '학교', '학원']);
    as('demo-kid');
    await expect(backend.createPlace(FAMILY, { name: '놀이터', ...here, radius: 150 }, 'demo-kid')).rejects.toThrow('부모만');
    as('demo-dad');
    const id = await backend.createPlace(FAMILY, { name: ' 놀이터 ', lat: 35.25, lng: 129.22, radius: 300 }, 'demo-dad');
    expect(places().find((p) => p.id === id)).toMatchObject({ name: '놀이터', radius: 300 });
    await expect(backend.createPlace(FAMILY, { name: '', lat: 35.25, lng: 129.22, radius: 300 }, 'demo-dad')).rejects.toThrow('장소 이름');
    await backend.deletePlace(FAMILY, id);
    expect(places().some((p) => p.id === id)).toBe(false);
  });

  it('오래된 위치 기록은 부모가 정리한다', async () => {
    const total = locations().length;
    expect(total).toBe(2);
    as('demo-kid');
    await expect(backend.pruneLocations(FAMILY, Date.now())).rejects.toThrow('부모만');
    as('demo-dad');
    await backend.pruneLocations(FAMILY, Date.now() - 60 * 60_000); // 한 시간보다 오래된 것
    expect(locations().map((r) => r.id)).toEqual(['loc-seed-2']);
  });
});

describe('캘린더', () => {
  const input = { title: '운동회', memo: '', startDay: addDays(today, 2), endDay: addDays(today, 2), allDay: true, startTime: '', endTime: '', who: [], repeat: 'none' as const, repeatUntil: '' };

  it('가족 누구나 일정을 올린다', async () => {
    expect(events()).toHaveLength(7);
    as('demo-kid');
    const id = await backend.createEvent(FAMILY, { ...input, who: ['demo-kid'] }, 'demo-kid');
    expect(eventById(id)).toMatchObject({ title: '운동회', createdBy: 'demo-kid', who: ['demo-kid'], allDay: true });
    await expect(backend.createEvent(FAMILY, { ...input, title: '' }, 'demo-kid')).rejects.toThrow('일정 이름');
    await expect(backend.createEvent(FAMILY, input, 'demo-dad')).rejects.toThrow('본인만');
    as('demo-new');
    await expect(backend.createEvent(FAMILY, input, 'demo-new')).rejects.toThrow('구성원이 아니에요');
  });

  it('자녀는 자기가 올린 일정만 고치고 지운다. 부모는 모두 할 수 있다', async () => {
    as('demo-kid');
    await backend.updateEvent(FAMILY, 'e-kid', { ...input, title: '친구 생일 파티 (장소 바뀜)' }); // 내가 올린 일정
    expect(eventById('e-kid')!.title).toBe('친구 생일 파티 (장소 바뀜)');
    expect(eventById('e-kid')!.createdBy).toBe('demo-kid');
    await expect(backend.updateEvent(FAMILY, 'e-dinner', input)).rejects.toThrow('올린 사람과 부모만'); // 아빠가 올린 일정
    await expect(backend.deleteEvent(FAMILY, 'e-dentist')).rejects.toThrow('올린 사람과 부모만'); // 내 일정이어도 엄마가 올린 것
    await backend.deleteEvent(FAMILY, 'e-kid');
    expect(eventById('e-kid')).toBeUndefined();

    as('demo-dad'); // 엄마가 올린 일정도 부모는 고친다
    await backend.updateEvent(FAMILY, 'e-mom', { ...input, title: '엄마 모임 (취소)' });
    expect(eventById('e-mom')!.title).toBe('엄마 모임 (취소)');
    await backend.deleteEvent(FAMILY, 'e-mom');
    await expect(backend.deleteEvent(FAMILY, 'e-mom')).rejects.toThrow('찾을 수 없어요');
  });
});

describe('보상 제안', () => {
  const input = { title: '보드게임 사기', note: '', icon: 'game', price: 80 };

  it('자녀가 제안하면 부모의 답을 기다린다. 한 번에 3개까지만 걸 수 있다', async () => {
    expect(wishById('w-park')).toMatchObject({ status: 'negotiating', lastRole: 'child', lastPrice: 150 });
    as('demo-kid');
    const id = await backend.createWish(FAMILY, input, 'demo-kid');
    expect(wishById(id)).toMatchObject({ title: '보드게임 사기', icon: 'game', lastPrice: 80, offerCount: 1, ownerUid: 'demo-kid' });
    await expect(backend.createWish(FAMILY, { ...input, title: ' ' }, 'demo-kid')).rejects.toThrow('이름을 적어 주세요');
    await expect(backend.createWish(FAMILY, { ...input, price: 0 }, 'demo-kid')).rejects.toThrow('가격은 1부터');
    await backend.createWish(FAMILY, { ...input, title: '셋째' }, 'demo-kid');
    await expect(backend.createWish(FAMILY, { ...input, title: '넷째' }, 'demo-kid')).rejects.toThrow('3개까지');
    // 아직 부모가 답하지 않았으므로 자녀가 수락하거나 다시 제안할 수 없다.
    await expect(backend.acceptWish(FAMILY, id, 'demo-kid')).rejects.toThrow('상대가 답할 차례');
    await expect(backend.counterWish(FAMILY, id, 60, '', 'demo-kid')).rejects.toThrow('상대가 답할 차례');
  });

  it('부모가 그 가격으로 수락하면 상점에 보상이 올라간다(코인은 빠지지 않는다)', async () => {
    const before = rewards().length;
    as('demo-dad');
    await backend.acceptWish(FAMILY, 'w-park', 'demo-dad');
    expect(wishById('w-park')).toMatchObject({ status: 'agreed' });
    expect(rewards()).toHaveLength(before + 1);
    expect(rewardById('w-park')).toMatchObject({ title: '놀이공원 가기', price: 150, icon: 'balloon', active: true, limit: { period: 'none' } });
    expect(kid().coins).toBe(30);
    await expect(backend.acceptWish(FAMILY, 'w-park', 'demo-dad')).rejects.toThrow('이미 끝난 제안');
    // 올라간 뒤에는 상점 관리에서 다른 보상처럼 고칠 수 있다.
    await backend.updateReward(FAMILY, 'w-park', { title: '놀이공원 가기', note: '', price: 200, icon: 'balloon', limit: { period: 'week', count: 1 } });
    expect(rewardById('w-park').price).toBe(200);
  });

  it('가격을 주고받다가 자녀가 수락하면 그 가격으로 올라간다. 횟수를 다 쓰면 수락이나 그만두기만 남는다', async () => {
    as('demo-dad');
    await backend.counterWish(FAMILY, 'w-park', 300, '멀어서 비싸', 'demo-dad');
    expect(wishById('w-park')).toMatchObject({ lastRole: 'parent', lastPrice: 300, offerCount: 2 });
    await expect(backend.counterWish(FAMILY, 'w-park', 250, '', 'demo-dad')).rejects.toThrow('상대가 답할 차례');
    as('demo-kid');
    await backend.counterWish(FAMILY, 'w-park', 200, '', 'demo-kid');
    expect(wishById('w-park')).toMatchObject({ lastRole: 'child', lastPrice: 200, offerCount: 3 });
    as('demo-mom');
    // 기본 3번을 다 썼으므로 부모는 수락하거나 거절만 할 수 있다.
    await expect(backend.counterWish(FAMILY, 'w-park', 250, '', 'demo-mom')).rejects.toThrow('더는 다시 제안할 수 없어요');
    await backend.acceptWish(FAMILY, 'w-park', 'demo-mom');
    expect(rewardById('w-park').price).toBe(200);
    expect(wishById('w-park')!.offers.map((o) => o.amount)).toEqual([150, 300, 200]);
  });

  it('자녀가 부모의 가격을 수락해도 상점에 올라간다', async () => {
    as('demo-dad');
    await backend.counterWish(FAMILY, 'w-park', 250, '', 'demo-dad');
    as('demo-kid');
    await backend.acceptWish(FAMILY, 'w-park', 'demo-kid');
    expect(rewardById('w-park')).toMatchObject({ price: 250, title: '놀이공원 가기' });
  });

  it('부모가 거절하면 이유가 남고 상점에는 올라가지 않는다. 자녀는 그 제안을 지울 수 있다', async () => {
    const before = rewards().length;
    as('demo-kid');
    await expect(backend.declineWish(FAMILY, 'w-park', '', 'demo-kid')).rejects.toThrow('부모만');
    as('demo-dad');
    await backend.declineWish(FAMILY, 'w-park', '겨울에 다시 얘기하자', 'demo-dad');
    expect(wishById('w-park')).toMatchObject({ status: 'declined', declineNote: '겨울에 다시 얘기하자' });
    expect(rewards()).toHaveLength(before);
    await expect(backend.deleteWish(FAMILY, 'w-park')).rejects.toThrow('내 제안만'); // 부모는 지우지 못한다
    as('demo-kid');
    await backend.deleteWish(FAMILY, 'w-park');
    expect(wishById('w-park')).toBeUndefined();
    // 거절된 제안은 3개 제한에 세지 않는다.
    await backend.createWish(FAMILY, input, 'demo-kid');
  });

  it('자녀는 기다리는 제안을 그만둘 수 있고, 상점에 올라간 제안은 지울 수 없다', async () => {
    as('demo-kid');
    const id = await backend.createWish(FAMILY, input, 'demo-kid');
    await backend.deleteWish(FAMILY, id);
    expect(wishById(id)).toBeUndefined();
    as('demo-dad');
    await backend.acceptWish(FAMILY, 'w-park', 'demo-dad');
    as('demo-kid');
    await expect(backend.deleteWish(FAMILY, 'w-park')).rejects.toThrow('이미 상점에 올라간');
    as('demo-new');
    await expect(backend.createWish(FAMILY, input, 'demo-new')).rejects.toThrow('구성원이 아니에요');
  });
});
