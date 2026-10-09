import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Food, LedgerEntry, Member, Note, Order, Place, Proposal, Quest, Reward, Run, Wish } from '../src/backend/types';
import { inventoryGroups, ownedCount, usedByMonth } from '../src/domain/inventory';
import { activeNoteCount, canEditNote, cleanNoteInput, isUnreadFor, noteDays, noteReceiptText, noteTargetText, noteUntilText, notesOnDay, visibleNotes } from '../src/domain/notes';
import { coinScene, gainsOf, goalJustReached, latestAt, missedGains } from '../src/domain/celebrate';
import { canAddWish, canCounterWish, cleanWishInput, splitMyWishes, wishTurn, wishesForParent } from '../src/domain/wishes';
import {
  canEditEvent,
  cleanEventInput,
  clockLabel,
  daysBetween,
  isFor,
  monthGrid,
  occurrencesByDay,
  occurrencesOn,
  repeatText,
  shiftMonth,
  todayLine,
  whenLabel,
} from '../src/domain/calendar';
import { holidayName, holidaysComplete } from '../src/domain/holidays';
import {
  DEFAULT_FOOD_CATEGORIES,
  MAX_EATEN,
  MAX_FOOD_CATEGORIES,
  canEditFood,
  categoryOf,
  cleanFoodCategories,
  cleanFoodInput,
  cleanLink,
  cleanStars,
  drawPool,
  eatCountLabel,
  eatenLabel,
  lastEatenLabel,
  findSameName,
  normalizeFoodCategories,
  pickRandom,
  ratingSummary,
  sortSaved,
  splitFoods,
  withEaten,
} from '../src/domain/foods';
import { isInviteCodeShape, newInviteCode, normalizeInviteCode } from '../src/domain/invites';
import {
  accuracyLabel,
  checkinCountToday,
  cleanFix,
  cleanPlaceInput,
  distanceMeters,
  mapLinks,
  nearestPlace,
  placeLabel,
  planCheckin,
  timeAgo,
} from '../src/domain/location';
import { canCounter, cleanProposalInput, turnOf } from '../src/domain/proposals';
import { buildBoard, cleanQuestInput, relativeDay, repeatLabel, scheduledOn, todayProgress } from '../src/domain/quests';
import { DEFAULT_SETTINGS, cleanSettings, halfReward, normalizeSettings } from '../src/domain/settings';
import { currentStreak, planStreak } from '../src/domain/streak';
import { availableCoins, buyBlockReason, buyState, cleanRewardInput, limitUsage, reservedCoins } from '../src/domain/shop';
import { addDays, dateKey, dayNumber, formatDay, formatTime, isDateKey, parseDateKey, weekStart, weekdayOf } from '../src/lib/dates';

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
  checkin: null,
  stickerPacks: [],
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
    useMode: 'inPerson',
    ...over,
  });
  const rich = { ...kid(), coins: 120 };

  it('인벤토리: 승인된 보상을 같은 보상끼리 묶고, 다 쓴 것은 달별로', () => {
    const list = [
      order({ id: 'a', status: 'approved', decidedAt: 3 }),
      order({ id: 'b', status: 'approved', decidedAt: 1 }),
      order({ id: 'c', status: 'approved', rewardId: 'r2', rewardTitle: '간식', decidedAt: 2 }),
      order({ id: 'd', status: 'requested' }),
      order({ id: 'e', status: 'approved', uid: 'other' }),
      order({ id: 'f', status: 'delivered', deliveredAt: new Date(2026, 8, 30).getTime() }),
      order({ id: 'g', status: 'delivered', deliveredAt: new Date(2026, 9, 2).getTime() }),
    ];
    const groups = inventoryGroups(list, 'kid');
    expect(groups.map((g) => [g.title, g.orders.map((o) => o.id)])).toEqual([
      ['게임 30분', ['b', 'a']], // 먼저 받은 것부터 쓴다
      ['간식', ['c']],
    ]);
    expect(ownedCount(list, 'kid')).toBe(3);
    expect(usedByMonth(list, 'kid').map((m) => [m.month, m.orders.map((o) => o.id)])).toEqual([
      ['2026-10', ['g']],
      ['2026-09', ['f']],
    ]);
  });

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

describe('뭐먹지', () => {
  const food = (over: Partial<Food>): Food => ({
    id: 'f1',
    name: '떡볶이',
    category: 'korean',
    link: '',
    memo: '',
    addedBy: 'kid',
    createdAt: 0,
    wantedBy: [],
    eaten: [],
    ratings: {},
    active: true,
    ...over,
  });

  it('cleans links: adds https, keeps ports, blocks non-web addresses', () => {
    expect(cleanLink('  ')).toBe('');
    expect(cleanLink('naver.com/맛집')).toBe('https://naver.com/%EB%A7%9B%EC%A7%91');
    expect(cleanLink('http://example.com/a?b=1')).toBe('http://example.com/a?b=1');
    expect(cleanLink('example.com:8080/menu')).toBe('https://example.com:8080/menu');
    expect(() => cleanLink('javascript:alert(1)')).toThrow('웹 주소');
    expect(() => cleanLink('data:text/html,hi')).toThrow('웹 주소');
    expect(() => cleanLink('그냥 글자')).toThrow('링크 주소');
    expect(() => cleanLink('https://a.com/' + 'x'.repeat(400))).toThrow('300자');
  });

  it('validates food input', () => {
    const base = { name: '  크림   파스타 ', category: 'etc', link: '', memo: ' 순한맛 ' };
    expect(cleanFoodInput(base)).toEqual({ name: '크림 파스타', category: 'etc', link: '', memo: '순한맛' });
    expect(() => cleanFoodInput({ ...base, name: ' ' })).toThrow('메뉴 이름');
    expect(() => cleanFoodInput({ ...base, name: '가'.repeat(31) })).toThrow('30자');
    expect(() => cleanFoodInput({ ...base, category: '' })).toThrow('분류');
  });

  it('finds the same name ignoring spacing and case', () => {
    const foods = [food({ id: 'a', name: 'BBQ 치킨' }), food({ id: 'b', name: '김밥' })];
    expect(findSameName(foods, ' bbq  치킨 ')?.id).toBe('a');
    expect(findSameName(foods, 'BBQ 치킨', 'a')).toBeNull();
    expect(findSameName(foods, '라면')).toBeNull();
    expect(findSameName(foods, '')).toBeNull();
  });

  it('records eaten days once per day, sorted, never in the future', () => {
    expect(withEaten(['2026-10-01', '2026-10-05'], '2026-10-03', TODAY)).toEqual(['2026-10-01', '2026-10-03', '2026-10-05']);
    expect(() => withEaten(['2026-10-05'], '2026-10-05', TODAY)).toThrow('이미 기록');
    expect(() => withEaten([], addDays(TODAY, 1), TODAY)).toThrow('아직 오지 않은');
    expect(() => withEaten([], '2026-13-40', TODAY)).toThrow('날짜');
    const many = Array.from({ length: MAX_EATEN }, (_, i) => addDays('2020-01-01', i));
    const next = withEaten(many, TODAY, TODAY);
    expect(next).toHaveLength(MAX_EATEN);
    expect(next[0]).toBe('2020-01-02');
    expect(next[next.length - 1]).toBe(TODAY);
  });

  it('splits into wanted (most wanted first) and saved (recently eaten first)', () => {
    const foods = [
      food({ id: 'one', name: '치킨', category: 'etc', wantedBy: ['kid'], createdAt: 5 }),
      food({ id: 'two', name: '피자', category: 'delivery', wantedBy: ['kid', 'dad'], createdAt: 1 }), // 예전 분류는 기타로 본다
      food({ id: 'old', name: '김밥', category: 'korean', eaten: ['2026-09-01'] }),
      food({ id: 'new', name: '찌개', category: 'korean', eaten: ['2026-09-01', '2026-10-04'] }),
      food({ id: 'never', name: '라면', category: 'korean' }),
      food({ id: 'gone', name: '지운 것', active: false, wantedBy: ['kid'] }),
    ];
    const lists = splitFoods(foods);
    expect(lists.wanted.map((f) => f.id)).toEqual(['two', 'one']);
    expect(lists.saved.map((f) => f.id)).toEqual(['new', 'old', 'never']);
    expect(splitFoods(foods, 'korean').wanted).toEqual([]);
    expect(splitFoods(foods, 'korean').saved).toHaveLength(3);
    expect(drawPool(foods, 'wanted', 'all').map((f) => f.id)).toEqual(['two', 'one']);
    expect(drawPool(foods, 'all', 'all')).toHaveLength(5);
    expect(drawPool(foods, 'all', 'etc')).toHaveLength(2);
    expect(drawPool(foods, 'all', 'bread')).toHaveLength(0);
  });

  it('draws at random and avoids repeating the last pick', () => {
    const pool = [food({ id: 'a' }), food({ id: 'b' }), food({ id: 'c' })];
    expect(pickRandom([], null)).toBeNull();
    expect(pickRandom(pool, null, () => 0)?.id).toBe('a');
    expect(pickRandom(pool, null, () => 0.999)?.id).toBe('c');
    expect(pickRandom(pool, 'a', () => 0)?.id).toBe('b');
    expect(pickRandom([pool[0]], 'a', () => 0)?.id).toBe('a'); // 하나뿐이면 같은 것이 나온다
    for (let i = 0; i < 50; i += 1) expect(pickRandom(pool, 'b')?.id).not.toBe('b');
  });

  it('labels eat history and edit rights', () => {
    expect(eatenLabel(food({}), TODAY)).toBe('아직 안 먹어 봤어요');
    expect(eatenLabel(food({ eaten: ['2026-09-30', '2026-10-03'] }), TODAY)).toBe('2번 먹음 · 마지막 10월 3일');
    expect(eatenLabel(food({ eaten: [TODAY] }), TODAY)).toBe('1번 먹음 · 마지막 오늘');
    expect(eatenLabel(food({ eaten: [addDays(TODAY, -1)] }), TODAY)).toBe('1번 먹음 · 마지막 어제');
    expect(eatenLabel(food({ eaten: ['2025-12-31'] }), TODAY)).toBe('1번 먹음 · 마지막 2025년 12월 31일');
    expect(canEditFood(food({ addedBy: 'kid' }), 'kid', false)).toBe(true);
    expect(canEditFood(food({ addedBy: 'kid' }), 'other', false)).toBe(false);
    expect(canEditFood(food({ addedBy: 'kid' }), 'dad', true)).toBe(true);
  });

  it('resolves categories, sending removed or old ones to 기타', () => {
    expect(DEFAULT_FOOD_CATEGORIES.map((c) => c.name)).toEqual(['한식', '중식', '일식', '빵', '기타']);
    expect(categoryOf(DEFAULT_FOOD_CATEGORIES, 'chinese')).toMatchObject({ name: '중식', icon: 'noodle' });
    expect(categoryOf(DEFAULT_FOOD_CATEGORIES, 'home').id).toBe('etc'); // 예전 분류
    expect(categoryOf(DEFAULT_FOOD_CATEGORIES, '없는분류').name).toBe('기타');
    expect(categoryOf([{ id: 'x', name: '양식', icon: '없는그림' }], 'x').icon).toBe('fork');
  });

  it('normalizes saved categories and always keeps 기타 last', () => {
    expect(normalizeFoodCategories(undefined)).toEqual(DEFAULT_FOOD_CATEGORIES);
    expect(normalizeFoodCategories('잘못된 값')).toEqual(DEFAULT_FOOD_CATEGORIES);
    const custom = normalizeFoodCategories([
      { id: 'a', name: ' 양식 ', icon: 'food' },
      { id: 'a', name: '중복', icon: 'food' },
      { id: 'etc', name: '바꾼 기타', icon: 'star' },
      { id: 'b', name: '', icon: 'food' },
      { id: 'c', name: '분식', icon: '없는그림' },
    ]);
    expect(custom.map((c) => `${c.id}:${c.name}:${c.icon}`)).toEqual(['a:양식:food', 'c:분식:fork', 'etc:기타:fork']);
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, name: `분류${i}`, icon: 'food' }));
    expect(normalizeFoodCategories(many)).toHaveLength(MAX_FOOD_CATEGORIES);
    expect(normalizeSettings({}).foodCategories).toEqual(DEFAULT_FOOD_CATEGORIES);
  });

  it('validates categories before saving', () => {
    const list = [{ id: 'a', name: '양식', icon: 'food' }, DEFAULT_FOOD_CATEGORIES[4]];
    expect(cleanFoodCategories(list).map((c) => c.name)).toEqual(['양식', '기타']);
    expect(cleanFoodCategories([{ id: 'a', name: '양식', icon: 'food' }]).map((c) => c.id)).toEqual(['a', 'etc']); // 기타가 빠져도 붙는다
    expect(() => cleanFoodCategories([{ id: 'a', name: ' ', icon: 'food' }])).toThrow('분류 이름을 적어');
    expect(() => cleanFoodCategories([{ id: 'a', name: '일곱글자이름임', icon: 'food' }])).toThrow('6자');
    expect(() => cleanFoodCategories([{ id: 'a', name: '양식', icon: 'food' }, { id: 'b', name: '양식', icon: 'food' }])).toThrow('같은 이름');
    expect(() => cleanFoodCategories([{ id: 'a', name: '기타', icon: 'food' }])).toThrow('같은 이름');
    expect(() => cleanFoodCategories(Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `분류${i}`, icon: 'food' })))).toThrow('8개까지');
    expect(() => cleanSettings({ ...DEFAULT_SETTINGS, foodCategories: [{ id: 'a', name: '', icon: 'food' }] })).toThrow('분류 이름');
  });

  it('filters by category using the family list', () => {
    const categories = [{ id: 'west', name: '양식', icon: 'fork' }, DEFAULT_FOOD_CATEGORIES[4]];
    const foods = [
      food({ id: 'a', name: '파스타', category: 'west', wantedBy: ['kid'] }),
      food({ id: 'b', name: '김밥', category: 'korean', wantedBy: ['kid'] }), // 한식 분류를 지운 가족
    ];
    expect(splitFoods(foods, 'west', categories).wanted.map((f) => f.id)).toEqual(['a']);
    expect(splitFoods(foods, 'etc', categories).wanted.map((f) => f.id)).toEqual(['b']);
    expect(drawPool(foods, 'wanted', 'etc', categories).map((f) => f.id)).toEqual(['b']);
  });

  it('averages the latest star from each member', () => {
    expect(ratingSummary(food({}))).toEqual({ average: null, count: 0 });
    expect(ratingSummary(food({ ratings: { kid: 5 } }))).toEqual({ average: 5, count: 1 });
    expect(ratingSummary(food({ ratings: { kid: 5, dad: 4, mom: 4 } }))).toEqual({ average: 4.3, count: 3 });
    expect(ratingSummary(food({ ratings: { kid: 5, dad: 0, mom: 9 } }))).toEqual({ average: 5, count: 1 }); // 잘못된 값은 빼고 센다
    expect(cleanStars(3)).toBe(3);
    expect(() => cleanStars(0)).toThrow('1개부터 5개');
    expect(() => cleanStars(6)).toThrow('1개부터 5개');
    expect(() => cleanStars(2.5)).toThrow('1개부터 5개');
  });

  it('sorts the saved list by rating when asked', () => {
    const saved = [
      food({ id: 'none', name: '가' }),
      food({ id: 'low', name: '나', ratings: { kid: 2 } }),
      food({ id: 'high', name: '다', ratings: { kid: 5, dad: 4 } }),
      food({ id: 'top', name: '라', ratings: { kid: 5 } }),
    ];
    expect(sortSaved(saved, 'recent').map((f) => f.id)).toEqual(['none', 'low', 'high', 'top']);
    expect(sortSaved(saved, 'rating').map((f) => f.id)).toEqual(['top', 'high', 'low', 'none']);
    expect(eatCountLabel(food({}))).toBe('아직 안 먹어 봤어요');
    expect(eatCountLabel(food({ eaten: ['2026-10-01', '2026-10-03'] }))).toBe('2번 먹음');
    expect(lastEatenLabel(food({}), TODAY)).toBe('아직 안 먹어 봤어요');
    expect(lastEatenLabel(food({ eaten: ['2026-10-01', '2026-10-03'] }), TODAY)).toBe('마지막 10월 3일');
  });
});

describe('위치', () => {
  const place = (over: Partial<Place>): Place => ({ id: 'p1', name: '학교', lat: 35.2475, lng: 129.219, radius: 150, createdBy: 'dad', createdAt: 0, ...over });

  it('numbers local days so the next local midnight is exactly one more', () => {
    const noon = new Date(2026, 9, 6, 12, 0, 0);
    expect(dayNumber(new Date(2026, 9, 6, 0, 0, 1))).toBe(dayNumber(noon));
    expect(dayNumber(new Date(2026, 9, 6, 23, 59, 59))).toBe(dayNumber(noon));
    expect(dayNumber(new Date(2026, 9, 7, 0, 0, 1))).toBe(dayNumber(noon) + 1);
    // 서버(UTC) 날짜 번호와는 하루 넘게 차이 나지 않는다.
    expect(Math.abs(dayNumber(noon) - Math.floor(noon.getTime() / 86_400_000))).toBeLessThanOrEqual(1);
  });

  it('validates and rounds a position', () => {
    expect(cleanFix({ lat: 35.24751234567, lng: 129.21900000049, accuracy: 23.6 })).toEqual({ lat: 35.247512, lng: 129.219, accuracy: 24 });
    expect(cleanFix({ lat: 0, lng: 0, accuracy: Number.NaN }).accuracy).toBe(0);
    expect(() => cleanFix({ lat: 91, lng: 0, accuracy: 1 })).toThrow('위치를 알 수 없어요');
    expect(() => cleanFix({ lat: Number.NaN, lng: 0, accuracy: 1 })).toThrow('위치를 알 수 없어요');
  });

  it('measures distance and finds the nearest registered place', () => {
    const school = place({});
    const academy = place({ id: 'p2', name: '학원', lat: 35.2402, lng: 129.2225 });
    // 위도 0.001도는 약 111m
    expect(distanceMeters({ lat: 35, lng: 129 }, { lat: 35.001, lng: 129 })).toBeGreaterThan(110);
    expect(distanceMeters({ lat: 35, lng: 129 }, { lat: 35.001, lng: 129 })).toBeLessThan(112);
    expect(distanceMeters(school, school)).toBe(0);
    expect(nearestPlace([school, academy], { lat: 35.2476, lng: 129.2192 })?.name).toBe('학교');
    expect(placeLabel([school, academy], { lat: 35.2403, lng: 129.2224 })).toBe('학원 근처');
    expect(placeLabel([school, academy], { lat: 35.3, lng: 129.3 })).toBeNull();
    // 범위가 겹치면 더 가까운 곳
    const wide = place({ id: 'p3', name: '동네', lat: 35.248, lng: 129.2195, radius: 1000 });
    expect(nearestPlace([wide, school], { lat: 35.2475, lng: 129.219 })?.name).toBe('학교');
  });

  it('plans check-in coins within the daily limit', () => {
    const settings = { ...DEFAULT_SETTINGS };
    expect(settings.checkinCoins).toBe(1);
    expect(settings.checkinPerDay).toBe(3);
    expect(planCheckin('kid', null, settings, 100)).toEqual({ coins: 1, dayNum: 100, count: 1, ledgerId: 'checkin_kid_100_1' });
    expect(planCheckin('kid', { dayNum: 100, count: 2 }, settings, 100)).toMatchObject({ count: 3, ledgerId: 'checkin_kid_100_3' });
    expect(planCheckin('kid', { dayNum: 100, count: 3 }, settings, 100)).toBeNull(); // 오늘 한도를 다 씀
    expect(planCheckin('kid', { dayNum: 100, count: 3 }, settings, 101)).toMatchObject({ dayNum: 101, count: 1 }); // 다음 날은 다시 1번부터
    expect(planCheckin('kid', { dayNum: 102, count: 1 }, settings, 101)).toBeNull(); // 시계가 뒤로 간 경우
    expect(planCheckin('kid', null, { ...settings, checkinCoins: 0 }, 100)).toBeNull(); // 코인을 꺼 둔 경우
    expect(planCheckin('kid', { dayNum: 100, count: 3 }, { ...settings, checkinCoins: 5, checkinPerDay: 5 }, 100)).toMatchObject({ coins: 5, count: 4 });
    expect(checkinCountToday({ dayNum: 100, count: 2 }, 100)).toBe(2);
    expect(checkinCountToday({ dayNum: 99, count: 2 }, 100)).toBe(0);
    expect(checkinCountToday(null, 100)).toBe(0);
  });

  it('keeps check-in settings within range', () => {
    expect(normalizeSettings({})).toMatchObject({ checkinCoins: 1, checkinPerDay: 3 });
    expect(normalizeSettings({ checkinCoins: 0, checkinPerDay: 99 })).toMatchObject({ checkinCoins: 0, checkinPerDay: 10 });
    expect(() => cleanSettings({ ...DEFAULT_SETTINGS, checkinCoins: -1 })).toThrow('위치 공유 코인');
    expect(() => cleanSettings({ ...DEFAULT_SETTINGS, checkinPerDay: 0 })).toThrow('횟수');
    expect(cleanSettings({ ...DEFAULT_SETTINGS, checkinCoins: 0, checkinPerDay: 5 })).toMatchObject({ checkinCoins: 0, checkinPerDay: 5 });
  });

  it('labels accuracy, elapsed time and map links', () => {
    expect(accuracyLabel(0)).toBe('');
    expect(accuracyLabel(4)).toBe('오차 약 10m');
    expect(accuracyLabel(34)).toBe('오차 약 30m');
    expect(accuracyLabel(1240)).toBe('오차 약 1.2km');
    const now = 1_000_000_000;
    expect(timeAgo(now - 20_000, now)).toBe('방금');
    expect(timeAgo(now - 12 * 60_000, now)).toBe('12분 전');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3시간 전');
    expect(timeAgo(now - 25 * 3_600_000, now)).toBeNull();
    const links = mapLinks({ lat: 35.24, lng: 129.21 }, '딸');
    expect(links.google).toBe('https://www.google.com/maps/search/?api=1&query=35.24,129.21');
    expect(links.kakao).toBe('https://map.kakao.com/link/map/%EB%94%B8,35.24,129.21');
  });

  it('validates place input', () => {
    const base = { name: ' 할머니  댁 ', lat: 35.1, lng: 129.1, radius: 150 };
    expect(cleanPlaceInput(base)).toEqual({ name: '할머니 댁', lat: 35.1, lng: 129.1, radius: 150 });
    expect(() => cleanPlaceInput({ ...base, name: '' })).toThrow('장소 이름');
    expect(() => cleanPlaceInput({ ...base, radius: 10 })).toThrow('범위');
    expect(() => cleanPlaceInput({ ...base, lat: 200 })).toThrow('위치를 알 수 없어요');
  });
});

describe('캘린더', () => {
  const event = (over: Partial<CalendarEvent>): CalendarEvent => ({
    id: 'e1',
    title: '치과',
    memo: '',
    startDay: TODAY,
    endDay: over.startDay ?? TODAY,
    allDay: false,
    startTime: '15:30',
    endTime: '',
    who: [],
    repeat: 'none',
    repeatUntil: '',
    createdBy: 'mom',
    createdAt: 0,
    ...over,
  });
  const daysOf = (e: CalendarEvent, from: string, to: string) => [...occurrencesByDay([e], from, to).keys()].sort();

  it('validates event input', () => {
    const base = { title: ' 치과 ', memo: '', startDay: TODAY, endDay: '', allDay: false, startTime: '15:30', endTime: '', who: ['kid', 'kid', ''], repeat: 'none' as const, repeatUntil: '2026-12-31' };
    expect(cleanEventInput(base)).toEqual({ title: '치과', memo: '', startDay: TODAY, endDay: TODAY, allDay: false, startTime: '15:30', endTime: '', who: ['kid'], repeat: 'none', repeatUntil: '' });
    expect(cleanEventInput({ ...base, allDay: true, endTime: '16:00' })).toMatchObject({ startTime: '', endTime: '' });
    expect(() => cleanEventInput({ ...base, title: ' ' })).toThrow('일정 이름');
    expect(() => cleanEventInput({ ...base, startDay: '2026-02-30' })).toThrow('날짜를 골라');
    expect(() => cleanEventInput({ ...base, endDay: '2026-10-01' })).toThrow('앞설 수 없어요');
    expect(() => cleanEventInput({ ...base, endDay: '2026-12-25' })).toThrow('31일까지');
    expect(() => cleanEventInput({ ...base, startTime: '' })).toThrow('시작 시각');
    expect(() => cleanEventInput({ ...base, startTime: '25:00' })).toThrow('시작 시각');
    expect(() => cleanEventInput({ ...base, endTime: '15:00' })).toThrow('시작 시각보다 뒤');
    expect(cleanEventInput({ ...base, endDay: '2026-10-07', endTime: '09:00' }).endTime).toBe('09:00'); // 다음 날 아침에 끝남
    expect(() => cleanEventInput({ ...base, repeat: 'weekly', endDay: '2026-10-14' })).toThrow('7일까지만');
    expect(() => cleanEventInput({ ...base, repeat: 'weekly', repeatUntil: '2026-10-01' })).toThrow('반복을 끝내는 날');
    expect(cleanEventInput({ ...base, repeat: 'weekly' }).repeatUntil).toBe('2026-12-31');
  });

  it('places one-off and multi-day events on every day they cover', () => {
    expect(daysOf(event({}), '2026-10-01', '2026-10-31')).toEqual([TODAY]);
    expect(daysOf(event({}), '2026-10-07', '2026-10-31')).toEqual([]);
    const trip = event({ startDay: '2026-10-30', endDay: '2026-11-02', allDay: true });
    expect(daysOf(trip, '2026-10-01', '2026-10-31')).toEqual(['2026-10-30', '2026-10-31']);
    expect(daysOf(trip, '2026-11-01', '2026-11-30')).toEqual(['2026-11-01', '2026-11-02']); // 지난달에 시작한 일정
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
  });

  it('repeats weekly on the same weekday, within the repeat window', () => {
    const piano = event({ startDay: '2026-09-23', endDay: '2026-09-23', repeat: 'weekly' }); // 수요일
    expect(daysOf(piano, '2026-10-01', '2026-10-31')).toEqual(['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28']);
    expect(daysOf(piano, '2026-09-01', '2026-09-30')).toEqual(['2026-09-23', '2026-09-30']); // 시작 전에는 없다
    expect(daysOf({ ...piano, repeatUntil: '2026-10-14' }, '2026-10-01', '2026-10-31')).toEqual(['2026-10-07', '2026-10-14']);
    const camp = event({ startDay: '2026-09-25', endDay: '2026-09-27', repeat: 'weekly', allDay: true }); // 금~일
    expect(daysOf(camp, '2026-10-04', '2026-10-10')).toEqual(['2026-10-04', '2026-10-09', '2026-10-10']); // 앞 회차의 끝과 다음 회차의 시작
  });

  it('repeats monthly and yearly, skipping dates that do not exist', () => {
    const rent = event({ startDay: '2026-01-31', endDay: '2026-01-31', repeat: 'monthly' });
    expect(daysOf(rent, '2026-02-01', '2026-05-31')).toEqual(['2026-03-31', '2026-05-31']); // 2월과 4월에는 31일이 없다
    const birthday = event({ startDay: '2020-10-12', endDay: '2020-10-12', repeat: 'yearly', allDay: true });
    expect(daysOf(birthday, '2026-10-01', '2026-10-31')).toEqual(['2026-10-12']);
    expect(daysOf(birthday, '2026-01-01', '2027-12-31')).toEqual(['2026-10-12', '2027-10-12']);
    const leap = event({ startDay: '2024-02-29', endDay: '2024-02-29', repeat: 'yearly', allDay: true });
    expect(daysOf(leap, '2026-01-01', '2028-12-31')).toEqual(['2028-02-29']);
  });

  it('orders a day: all-day first, then by time', () => {
    const events = [
      event({ id: 'b', title: '학원', startTime: '16:00' }),
      event({ id: 'a', title: '치과', startTime: '09:30' }),
      event({ id: 'c', title: '여행', allDay: true, startTime: '' }),
    ];
    expect(occurrencesOn(events, TODAY).map((o) => o.event.id)).toEqual(['c', 'a', 'b']);
    expect(todayLine(occurrencesOn(events, TODAY))).toBe('여행 외 2개');
    expect(todayLine(occurrencesOn([events[1]], TODAY))).toBe('오전 9:30 치과');
    expect(todayLine([])).toBeNull();
  });

  it('labels times, ranges and repeats', () => {
    expect(clockLabel('00:05')).toBe('오전 12:05');
    expect(clockLabel('12:00')).toBe('오후 12:00');
    expect(clockLabel('15:30')).toBe('오후 3:30');
    const on = (e: CalendarEvent) => whenLabel(occurrencesOn([e], e.startDay)[0], TODAY);
    expect(on(event({}))).toBe('오후 3:30');
    expect(on(event({ endTime: '17:00' }))).toBe('오후 3:30~오후 5:00');
    expect(on(event({ allDay: true, startTime: '' }))).toBe('하루 종일');
    expect(on(event({ startDay: '2026-10-09', endDay: '2026-10-11', allDay: true, startTime: '' }))).toBe('10월 9일~10월 11일');
    expect(repeatText(event({}))).toBe('');
    expect(repeatText(event({ startDay: '2026-10-07', repeat: 'weekly' }))).toBe('매주 수요일');
    expect(repeatText(event({ startDay: '2026-10-09', repeat: 'monthly' }))).toBe('매달 9일');
    expect(repeatText(event({ startDay: '2026-10-09', repeat: 'yearly', repeatUntil: '2028-10-09' }))).toBe('매년 10월 9일 (2028년 10월 9일까지)');
  });

  it('builds the month grid starting on Sunday', () => {
    const october = monthGrid(2026, 10);
    expect(october[0]).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(october).toHaveLength(5);
    expect(october[4][6]).toBe('2026-10-31');
    expect(monthGrid(2026, 2)).toHaveLength(4); // 일요일에 시작하는 28일짜리 달
    expect(monthGrid(2026, 8)).toHaveLength(6); // 토요일에 시작하는 31일짜리 달
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('knows who an event is for and who may edit it', () => {
    expect(isFor(event({ who: [] }), 'kid')).toBe(true);
    expect(isFor(event({ who: ['mom'] }), 'kid')).toBe(false);
    expect(canEditEvent(event({ createdBy: 'kid' }), 'kid', false)).toBe(true);
    expect(canEditEvent(event({ createdBy: 'mom' }), 'kid', false)).toBe(false);
    expect(canEditEvent(event({ createdBy: 'kid' }), 'dad', true)).toBe(true);
  });

  it('knows Korean public holidays for 2026 and 2027', () => {
    expect(holidayName('2026-10-09')).toBe('한글날');
    expect(holidayName('2026-10-05')).toBe('대체공휴일'); // 개천절이 토요일
    expect(holidayName('2026-09-25')).toBe('추석');
    expect(holidayName('2026-07-17')).toBe('제헌절');
    expect(holidayName('2025-07-17')).toBeNull(); // 2026년부터 공휴일
    expect(holidayName('2026-05-01')).toBeNull();
    expect(holidayName('2027-05-01')).toBe('노동절');
    expect(holidayName('2027-02-07')).toBe('설날');
    expect(holidayName('2027-02-09')).toBe('대체공휴일');
    expect(holidayName('2027-12-27')).toBe('대체공휴일');
    expect(holidayName('2026-10-07')).toBeNull();
    expect(holidayName('2030-12-25')).toBe('성탄절'); // 표가 없는 해도 날짜가 고정된 공휴일은 보인다
    expect(holidaysComplete(2027)).toBe(true);
    expect(holidaysComplete(2028)).toBe(false);
  });
});

describe('코인 축하 연출', () => {
  const entry = (id: string, amount: number, at: number, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
    id,
    uid: 'kid',
    amount,
    type: 'quest',
    refId: '',
    memo: id,
    note: '',
    by: 'dad',
    at,
    ...extra,
  });
  const ledger = [entry('a', 10, 100), entry('b', -50, 200, { type: 'reward' }), entry('c', 5, 300, { type: 'gift', note: '고마워!' }), entry('d', 20, 400, { uid: 'other' })];

  it('받은 코인만 고르고, 마지막으로 본 뒤의 것만 "그동안 받은 코인"이 된다', () => {
    const gains = gainsOf(ledger, 'kid');
    expect(gains.map((e) => e.id)).toEqual(['a', 'c']);
    expect(latestAt(gains)).toBe(300);
    expect(latestAt([])).toBe(0);
    expect(missedGains(gains, 100).map((e) => e.id)).toEqual(['c']);
    expect(missedGains(gains, 300)).toEqual([]);
    expect(missedGains([entry('z', 1, 900), entry('y', 1, 800)], 0).map((e) => e.id)).toEqual(['y', 'z']);
  });

  it('한 장면으로 묶는다: 합계, 내역 4줄까지, 최근 한마디, 연속 달성 여부', () => {
    const scene = coinScene([entry('수학', 10, 1), entry('칭찬 코인', 5, 2, { type: 'gift', note: '고마워!' })]);
    expect(scene).toMatchObject({ total: 15, lines: ['수학 +10', '칭찬 코인 +5'], more: 0, note: '고마워!', streak: false, rain: 15 });
    const many = coinScene(Array.from({ length: 6 }, (_, i) => entry(`q${i}`, 1, i)));
    expect(many.lines).toHaveLength(4);
    expect(many.more).toBe(2);
    expect(many.rain).toBe(8); // 적어도 8개는 떨어진다
    expect(coinScene([entry('큰돈', 500, 1)]).rain).toBe(28); // 많아도 28개까지
    expect(coinScene([entry('보너스', 10, 1, { type: 'bonus' })]).streak).toBe(true);
  });

  it('이번에 받은 코인으로 목표를 처음 채웠을 때만 목표 달성이다', () => {
    const goal = { id: 'g', title: '게임', note: '', price: 50, icon: 'game', limit: { period: 'none', count: 1 }, active: true, createdBy: 'dad', createdAt: 0 } as Reward;
    expect(goalJustReached(goal, 55, 10, 0)).toBe(true); // 45 → 55
    expect(goalJustReached(goal, 70, 10, 0)).toBe(false); // 이미 채워져 있었다
    expect(goalJustReached(goal, 45, 10, 0)).toBe(false); // 아직 모자라다
    expect(goalJustReached(goal, 55, 10, 20)).toBe(false); // 묶인 코인을 빼면 모자라다
    expect(goalJustReached(undefined, 55, 10, 0)).toBe(false);
    expect(goalJustReached(goal, 55, 0, 0)).toBe(false);
  });
});

describe('보상 제안', () => {
  const settings = { ...DEFAULT_SETTINGS };
  const wish = (id: string, extra: Partial<Wish> = {}): Wish => ({
    id,
    ownerUid: 'kid',
    title: id,
    note: '',
    icon: 'shop',
    status: 'negotiating',
    lastPrice: 100,
    lastRole: 'child',
    offerCount: 1,
    offers: [],
    declineNote: '',
    decidedAt: null,
    createdAt: 0,
    ...extra,
  });

  it('입력값을 다듬고 잘못된 값은 막는다', () => {
    expect(cleanWishInput({ title: ' 놀이공원 ', note: ' 가고 싶어요 ', icon: 'balloon', price: 150 })).toEqual({ title: '놀이공원', note: '가고 싶어요', icon: 'balloon', price: 150 });
    expect(cleanWishInput({ title: '선물', note: '', icon: '없는그림', price: 1 }).icon).toBe('shop');
    expect(() => cleanWishInput({ title: '', note: '', icon: 'shop', price: 10 })).toThrow('이름을 적어 주세요');
    expect(() => cleanWishInput({ title: '선물', note: '', icon: 'shop', price: 0 })).toThrow('가격은 1부터');
    expect(() => cleanWishInput({ title: '선물', note: '', icon: 'shop', price: 1.5 })).toThrow('가격은 1부터');
    expect(() => cleanWishInput({ title: '선물', note: '', icon: 'shop', price: 10001 })).toThrow('가격은 1부터');
  });

  it('차례와 다시 제안할 수 있는 횟수', () => {
    expect(wishTurn(wish('a'))).toBe('parent');
    expect(wishTurn(wish('a', { lastRole: 'parent' }))).toBe('child');
    expect(wishTurn(wish('a', { status: 'agreed' }))).toBeNull();
    expect(canCounterWish(wish('a', { offerCount: 2 }), settings)).toBe(true);
    expect(canCounterWish(wish('a', { offerCount: 3 }), settings)).toBe(false);
    expect(canCounterWish(wish('a', { status: 'declined' }), settings)).toBe(false);
  });

  it('자녀 화면과 부모 화면에 나눠 보여 준다', () => {
    const list = [
      wish('기다림', { createdAt: 2 }),
      wish('답할것', { lastRole: 'parent', createdAt: 1 }),
      wish('오늘거절', { status: 'declined', decidedAt: 10 }),
      wish('어제거절', { status: 'declined', decidedAt: 5 }),
      wish('올라감', { status: 'agreed', decidedAt: 10 }),
      wish('남의것', { ownerUid: 'other' }),
    ];
    const mine = splitMyWishes(list, 'kid', (at) => at === 10);
    expect(mine.toAnswer.map((w) => w.id)).toEqual(['답할것']);
    expect(mine.waiting.map((w) => w.id)).toEqual(['기다림']);
    expect(mine.declinedToday.map((w) => w.id)).toEqual(['오늘거절']);
    expect(wishesForParent(list).map((w) => w.id)).toEqual(['남의것', '기다림']);
    expect(canAddWish(list, 'kid')).toBe(true); // 협상 중인 것은 2개
    expect(canAddWish([...list, wish('셋째')], 'kid')).toBe(false);
  });
});

describe('가족 메모', () => {
  const person = (uid: string, displayName: string, role: 'parent' | 'child' = 'parent') =>
    ({ uid, displayName, role, avatar: { id: 'bear', color: 'brown' }, coins: 0 }) as unknown as Member;
  const family = [person('dad', '아빠'), person('mom', '엄마'), person('kid', '딸', 'child')];
  const note = (id: string, extra: Partial<Note> = {}): Note => ({ id, text: id, toUids: [], until: '', createdBy: 'dad', createdAt: 0, readBy: [], hiddenAt: 0, sticker: '', ...extra });

  it('홈에서 내린 메모는 홈에서 빠지고 캘린더 기록에는 남는다', () => {
    const at = new Date(2026, 9, 7, 19).getTime();
    const notes = [
      note('all', { createdAt: at }),
      note('hidden', { createdAt: at + 1, hiddenAt: at + 2 }),
      note('toMom', { createdAt: at + 2, toUids: ['mom'], createdBy: 'kid' }),
      note('other', { createdAt: new Date(2026, 9, 8, 9).getTime() }),
    ];
    expect(visibleNotes(notes, 'dad', '2026-10-09').map((n) => n.id)).toEqual(['other', 'all']);
    expect(activeNoteCount(notes, '2026-10-09')).toBe(3);
    // 그날 기록: 부모는 다른 사람에게 보낸 메모도 보고, 자녀는 자기와 관계있는 것만 본다.
    expect(notesOnDay(notes, '2026-10-07', 'dad', true).map((n) => n.id)).toEqual(['all', 'hidden', 'toMom']);
    expect(notesOnDay(notes, '2026-10-07', 'kid2', false).map((n) => n.id)).toEqual(['all', 'hidden']);
    expect([...noteDays(notes, 'kid2', false)].sort()).toEqual(['2026-10-07', '2026-10-08']);
  });

  it('입력값을 다듬는다', () => {
    const uids = ['dad', 'mom', 'kid'];
    expect(cleanNoteInput({ text: ' 전화해 줘 ', toUids: ['kid', 'kid', 'dad', 'x'], until: '' }, uids, 'dad', '2026-10-08')).toEqual({ text: '전화해 줘', toUids: ['kid'], until: '', sticker: '' });
    expect(cleanNoteInput({ text: '모두에게', toUids: [], until: '2026-10-08' }, uids, 'dad', '2026-10-08').until).toBe('2026-10-08');
    expect(() => cleanNoteInput({ text: '', toUids: [], until: '' }, uids, 'dad', '2026-10-08')).toThrow('메모를 적어 주세요');
    expect(() => cleanNoteInput({ text: '가'.repeat(101), toUids: [], until: '' }, uids, 'dad', '2026-10-08')).toThrow('100자까지');
    expect(() => cleanNoteInput({ text: '메모', toUids: [], until: '2026-10-07' }, uids, 'dad', '2026-10-08')).toThrow('오늘보다 앞설 수 없어요');
    expect(() => cleanNoteInput({ text: '메모', toUids: [], until: '내일' }, uids, 'dad', '2026-10-08')).toThrow('다시 골라 주세요');
    expect(() => cleanNoteInput({ text: '메모', toUids: ['dad'], until: '' }, uids, 'dad', '2026-10-08')).toThrow('받을 사람을 골라 주세요');
  });

  it('내가 썼거나 나에게 온 메모만, 사라질 날짜가 지나지 않은 것만 보인다', () => {
    const list = [
      note('모두', { createdAt: 1 }),
      note('딸에게', { toUids: ['kid'], createdAt: 2 }),
      note('엄마에게', { toUids: ['mom'], createdAt: 3 }),
      note('어제까지', { until: '2026-10-07', createdAt: 4 }),
      note('오늘까지', { until: '2026-10-08', createdAt: 5 }),
    ];
    expect(visibleNotes(list, 'kid', '2026-10-08').map((n) => n.id)).toEqual(['오늘까지', '딸에게', '모두']);
    expect(visibleNotes(list, 'dad', '2026-10-08').map((n) => n.id)).toEqual(['오늘까지', '엄마에게', '딸에게', '모두']); // 쓴 사람은 다 본다
    expect(visibleNotes(list, 'mom', '2026-10-09').map((n) => n.id)).toEqual(['엄마에게', '모두']);
  });

  it('확인 안 한 메모와 확인 상황', () => {
    const toAll = note('모두', { readBy: ['kid'] });
    expect(isUnreadFor(toAll, 'mom')).toBe(true);
    expect(isUnreadFor(toAll, 'kid')).toBe(false);
    expect(isUnreadFor(toAll, 'dad')).toBe(false); // 내가 쓴 메모
    expect(isUnreadFor(note('딸에게', { toUids: ['kid'] }), 'mom')).toBe(false); // 나에게 온 것이 아니다
    expect(noteReceiptText(toAll, family)).toBe('딸 확인 · 엄마 아직');
    expect(noteReceiptText(note('모두', { readBy: ['kid', 'mom'] }), family)).toBe('모두 확인');
    expect(noteReceiptText(note('모두'), family)).toBe('엄마, 딸 아직');
    expect(noteReceiptText(note('딸에게', { toUids: ['kid'], readBy: ['kid'] }), family)).toBe('딸 확인');
    expect(noteTargetText(toAll, family)).toBe('가족 모두');
    expect(noteTargetText(note('둘', { toUids: ['mom', 'kid'] }), family)).toBe('엄마, 딸');
  });

  it('고치기와 지우기는 쓴 사람과 부모만, 사라질 날짜 안내', () => {
    const kidNote = note('딸 메모', { createdBy: 'kid' });
    expect(canEditNote(kidNote, 'kid', false)).toBe(true);
    expect(canEditNote(kidNote, 'mom', true)).toBe(true);
    expect(canEditNote(note('아빠 메모'), 'kid', false)).toBe(false);
    expect(noteUntilText({ until: '' }, '2026-10-08')).toBe('지울 때까지 보여요');
    expect(noteUntilText({ until: '2026-10-12' }, '2026-10-08')).toBe('10월 12일까지 보여요');
  });
});
