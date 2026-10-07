import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBackend } from '../src/backend/demo';
import type { ApproveOptions, Backend, Family, LedgerEntry, Member, Order, Preset, Proposal, Quest, Reward, Run } from '../src/backend/types';
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
