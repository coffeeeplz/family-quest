// 가족 퀘스트 알림 서버.
// 저장소(Firestore)의 문서가 바뀌면 누구에게 알릴지 정해서 웹 푸시를 보낸다.
// 15분마다 저녁 할 일 알림과 아침 일정 알림을 보낼 사람이 있는지 살핀다.
// 무엇을 보낼지는 앱과 같은 규칙(src/domain)을 그대로 쓴다.

// 날짜 계산(오늘, 어제)을 서울 시각으로 한다.
process.env.TZ = 'Asia/Seoul';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { CalendarEvent, Quest, Run } from '../../src/backend/types';
import { isFor, occurrencesOn, todayLine } from '../../src/domain/calendar';
import { dueNow, inQuietHours, normalizePushPrefs, seoulClock, type PushMessage, type PushType } from '../../src/domain/push';
import {
  ledgerNotices,
  morningMessage,
  noteNotices,
  orderNotices,
  proposalNotices,
  questNotices,
  remindMessage,
  runNotices,
  wishNotices,
  type Doc,
  type Notice,
} from '../../src/domain/pushMessages';
import { buildBoard } from '../../src/domain/quests';
import { MISSED_DAYS } from '../../src/domain/settings';
import { addDays } from '../../src/lib/dates';

// Firestore 가 서울(asia-northeast3)에 있으므로 함수도 같은 곳에서 돈다.
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 2, memory: '256MiB' });
initializeApp();
const db = getFirestore();

interface Person {
  uid: string;
  role: 'parent' | 'child';
  name: string;
}

async function familyMembers(fid: string): Promise<Person[]> {
  const snap = await db.collection(`families/${fid}/members`).get();
  return snap.docs.map((d) => ({ uid: d.id, role: d.get('role') === 'parent' ? 'parent' : 'child', name: String(d.get('displayName') ?? '가족') }));
}

const nameOf = (people: Person[], uid: unknown) => people.find((p) => p.uid === uid)?.name ?? '가족';

/** 정해진 사람들에게 알림을 보낸다. 알림 설정(종류, 조용한 시간)을 지키고, 쓸 수 없게 된 기기는 지운다. */
async function sendTo(fid: string, uids: string[], type: PushType, msg: PushMessage, options: { ignoreQuiet?: boolean } = {}): Promise<void> {
  const { time } = seoulClock();
  for (const uid of [...new Set(uids)]) {
    const prefs = normalizePushPrefs((await db.doc(`families/${fid}/pushPrefs/${uid}`).get()).data());
    if (!prefs.types[type]) continue;
    if (!options.ignoreQuiet && inQuietHours(time, prefs.quietStart, prefs.quietEnd)) continue;
    const devices = (await db.collection(`families/${fid}/pushDevices`).where('uid', '==', uid).get()).docs.filter(
      (d) => typeof d.get('token') === 'string',
    );
    if (devices.length === 0) continue;
    const result = await getMessaging().sendEachForMulticast({
      tokens: devices.map((d) => d.get('token') as string),
      webpush: { headers: { Urgency: 'high', TTL: '86400' }, data: { ...msg } },
    });
    await Promise.all(
      result.responses.map(async (response, i) => {
        if (response.success) return;
        const code = response.error?.code ?? '';
        logger.warn('알림을 보내지 못함', { uid, code });
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          await devices[i].ref.delete();
        }
      }),
    );
  }
}

/** 규칙이 정한 알림들을 실제로 보낸다. 'parents' 는 가족의 부모 모두 */
async function deliver(fid: string, notices: Notice[], people?: Person[]): Promise<void> {
  if (notices.length === 0) return;
  const list = people ?? (await familyMembers(fid));
  for (const notice of notices) {
    const to = notice.to === 'parents' ? list.filter((p) => p.role === 'parent').map((p) => p.uid) : notice.to;
    await sendTo(fid, to, notice.type, notice.msg);
  }
}

const dataOf = (snap: DocumentSnapshot | undefined): Doc | undefined => (snap?.exists ? (snap.data() as Doc) : undefined);

// ── 문서가 바뀔 때 ───────────────────────────────────────────────────────────

export const onRunWritten = onDocumentWritten('families/{fid}/runs/{rid}', async (event) => {
  const before = dataOf(event.data?.before);
  const after = dataOf(event.data?.after);
  if (!after) return;
  const people = await familyMembers(event.params.fid);
  await deliver(event.params.fid, runNotices(event.params.rid, before, after, nameOf(people, after.assigneeUid)), people);
});

export const onQuestCreated = onDocumentCreated('families/{fid}/quests/{qid}', async (event) => {
  await deliver(event.params.fid, questNotices(event.params.qid, dataOf(event.data)));
});

export const onProposalWritten = onDocumentWritten('families/{fid}/proposals/{pid}', async (event) => {
  const before = dataOf(event.data?.before);
  const after = dataOf(event.data?.after);
  if (!after) return;
  const people = await familyMembers(event.params.fid);
  await deliver(event.params.fid, proposalNotices(event.params.pid, before, after, nameOf(people, after.ownerUid)), people);
});

export const onOrderWritten = onDocumentWritten('families/{fid}/orders/{oid}', async (event) => {
  const before = dataOf(event.data?.before);
  const after = dataOf(event.data?.after);
  if (!after) return;
  const people = await familyMembers(event.params.fid);
  await deliver(event.params.fid, orderNotices(event.params.oid, before, after, nameOf(people, after.uid)), people);
});

export const onWishWritten = onDocumentWritten('families/{fid}/wishes/{wid}', async (event) => {
  const before = dataOf(event.data?.before);
  const after = dataOf(event.data?.after);
  if (!after) return;
  const people = await familyMembers(event.params.fid);
  await deliver(event.params.fid, wishNotices(event.params.wid, before, after, nameOf(people, after.ownerUid)), people);
});

export const onNoteCreated = onDocumentCreated('families/{fid}/notes/{nid}', async (event) => {
  const note = dataOf(event.data);
  if (!note) return;
  const people = await familyMembers(event.params.fid);
  await deliver(
    event.params.fid,
    noteNotices(
      event.params.nid,
      note,
      nameOf(people, note.createdBy),
      people.map((p) => p.uid),
    ),
    people,
  );
});

export const onLedgerCreated = onDocumentCreated('families/{fid}/ledger/{lid}', async (event) => {
  const entry = dataOf(event.data);
  const people = await familyMembers(event.params.fid);
  await deliver(event.params.fid, ledgerNotices(event.params.lid, entry, nameOf(people, entry?.uid)), people);
});

// ── 정해진 시각 ─────────────────────────────────────────────────────────────

const toQuest = (id: string, d: Doc): Quest => ({
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

const toRun = (id: string, d: Doc): Run => ({
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

const toEvent = (id: string, d: Doc): CalendarEvent => ({
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

/** 자녀가 오늘(놓친 날 포함) 아직 하지 않은 "꼭" 퀘스트의 이름 */
async function unfinishedImportant(fid: string, uid: string, day: string): Promise<string[]> {
  const [questSnap, runSnap] = await Promise.all([
    db.collection(`families/${fid}/quests`).where('assigneeUid', '==', uid).get(),
    db.collection(`families/${fid}/runs`).where('dateKey', '>=', addDays(day, -MISSED_DAYS)).get(),
  ]);
  const quests = questSnap.docs.map((d) => toQuest(d.id, d.data())).filter((q) => q.active);
  const runs = runSnap.docs.map((d) => toRun(d.id, d.data())).filter((r) => r.assigneeUid === uid);
  const board = buildBoard(quests, runs, [], uid, day);
  return [...board.missed, ...board.today]
    .filter((item) => item.kind === 'quest' && item.important && (item.state === 'todo' || item.state === 'rejected'))
    .map((item) => item.title);
}

export const scheduledReminders = onSchedule({ schedule: 'every 15 minutes', timeZone: 'Asia/Seoul' }, async () => {
  const { day, time } = seoulClock();
  const families = await db.collection('families').get();
  for (const family of families.docs) {
    const fid = family.id;
    const people = await familyMembers(fid);
    let events: CalendarEvent[] | null = null;
    for (const person of people) {
      const hasDevice = !(await db.collection(`families/${fid}/pushDevices`).where('uid', '==', person.uid).limit(1).get()).empty;
      if (!hasDevice) continue;
      const prefsRef = db.doc(`families/${fid}/pushPrefs/${person.uid}`);
      const raw = (await prefsRef.get()).data() ?? {};
      const prefs = normalizePushPrefs(raw);

      if (person.role === 'child' && prefs.types.remind && dueNow(time, prefs.remindAt, raw.remindSentDay, day)) {
        // 먼저 "오늘 보냄"을 적어 두어 두 번 보내지 않게 한다.
        await prefsRef.set({ remindSentDay: day }, { merge: true });
        const msg = remindMessage(await unfinishedImportant(fid, person.uid, day));
        if (msg) await sendTo(fid, [person.uid], 'remind', msg, { ignoreQuiet: true });
      }

      if (prefs.types.morning && dueNow(time, prefs.morningAt, raw.morningSentDay, day)) {
        await prefsRef.set({ morningSentDay: day }, { merge: true });
        events ??= (await db.collection(`families/${fid}/events`).get()).docs.map((d) => toEvent(d.id, d.data()));
        const mine = occurrencesOn(events, day).filter((o) => person.role === 'parent' || isFor(o.event, person.uid));
        const msg = morningMessage(todayLine(mine));
        if (msg) await sendTo(fid, [person.uid], 'morning', msg, { ignoreQuiet: true });
      }
    }
  }
});
