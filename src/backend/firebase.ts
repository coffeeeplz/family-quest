/**
 * Firebase(로그인 + Firestore) 저장소.
 * 누가 무엇을 할 수 있는지는 firestore.rules 가 서버에서 최종 판단한다.
 *
 * 저장 위치
 *   users/{uid}                          내 가족 id
 *   invites/{code}                       초대코드
 *   families/{fid}                       가족(이름, 설정)
 *   families/{fid}/members/{uid}         구성원(역할, 이름, 캐릭터, 코인, 연속 달성)
 *   families/{fid}/quests/{questId}      퀘스트
 *   families/{fid}/runs/{questId_날짜}   수행 기록
 *   families/{fid}/ledger/{id}           코인 장부
 *   families/{fid}/presets/{id}          자주 쓰는 퀘스트 버튼
 *   families/{fid}/proposals/{id}        자녀가 직접 추가한 할 일과 코인 협상
 *   families/{fid}/rewards/{id}          상점의 보상
 *   families/{fid}/orders/{id}           보상 신청
 *   families/{fid}/foods/{id}            뭐먹지의 메뉴
 *   families/{fid}/locations/{id}        위치 기록(최근 며칠 치)
 *   families/{fid}/places/{id}           이름을 붙여 둔 장소
 *   families/{fid}/events/{id}           가족 캘린더의 일정
 */
import { FirebaseError, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  FieldPath,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Query,
} from 'firebase/firestore';
import { firebaseConfig } from '../config/firebase';
import { INVITE_TTL_MS, isInviteCodeShape, newInviteCode, normalizeInviteCode } from '../domain/invites';
import { cleanEventInput } from '../domain/calendar';
import { ETC_CATEGORY_ID, MAX_EATEN, cleanFoodInput, cleanStars, withEaten } from '../domain/foods';
import { cleanFix, cleanPlaceInput, planCheckin } from '../domain/location';
import { cleanFamilyName, cleanProfile } from '../domain/profile';
import { MAX_OFFER_NOTE, canCounter, cleanOfferAmount, cleanProposalInput, turnOf } from '../domain/proposals';
import { cleanPresetInput, cleanQuestInput, runId } from '../domain/quests';
import {
  DEFAULT_SETTINGS,
  MAX_PRAISE_LENGTH,
  MAX_REWARD,
  cleanSettings,
  halfReward,
  normalizeSettings,
} from '../domain/settings';
import { buyBlockReason, cleanRewardInput } from '../domain/shop';
import { dateKey, dayNumber, weekStart } from '../lib/dates';
import {
  AppError,
  type Backend,
  type CalendarEvent,
  type Family,
  type FamilySettings,
  type Food,
  type Invite,
  type LedgerEntry,
  type LocationRecord,
  type Member,
  type Offer,
  type Order,
  type Place,
  type Preset,
  type Proposal,
  type Quest,
  type Reward,
  type Role,
  type Run,
  type Unsub,
} from './types';

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': '이메일이나 비밀번호가 맞지 않아요.',
  'auth/invalid-email': '이메일 주소 모양이 올바르지 않아요.',
  'auth/user-not-found': '가입하지 않은 이메일이에요.',
  'auth/wrong-password': '비밀번호가 맞지 않아요.',
  'auth/email-already-in-use': '이미 가입한 이메일이에요. 로그인해 주세요.',
  'auth/weak-password': '비밀번호는 6자 이상으로 정해 주세요.',
  'auth/too-many-requests': '시도가 너무 많았어요. 잠시 뒤에 다시 해 주세요.',
  'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
  'auth/popup-blocked': '로그인 창이 막혔어요. 팝업을 허용하고 다시 눌러 주세요.',
  'auth/operation-not-allowed': '이 로그인 방식이 아직 켜져 있지 않아요.',
};

const STORE_MESSAGES: Record<string, string> = {
  'permission-denied': '권한이 없어요. 역할을 확인해 주세요.',
  unavailable: '인터넷 연결을 확인해 주세요.',
  'not-found': '찾을 수 없어요. 이미 지워졌을 수 있어요.',
  aborted: '다른 기기에서 먼저 처리했어요. 다시 확인해 주세요.',
  'failed-precondition': '지금은 처리할 수 없어요. 잠시 뒤에 다시 해 주세요.',
};

const isDenied = (error: unknown) => error instanceof FirebaseError && error.code === 'permission-denied';

/** Firebase 오류를 사용자에게 보여 줄 문장으로 바꾼다. */
function toAppError(error: unknown): Error {
  if (error instanceof AppError) return error;
  if (error instanceof FirebaseError) {
    // 로그인 창을 그냥 닫은 것은 오류로 알리지 않는다.
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      return new AppError('');
    }
    const message = AUTH_MESSAGES[error.code] ?? STORE_MESSAGES[error.code];
    if (message) return new AppError(message);
  }
  console.error(error);
  return new AppError('문제가 생겼어요. 잠시 뒤에 다시 해 주세요.');
}

async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw toAppError(error);
  }
}

/** 두 개의 실시간 조회 결과를 id 기준으로 합쳐서 하나처럼 돌려준다. */
function watchMerged<T extends { id: string }>(
  queries: [Query, Query],
  convert: (id: string, data: DocumentData) => T,
  cb: (items: T[]) => void,
  label: string,
): Unsub {
  const results: (T[] | null)[] = [null, null];
  const stops = queries.map((q, index) =>
    onSnapshot(
      q,
      (snap) => {
        results[index] = snap.docs.map((s) => convert(s.id, s.data()));
        if (results.some((r) => r === null)) return;
        const merged = new Map<string, T>();
        for (const item of results.flatMap((r) => r ?? [])) merged.set(item.id, item);
        cb([...merged.values()]);
      },
      (error) => console.error(`[${label}]`, error),
    ),
  );
  return () => stops.forEach((stop) => stop());
}

export function createFirebaseBackend(): Backend {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  auth.languageCode = 'ko';
  const db: Firestore = initializeFirestore(app, {
    // 오프라인에서도 마지막으로 본 내용을 보여 준다.
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  const familyRef = (fid: string) => doc(db, 'families', fid);
  const memberRef = (fid: string, uid: string) => doc(db, 'families', fid, 'members', uid);
  const questsCol = (fid: string) => collection(db, 'families', fid, 'quests');
  const runsCol = (fid: string) => collection(db, 'families', fid, 'runs');
  const ledgerCol = (fid: string) => collection(db, 'families', fid, 'ledger');
  const presetsCol = (fid: string) => collection(db, 'families', fid, 'presets');
  const proposalsCol = (fid: string) => collection(db, 'families', fid, 'proposals');
  const rewardsCol = (fid: string) => collection(db, 'families', fid, 'rewards');
  const ordersCol = (fid: string) => collection(db, 'families', fid, 'orders');
  const foodsCol = (fid: string) => collection(db, 'families', fid, 'foods');
  const locationsCol = (fid: string) => collection(db, 'families', fid, 'locations');
  const placesCol = (fid: string) => collection(db, 'families', fid, 'places');
  const eventsCol = (fid: string) => collection(db, 'families', fid, 'events');

  const onListenError = (what: string) => (error: Error) => console.error(`[${what}]`, error);

  const toQuest = (id: string, d: DocumentData): Quest => ({
    id,
    title: d.title,
    note: d.note ?? '',
    assigneeUid: d.assigneeUid,
    reward: d.reward,
    repeat: d.repeat,
    important: d.important === true,
    active: d.active,
    createdBy: d.createdBy,
    createdAt: d.createdAt,
  });

  const toRun = (id: string, d: DocumentData): Run => ({
    id,
    questId: d.questId,
    questTitle: d.questTitle,
    reward: d.reward,
    assigneeUid: d.assigneeUid,
    dateKey: d.dateKey,
    oneOff: d.oneOff === true,
    late: d.late === true,
    status: d.status,
    submittedAt: d.submittedAt,
    decidedBy: d.decidedBy ?? null,
    decidedAt: d.decidedAt ?? null,
    rejectReason: d.rejectReason ?? '',
    praise: d.praise ?? '',
  });

  const toProposal = (id: string, d: DocumentData): Proposal => ({
    id,
    ownerUid: d.ownerUid,
    title: d.title,
    note: d.note ?? '',
    date: d.date,
    important: d.important === true,
    status: d.status,
    doneDay: d.doneDay ?? null,
    declined: d.declined === true,
    lastAmount: d.lastAmount ?? null,
    lastRole: d.lastRole ?? null,
    offerCount: d.offerCount ?? 0,
    offers: (d.offers as Offer[] | undefined) ?? [],
    createdAt: d.createdAt ?? 0,
  });

  const toReward = (id: string, d: DocumentData): Reward => ({
    id,
    title: d.title,
    note: d.note ?? '',
    price: d.price,
    icon: d.icon ?? 'shop',
    limit: d.limit ?? { period: 'none', count: 1 },
    active: d.active === true,
    createdBy: d.createdBy,
    createdAt: d.createdAt ?? 0,
  });

  const toFood = (id: string, d: DocumentData): Food => ({
    id,
    name: d.name,
    category: typeof d.category === 'string' && d.category ? d.category : ETC_CATEGORY_ID,
    link: d.link ?? '',
    memo: d.memo ?? '',
    addedBy: d.addedBy,
    createdAt: d.createdAt ?? 0,
    wantedBy: [...((d.wantedBy as string[] | undefined) ?? [])],
    eaten: [...((d.eaten as string[] | undefined) ?? [])].sort(),
    ratings: { ...((d.ratings as Record<string, number> | undefined) ?? {}) },
    active: d.active === true,
  });

  const toOrder = (id: string, d: DocumentData): Order => ({
    id,
    rewardId: d.rewardId,
    rewardTitle: d.rewardTitle,
    icon: d.icon ?? 'shop',
    price: d.price,
    uid: d.uid,
    status: d.status,
    requestedAt: d.requestedAt,
    requestedDay: d.requestedDay,
    decidedBy: d.decidedBy ?? null,
    decidedAt: d.decidedAt ?? null,
    rejectReason: d.rejectReason ?? '',
    deliveredBy: d.deliveredBy ?? null,
    deliveredAt: d.deliveredAt ?? null,
  });

  const toMember = (uid: string, d: DocumentData): Member => ({
    uid,
    role: d.role,
    displayName: d.displayName,
    avatar: d.avatar,
    coins: d.coins ?? 0,
    joinedAt: d.joinedAt ?? 0,
    streak: d.streak ?? null,
    goalRewardId: d.goalRewardId ?? null,
    checkin:
      d.checkin && Number.isInteger(d.checkin.dayNum) && Number.isInteger(d.checkin.count)
        ? { dayNum: d.checkin.dayNum, count: d.checkin.count }
        : null,
  });

  const toLocation = (id: string, d: DocumentData): LocationRecord => ({
    id,
    uid: d.uid,
    lat: d.lat,
    lng: d.lng,
    accuracy: d.accuracy ?? 0,
    at: d.at ?? 0,
    trigger: d.trigger === 'open' || d.trigger === 'quest' ? d.trigger : 'button',
    coins: d.coins ?? 0,
  });

  const toEvent = (id: string, d: DocumentData): CalendarEvent => ({
    id,
    title: d.title,
    memo: d.memo ?? '',
    startDay: d.startDay,
    endDay: d.endDay ?? d.startDay,
    allDay: d.allDay === true,
    startTime: d.startTime ?? '',
    endTime: d.endTime ?? '',
    who: [...((d.who as string[] | undefined) ?? [])],
    repeat: d.repeat === 'weekly' || d.repeat === 'monthly' || d.repeat === 'yearly' ? d.repeat : 'none',
    repeatUntil: d.repeatUntil ?? '',
    createdBy: d.createdBy,
    createdAt: d.createdAt ?? 0,
  });

  const toPlace = (id: string, d: DocumentData): Place => ({
    id,
    name: d.name,
    lat: d.lat,
    lng: d.lng,
    radius: d.radius ?? 150,
    createdBy: d.createdBy,
    createdAt: d.createdAt ?? 0,
  });

  const toFamily = (id: string, d: DocumentData): Family => ({
    id,
    name: d.name,
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    settings: normalizeSettings(d.settings),
  });

  async function readSettings(fid: string): Promise<FamilySettings> {
    const snap = await getDoc(familyRef(fid));
    return normalizeSettings(snap.data()?.settings);
  }

  async function readRole(fid: string, uid: string): Promise<Role> {
    const snap = await getDoc(memberRef(fid, uid));
    const role = snap.data()?.role as Role | undefined;
    if (!role) throw new AppError('이 가족의 구성원이 아니에요.');
    return role;
  }

  /** 협상에서 지금 답할 차례인 사람인지 확인한다. */
  function checkTurn(proposal: Proposal, role: Role, uid: string) {
    const turn = turnOf(proposal);
    if (!turn) throw new AppError('이미 끝난 협상이에요.');
    if (role === 'child' && proposal.ownerUid !== uid) throw new AppError('내 할 일만 협상할 수 있어요.');
    if (role !== turn) throw new AppError('지금은 상대가 답할 차례예요.');
  }

  const backend: Backend = {
    mode: 'firebase',

    onAuthChange(cb) {
      return onAuthStateChanged(auth, (user) => cb(user ? { uid: user.uid, email: user.email } : null));
    },
    signInWithGoogle: () =>
      guard(async () => {
        await signInWithPopup(auth, new GoogleAuthProvider());
      }),
    signInWithEmail: (email, password) =>
      guard(async () => {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }),
    signUpWithEmail: (email, password) =>
      guard(async () => {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }),
    signOut: () => guard(() => fbSignOut(auth)),

    watchUserProfile(uid, cb) {
      return onSnapshot(
        doc(db, 'users', uid),
        (snap) => cb({ uid, familyId: (snap.data()?.familyId as string | undefined) ?? null }),
        onListenError('users'),
      );
    },

    createFamily: (uid, familyName, profile) =>
      guard(async () => {
        const name = cleanFamilyName(familyName);
        const clean = cleanProfile(profile);
        const ref = doc(collection(db, 'families'));
        const now = Date.now();
        const batch = writeBatch(db);
        batch.set(ref, { name, createdBy: uid, createdAt: now, settings: DEFAULT_SETTINGS });
        batch.set(memberRef(ref.id, uid), { uid, role: 'parent', ...clean, coins: 0, joinedAt: now });
        batch.set(doc(db, 'users', uid), { familyId: ref.id }, { merge: true });
        await batch.commit();
        return ref.id;
      }),

    joinFamily: (uid, rawCode, profile) =>
      guard(async () => {
        const clean = cleanProfile(profile);
        const code = normalizeInviteCode(rawCode);
        if (!isInviteCodeShape(code)) throw new AppError('초대코드는 6자리예요. 다시 확인해 주세요.');
        const snap = await getDoc(doc(db, 'invites', code));
        if (!snap.exists()) throw new AppError('초대코드를 찾을 수 없어요. 다시 확인해 주세요.');
        const invite = snap.data() as Omit<Invite, 'code'>;
        if (invite.expiresAt < Date.now()) throw new AppError('기한이 지난 초대코드예요. 새 코드를 받아 주세요.');
        const batch = writeBatch(db);
        batch.set(memberRef(invite.familyId, uid), {
          uid,
          role: invite.role,
          ...clean,
          coins: 0,
          joinedAt: Date.now(),
          inviteCode: code,
        });
        batch.set(doc(db, 'users', uid), { familyId: invite.familyId }, { merge: true });
        await batch.commit();
        return invite.familyId;
      }),

    createInvite: (familyId, role, byUid) =>
      guard(async () => {
        const family = await getDoc(familyRef(familyId));
        const familyName = (family.data()?.name as string | undefined) ?? '';
        // 코드가 겹치면(이미 있는 문서는 덮어쓸 수 없다) 새 코드로 다시 시도한다.
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const invite: Invite = {
            code: newInviteCode(),
            familyId,
            familyName,
            role,
            createdBy: byUid,
            expiresAt: Date.now() + INVITE_TTL_MS,
          };
          const { code, ...data } = invite;
          try {
            await setDoc(doc(db, 'invites', code), data);
            return invite;
          } catch (error) {
            if (!(isDenied(error) && attempt < 3)) throw error;
          }
        }
        throw new AppError('초대코드를 만들지 못했어요. 다시 해 주세요.');
      }),

    watchFamily(familyId, cb) {
      return onSnapshot(
        familyRef(familyId),
        (snap) => {
          const d = snap.data();
          cb(d ? toFamily(familyId, d) : null);
        },
        onListenError('family'),
      );
    },

    watchMembers(familyId, cb) {
      return onSnapshot(
        collection(db, 'families', familyId, 'members'),
        (snap) => cb(snap.docs.map((s) => toMember(s.id, s.data()))),
        onListenError('members'),
      );
    },

    updateMyProfile: (familyId, uid, profile) =>
      guard(async () => {
        const clean = cleanProfile(profile);
        await updateDoc(memberRef(familyId, uid), { displayName: clean.displayName, avatar: clean.avatar });
      }),

    updateSettings: (familyId, settings) =>
      guard(async () => {
        await updateDoc(familyRef(familyId), { settings: cleanSettings(settings) });
      }),

    watchQuests(familyId, cb) {
      return onSnapshot(
        query(questsCol(familyId), where('active', '==', true)),
        (snap) => cb(snap.docs.map((s) => toQuest(s.id, s.data()))),
        onListenError('quests'),
      );
    },

    createQuest: (familyId, input, byUid) =>
      guard(async () => {
        const clean = cleanQuestInput(input);
        const ref = doc(questsCol(familyId));
        await setDoc(ref, { ...clean, active: true, createdBy: byUid, createdAt: Date.now() });
        return ref.id;
      }),

    updateQuest: (familyId, questId, input) =>
      guard(async () => {
        const clean = cleanQuestInput(input);
        await updateDoc(doc(questsCol(familyId), questId), { ...clean });
      }),

    archiveQuest: (familyId, questId) =>
      guard(async () => {
        await updateDoc(doc(questsCol(familyId), questId), { active: false });
      }),

    watchPresets(familyId, cb) {
      return onSnapshot(
        presetsCol(familyId),
        (snap) =>
          cb(
            snap.docs
              .map((s) => {
                const d = s.data();
                return {
                  id: s.id,
                  title: d.title,
                  reward: d.reward,
                  childCanAdd: d.childCanAdd === true,
                  createdAt: d.createdAt ?? 0,
                } as Preset;
              })
              .sort((a, b) => a.createdAt - b.createdAt),
          ),
        onListenError('presets'),
      );
    },

    createPreset: (familyId, input) =>
      guard(async () => {
        const clean = cleanPresetInput(input);
        const ref = doc(presetsCol(familyId));
        await setDoc(ref, { ...clean, createdAt: Date.now() });
        return ref.id;
      }),

    deletePreset: (familyId, presetId) => guard(() => deleteDoc(doc(presetsCol(familyId), presetId))),

    addPresetQuestAsChild: (familyId, preset, uid, day) =>
      guard(async () => {
        // 문서 id 를 "버튼_사람_날짜"로 고정해서 버튼마다 하루 한 번만 추가되게 한다.
        const id = `${preset.id}_${uid}_${day}`;
        try {
          await setDoc(doc(questsCol(familyId), id), {
            title: preset.title,
            note: '',
            assigneeUid: uid,
            reward: preset.reward,
            repeat: { type: 'none', date: day },
            important: false,
            active: true,
            createdBy: uid,
            createdAt: Date.now(),
            presetId: preset.id,
          });
        } catch (error) {
          // 같은 id 가 이미 있으면 덮어쓰기가 거부된다.
          if (isDenied(error)) throw new AppError('오늘은 이미 추가했거나, 스스로 추가할 수 없는 퀘스트예요.');
          throw error;
        }
      }),

    watchRuns(familyId, sinceDateKey, cb) {
      // 최근 기록과, 오래됐더라도 아직 확인을 기다리는 기록을 합쳐서 돌려준다.
      return watchMerged(
        [
          query(runsCol(familyId), where('dateKey', '>=', sinceDateKey)),
          query(runsCol(familyId), where('status', '==', 'submitted')),
        ],
        toRun,
        cb,
        'runs',
      );
    },

    submitRun: (familyId, quest, day, uid, late) =>
      guard(async () => {
        // 처음이면 새로 만들고, 돌려받은(반려된) 기록이면 다시 제출로 덮어쓴다.
        await setDoc(doc(runsCol(familyId), runId(quest.id, day)), {
          questId: quest.id,
          questTitle: quest.title,
          reward: late ? halfReward(quest.reward) : quest.reward,
          assigneeUid: uid,
          dateKey: day,
          oneOff: quest.repeat.type === 'none',
          late,
          status: 'submitted',
          submittedAt: Date.now(),
          decidedBy: null,
          decidedAt: null,
          rejectReason: '',
          praise: '',
        });
      }),

    cancelRun: (familyId, id) =>
      guard(async () => {
        await deleteDoc(doc(runsCol(familyId), id));
      }),

    approveRun: (familyId, id, byUid, options) =>
      guard(async () => {
        const runRef = doc(runsCol(familyId), id);
        const praise = options.praise.trim().slice(0, MAX_PRAISE_LENGTH);
        // 승인, 장부 기록, 잔액 증가, 연속 달성을 한 묶음으로 처리한다(하나라도 실패하면 모두 취소).
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(runRef);
          if (!snap.exists()) throw new AppError('완료 요청을 찾을 수 없어요.');
          const run = toRun(snap.id, snap.data());
          if (run.status !== 'submitted') throw new AppError('이미 다른 사람이 확인했어요.');

          const streak = options.streak;
          const bonusRef = streak ? doc(ledgerCol(familyId), `streak_${run.assigneeUid}_${streak.lastDate}`) : null;
          // 같은 날의 보너스가 이미 있으면 다시 주지 않는다.
          const bonus = streak && bonusRef && streak.bonus > 0 && !(await tx.get(bonusRef)).exists() ? streak.bonus : 0;

          const now = Date.now();
          tx.update(runRef, { status: 'approved', decidedBy: byUid, decidedAt: now, praise });
          const entry: Omit<LedgerEntry, 'id'> = {
            uid: run.assigneeUid,
            amount: run.reward,
            type: 'quest',
            refId: id,
            memo: run.questTitle,
            note: praise,
            by: byUid,
            at: now,
          };
          tx.set(doc(ledgerCol(familyId), id), entry);
          if (bonus > 0 && bonusRef && streak) {
            const bonusEntry: Omit<LedgerEntry, 'id'> = {
              uid: run.assigneeUid,
              amount: bonus,
              type: 'bonus',
              refId: id,
              memo: `${streak.count}일 연속 달성 보너스`,
              note: '',
              by: byUid,
              at: now + 1,
            };
            tx.set(bonusRef, bonusEntry);
          }
          tx.update(memberRef(familyId, run.assigneeUid), {
            coins: increment(run.reward + bonus),
            ...(streak ? { streak: { count: streak.count, lastDate: streak.lastDate } } : {}),
          });
          if (run.oneOff) tx.update(doc(questsCol(familyId), run.questId), { active: false });
        });
      }),

    rejectRun: (familyId, id, byUid, reason) =>
      guard(async () => {
        const runRef = doc(runsCol(familyId), id);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(runRef);
          if (!snap.exists()) throw new AppError('완료 요청을 찾을 수 없어요.');
          if (snap.data().status !== 'submitted') throw new AppError('이미 다른 사람이 확인했어요.');
          tx.update(runRef, {
            status: 'rejected',
            decidedBy: byUid,
            decidedAt: Date.now(),
            rejectReason: reason.trim().slice(0, 60),
          });
        });
      }),

    watchProposals(familyId, today, cb) {
      // 진행 중인 것과, 오늘 끝낸 메모를 합쳐서 돌려준다.
      return watchMerged(
        [
          query(proposalsCol(familyId), where('status', 'in', ['memo', 'negotiating'])),
          query(proposalsCol(familyId), where('doneDay', '==', today)),
        ],
        toProposal,
        cb,
        'proposals',
      );
    },

    createProposal: (familyId, input, uid) =>
      guard(async () => {
        const clean = cleanProposalInput(input, await readSettings(familyId), dateKey());
        const ref = doc(proposalsCol(familyId));
        const now = Date.now();
        const offering = clean.amount !== null;
        await setDoc(ref, {
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
          offers: offering ? [{ byUid: uid, role: 'child', amount: clean.amount, note: '', at: now }] : [],
          createdAt: now,
        });
        return ref.id;
      }),

    setMemoDone: (familyId, proposalId, done, today) =>
      guard(async () => {
        await updateDoc(doc(proposalsCol(familyId), proposalId), {
          status: done ? 'done' : 'memo',
          doneDay: done ? today : null,
        });
      }),

    deleteProposal: (familyId, proposalId) => guard(() => deleteDoc(doc(proposalsCol(familyId), proposalId))),

    counterProposal: (familyId, proposalId, amount, note, byUid) =>
      guard(async () => {
        const ref = doc(proposalsCol(familyId), proposalId);
        const [role, settings] = await Promise.all([readRole(familyId, byUid), readSettings(familyId)]);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new AppError('할 일을 찾을 수 없어요.');
          const proposal = toProposal(snap.id, snap.data());
          checkTurn(proposal, role, byUid);
          if (!canCounter(proposal, settings)) {
            throw new AppError('더는 다시 제안할 수 없어요. 수락하거나 그만둘 수 있어요.');
          }
          const clean = cleanOfferAmount(amount, role, settings);
          const offer: Offer = { byUid, role, amount: clean, note: note.trim().slice(0, MAX_OFFER_NOTE), at: Date.now() };
          tx.update(ref, {
            lastAmount: clean,
            lastRole: role,
            offerCount: proposal.offerCount + 1,
            offers: [...proposal.offers, offer],
          });
        });
      }),

    acceptProposal: (familyId, proposalId, byUid) =>
      guard(async () => {
        const ref = doc(proposalsCol(familyId), proposalId);
        const role = await readRole(familyId, byUid);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new AppError('할 일을 찾을 수 없어요.');
          const proposal = toProposal(snap.id, snap.data());
          checkTurn(proposal, role, byUid);
          const reward = proposal.lastAmount ?? 0;
          if (reward < 1 || reward > MAX_REWARD) throw new AppError('제안 금액이 올바르지 않아요.');
          // 합의된 금액으로 한 번짜리 퀘스트를 만든다(퀘스트 id = 제안 id).
          tx.set(doc(questsCol(familyId), proposalId), {
            title: proposal.title,
            note: proposal.note,
            assigneeUid: proposal.ownerUid,
            reward,
            repeat: { type: 'none', date: proposal.date },
            important: proposal.important,
            active: true,
            createdBy: byUid,
            createdAt: Date.now(),
            proposalId,
          });
          tx.update(ref, { status: 'agreed' });
        });
      }),

    declineProposal: (familyId, proposalId, byUid) =>
      guard(async () => {
        const role = await readRole(familyId, byUid);
        await updateDoc(doc(proposalsCol(familyId), proposalId), { status: 'memo', declined: role === 'parent' });
      }),

    watchLedger(familyId, cb) {
      return onSnapshot(
        query(ledgerCol(familyId), orderBy('at', 'desc'), limit(100)),
        (snap) =>
          cb(
            snap.docs.map((s) => {
              const d = s.data();
              return {
                id: s.id,
                uid: d.uid,
                amount: d.amount,
                type: d.type,
                refId: d.refId ?? '',
                memo: d.memo ?? '',
                note: d.note ?? '',
                by: d.by,
                at: d.at,
              } as LedgerEntry;
            }),
          ),
        onListenError('ledger'),
      );
    },

    watchRewards(familyId, cb) {
      return onSnapshot(
        query(rewardsCol(familyId), where('active', '==', true)),
        (snap) =>
          cb(
            snap.docs
              .map((s) => toReward(s.id, s.data()))
              .sort((a, b) => a.price - b.price || a.title.localeCompare(b.title, 'ko')),
          ),
        onListenError('rewards'),
      );
    },

    createReward: (familyId, input, byUid) =>
      guard(async () => {
        const ref = doc(rewardsCol(familyId));
        await setDoc(ref, { ...cleanRewardInput(input), active: true, createdBy: byUid, createdAt: Date.now() });
        return ref.id;
      }),

    updateReward: (familyId, rewardId, input) =>
      guard(async () => {
        await updateDoc(doc(rewardsCol(familyId), rewardId), { ...cleanRewardInput(input) });
      }),

    archiveReward: (familyId, rewardId) =>
      guard(async () => {
        await updateDoc(doc(rewardsCol(familyId), rewardId), { active: false });
      }),

    watchOrders(familyId, sinceDay, cb) {
      // 진행 중인 신청(신청함, 받을 보상)과 최근 신청 기록을 합쳐서 돌려준다.
      return watchMerged(
        [
          query(ordersCol(familyId), where('status', 'in', ['requested', 'approved'])),
          query(ordersCol(familyId), where('requestedDay', '>=', sinceDay)),
        ],
        toOrder,
        cb,
        'orders',
      );
    },

    requestReward: (familyId, reward, uid, today) =>
      guard(async () => {
        // 묶인 코인과 구매 제한을 확인한다. 최종 잔액 확인은 승인할 때 다시 한다.
        const [memberSnap, openSnap, recentSnap] = await Promise.all([
          getDoc(memberRef(familyId, uid)),
          getDocs(query(ordersCol(familyId), where('status', 'in', ['requested', 'approved']))),
          getDocs(query(ordersCol(familyId), where('requestedDay', '>=', weekStart(today)))),
        ]);
        const memberData = memberSnap.data();
        if (!memberData) throw new AppError('이 가족의 구성원이 아니에요.');
        const orders = new Map<string, Order>();
        for (const s of [...openSnap.docs, ...recentSnap.docs]) orders.set(s.id, toOrder(s.id, s.data()));
        const blocked = buyBlockReason(reward, toMember(uid, memberData), [...orders.values()], today);
        if (blocked) throw new AppError(blocked);
        const ref = doc(ordersCol(familyId));
        await setDoc(ref, {
          rewardId: reward.id,
          rewardTitle: reward.title,
          icon: reward.icon,
          price: reward.price,
          uid,
          status: 'requested',
          requestedAt: Date.now(),
          requestedDay: today,
          decidedBy: null,
          decidedAt: null,
          rejectReason: '',
          deliveredBy: null,
          deliveredAt: null,
        });
        return ref.id;
      }),

    cancelOrder: (familyId, orderId) => guard(() => deleteDoc(doc(ordersCol(familyId), orderId))),

    approveOrder: (familyId, orderId, byUid) =>
      guard(async () => {
        const ref = doc(ordersCol(familyId), orderId);
        // 승인, 장부 기록, 잔액 차감을 한 묶음으로 처리한다. 잔액이 모자라면 아무것도 바뀌지 않는다.
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new AppError('보상 신청을 찾을 수 없어요.');
          const order = toOrder(snap.id, snap.data());
          if (order.status !== 'requested') throw new AppError('이미 다른 사람이 확인했어요.');
          const buyer = await tx.get(memberRef(familyId, order.uid));
          const coins = (buyer.data()?.coins as number | undefined) ?? 0;
          if (coins < order.price) throw new AppError(`코인이 모자라요. 지금 ${coins}코인이 있어요.`);
          const now = Date.now();
          tx.update(ref, { status: 'approved', decidedBy: byUid, decidedAt: now });
          const entry: Omit<LedgerEntry, 'id'> = {
            uid: order.uid,
            amount: -order.price,
            type: 'reward',
            refId: orderId,
            memo: order.rewardTitle,
            note: '',
            by: byUid,
            at: now,
          };
          tx.set(doc(ledgerCol(familyId), orderId), entry);
          tx.update(memberRef(familyId, order.uid), { coins: increment(-order.price) });
        });
      }),

    rejectOrder: (familyId, orderId, byUid, reason) =>
      guard(async () => {
        const ref = doc(ordersCol(familyId), orderId);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new AppError('보상 신청을 찾을 수 없어요.');
          if (snap.data().status !== 'requested') throw new AppError('이미 다른 사람이 확인했어요.');
          tx.update(ref, { status: 'rejected', decidedBy: byUid, decidedAt: Date.now(), rejectReason: reason.trim().slice(0, 60) });
        });
      }),

    deliverOrder: (familyId, orderId, byUid) =>
      guard(async () => {
        const ref = doc(ordersCol(familyId), orderId);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new AppError('보상 신청을 찾을 수 없어요.');
          if (snap.data().status !== 'approved') throw new AppError('승인된 보상만 마무리할 수 있어요.');
          tx.update(ref, { status: 'delivered', deliveredBy: byUid, deliveredAt: Date.now() });
        });
      }),

    setGoal: (familyId, uid, rewardId) =>
      guard(async () => {
        await updateDoc(memberRef(familyId, uid), { goalRewardId: rewardId });
      }),

    watchFoods(familyId, cb, onError) {
      return onSnapshot(
        query(foodsCol(familyId), where('active', '==', true)),
        (snap) => cb(snap.docs.map((s) => toFood(s.id, s.data()))),
        (error) => {
          console.error('[foods]', error);
          onError?.();
        },
      );
    },

    // 같은 이름이 이미 있는지는 목록을 들고 있는 화면이 먼저 확인한다.
    createFood: (familyId, input, byUid) =>
      guard(async () => {
        const ref = doc(foodsCol(familyId));
        await setDoc(ref, {
          ...cleanFoodInput(input),
          addedBy: byUid,
          createdAt: Date.now(),
          wantedBy: [byUid],
          eaten: [],
          ratings: {},
          active: true,
        });
        return ref.id;
      }),

    updateFood: (familyId, foodId, input) =>
      guard(async () => {
        await updateDoc(doc(foodsCol(familyId), foodId), { ...cleanFoodInput(input) });
      }),

    archiveFood: (familyId, foodId) =>
      guard(async () => {
        await updateDoc(doc(foodsCol(familyId), foodId), { active: false });
      }),

    setFoodWant: (familyId, foodId, uid, want) =>
      guard(async () => {
        await updateDoc(doc(foodsCol(familyId), foodId), { wantedBy: want ? arrayUnion(uid) : arrayRemove(uid) });
      }),

    addFoodEaten: (familyId, foodId, day) =>
      guard(async () => {
        const ref = doc(foodsCol(familyId), foodId);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new AppError('메뉴를 찾을 수 없어요. 이미 지워졌을 수 있어요.');
        const current = toFood(snap.id, snap.data()).eaten;
        const next = withEaten(current, day, dateKey());
        // 기록이 가득 차서 오래된 날을 덜어 내야 할 때만 목록을 통째로 바꾼다.
        const eaten = current.length >= MAX_EATEN ? next : arrayUnion(day);
        await updateDoc(ref, { eaten, wantedBy: [] });
      }),

    rateFood: (familyId, foodId, uid, stars) =>
      guard(async () => {
        // ratings.<uid> 한 칸만 바꾼다. 다른 사람의 별점은 건드리지 않는다.
        await updateDoc(doc(foodsCol(familyId), foodId), new FieldPath('ratings', uid), cleanStars(stars));
      }),

    removeFoodEaten: (familyId, foodId, day) =>
      guard(async () => {
        await updateDoc(doc(foodsCol(familyId), foodId), { eaten: arrayRemove(day) });
      }),

    watchLocations(familyId, sinceMs, cb, onError) {
      return onSnapshot(
        query(locationsCol(familyId), where('at', '>=', sinceMs), orderBy('at', 'desc'), limit(200)),
        (snap) => cb(snap.docs.map((s) => toLocation(s.id, s.data()))),
        (error) => {
          console.error('[locations]', error);
          onError?.();
        },
      );
    },

    shareLocation: (familyId, uid, fix, trigger) =>
      guard(async () => {
        const clean = cleanFix(fix);
        const locRef = doc(locationsCol(familyId));
        const record = { uid, ...clean, at: Date.now(), trigger };
        if (trigger === 'button') {
          try {
            // 위치 기록, 장부, 잔액을 한 묶음으로 쓴다. 금액과 하루 횟수는 서버 규칙이 다시 검사한다.
            return await runTransaction(db, async (tx) => {
              const family = await tx.get(familyRef(familyId));
              const member = await tx.get(memberRef(familyId, uid));
              if (!member.exists()) throw new AppError('이 가족의 구성원이 아니에요.');
              const settings = normalizeSettings(family.data()?.settings);
              const plan = planCheckin(uid, toMember(uid, member.data()).checkin, settings, dayNumber());
              tx.set(locRef, { ...record, coins: plan?.coins ?? 0 });
              if (plan) {
                const entry: Omit<LedgerEntry, 'id'> = {
                  uid,
                  amount: plan.coins,
                  type: 'checkin',
                  refId: locRef.id,
                  memo: '위치 공유',
                  note: '',
                  by: uid,
                  at: record.at,
                };
                tx.set(doc(ledgerCol(familyId), plan.ledgerId), entry);
                tx.update(memberRef(familyId, uid), {
                  coins: increment(plan.coins),
                  checkin: { dayNum: plan.dayNum, count: plan.count },
                });
              }
              return { coins: plan?.coins ?? 0 };
            });
          } catch (error) {
            // 코인 규칙에서 막혔다면(설정이 방금 바뀌었거나 규칙이 아직 옛것) 위치만이라도 남긴다.
            if (!isDenied(error)) throw error;
          }
        }
        try {
          await setDoc(locRef, { ...record, coins: 0 });
        } catch (error) {
          if (isDenied(error)) throw new AppError('위치를 저장하지 못했어요. 부모님께 Firebase 규칙을 새로 게시했는지 물어봐 주세요.');
          throw error;
        }
        return { coins: 0 };
      }),

    pruneLocations: (familyId, beforeMs) =>
      guard(async () => {
        const old = await getDocs(query(locationsCol(familyId), where('at', '<', beforeMs), limit(200)));
        if (old.empty) return;
        const batch = writeBatch(db);
        old.docs.forEach((s) => batch.delete(s.ref));
        await batch.commit();
      }),

    watchPlaces(familyId, cb, onError) {
      return onSnapshot(
        placesCol(familyId),
        (snap) => cb(snap.docs.map((s) => toPlace(s.id, s.data())).sort((a, b) => a.name.localeCompare(b.name, 'ko'))),
        (error) => {
          console.error('[places]', error);
          onError?.();
        },
      );
    },

    // 장소 수의 상한은 목록을 들고 있는 화면이 먼저 확인한다.
    createPlace: (familyId, input, byUid) =>
      guard(async () => {
        const ref = doc(placesCol(familyId));
        await setDoc(ref, { ...cleanPlaceInput(input), createdBy: byUid, createdAt: Date.now() });
        return ref.id;
      }),

    deletePlace: (familyId, placeId) =>
      guard(async () => {
        await deleteDoc(doc(placesCol(familyId), placeId));
      }),

    watchEvents(familyId, cb, onError) {
      return onSnapshot(
        eventsCol(familyId),
        (snap) => cb(snap.docs.map((s) => toEvent(s.id, s.data()))),
        (error) => {
          console.error('[events]', error);
          onError?.();
        },
      );
    },

    createEvent: (familyId, input, byUid) =>
      guard(async () => {
        const ref = doc(eventsCol(familyId));
        await setDoc(ref, { ...cleanEventInput(input), createdBy: byUid, createdAt: Date.now() });
        return ref.id;
      }),

    updateEvent: (familyId, eventId, input) =>
      guard(async () => {
        await updateDoc(doc(eventsCol(familyId), eventId), { ...cleanEventInput(input) });
      }),

    deleteEvent: (familyId, eventId) =>
      guard(async () => {
        await deleteDoc(doc(eventsCol(familyId), eventId));
      }),

    giveCoins: (familyId, toUid, amount, note, byUid) =>
      guard(async () => {
        if (!Number.isInteger(amount) || amount < 1 || amount > MAX_REWARD) {
          throw new AppError(`코인은 1부터 ${MAX_REWARD} 사이의 숫자로 적어 주세요.`);
        }
        const ref = doc(ledgerCol(familyId));
        const entry: Omit<LedgerEntry, 'id'> = {
          uid: toUid,
          amount,
          type: 'gift',
          refId: ref.id,
          memo: '칭찬 코인',
          note: note.trim().slice(0, MAX_PRAISE_LENGTH),
          by: byUid,
          at: Date.now(),
        };
        const batch = writeBatch(db);
        batch.set(ref, entry);
        batch.update(memberRef(familyId, toUid), { coins: increment(amount) });
        await batch.commit();
      }),
  };

  return backend;
}
