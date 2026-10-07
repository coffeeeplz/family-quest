import { describe, expect, it } from 'vitest';
import type { Member, Order, Proposal, Quest, Reward, Run } from '../src/backend/types';
import { isInviteCodeShape, newInviteCode, normalizeInviteCode } from '../src/domain/invites';
import { canCounter, cleanProposalInput, turnOf } from '../src/domain/proposals';
import { buildBoard, cleanQuestInput, relativeDay, repeatLabel, scheduledOn, todayProgress } from '../src/domain/quests';
import { DEFAULT_SETTINGS, cleanSettings, halfReward, normalizeSettings } from '../src/domain/settings';
import { currentStreak, planStreak } from '../src/domain/streak';
import { availableCoins, buyBlockReason, buyState, cleanRewardInput, limitUsage, reservedCoins } from '../src/domain/shop';
import { addDays, dateKey, formatDay, formatTime, isDateKey, parseDateKey, weekStart, weekdayOf } from '../src/lib/dates';

const TODAY = '2026-10-06'; // 화요일
const at = (day: string) => parseDateKey(day).getTime() + 12 * 3_600_000;

const quest = (over: Partial<Quest>): Quest => ({
  id: 'q1',
  title: '책 읽기',
  note: '',
  assigneeUid: 'kid',
  reward: 10,
  repeat: { type: 'daily' },
  important: false,
  active: true,
  createdBy: 'dad',
  createdAt: at('2026-09-01'),
  ...over,
});

const run = (questId: string, day: string, over: Partial<Run> = {}): Run => ({
  id: `${questId}_${day}`,
  questId,
  questTitle: '책 읽기',
  reward: 10,
  assigneeUid: 'kid',
  dateKey: day,
  oneOff: false,
  late: false,
  status: 'approved',
  submittedAt: at(day),
  decidedBy: 'dad',
  decidedAt: at(day),
  rejectReason: '',
  praise: '',
  ...over,
});

const memo = (over: Partial<Proposal>): Proposal => ({
  id: 'm1',
  ownerUid: 'kid',
  title: '준비물 챙기기',
  note: '',
  date: TODAY,
  important: false,
  status: 'memo',
  doneDay: null,
  declined: false,
  lastAmount: null,
  lastRole: null,
  offerCount: 0,
  offers: [],
  createdAt: 0,
  ...over,
});

const kid = (streak: Member['streak'] = null): Member => ({
  uid: 'kid',
  role: 'child',
  displayName: '딸',
  avatar: { id: 'rabbit', color: 'pink' },
  coins: 0,
  joinedAt: 0,
  streak,
  goalRewardId: null,
});

describe('dates', () => {
  it('formats and steps date keys in local time', () => {
    expect(dateKey(new Date(2026, 9, 6, 23, 59))).toBe('2026-10-06');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf(TODAY)).toBe(2);
    expect(formatDay(TODAY)).toBe('10월 6일 (화)');
  });
  it('validates date keys', () => {
    expect(isDateKey('2026-10-06')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('오늘')).toBe(false);
  });
  it('formats 12-hour time', () => {
    expect(formatTime(new Date(2026, 9, 6, 15, 10).getTime())).toBe('오후 3:10');
    expect(formatTime(new Date(2026, 9, 6, 0, 5).getTime())).toBe('오전 12:05');
  });
  it('names days relative to today', () => {
    expect(['2026-10-04', '2026-10-05', TODAY, '2026-10-07', '2026-10-08', '2026-10-10'].map((d) => relativeDay(d, TODAY))).toEqual([
      '그저께',
      '어제',
      '오늘',
      '내일',
      '모레',
      '10월 10일 (토)',
    ]);
  });
});

describe('quest schedule', () => {
  it('weekly quests are scheduled only on chosen weekdays', () => {
    const saturday = quest({ repeat: { type: 'weekly', days: [6] } });
    expect(scheduledOn(saturday, '2026-10-10')).toBe(true);
    expect(scheduledOn(saturday, TODAY)).toBe(false);
  });
  it('a quest is not scheduled before the day it was created, or once archived', () => {
    const fresh = quest({ createdAt: at('2026-10-05') });
    expect(scheduledOn(fresh, '2026-10-04')).toBe(false);
    expect(scheduledOn(fresh, '2026-10-05')).toBe(true);
    expect(scheduledOn(quest({ active: false }), TODAY)).toBe(false);
  });
  it('labels repeats and due dates', () => {
    expect(repeatLabel({ type: 'weekly', days: [5, 1, 3] }, TODAY)).toBe('매주 월·수·금');
    expect(repeatLabel({ type: 'none', date: TODAY }, TODAY)).toBe('오늘까지');
    expect(repeatLabel({ type: 'none', date: '2026-10-07' }, TODAY)).toBe('내일까지');
    expect(repeatLabel({ type: 'none', date: '2026-10-05' }, TODAY)).toBe('기한 지남 (어제까지)');
  });
});

describe('quest input', () => {
  const base = { title: ' 방 정리 ', note: '', assigneeUid: 'kid', reward: 20, repeat: { type: 'daily' } as const, important: true };
  it('trims and keeps the important flag', () => {
    expect(cleanQuestInput(base)).toMatchObject({ title: '방 정리', important: true });
  });
  it('rejects bad values', () => {
    expect(() => cleanQuestInput({ ...base, title: '  ' })).toThrow('이름');
    expect(() => cleanQuestInput({ ...base, reward: -1 })).toThrow('코인');
    expect(() => cleanQuestInput({ ...base, reward: 1.5 })).toThrow('코인');
    expect(() => cleanQuestInput({ ...base, reward: NaN })).toThrow('코인');
    expect(() => cleanQuestInput({ ...base, repeat: { type: 'weekly', days: [] } })).toThrow('요일');
    expect(() => cleanQuestInput({ ...base, repeat: { type: 'none', date: '' } })).toThrow('기한');
    expect(() => cleanQuestInput({ ...base, assigneeUid: '' })).toThrow('받을 사람');
  });
});

describe('half reward for late quests', () => {
  it('rounds odd amounts up', () => {
    expect([0, 1, 10, 15, 25].map(halfReward)).toEqual([0, 1, 5, 8, 13]);
  });
});

describe('board: missed / today / upcoming', () => {
  it('lists the last three missed days of a repeating quest at half coins', () => {
    const board = buildBoard([quest({ reward: 15 })], [], [], 'kid', TODAY);
    expect(board.today.map((i) => [i.runDay, i.reward, i.late])).toEqual([[TODAY, 15, false]]);
    expect(board.missed.map((i) => [i.runDay, i.reward, i.late])).toEqual([
      ['2026-10-03', 8, true],
      ['2026-10-04', 8, true],
      ['2026-10-05', 8, true],
    ]);
  });

  it('skips missed days that were done, are awaiting approval, or predate the quest', () => {
    const q = quest({ createdAt: at('2026-10-04') });
    const runs = [
      run('q1', '2026-10-05', { status: 'approved' }),
      run('q1', '2026-10-04', { status: 'submitted' }), // 제때 냈고 확인을 기다리는 중
    ];
    expect(buildBoard([q], runs, [], 'kid', TODAY).missed).toEqual([]);
  });

  it('keeps a rejected or late-submitted day in the missed list', () => {
    const runs = [
      run('q1', '2026-10-05', { status: 'rejected', rejectReason: '다시' }),
      run('q1', '2026-10-04', { status: 'submitted', late: true, reward: 5 }),
      run('q1', '2026-10-03', { status: 'approved', late: true, reward: 5 }),
    ];
    const missed = buildBoard([quest({})], runs, [], 'kid', TODAY).missed;
    expect(missed.map((i) => [i.runDay, i.state])).toEqual([
      ['2026-10-05', 'rejected'],
      ['2026-10-04', 'submitted'],
    ]);
  });

  it('places one-off quests by due date; overdue ones keep full coins', () => {
    const quests = [
      quest({ id: 'a', title: '어제까지', reward: 15, repeat: { type: 'none', date: '2026-10-05' } }),
      quest({ id: 'b', title: '오늘까지', repeat: { type: 'none', date: TODAY } }),
      quest({ id: 'c', title: '금요일까지', repeat: { type: 'none', date: '2026-10-09' } }),
    ];
    const board = buildBoard(quests, [], [], 'kid', TODAY);
    expect(board.missed.map((i) => [i.title, i.reward, i.late])).toEqual([['어제까지', 15, false]]);
    expect(board.today.map((i) => i.title)).toEqual(['오늘까지']);
    expect(board.upcoming.map((i) => [i.title, i.canAct, i.runDay])).toEqual([['금요일까지', true, '2026-10-09']]);
  });

  it('previews the next day of a weekly quest, but not daily ones', () => {
    const quests = [quest({ id: 'w', title: '방 정리', repeat: { type: 'weekly', days: [6] } }), quest({ id: 'd' })];
    const upcoming = buildBoard(quests, [], [], 'kid', TODAY).upcoming;
    expect(upcoming.map((i) => [i.title, i.runDay, i.canAct])).toEqual([['방 정리', '2026-10-10', false]]);
  });

  it('puts important items first and counts only quests in today progress', () => {
    const quests = [quest({ id: 'a', title: '가' }), quest({ id: 'b', title: '나', important: true })];
    const runs = [run('a', TODAY)];
    const board = buildBoard(quests, runs, [memo({})], 'kid', TODAY);
    expect(board.today.map((i) => i.title)).toEqual(['나', '준비물 챙기기', '가']);
    expect(todayProgress(board)).toEqual({ done: 1, total: 2 });
  });

  it('places memos by date and shows memos finished today as done', () => {
    const memos = [
      memo({ id: 'm1', title: '오늘 메모' }),
      memo({ id: 'm2', title: '내일 메모', date: '2026-10-07' }),
      memo({ id: 'm3', title: '지난 메모', date: '2026-10-01' }),
      memo({ id: 'm4', title: '끝낸 메모', date: '2026-10-01', status: 'done', doneDay: TODAY }),
      memo({ id: 'm5', title: '협상 중', status: 'negotiating', lastRole: 'child', lastAmount: 10, offerCount: 1 }),
      memo({ id: 'm6', title: '남의 메모', ownerUid: 'other' }),
    ];
    const board = buildBoard([], [], memos, 'kid', TODAY);
    expect(board.today.map((i) => [i.title, i.state])).toEqual([
      ['오늘 메모', 'todo'],
      ['끝낸 메모', 'approved'],
    ]);
    expect(board.upcoming.map((i) => i.title)).toEqual(['내일 메모']);
    expect(board.missed.map((i) => i.title)).toEqual(['지난 메모']);
  });

  it('keeps a one-off quest approved today on the list after it is archived', () => {
    const startOfDay = parseDateKey(TODAY).getTime();
    const runs = [
      run('x', TODAY, { questTitle: '피아노', oneOff: true, decidedAt: startOfDay + 1000 }),
      run('y', '2026-10-05', { questTitle: '어제 것', oneOff: true, decidedAt: startOfDay - 1000 }),
    ];
    expect(buildBoard([], runs, [], 'kid', TODAY).today.map((i) => i.title)).toEqual(['피아노']);
  });
});

describe('streak', () => {
  const math = quest({ id: 'math' });
  const read = quest({ id: 'read' });
  const settings = { ...DEFAULT_SETTINGS, streakDays: 3, streakBonus: 10 };

  it('does nothing until every repeating quest of that day is approved', () => {
    const approving = run('math', TODAY, { status: 'submitted' });
    expect(planStreak([math, read], [approving], kid(), approving, settings)).toBeNull();
  });

  it('extends the streak when the last quest of the day is approved, with a bonus on the Nth day', () => {
    const approving = run('read', TODAY, { status: 'submitted' });
    const runs = [run('math', TODAY), approving];
    expect(planStreak([math, read], runs, kid({ count: 2, lastDate: '2026-10-05' }), approving, settings)).toEqual({
      count: 3,
      lastDate: TODAY,
      bonus: 10,
    });
    expect(planStreak([math, read], runs, kid({ count: 1, lastDate: '2026-10-05' }), approving, settings)).toEqual({
      count: 2,
      lastDate: TODAY,
      bonus: 0,
    });
  });

  it('restarts at 1 after a day with unfinished quests', () => {
    const approving = run('math', TODAY, { status: 'submitted' });
    const plan = planStreak([math], [approving], kid({ count: 5, lastDate: '2026-10-04' }), approving, settings);
    expect(plan).toEqual({ count: 1, lastDate: TODAY, bonus: 0 });
  });

  it('skips days that have no repeating quests', () => {
    const monWed = quest({ id: 'mw', repeat: { type: 'weekly', days: [1, 3] } });
    const approving = run('mw', '2026-10-07', { status: 'submitted' }); // 수요일
    const plan = planStreak([monWed], [approving], kid({ count: 2, lastDate: '2026-10-05' }), approving, settings);
    expect(plan).toEqual({ count: 3, lastDate: '2026-10-07', bonus: 10 });
  });

  it('ignores late runs, one-off quests, and days already counted', () => {
    const late = run('math', '2026-10-05', { status: 'submitted', late: true });
    expect(planStreak([math], [late], kid(), late, settings)).toBeNull();
    const once = run('x', TODAY, { status: 'submitted', oneOff: true });
    expect(planStreak([math], [once], kid(), once, settings)).toBeNull();
    const again = run('math', TODAY, { status: 'submitted' });
    expect(planStreak([math], [again], kid({ count: 4, lastDate: TODAY }), again, settings)).toBeNull();
  });

  it('a late run does not complete the day for the others', () => {
    const approving = run('read', TODAY, { status: 'submitted' });
    const runs = [run('math', TODAY, { late: true }), approving];
    expect(planStreak([math, read], runs, kid(), approving, settings)).toBeNull();
  });

  it('gives no bonus when the bonus is switched off', () => {
    const approving = run('math', TODAY, { status: 'submitted' });
    const plan = planStreak([math], [approving], kid({ count: 2, lastDate: '2026-10-05' }), approving, { ...settings, streakOn: false });
    expect(plan).toEqual({ count: 3, lastDate: TODAY, bonus: 0 });
  });

  it('reports the live streak, or 0 once a day was missed', () => {
    expect(currentStreak(kid({ count: 3, lastDate: TODAY }), [math], TODAY)).toBe(3);
    expect(currentStreak(kid({ count: 3, lastDate: '2026-10-05' }), [math], TODAY)).toBe(3); // 오늘은 아직 진행 중
    expect(currentStreak(kid({ count: 3, lastDate: '2026-10-04' }), [math], TODAY)).toBe(0);
    expect(currentStreak(kid(), [math], TODAY)).toBe(0);
  });
});

describe('settings', () => {
  it('fills in defaults for missing or broken values', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ maxRounds: 99, praises: ['멋져', 3, ''] })).toMatchObject({ maxRounds: 5, praises: ['멋져'] });
  });
  it('validates on save', () => {
    expect(cleanSettings({ ...DEFAULT_SETTINGS, praises: [' 멋져 ', '멋져', ''] }).praises).toEqual(['멋져']);
    expect(() => cleanSettings({ ...DEFAULT_SETTINGS, maxRounds: 0 })).toThrow('협상 횟수');
    expect(() => cleanSettings({ ...DEFAULT_SETTINGS, maxProposalCoins: NaN })).toThrow('제안');
    expect(() => cleanSettings({ ...DEFAULT_SETTINGS, streakBonus: -5 })).toThrow('보너스');
  });
});

describe('proposals', () => {
  const base = { title: '신발 정리', note: '', date: TODAY, important: false, amount: 20 };
  it('caps what a child can ask for', () => {
    expect(cleanProposalInput(base, DEFAULT_SETTINGS, TODAY).amount).toBe(20);
    expect(() => cleanProposalInput({ ...base, amount: 51 }, DEFAULT_SETTINGS, TODAY)).toThrow('50까지');
    expect(() => cleanProposalInput({ ...base, amount: 0 }, DEFAULT_SETTINGS, TODAY)).toThrow('1 이상');
    expect(() => cleanProposalInput({ ...base, date: '2026-10-05' }, DEFAULT_SETTINGS, TODAY)).toThrow('지난 날짜');
    expect(cleanProposalInput({ ...base, amount: null }, DEFAULT_SETTINGS, TODAY).amount).toBeNull();
  });
  it('knows whose turn it is and when countering is used up', () => {
    const p = memo({ status: 'negotiating', lastRole: 'child', lastAmount: 20, offerCount: 1 });
    expect(turnOf(p)).toBe('parent');
    expect(turnOf({ ...p, lastRole: 'parent' })).toBe('child');
    expect(turnOf(memo({}))).toBeNull();
    expect(canCounter(p, DEFAULT_SETTINGS)).toBe(true);
    expect(canCounter({ ...p, offerCount: 3 }, DEFAULT_SETTINGS)).toBe(false);
    expect(canCounter(p, { ...DEFAULT_SETTINGS, maxRounds: 1 })).toBe(false);
  });
});

describe('invite codes', () => {
  it('generates well-formed codes and normalises typed input', () => {
    for (let i = 0; i < 50; i += 1) expect(isInviteCodeShape(newInviteCode())).toBe(true);
    expect(normalizeInviteCode(' ab-c2 3d ')).toBe('ABC23D');
    expect(isInviteCodeShape('ABC10O')).toBe(false);
  });
});

describe('shop', () => {
  const reward = (over: Partial<Reward> = {}): Reward => ({
    id: 'r1',
    title: '게임 30분',
    note: '',
    price: 50,
    icon: 'game',
    limit: { period: 'none', count: 1 },
    active: true,
    createdBy: 'dad',
    createdAt: 0,
    ...over,
  });
  const order = (over: Partial<Order> = {}): Order => ({
    id: 'o1',
    rewardId: 'r1',
    rewardTitle: '게임 30분',
    icon: 'game',
    price: 50,
    uid: 'kid',
    status: 'requested',
    requestedAt: 0,
    requestedDay: TODAY,
    decidedBy: null,
    decidedAt: null,
    rejectReason: '',
    deliveredBy: null,
    deliveredAt: null,
    ...over,
  });
  const rich = { ...kid(), coins: 120 };

  it('weeks start on Monday', () => {
    expect(weekStart(TODAY)).toBe('2026-10-05'); // 화 → 월
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // 일요일은 그 주의 마지막 날
  });

  it('holds coins for requests that are not approved yet', () => {
    const orders = [order(), order({ id: 'o2', price: 30 }), order({ id: 'o3', status: 'approved' }), order({ id: 'o4', uid: 'other' })];
    expect(reservedCoins(orders, 'kid')).toBe(80);
    expect(availableCoins(rich, orders)).toBe(40);
  });

  it('blocks a purchase when available coins are short', () => {
    expect(buyState(reward(), rich, [], TODAY)).toEqual({ kind: 'ok' });
    expect(buyState(reward(), rich, [order(), order({ id: 'o2', price: 30 })], TODAY)).toEqual({ kind: 'short', missing: 10 });
    expect(buyBlockReason(reward({ price: 200 }), rich, [], TODAY)).toBe('코인이 80개 모자라요.');
  });

  it('counts the daily limit from today only, ignoring rejected requests', () => {
    const daily = reward({ limit: { period: 'day', count: 1 } });
    expect(limitUsage(daily, [order({ requestedDay: '2026-10-05', status: 'delivered' })], 'kid', TODAY).reached).toBe(false);
    expect(limitUsage(daily, [order({ status: 'rejected' })], 'kid', TODAY).reached).toBe(false);
    expect(limitUsage(daily, [order({ status: 'approved' })], 'kid', TODAY)).toEqual({ used: 1, reached: true });
    expect(buyBlockReason(daily, rich, [order({ status: 'delivered' })], TODAY)).toBe('오늘은 더 바꿀 수 없어요.');
  });

  it('counts the weekly limit from Monday', () => {
    const weekly = reward({ limit: { period: 'week', count: 2 } });
    const orders = [
      order({ id: 'a', requestedDay: '2026-10-04', status: 'delivered' }), // 지난주 일요일
      order({ id: 'b', requestedDay: '2026-10-05', status: 'delivered' }),
      order({ id: 'c', requestedDay: TODAY, status: 'requested' }),
    ];
    expect(limitUsage(weekly, orders, 'kid', TODAY)).toEqual({ used: 2, reached: true });
    expect(buyBlockReason(weekly, rich, orders, TODAY)).toBe('이번 주에는 더 바꿀 수 없어요.');
  });

  it('validates reward input', () => {
    const base = { title: ' 간식 ', note: '', price: 30, icon: 'snack', limit: { period: 'none' as const, count: 99 } };
    expect(cleanRewardInput(base)).toMatchObject({ title: '간식', limit: { period: 'none', count: 1 } });
    expect(cleanRewardInput({ ...base, icon: '없는그림' }).icon).toBe('shop');
    expect(() => cleanRewardInput({ ...base, title: '' })).toThrow('보상 이름');
    expect(() => cleanRewardInput({ ...base, price: 0 })).toThrow('가격');
    expect(() => cleanRewardInput({ ...base, limit: { period: 'day', count: 0 } })).toThrow('횟수');
  });
});
