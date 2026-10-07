import { describe, expect, it } from 'vitest';
import type { Food, Member, Order, Place, Proposal, Quest, Reward, Run } from '../src/backend/types';
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
