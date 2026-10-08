/**
 * 체험 모드 저장소. Firebase 설정이 없을 때 쓰인다.
 * 데이터는 이 기기의 브라우저에만 저장되고, 실제 서버와 같은 권한 규칙을 흉내 낸다.
 */
import { INVITE_TTL_MS, isInviteCodeShape, newInviteCode, normalizeInviteCode } from '../domain/invites';
import { MAX_EVENTS, canEditEvent, cleanEventInput } from '../domain/calendar';
import { MAX_FOODS, canEditFood, cleanFoodInput, cleanStars, findSameName, withEaten } from '../domain/foods';
import { MAX_PLACES, cleanFix, cleanPlaceInput, planCheckin } from '../domain/location';
import { cleanFamilyName, cleanProfile } from '../domain/profile';
import { MAX_OFFER_NOTE, canCounter, cleanOfferAmount, cleanProposalInput, turnOf } from '../domain/proposals';
import { cleanPresetInput, cleanQuestInput, runId } from '../domain/quests';
import {
  DEFAULT_SETTINGS,
  MAX_PRAISE_LENGTH,
  MAX_PRESETS,
  MAX_REWARD,
  cleanSettings,
  halfReward,
  normalizeSettings,
} from '../domain/settings';
import { MAX_NOTES, canEditNote, cleanNoteInput, isNoteFor } from '../domain/notes';
import { MAX_REWARDS, buyBlockReason, cleanRewardInput } from '../domain/shop';
import { MAX_DECLINE_NOTE, MAX_OPEN_WISHES, WISH_KEEP_DAYS, canCounterWish, checkWishTurn, cleanWishInput, cleanWishPrice, openWishCount } from '../domain/wishes';
import { addDays, dateKey, dayNumber } from '../lib/dates';
import {
  AppError,
  type AuthUser,
  type Backend,
  type CalendarEvent,
  type DemoPersona,
  type Family,
  type Food,
  type Invite,
  type LedgerEntry,
  type LocationRecord,
  type Member,
  type Note,
  type Order,
  type Place,
  type Preset,
  type Proposal,
  type Quest,
  type Reward,
  type Run,
  type Unsub,
  type UserProfile,
  type Wish,
} from './types';

interface DemoUser {
  uid: string;
  email: string;
  label: string;
  hint: string;
  familyId: string | null;
}

interface DemoState {
  v: 9;
  currentUid: string | null;
  users: Record<string, DemoUser>;
  families: Record<string, Family>;
  members: Record<string, Record<string, Member>>;
  quests: Record<string, Record<string, Quest>>;
  runs: Record<string, Record<string, Run>>;
  ledger: Record<string, LedgerEntry[]>;
  presets: Record<string, Record<string, Preset>>;
  proposals: Record<string, Record<string, Proposal>>;
  rewards: Record<string, Record<string, Reward>>;
  orders: Record<string, Record<string, Order>>;
  foods: Record<string, Record<string, Food>>;
  locations: Record<string, LocationRecord[]>;
  places: Record<string, Record<string, Place>>;
  events: Record<string, Record<string, CalendarEvent>>;
  wishes: Record<string, Record<string, Wish>>;
  notes: Record<string, Record<string, Note>>;
  invites: Record<string, Invite>;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'family-quest-demo-v9';
const FAMILY = 'demo-family';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 체험용 예시 데이터: 이틀 전부터 쓰기 시작한 가족 */
function seed(now: number = Date.now()): DemoState {
  const today = dateKey(new Date(now));
  const yesterday = addDays(today, -1);
  const twoDaysAgo = addDays(today, -2);
  const startedAt = now - 2 * DAY_MS;

  const quest = (id: string, title: string, reward: number, repeat: Quest['repeat'], important = false): Quest => ({
    id,
    title,
    note: '',
    assigneeUid: 'demo-kid',
    reward,
    repeat,
    important,
    active: true,
    createdBy: 'demo-dad',
    createdAt: startedAt,
  });

  const run = (questId: string, title: string, reward: number, day: string, at: number, approved: boolean): Run => ({
    id: runId(questId, day),
    questId,
    questTitle: title,
    reward,
    assigneeUid: 'demo-kid',
    dateKey: day,
    oneOff: false,
    late: false,
    status: approved ? 'approved' : 'submitted',
    submittedAt: at,
    decidedBy: approved ? 'demo-dad' : null,
    decidedAt: approved ? at + 60_000 : null,
    rejectReason: '',
    praise: approved ? '참 잘했어요!' : '',
  });

  const paid = (r: Run): LedgerEntry => ({
    id: r.id,
    uid: r.assigneeUid,
    amount: r.reward,
    type: 'quest',
    refId: r.id,
    memo: r.questTitle,
    note: r.praise,
    by: 'demo-dad',
    at: r.decidedAt ?? r.submittedAt,
  });

  // 그저께는 수학만 했고(책 읽기는 놓침), 어제는 둘 다 했다.
  const done = [
    run('q-math', '수학 문제집 2쪽', 10, twoDaysAgo, now - 2 * DAY_MS, true),
    run('q-math', '수학 문제집 2쪽', 10, yesterday, now - DAY_MS, true),
    run('q-read', '책 30분 읽기', 10, yesterday, now - DAY_MS + 3_600_000, true),
  ];
  const pending = run('q-read', '책 30분 읽기', 10, today, now - 10 * 60_000, false);

  const member = (uid: string, role: Member['role'], displayName: string, avatar: Member['avatar']): Member => ({
    uid,
    role,
    displayName,
    avatar,
    coins: 0,
    joinedAt: startedAt,
    streak: null,
    goalRewardId: null,
    checkin: null,
  });

  const event = (id: string, title: string, startDay: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id,
    title,
    memo: '',
    startDay,
    endDay: startDay,
    allDay: false,
    startTime: '',
    endTime: '',
    who: [],
    repeat: 'none',
    repeatUntil: '',
    createdBy: 'demo-mom',
    createdAt: startedAt,
    ...over,
  });
  // 작년 이맘때(닷새 뒤 날짜)부터 매년 돌아오는 생신
  const birthday = addDays(today, 5);
  const birthdayLastYear = `${Number(birthday.slice(0, 4)) - 1}${birthday.slice(4)}`;

  const place = (id: string, name: string, lat: number, lng: number): Place => ({
    id,
    name,
    lat,
    lng,
    radius: 150,
    createdBy: 'demo-dad',
    createdAt: startedAt,
  });

  const preset = (id: string, title: string, reward: number, childCanAdd: boolean): Preset => ({
    id,
    title,
    reward,
    childCanAdd,
    createdAt: startedAt,
  });

  const reward = (id: string, title: string, price: number, icon: string, limit: Reward['limit']): Reward => ({
    id,
    title,
    note: '',
    price,
    icon,
    limit,
    active: true,
    createdBy: 'demo-dad',
    createdAt: startedAt,
  });

  const food = (
    id: string,
    name: string,
    category: Food['category'],
    wantedBy: string[],
    eatenDaysAgo: number[],
    ratings: Food['ratings'] = {},
    link = '',
    memo = '',
  ): Food => ({
    id,
    name,
    category,
    link,
    memo,
    addedBy: wantedBy[0] ?? 'demo-mom',
    createdAt: startedAt + eatenDaysAgo.length,
    wantedBy,
    eaten: eatenDaysAgo.map((n) => addDays(today, -n)).sort(),
    ratings,
    active: true,
  });

  return {
    v: 9,
    currentUid: null,
    users: {
      'demo-dad': { uid: 'demo-dad', email: 'dad@example.com', label: '아빠', hint: '퀘스트를 만들고 승인해요', familyId: FAMILY },
      'demo-mom': { uid: 'demo-mom', email: 'mom@example.com', label: '엄마', hint: '아빠와 똑같이 승인할 수 있어요', familyId: FAMILY },
      'demo-kid': { uid: 'demo-kid', email: 'kid@example.com', label: '딸', hint: '퀘스트를 하고 코인을 모아요', familyId: FAMILY },
      'demo-new': { uid: 'demo-new', email: 'new@example.com', label: '처음 온 사람', hint: '가입 과정을 처음부터 해 봐요', familyId: null },
    },
    families: {
      [FAMILY]: { id: FAMILY, name: '우리 가족', createdBy: 'demo-dad', createdAt: startedAt, settings: { ...DEFAULT_SETTINGS } },
    },
    members: {
      [FAMILY]: {
        'demo-dad': member('demo-dad', 'parent', '아빠', { id: 'bear', color: 'brown' }),
        'demo-mom': member('demo-mom', 'parent', '엄마', { id: 'cat', color: 'yellow' }),
        'demo-kid': {
          ...member('demo-kid', 'child', '딸', { id: 'rabbit', color: 'pink' }),
          coins: 30,
          streak: { count: 2, lastDate: yesterday },
          goalRewardId: 'r-game',
        },
      },
    },
    quests: {
      [FAMILY]: {
        'q-math': quest('q-math', '수학 문제집 2쪽', 10, { type: 'daily' }),
        'q-read': quest('q-read', '책 30분 읽기', 10, { type: 'daily' }),
        'q-room': quest('q-room', '방 정리하기', 20, { type: 'weekly', days: [6] }),
        'q-piano': quest('q-piano', '피아노 연습', 15, { type: 'none', date: today }, true),
      },
    },
    runs: { [FAMILY]: Object.fromEntries([...done, pending].map((r) => [r.id, r])) },
    ledger: { [FAMILY]: done.map(paid) },
    presets: {
      [FAMILY]: {
        'p-dish': preset('p-dish', '설거지 돕기', 10, true),
        'p-recycle': preset('p-recycle', '분리수거 하기', 10, true),
        'p-errand': preset('p-errand', '심부름', 5, false),
      },
    },
    proposals: {
      [FAMILY]: {
        'm-bag': {
          id: 'm-bag',
          ownerUid: 'demo-kid',
          title: '준비물 챙기기',
          note: '',
          date: addDays(today, 1),
          important: true,
          status: 'memo',
          doneDay: null,
          declined: false,
          lastAmount: null,
          lastRole: null,
          offerCount: 0,
          offers: [],
          createdAt: now - 3_600_000,
        },
        'n-shoes': {
          id: 'n-shoes',
          ownerUid: 'demo-kid',
          title: '신발장 정리하기',
          note: '',
          date: today,
          important: false,
          status: 'negotiating',
          doneDay: null,
          declined: false,
          lastAmount: 20,
          lastRole: 'child',
          offerCount: 1,
          offers: [{ byUid: 'demo-kid', role: 'child', amount: 20, note: '', at: now - 30 * 60_000 }],
          createdAt: now - 30 * 60_000,
        },
      },
    },
    rewards: {
      [FAMILY]: {
        'r-snack': reward('r-snack', '먹고 싶은 간식', 30, 'snack', { period: 'none', count: 1 }),
        'r-game': reward('r-game', '게임 30분', 50, 'game', { period: 'day', count: 1 }),
        'r-sleep': reward('r-sleep', '30분 늦게 자기', 80, 'moon', { period: 'week', count: 2 }),
        'r-movie': reward('r-movie', '주말 영화 보기', 150, 'movie', { period: 'week', count: 1 }),
        'r-gift': reward('r-gift', '갖고 싶은 선물', 300, 'shop', { period: 'none', count: 1 }),
      },
    },
    orders: { [FAMILY]: {} },
    foods: {
      [FAMILY]: {
        'f-chicken': food('f-chicken', '치킨', 'etc', ['demo-kid', 'demo-dad'], [9], { 'demo-kid': 5, 'demo-dad': 4 }),
        'f-sushi': food('f-sushi', '초밥', 'japanese', ['demo-mom'], [], {}, 'https://www.google.com/maps/search/?api=1&query=%EC%B4%88%EB%B0%A5', '역 앞 새로 생긴 집'),
        'f-bread': food('f-bread', '소금빵', 'bread', ['demo-kid'], [12], { 'demo-kid': 4 }),
        'f-kimchi': food('f-kimchi', '김치찌개', 'korean', [], [2, 9, 20], { 'demo-dad': 5, 'demo-mom': 4, 'demo-kid': 3 }),
        'f-gimbap': food('f-gimbap', '김밥', 'korean', [], [5]),
        'f-tteok': food('f-tteok', '떡볶이', 'korean', [], [15, 30], { 'demo-kid': 5 }),
      },
    },
    events: {
      [FAMILY]: {
        'e-dentist': event('e-dentist', '치과', today, { startTime: '15:30', who: ['demo-kid'], memo: '칫솔 챙기기' }),
        'e-piano': event('e-piano', '피아노 학원', addDays(today, -13), { startTime: '16:00', endTime: '17:00', who: ['demo-kid'], repeat: 'weekly' }),
        'e-mom': event('e-mom', '엄마 모임', addDays(today, 1), { startTime: '19:30', who: ['demo-mom'] }),
        'e-dinner': event('e-dinner', '가족 외식', addDays(today, 3), { startTime: '18:30', createdBy: 'demo-dad' }),
        'e-birthday': event('e-birthday', '할머니 생신', birthdayLastYear, { allDay: true, repeat: 'yearly' }),
        'e-trip': event('e-trip', '가족 여행', addDays(today, 9), { endDay: addDays(today, 11), allDay: true, createdBy: 'demo-dad' }),
        'e-kid': event('e-kid', '친구 생일 파티', addDays(today, 6), { startTime: '14:00', who: ['demo-kid'], createdBy: 'demo-kid' }),
      },
    },
    // 가족 메모: 딸이 아직 확인하지 않은 엄마의 메모와, 딸은 확인한 아빠의 메모
    notes: {
      [FAMILY]: {
        'n-call': { id: 'n-call', text: '학원 끝나면 바로 전화해 줘! 오늘 저녁은 할머니 댁에서 먹어요.', toUids: ['demo-kid'], until: today, createdBy: 'demo-mom', createdAt: now - 20 * 60_000, readBy: [] },
        'n-clean': { id: 'n-clean', text: '토요일 10시에 가족 대청소', toUids: [], until: '', createdBy: 'demo-dad', createdAt: now - 5 * 3_600_000, readBy: ['demo-kid'] },
      },
    },
    // 자녀가 상점에 올려 달라고 제안한 보상: 부모의 답을 기다리는 중
    wishes: {
      [FAMILY]: {
        'w-park': {
          id: 'w-park',
          ownerUid: 'demo-kid',
          title: '놀이공원 가기',
          note: '시험 끝나고 가고 싶어요',
          icon: 'balloon',
          status: 'negotiating',
          lastPrice: 150,
          lastRole: 'child',
          offerCount: 1,
          offers: [{ byUid: 'demo-kid', role: 'child', amount: 150, note: '', at: now - 2 * 3_600_000 }],
          declineNote: '',
          decidedAt: null,
          createdAt: now - 2 * 3_600_000,
        },
      },
    },
    // 체험용 장소와 위치는 지어낸 좌표다.
    places: {
      [FAMILY]: {
        'pl-home': place('pl-home', '집', 35.244, 129.213),
        'pl-school': place('pl-school', '학교', 35.2475, 129.219),
        'pl-academy': place('pl-academy', '학원', 35.2402, 129.2225),
      },
    },
    locations: {
      [FAMILY]: [
        { id: 'loc-seed-1', uid: 'demo-kid', lat: 35.2476, lng: 129.2192, accuracy: 24, at: now - 3 * 3_600_000, trigger: 'quest', coins: 0 },
        { id: 'loc-seed-2', uid: 'demo-kid', lat: 35.2403, lng: 129.2224, accuracy: 35, at: now - 40 * 60_000, trigger: 'open', coins: 0 },
      ],
    },
    invites: {},
  };
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createDemoBackend(store: KeyValueStore | null = defaultStore()): Backend {
  let state = load();
  const dataListeners = new Set<() => void>();
  const authListeners = new Set<(user: AuthUser | null) => void>();

  function load(): DemoState {
    try {
      const raw = store?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState;
        if (parsed.v === 9) return parsed;
      }
    } catch {
      // 저장소를 못 읽으면 새로 시작한다.
    }
    return seed();
  }

  function commit() {
    try {
      store?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 저장 실패는 체험에 지장이 없으므로 넘어간다.
    }
    dataListeners.forEach((fn) => fn());
  }

  function authUser(): AuthUser | null {
    const user = state.currentUid ? state.users[state.currentUid] : null;
    return user ? { uid: user.uid, email: user.email } : null;
  }

  function emitAuth() {
    const user = authUser();
    authListeners.forEach((fn) => fn(user));
  }

  function watch<T>(select: () => T, cb: (value: T) => void): Unsub {
    const run = () => cb(select());
    run();
    dataListeners.add(run);
    return () => dataListeners.delete(run);
  }

  // 다른 탭에서 바뀐 내용을 따라간다(창 두 개로 부모/자녀를 동시에 체험할 때).
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const next = JSON.parse(event.newValue) as DemoState;
        // 로그인한 사람은 탭마다 따로 유지한다.
        next.currentUid = state.currentUid;
        state = next;
        dataListeners.forEach((fn) => fn());
      } catch {
        // 무시
      }
    });
  }

  function me(): string {
    if (!state.currentUid) throw new AppError('로그인이 필요해요.');
    return state.currentUid;
  }

  function requireMember(familyId: string): Member {
    const member = state.members[familyId]?.[me()];
    if (!member) throw new AppError('이 가족의 구성원이 아니에요.');
    return member;
  }

  function requireParent(familyId: string): Member {
    const member = requireMember(familyId);
    if (member.role !== 'parent') throw new AppError('부모만 할 수 있는 일이에요.');
    return member;
  }

  function requireSelf(uid: string) {
    if (uid !== me()) throw new AppError('본인만 할 수 있는 일이에요.');
  }

  function settingsOf(familyId: string) {
    return normalizeSettings(state.families[familyId].settings);
  }

  function requireProposal(familyId: string, proposalId: string): Proposal {
    const proposal = state.proposals[familyId]?.[proposalId];
    if (!proposal) throw new AppError('할 일을 찾을 수 없어요.');
    return proposal;
  }

  function requireNote(familyId: string, noteId: string): Note {
    const note = state.notes[familyId]?.[noteId];
    if (!note) throw new AppError('메모를 찾을 수 없어요.');
    return note;
  }

  function requireWish(familyId: string, wishId: string): Wish {
    const wish = state.wishes[familyId]?.[wishId];
    if (!wish) throw new AppError('제안을 찾을 수 없어요.');
    return wish;
  }

  function requireEvent(familyId: string, eventId: string): CalendarEvent {
    const found = state.events[familyId]?.[eventId];
    if (!found) throw new AppError('일정을 찾을 수 없어요. 이미 지워졌을 수 있어요.');
    return found;
  }

  function requireFood(familyId: string, foodId: string): Food {
    const food = state.foods[familyId]?.[foodId];
    if (!food || !food.active) throw new AppError('메뉴를 찾을 수 없어요. 이미 지워졌을 수 있어요.');
    return food;
  }

  /** 협상에서 지금 답할 차례인 사람만 통과시킨다. */
  function requireTurn(familyId: string, proposal: Proposal): Member {
    const member = requireMember(familyId);
    const turn = turnOf(proposal);
    if (!turn) throw new AppError('이미 끝난 협상이에요.');
    if (member.role === 'child' && proposal.ownerUid !== member.uid) throw new AppError('내 할 일만 협상할 수 있어요.');
    if (member.role !== turn) throw new AppError('지금은 상대가 답할 차례예요.');
    return member;
  }

  function addLedger(familyId: string, entry: LedgerEntry) {
    const member = state.members[familyId][entry.uid];
    if (!member) throw new AppError('구성원을 찾을 수 없어요.');
    state.ledger[familyId].push(entry);
    state.members[familyId][entry.uid] = { ...member, coins: member.coins + entry.amount };
  }

  const backend: Backend = {
    mode: 'demo',

    onAuthChange(cb) {
      cb(authUser());
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    async signInWithGoogle() {
      throw new AppError('체험 모드에서는 아래에서 사람을 골라 들어가요.');
    },
    async signInWithEmail() {
      throw new AppError('체험 모드에서는 아래에서 사람을 골라 들어가요.');
    },
    async signUpWithEmail() {
      throw new AppError('체험 모드에서는 아래에서 사람을 골라 들어가요.');
    },
    async signOut() {
      state.currentUid = null;
      commit();
      emitAuth();
    },

    watchUserProfile(uid, cb) {
      return watch<UserProfile | null>(() => {
        const user = state.users[uid];
        return user ? { uid, familyId: user.familyId } : null;
      }, cb);
    },

    async createFamily(uid, familyName, profile) {
      requireSelf(uid);
      const name = cleanFamilyName(familyName);
      const clean = cleanProfile(profile);
      if (state.users[uid].familyId) throw new AppError('이미 가족에 들어가 있어요.');
      const id = newId('fam');
      const now = Date.now();
      state.families[id] = { id, name, createdBy: uid, createdAt: now, settings: { ...DEFAULT_SETTINGS } };
      state.members[id] = { [uid]: { uid, role: 'parent', ...clean, coins: 0, joinedAt: now, streak: null, goalRewardId: null, checkin: null } };
      state.quests[id] = {};
      state.runs[id] = {};
      state.ledger[id] = [];
      state.presets[id] = {};
      state.proposals[id] = {};
      state.rewards[id] = {};
      state.orders[id] = {};
      state.foods[id] = {};
      state.locations[id] = [];
      state.places[id] = {};
      state.events[id] = {};
      state.wishes[id] = {};
      state.notes[id] = {};
      state.users[uid].familyId = id;
      commit();
      return id;
    },

    async joinFamily(uid, rawCode, profile) {
      requireSelf(uid);
      const clean = cleanProfile(profile);
      const code = normalizeInviteCode(rawCode);
      if (!isInviteCodeShape(code)) throw new AppError('초대코드는 6자리예요. 다시 확인해 주세요.');
      const invite = state.invites[code];
      if (!invite) throw new AppError('초대코드를 찾을 수 없어요. 다시 확인해 주세요.');
      if (invite.expiresAt < Date.now()) throw new AppError('기한이 지난 초대코드예요. 새 코드를 받아 주세요.');
      if (state.users[uid].familyId) throw new AppError('이미 가족에 들어가 있어요.');
      state.members[invite.familyId][uid] = {
        uid,
        role: invite.role,
        ...clean,
        coins: 0,
        joinedAt: Date.now(),
        streak: null,
        goalRewardId: null,
        checkin: null,
      };
      state.users[uid].familyId = invite.familyId;
      commit();
      return invite.familyId;
    },

    async createInvite(familyId, role, byUid) {
      requireSelf(byUid);
      requireParent(familyId);
      let code = newInviteCode();
      while (state.invites[code]) code = newInviteCode();
      const invite: Invite = {
        code,
        familyId,
        familyName: state.families[familyId].name,
        role,
        createdBy: byUid,
        expiresAt: Date.now() + INVITE_TTL_MS,
      };
      state.invites[code] = invite;
      commit();
      return invite;
    },

    watchFamily(familyId, cb) {
      return watch(() => {
        const family = state.families[familyId];
        return family ? { ...family, settings: { ...family.settings } } : null;
      }, cb);
    },
    watchMembers(familyId, cb) {
      return watch(() => Object.values(state.members[familyId] ?? {}).map((m) => ({ ...m })), cb);
    },

    async updateMyProfile(familyId, uid, profile) {
      requireSelf(uid);
      const member = requireMember(familyId);
      const clean = cleanProfile(profile);
      state.members[familyId][uid] = { ...member, ...clean };
      commit();
    },

    async updateSettings(familyId, settings) {
      requireParent(familyId);
      state.families[familyId] = { ...state.families[familyId], settings: cleanSettings(settings) };
      commit();
    },

    watchQuests(familyId, cb) {
      return watch(() => Object.values(state.quests[familyId] ?? {}).filter((q) => q.active), cb);
    },

    async createQuest(familyId, input, byUid) {
      requireSelf(byUid);
      requireParent(familyId);
      const clean = cleanQuestInput(input);
      if (!state.members[familyId][clean.assigneeUid]) throw new AppError('퀘스트를 받을 사람을 다시 골라 주세요.');
      const id = newId('q');
      state.quests[familyId][id] = { id, ...clean, active: true, createdBy: byUid, createdAt: Date.now() };
      commit();
      return id;
    },

    async updateQuest(familyId, questId, input) {
      requireParent(familyId);
      const quest = state.quests[familyId]?.[questId];
      if (!quest) throw new AppError('퀘스트를 찾을 수 없어요.');
      const clean = cleanQuestInput(input);
      if (!state.members[familyId][clean.assigneeUid]) throw new AppError('퀘스트를 받을 사람을 다시 골라 주세요.');
      state.quests[familyId][questId] = { ...quest, ...clean };
      commit();
    },

    async archiveQuest(familyId, questId) {
      requireParent(familyId);
      const quest = state.quests[familyId]?.[questId];
      if (!quest) throw new AppError('퀘스트를 찾을 수 없어요.');
      state.quests[familyId][questId] = { ...quest, active: false };
      commit();
    },

    watchPresets(familyId, cb) {
      return watch(
        () => Object.values(state.presets[familyId] ?? {}).sort((a, b) => a.createdAt - b.createdAt),
        cb,
      );
    },

    async createPreset(familyId, input) {
      requireParent(familyId);
      const clean = cleanPresetInput(input);
      if (Object.keys(state.presets[familyId]).length >= MAX_PRESETS) {
        throw new AppError(`버튼은 ${MAX_PRESETS}개까지 만들 수 있어요.`);
      }
      const id = newId('p');
      state.presets[familyId][id] = { id, ...clean, createdAt: Date.now() };
      commit();
      return id;
    },

    async deletePreset(familyId, presetId) {
      requireParent(familyId);
      delete state.presets[familyId][presetId];
      commit();
    },

    async addPresetQuestAsChild(familyId, preset, uid, day) {
      requireSelf(uid);
      requireMember(familyId);
      const stored = state.presets[familyId]?.[preset.id];
      if (!stored || !stored.childCanAdd) throw new AppError('스스로 추가할 수 없는 퀘스트예요.');
      const id = `${stored.id}_${uid}_${day}`;
      if (state.quests[familyId][id]) throw new AppError('오늘은 이미 추가했어요.');
      state.quests[familyId][id] = {
        id,
        title: stored.title,
        note: '',
        assigneeUid: uid,
        reward: stored.reward,
        repeat: { type: 'none', date: day },
        important: false,
        active: true,
        createdBy: uid,
        createdAt: Date.now(),
      };
      commit();
    },

    watchRuns(familyId, sinceDateKey, cb) {
      return watch(
        () =>
          Object.values(state.runs[familyId] ?? {})
            .filter((r) => r.dateKey >= sinceDateKey || r.status === 'submitted')
            .map((r) => ({ ...r })),
        cb,
      );
    },

    async submitRun(familyId, quest, day, uid, late) {
      requireSelf(uid);
      requireMember(familyId);
      const stored = state.quests[familyId]?.[quest.id];
      if (!stored || !stored.active) throw new AppError('지금은 할 수 없는 퀘스트예요.');
      if (stored.assigneeUid !== uid) throw new AppError('내 퀘스트만 완료할 수 있어요.');
      const id = runId(stored.id, day);
      const existing = state.runs[familyId][id];
      if (existing && existing.status !== 'rejected') throw new AppError('이미 완료를 알린 퀘스트예요.');
      state.runs[familyId][id] = {
        id,
        questId: stored.id,
        questTitle: stored.title,
        reward: late ? halfReward(stored.reward) : stored.reward,
        assigneeUid: uid,
        dateKey: day,
        oneOff: stored.repeat.type === 'none',
        late,
        status: 'submitted',
        submittedAt: Date.now(),
        decidedBy: null,
        decidedAt: null,
        rejectReason: '',
        praise: '',
      };
      commit();
    },

    async cancelRun(familyId, id) {
      requireMember(familyId);
      const run = state.runs[familyId]?.[id];
      if (!run) return;
      if (run.assigneeUid !== me()) throw new AppError('내 퀘스트만 취소할 수 있어요.');
      if (run.status !== 'submitted') throw new AppError('이미 확인이 끝난 퀘스트예요.');
      delete state.runs[familyId][id];
      commit();
    },

    async approveRun(familyId, id, byUid, options) {
      requireSelf(byUid);
      requireParent(familyId);
      const run = state.runs[familyId]?.[id];
      if (!run) throw new AppError('완료 요청을 찾을 수 없어요.');
      if (run.status !== 'submitted') throw new AppError('이미 다른 사람이 확인했어요.');
      const now = Date.now();
      const praise = options.praise.trim().slice(0, MAX_PRAISE_LENGTH);
      state.runs[familyId][id] = { ...run, status: 'approved', decidedBy: byUid, decidedAt: now, praise };
      addLedger(familyId, {
        id,
        uid: run.assigneeUid,
        amount: run.reward,
        type: 'quest',
        refId: id,
        memo: run.questTitle,
        note: praise,
        by: byUid,
        at: now,
      });
      const streak = options.streak;
      if (streak) {
        const member = state.members[familyId][run.assigneeUid];
        state.members[familyId][run.assigneeUid] = { ...member, streak: { count: streak.count, lastDate: streak.lastDate } };
        const bonusId = `streak_${run.assigneeUid}_${streak.lastDate}`;
        if (streak.bonus > 0 && !state.ledger[familyId].some((e) => e.id === bonusId)) {
          addLedger(familyId, {
            id: bonusId,
            uid: run.assigneeUid,
            amount: streak.bonus,
            type: 'bonus',
            refId: id,
            memo: `${streak.count}일 연속 달성 보너스`,
            note: '',
            by: byUid,
            at: now + 1,
          });
        }
      }
      const quest = state.quests[familyId][run.questId];
      if (run.oneOff && quest) state.quests[familyId][run.questId] = { ...quest, active: false };
      commit();
    },

    async rejectRun(familyId, id, byUid, reason) {
      requireSelf(byUid);
      requireParent(familyId);
      const run = state.runs[familyId]?.[id];
      if (!run) throw new AppError('완료 요청을 찾을 수 없어요.');
      if (run.status !== 'submitted') throw new AppError('이미 다른 사람이 확인했어요.');
      state.runs[familyId][id] = {
        ...run,
        status: 'rejected',
        decidedBy: byUid,
        decidedAt: Date.now(),
        rejectReason: reason.trim().slice(0, 60),
      };
      commit();
    },

    watchProposals(familyId, today, cb) {
      return watch(
        () =>
          Object.values(state.proposals[familyId] ?? {})
            .filter((p) => p.status === 'memo' || p.status === 'negotiating' || (p.status === 'done' && p.doneDay === today))
            .map((p) => ({ ...p, offers: [...p.offers] })),
        cb,
      );
    },

    async createProposal(familyId, input, uid) {
      requireSelf(uid);
      requireMember(familyId);
      const clean = cleanProposalInput(input, settingsOf(familyId), dateKey());
      const id = newId('n');
      const now = Date.now();
      const offering = clean.amount !== null;
      state.proposals[familyId][id] = {
        id,
        ownerUid: uid,
        title: clean.title,
        note: clean.note,
        date: clean.date,
        important: clean.important,
        status: offering ? 'negotiating' : 'memo',
        doneDay: null,
        declined: false,
        lastAmount: clean.amount,
        lastRole: offering ? 'child' : null,
        offerCount: offering ? 1 : 0,
        offers: offering ? [{ byUid: uid, role: 'child', amount: clean.amount!, note: '', at: now }] : [],
        createdAt: now,
      };
      commit();
      return id;
    },

    async setMemoDone(familyId, proposalId, done, today) {
      requireMember(familyId);
      const proposal = requireProposal(familyId, proposalId);
      if (proposal.ownerUid !== me()) throw new AppError('내가 적은 일만 바꿀 수 있어요.');
      if (proposal.status !== 'memo' && proposal.status !== 'done') throw new AppError('협상 중인 일이에요.');
      state.proposals[familyId][proposalId] = {
        ...proposal,
        status: done ? 'done' : 'memo',
        doneDay: done ? today : null,
      };
      commit();
    },

    async deleteProposal(familyId, proposalId) {
      requireMember(familyId);
      const proposal = requireProposal(familyId, proposalId);
      if (proposal.ownerUid !== me()) throw new AppError('내가 적은 일만 지울 수 있어요.');
      if (proposal.status === 'agreed') throw new AppError('이미 퀘스트가 된 일이에요.');
      delete state.proposals[familyId][proposalId];
      commit();
    },

    async counterProposal(familyId, proposalId, amount, note, byUid) {
      requireSelf(byUid);
      const proposal = requireProposal(familyId, proposalId);
      const member = requireTurn(familyId, proposal);
      const settings = settingsOf(familyId);
      if (!canCounter(proposal, settings)) throw new AppError('더는 다시 제안할 수 없어요. 수락하거나 그만둘 수 있어요.');
      const clean = cleanOfferAmount(amount, member.role, settings);
      state.proposals[familyId][proposalId] = {
        ...proposal,
        lastAmount: clean,
        lastRole: member.role,
        offerCount: proposal.offerCount + 1,
        offers: [
          ...proposal.offers,
          { byUid, role: member.role, amount: clean, note: note.trim().slice(0, MAX_OFFER_NOTE), at: Date.now() },
        ],
      };
      commit();
    },

    async acceptProposal(familyId, proposalId, byUid) {
      requireSelf(byUid);
      const proposal = requireProposal(familyId, proposalId);
      requireTurn(familyId, proposal);
      const reward = proposal.lastAmount ?? 0;
      if (reward < 1 || reward > MAX_REWARD) throw new AppError('제안 금액이 올바르지 않아요.');
      // 합의된 금액으로 한 번짜리 퀘스트를 만든다(퀘스트 id = 제안 id).
      state.quests[familyId][proposalId] = {
        id: proposalId,
        title: proposal.title,
        note: proposal.note,
        assigneeUid: proposal.ownerUid,
        reward,
        repeat: { type: 'none', date: proposal.date },
        important: proposal.important,
        active: true,
        createdBy: byUid,
        createdAt: Date.now(),
      };
      state.proposals[familyId][proposalId] = { ...proposal, status: 'agreed' };
      commit();
    },

    async declineProposal(familyId, proposalId, byUid) {
      requireSelf(byUid);
      const member = requireMember(familyId);
      const proposal = requireProposal(familyId, proposalId);
      if (proposal.status !== 'negotiating') throw new AppError('이미 끝난 협상이에요.');
      if (member.role === 'child') {
        // 자녀는 자기 제안을 언제든 그만둘 수 있다.
        if (proposal.ownerUid !== member.uid) throw new AppError('내 할 일만 협상할 수 있어요.');
      } else if (turnOf(proposal) !== 'parent') {
        throw new AppError('지금은 상대가 답할 차례예요.');
      }
      state.proposals[familyId][proposalId] = { ...proposal, status: 'memo', declined: member.role === 'parent' };
      commit();
    },

    watchLedger(familyId, cb) {
      return watch(() => [...(state.ledger[familyId] ?? [])].sort((a, b) => b.at - a.at).slice(0, 100), cb);
    },

    async giveCoins(familyId, toUid, amount, note, byUid) {
      requireSelf(byUid);
      requireParent(familyId);
      if (!Number.isInteger(amount) || amount < 1 || amount > MAX_REWARD) {
        throw new AppError(`코인은 1부터 ${MAX_REWARD} 사이의 숫자로 적어 주세요.`);
      }
      const id = newId('gift');
      addLedger(familyId, {
        id,
        uid: toUid,
        amount,
        type: 'gift',
        refId: id,
        memo: '칭찬 코인',
        note: note.trim().slice(0, MAX_PRAISE_LENGTH),
        by: byUid,
        at: Date.now(),
      });
      commit();
    },

    watchRewards(familyId, cb) {
      return watch(
        () =>
          Object.values(state.rewards[familyId] ?? {})
            .filter((r) => r.active)
            .sort((a, b) => a.price - b.price || a.title.localeCompare(b.title, 'ko')),
        cb,
      );
    },

    async createReward(familyId, input, byUid) {
      requireSelf(byUid);
      requireParent(familyId);
      const clean = cleanRewardInput(input);
      if (Object.values(state.rewards[familyId]).filter((r) => r.active).length >= MAX_REWARDS) {
        throw new AppError(`보상은 ${MAX_REWARDS}개까지 올릴 수 있어요.`);
      }
      const id = newId('r');
      state.rewards[familyId][id] = { id, ...clean, active: true, createdBy: byUid, createdAt: Date.now() };
      commit();
      return id;
    },

    async updateReward(familyId, rewardId, input) {
      requireParent(familyId);
      const reward = state.rewards[familyId]?.[rewardId];
      if (!reward) throw new AppError('보상을 찾을 수 없어요.');
      state.rewards[familyId][rewardId] = { ...reward, ...cleanRewardInput(input) };
      commit();
    },

    async archiveReward(familyId, rewardId) {
      requireParent(familyId);
      const reward = state.rewards[familyId]?.[rewardId];
      if (!reward) throw new AppError('보상을 찾을 수 없어요.');
      state.rewards[familyId][rewardId] = { ...reward, active: false };
      commit();
    },

    watchOrders(familyId, sinceDay, cb) {
      return watch(
        () =>
          Object.values(state.orders[familyId] ?? {})
            .filter((o) => o.status === 'requested' || o.status === 'approved' || o.requestedDay >= sinceDay)
            .map((o) => ({ ...o })),
        cb,
      );
    },

    async requestReward(familyId, reward, uid, today) {
      requireSelf(uid);
      const member = requireMember(familyId);
      const stored = state.rewards[familyId]?.[reward.id];
      if (!stored || !stored.active) throw new AppError('지금은 바꿀 수 없는 보상이에요.');
      const blocked = buyBlockReason(stored, member, Object.values(state.orders[familyId]), today);
      if (blocked) throw new AppError(blocked);
      const id = newId('o');
      state.orders[familyId][id] = {
        id,
        rewardId: stored.id,
        rewardTitle: stored.title,
        icon: stored.icon,
        price: stored.price,
        uid,
        status: 'requested',
        requestedAt: Date.now(),
        requestedDay: today,
        decidedBy: null,
        decidedAt: null,
        rejectReason: '',
        deliveredBy: null,
        deliveredAt: null,
      };
      commit();
      return id;
    },

    async cancelOrder(familyId, orderId) {
      requireMember(familyId);
      const order = state.orders[familyId]?.[orderId];
      if (!order) return;
      if (order.uid !== me()) throw new AppError('내 신청만 취소할 수 있어요.');
      if (order.status !== 'requested') throw new AppError('이미 확인이 끝난 신청이에요.');
      delete state.orders[familyId][orderId];
      commit();
    },

    async approveOrder(familyId, orderId, byUid) {
      requireSelf(byUid);
      requireParent(familyId);
      const order = state.orders[familyId]?.[orderId];
      if (!order) throw new AppError('보상 신청을 찾을 수 없어요.');
      if (order.status !== 'requested') throw new AppError('이미 다른 사람이 확인했어요.');
      const buyer = state.members[familyId][order.uid];
      if (!buyer) throw new AppError('구성원을 찾을 수 없어요.');
      if (buyer.coins < order.price) throw new AppError(`코인이 모자라요. 지금 ${buyer.coins}코인이 있어요.`);
      const now = Date.now();
      state.orders[familyId][orderId] = { ...order, status: 'approved', decidedBy: byUid, decidedAt: now };
      addLedger(familyId, {
        id: orderId,
        uid: order.uid,
        amount: -order.price,
        type: 'reward',
        refId: orderId,
        memo: order.rewardTitle,
        note: '',
        by: byUid,
        at: now,
      });
      commit();
    },

    async rejectOrder(familyId, orderId, byUid, reason) {
      requireSelf(byUid);
      requireParent(familyId);
      const order = state.orders[familyId]?.[orderId];
      if (!order) throw new AppError('보상 신청을 찾을 수 없어요.');
      if (order.status !== 'requested') throw new AppError('이미 다른 사람이 확인했어요.');
      state.orders[familyId][orderId] = {
        ...order,
        status: 'rejected',
        decidedBy: byUid,
        decidedAt: Date.now(),
        rejectReason: reason.trim().slice(0, 60),
      };
      commit();
    },

    async deliverOrder(familyId, orderId, byUid) {
      requireSelf(byUid);
      requireParent(familyId);
      const order = state.orders[familyId]?.[orderId];
      if (!order) throw new AppError('보상 신청을 찾을 수 없어요.');
      if (order.status !== 'approved') throw new AppError('승인된 보상만 마무리할 수 있어요.');
      state.orders[familyId][orderId] = { ...order, status: 'delivered', deliveredBy: byUid, deliveredAt: Date.now() };
      commit();
    },

    async setGoal(familyId, uid, rewardId) {
      requireSelf(uid);
      const member = requireMember(familyId);
      if (rewardId !== null && !state.rewards[familyId]?.[rewardId]?.active) throw new AppError('보상을 찾을 수 없어요.');
      state.members[familyId][uid] = { ...member, goalRewardId: rewardId };
      commit();
    },

    watchFoods(familyId, cb) {
      return watch(
        () =>
          Object.values(state.foods[familyId] ?? {})
            .filter((f) => f.active)
            .map((f) => ({ ...f, wantedBy: [...f.wantedBy], eaten: [...f.eaten], ratings: { ...f.ratings } })),
        cb,
      );
    },

    async createFood(familyId, input, byUid) {
      requireSelf(byUid);
      requireMember(familyId);
      const clean = cleanFoodInput(input);
      const active = Object.values(state.foods[familyId]).filter((f) => f.active);
      if (findSameName(active, clean.name)) throw new AppError('이미 올라와 있는 메뉴예요.');
      if (active.length >= MAX_FOODS) throw new AppError(`메뉴는 ${MAX_FOODS}개까지 올릴 수 있어요.`);
      const id = newId('f');
      state.foods[familyId][id] = {
        id,
        ...clean,
        addedBy: byUid,
        createdAt: Date.now(),
        wantedBy: [byUid],
        eaten: [],
        ratings: {},
        active: true,
      };
      commit();
      return id;
    },

    async updateFood(familyId, foodId, input) {
      const member = requireMember(familyId);
      const stored = requireFood(familyId, foodId);
      if (!canEditFood(stored, member.uid, member.role === 'parent')) throw new AppError('올린 사람과 부모만 고칠 수 있어요.');
      const clean = cleanFoodInput(input);
      const active = Object.values(state.foods[familyId]).filter((f) => f.active);
      if (findSameName(active, clean.name, foodId)) throw new AppError('같은 이름의 메뉴가 이미 있어요.');
      state.foods[familyId][foodId] = { ...stored, ...clean };
      commit();
    },

    async archiveFood(familyId, foodId) {
      const member = requireMember(familyId);
      const stored = requireFood(familyId, foodId);
      if (!canEditFood(stored, member.uid, member.role === 'parent')) throw new AppError('올린 사람과 부모만 지울 수 있어요.');
      state.foods[familyId][foodId] = { ...stored, active: false };
      commit();
    },

    async setFoodWant(familyId, foodId, uid, want) {
      requireSelf(uid);
      requireMember(familyId);
      const stored = requireFood(familyId, foodId);
      const others = stored.wantedBy.filter((id) => id !== uid);
      state.foods[familyId][foodId] = { ...stored, wantedBy: want ? [...others, uid] : others };
      commit();
    },

    async addFoodEaten(familyId, foodId, day) {
      requireMember(familyId);
      const stored = requireFood(familyId, foodId);
      state.foods[familyId][foodId] = { ...stored, eaten: withEaten(stored.eaten, day, dateKey()), wantedBy: [] };
      commit();
    },

    async rateFood(familyId, foodId, uid, stars) {
      requireSelf(uid);
      requireMember(familyId);
      const stored = requireFood(familyId, foodId);
      state.foods[familyId][foodId] = { ...stored, ratings: { ...stored.ratings, [uid]: cleanStars(stars) } };
      commit();
    },

    async removeFoodEaten(familyId, foodId, day) {
      requireMember(familyId);
      const stored = requireFood(familyId, foodId);
      state.foods[familyId][foodId] = { ...stored, eaten: stored.eaten.filter((d) => d !== day) };
      commit();
    },

    watchLocations(familyId, sinceMs, cb) {
      return watch(
        () =>
          (state.locations[familyId] ?? [])
            .filter((record) => record.at >= sinceMs)
            .sort((a, b) => b.at - a.at)
            .map((record) => ({ ...record })),
        cb,
      );
    },

    async shareLocation(familyId, uid, fix, trigger) {
      requireSelf(uid);
      const member = requireMember(familyId);
      const clean = cleanFix(fix);
      const now = Date.now();
      // 코인은 직접 누른 공유에만, 설정된 하루 횟수까지만 준다.
      const plan = trigger === 'button' ? planCheckin(uid, member.checkin, settingsOf(familyId), dayNumber()) : null;
      const id = newId('loc');
      state.locations[familyId].push({ id, uid, ...clean, at: now, trigger, coins: plan?.coins ?? 0 });
      if (plan) {
        state.members[familyId][uid] = { ...member, checkin: { dayNum: plan.dayNum, count: plan.count } };
        addLedger(familyId, {
          id: plan.ledgerId,
          uid,
          amount: plan.coins,
          type: 'checkin',
          refId: id,
          memo: '위치 공유',
          note: '',
          by: uid,
          at: now,
        });
      }
      commit();
      return { coins: plan?.coins ?? 0 };
    },

    async pruneLocations(familyId, beforeMs) {
      requireParent(familyId);
      const kept = (state.locations[familyId] ?? []).filter((record) => record.at >= beforeMs);
      if (kept.length === (state.locations[familyId] ?? []).length) return;
      state.locations[familyId] = kept;
      commit();
    },

    watchPlaces(familyId, cb) {
      return watch(
        () => Object.values(state.places[familyId] ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
        cb,
      );
    },

    async createPlace(familyId, input, byUid) {
      requireSelf(byUid);
      requireParent(familyId);
      const clean = cleanPlaceInput(input);
      if (Object.keys(state.places[familyId]).length >= MAX_PLACES) throw new AppError(`장소는 ${MAX_PLACES}곳까지 등록할 수 있어요.`);
      const id = newId('pl');
      state.places[familyId][id] = { id, ...clean, createdBy: byUid, createdAt: Date.now() };
      commit();
      return id;
    },

    async deletePlace(familyId, placeId) {
      requireParent(familyId);
      delete state.places[familyId][placeId];
      commit();
    },

    watchNotes(familyId, cb) {
      return watch(() => Object.values(state.notes[familyId] ?? {}).map((note) => ({ ...note, toUids: [...note.toUids], readBy: [...note.readBy] })), cb);
    },

    async createNote(familyId, input, byUid) {
      requireSelf(byUid);
      requireMember(familyId);
      const clean = cleanNoteInput(input, Object.keys(state.members[familyId]), byUid, dateKey());
      if (Object.keys(state.notes[familyId]).length >= MAX_NOTES) {
        throw new AppError(`메모는 ${MAX_NOTES}개까지 남길 수 있어요. 지난 메모를 지워 주세요.`);
      }
      const id = newId('n');
      state.notes[familyId][id] = { id, ...clean, createdBy: byUid, createdAt: Date.now(), readBy: [] };
      commit();
      return id;
    },

    async updateNote(familyId, noteId, input) {
      const member = requireMember(familyId);
      const note = requireNote(familyId, noteId);
      if (!canEditNote(note, member.uid, member.role === 'parent')) throw new AppError('메모는 쓴 사람과 부모만 고칠 수 있어요.');
      const clean = cleanNoteInput(input, Object.keys(state.members[familyId]), note.createdBy, dateKey());
      // 내용이 바뀌었으므로 다시 확인받는다(고친 사람이 이미 확인했다면 그 표시는 남긴다).
      state.notes[familyId][noteId] = { ...note, ...clean, readBy: note.readBy.filter((uid) => uid === member.uid) };
      commit();
    },

    async markNoteRead(familyId, noteId, uid) {
      requireSelf(uid);
      requireMember(familyId);
      const note = requireNote(familyId, noteId);
      if (note.createdBy === uid || !isNoteFor(note, uid)) throw new AppError('나에게 온 메모만 확인할 수 있어요.');
      if (note.readBy.includes(uid)) return;
      state.notes[familyId][noteId] = { ...note, readBy: [...note.readBy, uid] };
      commit();
    },

    async deleteNote(familyId, noteId) {
      const member = requireMember(familyId);
      const note = requireNote(familyId, noteId);
      if (!canEditNote(note, member.uid, member.role === 'parent')) throw new AppError('메모는 쓴 사람과 부모만 지울 수 있어요.');
      delete state.notes[familyId][noteId];
      commit();
    },

    watchWishes(familyId, cb) {
      const since = Date.now() - WISH_KEEP_DAYS * DAY_MS;
      return watch(
        () =>
          Object.values(state.wishes[familyId] ?? {})
            .filter((wish) => wish.status === 'negotiating' || (wish.decidedAt ?? 0) >= since)
            .map((wish) => ({ ...wish, offers: [...wish.offers] })),
        cb,
      );
    },

    async createWish(familyId, input, uid) {
      requireSelf(uid);
      requireMember(familyId);
      const clean = cleanWishInput(input);
      if (openWishCount(Object.values(state.wishes[familyId]), uid) >= MAX_OPEN_WISHES) {
        throw new AppError(`제안은 한 번에 ${MAX_OPEN_WISHES}개까지 걸어 둘 수 있어요.`);
      }
      const id = newId('w');
      const now = Date.now();
      state.wishes[familyId][id] = {
        id,
        ownerUid: uid,
        title: clean.title,
        note: clean.note,
        icon: clean.icon,
        status: 'negotiating',
        lastPrice: clean.price,
        lastRole: 'child',
        offerCount: 1,
        offers: [{ byUid: uid, role: 'child', amount: clean.price, note: '', at: now }],
        declineNote: '',
        decidedAt: null,
        createdAt: now,
      };
      commit();
      return id;
    },

    async counterWish(familyId, wishId, price, note, byUid) {
      requireSelf(byUid);
      const member = requireMember(familyId);
      const wish = requireWish(familyId, wishId);
      checkWishTurn(wish, member.role, member.uid);
      if (!canCounterWish(wish, settingsOf(familyId))) throw new AppError('더는 다시 제안할 수 없어요. 수락하거나 그만둘 수 있어요.');
      const clean = cleanWishPrice(price);
      state.wishes[familyId][wishId] = {
        ...wish,
        lastPrice: clean,
        lastRole: member.role,
        offerCount: wish.offerCount + 1,
        offers: [...wish.offers, { byUid, role: member.role, amount: clean, note: note.trim().slice(0, MAX_OFFER_NOTE), at: Date.now() }],
      };
      commit();
    },

    async acceptWish(familyId, wishId, byUid) {
      requireSelf(byUid);
      const member = requireMember(familyId);
      const wish = requireWish(familyId, wishId);
      checkWishTurn(wish, member.role, member.uid);
      if (Object.values(state.rewards[familyId]).filter((r) => r.active).length >= MAX_REWARDS) {
        throw new AppError(`보상은 ${MAX_REWARDS}개까지 올릴 수 있어요. 상점 관리에서 안 쓰는 보상을 내려 주세요.`);
      }
      const now = Date.now();
      // 합의된 가격으로 상점에 보상을 올린다(보상 id = 제안 id).
      state.rewards[familyId][wishId] = {
        id: wishId,
        title: wish.title,
        note: wish.note,
        price: cleanWishPrice(wish.lastPrice),
        icon: wish.icon,
        limit: { period: 'none', count: 1 },
        active: true,
        createdBy: byUid,
        createdAt: now,
      };
      state.wishes[familyId][wishId] = { ...wish, status: 'agreed', decidedAt: now };
      commit();
    },

    async declineWish(familyId, wishId, note, byUid) {
      requireSelf(byUid);
      const member = requireParent(familyId);
      const wish = requireWish(familyId, wishId);
      checkWishTurn(wish, member.role, member.uid);
      state.wishes[familyId][wishId] = {
        ...wish,
        status: 'declined',
        declineNote: note.trim().slice(0, MAX_DECLINE_NOTE),
        decidedAt: Date.now(),
      };
      commit();
    },

    async deleteWish(familyId, wishId) {
      const member = requireMember(familyId);
      const wish = requireWish(familyId, wishId);
      if (wish.ownerUid !== member.uid) throw new AppError('내 제안만 지울 수 있어요.');
      if (wish.status === 'agreed') throw new AppError('이미 상점에 올라간 제안이에요.');
      delete state.wishes[familyId][wishId];
      commit();
    },

    watchEvents(familyId, cb) {
      return watch(() => Object.values(state.events[familyId] ?? {}).map((e) => ({ ...e, who: [...e.who] })), cb);
    },

    async createEvent(familyId, input, byUid) {
      requireSelf(byUid);
      requireMember(familyId);
      const clean = cleanEventInput(input);
      if (Object.keys(state.events[familyId]).length >= MAX_EVENTS) throw new AppError(`일정은 ${MAX_EVENTS}개까지 올릴 수 있어요.`);
      const id = newId('e');
      state.events[familyId][id] = { id, ...clean, createdBy: byUid, createdAt: Date.now() };
      commit();
      return id;
    },

    async updateEvent(familyId, eventId, input) {
      const member = requireMember(familyId);
      const stored = requireEvent(familyId, eventId);
      if (!canEditEvent(stored, member.uid, member.role === 'parent')) throw new AppError('올린 사람과 부모만 고칠 수 있어요.');
      state.events[familyId][eventId] = { ...stored, ...cleanEventInput(input) };
      commit();
    },

    async deleteEvent(familyId, eventId) {
      const member = requireMember(familyId);
      const stored = requireEvent(familyId, eventId);
      if (!canEditEvent(stored, member.uid, member.role === 'parent')) throw new AppError('올린 사람과 부모만 지울 수 있어요.');
      delete state.events[familyId][eventId];
      commit();
    },

    demo: {
      personas(): DemoPersona[] {
        return Object.values(state.users).map((user) => {
          const member = user.familyId ? state.members[user.familyId]?.[user.uid] : undefined;
          return {
            uid: user.uid,
            label: member?.displayName ?? user.label,
            hint: user.hint,
            avatar: member?.avatar ?? null,
          };
        });
      },
      loginAs(uid) {
        if (!state.users[uid]) throw new AppError('없는 사용자예요.');
        state.currentUid = uid;
        commit();
        emitAuth();
      },
      reset() {
        state = seed();
        commit();
        emitAuth();
      },
    },
  };

  return backend;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
