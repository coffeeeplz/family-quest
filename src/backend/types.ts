import type { PushPrefs } from '../domain/push';

/**
 * 앱 전체가 공유하는 데이터 모양과, 서버 구현이 지켜야 할 약속(Backend).
 * 화면 코드는 이 파일의 타입만 알고, 실제 저장소가 Firebase 인지 체험용 저장소인지는 모른다.
 * 새 기능(상점, 일정 등)을 붙일 때는 여기에 타입과 메서드를 추가한다.
 */

export type Role = 'parent' | 'child';

export interface AvatarChoice {
  /** sprites.json 의 캐릭터 id */
  id: string;
  /** sprites.json 의 색 id */
  color: string;
}

export interface AuthUser {
  uid: string;
  email: string | null;
}

export interface UserProfile {
  uid: string;
  familyId: string | null;
}

/** 부모가 가족 설정 화면에서 바꾸는 값 */
export interface FamilySettings {
  /** 코인 협상에서 주고받을 수 있는 제안 횟수(1~5) */
  maxRounds: number;
  /** 자녀가 한 번에 제안할 수 있는 최대 코인 */
  maxProposalCoins: number;
  /** 연속 달성 보너스 사용 여부 */
  streakOn: boolean;
  /** 며칠 연속마다 보너스를 줄지 */
  streakDays: number;
  streakBonus: number;
  /** 승인할 때 누르는 칭찬 한마디 */
  praises: string[];
  /** "지금 여기예요"로 위치를 알릴 때마다 받는 코인(0이면 코인 없이 공유만) */
  checkinCoins: number;
  /** 하루에 몇 번까지 위치 공유 코인을 줄지 */
  checkinPerDay: number;
  /** 뭐먹지의 분류. 마지막은 항상 "기타" */
  foodCategories: FoodCategoryDef[];
}

/** 뭐먹지의 분류 하나. id 는 메뉴에 저장되고, 이름과 그림은 설정에서 바꿀 수 있다. */
export interface FoodCategoryDef {
  id: string;
  name: string;
  /** sprites.json 의 아이콘 이름 */
  icon: string;
}

export interface Family {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  settings: FamilySettings;
}

/** 위치 공유 코인을 받은 기록. dayNum = 그날의 날짜 번호, count = 그날 받은 횟수 */
export interface Checkin {
  dayNum: number;
  count: number;
}

/** 연속 달성 기록. lastDate = 마지막으로 하루치를 다 끝낸 날 */
export interface Streak {
  count: number;
  lastDate: string;
}

export interface Member {
  uid: string;
  role: Role;
  displayName: string;
  avatar: AvatarChoice;
  coins: number;
  joinedAt: number;
  streak: Streak | null;
  /** 목표 저금통: 모으고 있는 보상의 id */
  goalRewardId: string | null;
  checkin: Checkin | null;
}

export type Repeat =
  | { type: 'none'; date: string } // 한 번만. date = 기한(YYYY-MM-DD)
  | { type: 'daily' }
  | { type: 'weekly'; days: number[] }; // 0=일 … 6=토

export interface QuestInput {
  title: string;
  note: string;
  assigneeUid: string;
  reward: number;
  repeat: Repeat;
  /** "꼭" 표시: 목록 맨 위에 별과 함께 보인다 */
  important: boolean;
}

export interface Quest extends QuestInput {
  id: string;
  active: boolean;
  createdBy: string;
  createdAt: number;
}

export type RunStatus = 'submitted' | 'approved' | 'rejected';

/** 퀘스트를 하루치(또는 한 번) 수행한 기록. id = `${questId}_${dateKey}` */
export interface Run {
  id: string;
  questId: string;
  questTitle: string;
  /** 실제로 받을 코인. 늦게 한 반복 퀘스트는 절반(올림) */
  reward: number;
  assigneeUid: string;
  dateKey: string;
  oneOff: boolean;
  /** 놓친 날의 반복 퀘스트를 나중에 한 경우 */
  late: boolean;
  status: RunStatus;
  submittedAt: number;
  decidedBy: string | null;
  decidedAt: number | null;
  rejectReason: string;
  /** 승인할 때 붙인 칭찬 한마디 */
  praise: string;
}

/** quest=퀘스트 완료, bonus=연속 달성 보너스, gift=칭찬 코인, reward=상점 사용, checkin=위치 공유, adjust=조정 */
export type LedgerType = 'quest' | 'bonus' | 'gift' | 'reward' | 'checkin' | 'adjust';

/** 코인 장부 한 줄. 잔액은 이 내역의 합과 같아야 한다. */
export interface LedgerEntry {
  id: string;
  uid: string;
  amount: number;
  type: LedgerType;
  refId: string;
  memo: string;
  /** 함께 전한 한마디 */
  note: string;
  by: string;
  at: number;
}

export interface Invite {
  code: string;
  familyId: string;
  familyName: string;
  role: Role;
  createdBy: string;
  expiresAt: number;
}

export interface ProfileInput {
  displayName: string;
  avatar: AvatarChoice;
}

/** 자주 쓰는 퀘스트: 버튼 한 번으로 오늘의 퀘스트를 만든다 */
export interface PresetInput {
  title: string;
  reward: number;
  /** 자녀가 스스로 추가해도 되는지(코인이 미리 정해져 있어 협상이 없다) */
  childCanAdd: boolean;
}

export interface Preset extends PresetInput {
  id: string;
  createdAt: number;
}

export interface Offer {
  byUid: string;
  role: Role;
  amount: number;
  note: string;
  at: number;
}

/** memo=코인 없는 내 할 일, done=끝낸 메모, negotiating=코인 협상 중, agreed=합의되어 퀘스트가 됨 */
export type ProposalStatus = 'memo' | 'done' | 'negotiating' | 'agreed';

/** 자녀가 직접 추가한 할 일. 코인을 제안하면 협상을 거쳐 퀘스트가 된다. */
export interface Proposal {
  id: string;
  ownerUid: string;
  title: string;
  note: string;
  /** 하려는 날(YYYY-MM-DD) */
  date: string;
  important: boolean;
  status: ProposalStatus;
  /** 끝낸 날. status 가 done 일 때만 */
  doneDay: string | null;
  /** 부모가 코인 제안을 거절해 메모로 남은 경우 */
  declined: boolean;
  lastAmount: number | null;
  lastRole: Role | null;
  offerCount: number;
  offers: Offer[];
  createdAt: number;
}

export interface ProposalInput {
  title: string;
  note: string;
  date: string;
  important: boolean;
  /** 제안할 코인. null 이면 메모만 */
  amount: number | null;
}

/** 보상을 얼마나 자주 살 수 있는지. none 이면 제한 없음 */
export interface RewardLimit {
  period: 'none' | 'day' | 'week';
  count: number;
}

export interface RewardInput {
  title: string;
  note: string;
  price: number;
  /** sprites.json 의 아이콘 이름 */
  icon: string;
  limit: RewardLimit;
}

/** 상점에 올린 보상 */
export interface Reward extends RewardInput {
  id: string;
  active: boolean;
  createdBy: string;
  createdAt: number;
}

/**
 * 이 기기의 알림 상태. unsupported=이 브라우저는 알림을 받을 수 없음, install=아이폰에서 홈 화면에 추가해야 함,
 * denied=알림을 막아 둠, off=받을 수 있지만 꺼져 있음, on=켜져 있음, demo=체험 모드
 */
export type PushStatus = 'unsupported' | 'install' | 'denied' | 'off' | 'on' | 'demo';

export interface NoteInput {
  text: string;
  /** 보여 줄 사람. 비어 있으면 가족 모두 */
  toUids: string[];
  /** 이날까지 보인다(YYYY-MM-DD). 빈 문자열이면 지울 때까지 */
  until: string;
}

/** 가족 메모: 홈 화면 맨 위에 보이는 한 방향 알림. 받은 사람이 "확인했어요"를 누르면 readBy 에 들어간다. */
export interface Note extends NoteInput {
  id: string;
  createdBy: string;
  createdAt: number;
  /** 확인한 사람들 */
  readBy: string[];
}

/** negotiating=가격 협상 중, agreed=합의되어 상점에 올라감, declined=부모가 거절함 */
export type WishStatus = 'negotiating' | 'agreed' | 'declined';

/** 자녀가 상점에 올려 달라고 제안한 보상. 가격을 주고받다가 합의되면 상점의 보상이 된다. */
export interface Wish {
  id: string;
  ownerUid: string;
  title: string;
  note: string;
  /** sprites.json 의 아이콘 이름 */
  icon: string;
  status: WishStatus;
  /** 마지막으로 나온 가격 */
  lastPrice: number;
  lastRole: Role;
  offerCount: number;
  offers: Offer[];
  /** 부모가 거절하며 남긴 한마디 */
  declineNote: string;
  /** 합의되거나 거절된 시각 */
  decidedAt: number | null;
  createdAt: number;
}

export interface WishInput {
  title: string;
  note: string;
  icon: string;
  /** 자녀가 원하는 가격 */
  price: number;
}

/** requested=신청함(코인 묶임), approved=승인되어 받을 보상, delivered=받음, rejected=거절됨 */
export type OrderStatus = 'requested' | 'approved' | 'delivered' | 'rejected';

/** 보상 신청 한 건 */
export interface Order {
  id: string;
  rewardId: string;
  rewardTitle: string;
  icon: string;
  price: number;
  uid: string;
  status: OrderStatus;
  requestedAt: number;
  /** 신청한 날(구매 제한을 셀 때 쓴다) */
  requestedDay: string;
  decidedBy: string | null;
  decidedAt: number | null;
  rejectReason: string;
  deliveredBy: string | null;
  deliveredAt: number | null;
}

export interface FoodInput {
  name: string;
  /** 분류의 id. 설정에서 지워진 분류라면 "기타"로 보인다 */
  category: string;
  /** 맛집, 레시피, 배달 페이지 주소. 없으면 빈 문자열 */
  link: string;
  memo: string;
}

/**
 * 뭐먹지에 올린 메뉴. 한 번 올리면 지우기 전까지 보관함에 남는다.
 * wantedBy 가 비어 있지 않으면 "먹고 싶어요" 목록에, 비어 있으면 보관함에 보인다.
 */
export interface Food extends FoodInput {
  id: string;
  addedBy: string;
  createdAt: number;
  /** 지금 먹고 싶어 하는 사람들 */
  wantedBy: string[];
  /** 먹은 날(YYYY-MM-DD), 오래된 날부터. 하루에 한 번만 기록한다 */
  eaten: string[];
  /** 가족 각자가 준 별점(1~5). 한 사람당 하나이고 언제든 바꿀 수 있다 */
  ratings: Record<string, number>;
  active: boolean;
}

/** 기기가 알려 준 위치. accuracy = 오차 범위(미터) */
export interface LocationFix {
  lat: number;
  lng: number;
  accuracy: number;
}

/** button=자녀가 "지금 여기예요"를 누름, open=앱을 열 때 자동, quest=퀘스트를 끝낼 때 자동 */
export type LocationTrigger = 'button' | 'open' | 'quest';

/** 위치 기록 한 건. 최근 며칠 치만 보관한다. */
export interface LocationRecord extends LocationFix {
  id: string;
  uid: string;
  at: number;
  trigger: LocationTrigger;
  /** 이 공유로 받은 코인(없으면 0) */
  coins: number;
}

export interface PlaceInput {
  name: string;
  lat: number;
  lng: number;
  /** 이 거리(미터) 안이면 그 장소 근처로 본다 */
  radius: number;
}

/** 부모가 이름을 붙여 둔 장소(집, 학교, 학원 등) */
export interface Place extends PlaceInput {
  id: string;
  createdBy: string;
  createdAt: number;
}

/** 일정이 되풀이되는 방식. weekly=매주 같은 요일, monthly=매달 같은 날, yearly=매년 같은 날 */
export type EventRepeat = 'none' | 'weekly' | 'monthly' | 'yearly';

export interface EventInput {
  title: string;
  memo: string;
  /** 시작하는 날과 끝나는 날(YYYY-MM-DD). 하루짜리 일정은 둘이 같다 */
  startDay: string;
  endDay: string;
  allDay: boolean;
  /** 'HH:MM'. 하루 종일이면 빈 문자열 */
  startTime: string;
  /** 'HH:MM'. 끝나는 시각을 안 정했으면 빈 문자열 */
  endTime: string;
  /** 누구의 일정인지(구성원 uid). 비어 있으면 가족 모두 */
  who: string[];
  repeat: EventRepeat;
  /** 반복을 끝내는 날. 비어 있으면 계속 */
  repeatUntil: string;
}

/** 가족 캘린더의 일정 */
export interface CalendarEvent extends EventInput {
  id: string;
  createdBy: string;
  createdAt: number;
}

/** 승인과 함께 반영할 연속 달성 변화 */
export interface StreakUpdate {
  count: number;
  lastDate: string;
  /** 이번에 줄 보너스 코인(없으면 0) */
  bonus: number;
}

export interface ApproveOptions {
  praise: string;
  streak: StreakUpdate | null;
}

export type Unsub = () => void;

export interface DemoPersona {
  uid: string;
  label: string;
  hint: string;
  avatar: AvatarChoice | null;
}

export interface Backend {
  readonly mode: 'firebase' | 'demo';

  // 로그인
  onAuthChange(cb: (user: AuthUser | null) => void): Unsub;
  signInWithGoogle(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  signUpWithEmail(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;

  // 가족
  watchUserProfile(uid: string, cb: (profile: UserProfile | null) => void): Unsub;
  createFamily(uid: string, familyName: string, profile: ProfileInput): Promise<string>;
  joinFamily(uid: string, code: string, profile: ProfileInput): Promise<string>;
  createInvite(familyId: string, role: Role, byUid: string): Promise<Invite>;
  watchFamily(familyId: string, cb: (family: Family | null) => void): Unsub;
  watchMembers(familyId: string, cb: (members: Member[]) => void): Unsub;
  updateMyProfile(familyId: string, uid: string, profile: ProfileInput): Promise<void>;
  updateSettings(familyId: string, settings: FamilySettings): Promise<void>;

  // 퀘스트
  watchQuests(familyId: string, cb: (quests: Quest[]) => void): Unsub;
  createQuest(familyId: string, input: QuestInput, byUid: string): Promise<string>;
  updateQuest(familyId: string, questId: string, input: QuestInput): Promise<void>;
  archiveQuest(familyId: string, questId: string): Promise<void>;

  // 자주 쓰는 퀘스트
  watchPresets(familyId: string, cb: (presets: Preset[]) => void): Unsub;
  createPreset(familyId: string, input: PresetInput): Promise<string>;
  deletePreset(familyId: string, presetId: string): Promise<void>;
  /** 자녀가 허용된 버튼으로 오늘의 퀘스트를 스스로 추가한다(버튼마다 하루 한 번). */
  addPresetQuestAsChild(familyId: string, preset: Preset, uid: string, day: string): Promise<void>;

  // 수행 기록과 승인
  watchRuns(familyId: string, sinceDateKey: string, cb: (runs: Run[]) => void): Unsub;
  /** late=true 면 놓친 날의 반복 퀘스트를 늦게 하는 것으로, 코인을 절반만 받는다. */
  submitRun(familyId: string, quest: Quest, dateKey: string, uid: string, late: boolean): Promise<void>;
  cancelRun(familyId: string, runId: string): Promise<void>;
  approveRun(familyId: string, runId: string, byUid: string, options: ApproveOptions): Promise<void>;
  rejectRun(familyId: string, runId: string, byUid: string, reason: string): Promise<void>;

  // 자녀가 직접 추가한 할 일과 코인 협상
  watchProposals(familyId: string, today: string, cb: (proposals: Proposal[]) => void): Unsub;
  createProposal(familyId: string, input: ProposalInput, uid: string): Promise<string>;
  setMemoDone(familyId: string, proposalId: string, done: boolean, today: string): Promise<void>;
  deleteProposal(familyId: string, proposalId: string): Promise<void>;
  /** 다른 금액을 제안한다. */
  counterProposal(familyId: string, proposalId: string, amount: number, note: string, byUid: string): Promise<void>;
  /** 상대의 마지막 제안을 받아들인다. 그 금액의 한 번짜리 퀘스트가 만들어진다. */
  acceptProposal(familyId: string, proposalId: string, byUid: string): Promise<void>;
  /** 협상을 그만둔다. 코인 없는 메모로 남는다. */
  declineProposal(familyId: string, proposalId: string, byUid: string): Promise<void>;

  // 코인
  watchLedger(familyId: string, cb: (entries: LedgerEntry[]) => void): Unsub;
  /** 칭찬 코인: 퀘스트와 상관없이 부모가 바로 준다. */
  giveCoins(familyId: string, toUid: string, amount: number, note: string, byUid: string): Promise<void>;

  // 상점
  watchRewards(familyId: string, cb: (rewards: Reward[]) => void): Unsub;
  createReward(familyId: string, input: RewardInput, byUid: string): Promise<string>;
  updateReward(familyId: string, rewardId: string, input: RewardInput): Promise<void>;
  archiveReward(familyId: string, rewardId: string): Promise<void>;
  // 알림(푸시)
  /** 이 사람의 알림 설정. 저장된 것이 없으면 기본값 */
  watchPushPrefs(familyId: string, uid: string, cb: (prefs: PushPrefs) => void, onError?: () => void): Unsub;
  savePushPrefs(familyId: string, uid: string, prefs: PushPrefs): Promise<void>;
  /** 이 기기에서 알림을 받을 수 있는지와 켜져 있는지 */
  pushStatus(familyId: string, uid: string): Promise<PushStatus>;
  /** 알림 권한을 묻고 이 기기를 등록한다. 사람이 버튼을 누른 순간에 불러야 한다. */
  enablePush(familyId: string, uid: string): Promise<void>;
  disablePush(familyId: string, uid: string): Promise<void>;
  /** 앱을 열 때 이 기기의 알림 주소가 바뀌었으면 새로 적어 둔다. */
  refreshPush(familyId: string, uid: string): Promise<void>;

  // 가족 메모
  watchNotes(familyId: string, cb: (notes: Note[]) => void, onError?: () => void): Unsub;
  createNote(familyId: string, input: NoteInput, byUid: string): Promise<string>;
  /** 내용을 고치면 확인 표시는 처음으로 돌아간다(고친 사람의 표시만 남는다). */
  updateNote(familyId: string, noteId: string, input: NoteInput): Promise<void>;
  markNoteRead(familyId: string, noteId: string, uid: string): Promise<void>;
  deleteNote(familyId: string, noteId: string): Promise<void>;

  // 자녀의 보상 제안과 가격 협상
  /** 협상 중인 제안과 최근에 끝난 제안 */
  watchWishes(familyId: string, cb: (wishes: Wish[]) => void, onError?: () => void): Unsub;
  createWish(familyId: string, input: WishInput, uid: string): Promise<string>;
  /** 받은 가격 대신 다른 가격을 제안한다(정해 둔 횟수까지). */
  counterWish(familyId: string, wishId: string, price: number, note: string, byUid: string): Promise<void>;
  /** 받은 가격을 수락한다. 그 가격의 보상이 상점에 올라간다. */
  acceptWish(familyId: string, wishId: string, byUid: string): Promise<void>;
  /** 부모가 제안을 거절한다. */
  declineWish(familyId: string, wishId: string, note: string, byUid: string): Promise<void>;
  /** 자녀가 제안을 그만두거나, 거절된 제안을 목록에서 지운다. */
  deleteWish(familyId: string, wishId: string): Promise<void>;

  /** 진행 중인 신청과, sinceDay 이후의 신청 기록 */
  watchOrders(familyId: string, sinceDay: string, cb: (orders: Order[]) => void): Unsub;
  /** 보상을 신청한다. 승인 전까지 그만큼의 코인이 묶인다. */
  requestReward(familyId: string, reward: Reward, uid: string, today: string): Promise<string>;
  cancelOrder(familyId: string, orderId: string): Promise<void>;
  /** 승인하면서 코인을 뺀다. */
  approveOrder(familyId: string, orderId: string, byUid: string): Promise<void>;
  rejectOrder(familyId: string, orderId: string, byUid: string, reason: string): Promise<void>;
  /** 승인한 보상을 실제로 줬을 때 마무리한다. */
  deliverOrder(familyId: string, orderId: string, byUid: string): Promise<void>;
  /** 목표 저금통으로 삼을 보상을 정한다(null 이면 없앰). */
  setGoal(familyId: string, uid: string, rewardId: string | null): Promise<void>;

  // 뭐먹지
  /** onError 는 목록을 읽지 못했을 때(권한 없음 등) 불린다. */
  watchFoods(familyId: string, cb: (foods: Food[]) => void, onError?: () => void): Unsub;
  /** 새 메뉴를 올린다. 올린 사람이 먹고 싶어 하는 것으로 시작한다. */
  createFood(familyId: string, input: FoodInput, byUid: string): Promise<string>;
  updateFood(familyId: string, foodId: string, input: FoodInput): Promise<void>;
  archiveFood(familyId: string, foodId: string): Promise<void>;
  /** "먹고 싶어요"를 켜거나 끈다. 보관함의 메뉴를 다시 올릴 때도 쓴다. */
  setFoodWant(familyId: string, foodId: string, uid: string, want: boolean): Promise<void>;
  /** 먹은 날을 기록한다. 먹었으니 "먹고 싶어요"는 모두 풀리고 보관함으로 간다. */
  addFoodEaten(familyId: string, foodId: string, day: string): Promise<void>;
  removeFoodEaten(familyId: string, foodId: string, day: string): Promise<void>;
  /** 내 별점을 주거나 바꾼다(1~5). */
  rateFood(familyId: string, foodId: string, uid: string, stars: number): Promise<void>;

  // 위치
  /** sinceMs 이후의 위치 기록(최근 것부터). onError 는 목록을 읽지 못했을 때 불린다. */
  watchLocations(familyId: string, sinceMs: number, cb: (records: LocationRecord[]) => void, onError?: () => void): Unsub;
  /**
   * 내 위치를 가족에게 알린다. trigger 가 button 이면 설정된 한도 안에서 코인을 받는다.
   * 돌려주는 coins 는 이번에 받은 코인(없으면 0).
   */
  shareLocation(familyId: string, uid: string, fix: LocationFix, trigger: LocationTrigger): Promise<{ coins: number }>;
  /** beforeMs 보다 오래된 위치 기록을 지운다(부모만). */
  pruneLocations(familyId: string, beforeMs: number): Promise<void>;
  watchPlaces(familyId: string, cb: (places: Place[]) => void, onError?: () => void): Unsub;
  createPlace(familyId: string, input: PlaceInput, byUid: string): Promise<string>;
  deletePlace(familyId: string, placeId: string): Promise<void>;

  // 캘린더
  /** 가족의 모든 일정. onError 는 목록을 읽지 못했을 때 불린다. */
  watchEvents(familyId: string, cb: (events: CalendarEvent[]) => void, onError?: () => void): Unsub;
  createEvent(familyId: string, input: EventInput, byUid: string): Promise<string>;
  /** 고치기와 지우기는 올린 사람과 부모만 할 수 있다. */
  updateEvent(familyId: string, eventId: string, input: EventInput): Promise<void>;
  deleteEvent(familyId: string, eventId: string): Promise<void>;

  /** 체험 모드에서만 제공 */
  demo?: {
    personas(): DemoPersona[];
    loginAs(uid: string): void;
    reset(): void;
  };
}

/** 사용자에게 그대로 보여줘도 되는 오류 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}
