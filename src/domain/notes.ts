import { AppError, type Member, type Note, type NoteInput } from '../backend/types';
import { dateKey, formatShortDay, isDateKey } from '../lib/dates';
import { findSticker } from './stickers';

export const MAX_NOTE_TEXT = 100;
/** 홈에 함께 둘 수 있는 메모의 수(내린 메모는 세지 않는다) */
export const MAX_NOTES = 30;
/** 홈에서 한 줄로 보여 주는 메모의 수. 넘는 것은 접어 둔다. */
export const NOTE_LINES = 5;

/** 메모 입력값을 검사한다. 받는 사람에서 쓴 사람과 가족이 아닌 사람은 뺀다. */
export function cleanNoteInput(input: NoteInput, memberUids: string[], authorUid: string, today: string): Required<NoteInput> {
  const text = input.text.trim();
  if (!text) throw new AppError('메모를 적어 주세요.');
  if (text.length > MAX_NOTE_TEXT) throw new AppError(`메모는 ${MAX_NOTE_TEXT}자까지 쓸 수 있어요.`);
  const toUids = [...new Set(input.toUids)].filter((uid) => uid !== authorUid && memberUids.includes(uid));
  if (input.toUids.length > 0 && toUids.length === 0) throw new AppError('메모를 받을 사람을 골라 주세요.');
  let until = '';
  if (input.until) {
    if (!isDateKey(input.until)) throw new AppError('사라질 날짜를 다시 골라 주세요.');
    if (input.until < today) throw new AppError('사라질 날짜는 오늘보다 앞설 수 없어요.');
    until = input.until;
  }
  // 모르는 스티커는 붙이지 않는다(가지고 있는지는 저장하는 쪽에서 본다).
  const sticker = input.sticker && findSticker(input.sticker) ? input.sticker : '';
  return { text, toUids, until, sticker };
}

/** 이 사람에게 보내는 메모인지(가족 모두에게 보내는 메모 포함) */
export function isNoteFor(note: Note, uid: string): boolean {
  return note.toUids.length === 0 || note.toUids.includes(uid);
}

/** 사라질 날짜가 지났는지 */
export function isNoteExpired(note: Note, today: string): boolean {
  return note.until !== '' && note.until < today;
}

/** 홈에 떠 있는 메모인지: 내리지 않았고 사라질 날짜도 지나지 않았다 */
export function isNoteOnHome(note: Note, today: string): boolean {
  return note.hiddenAt === 0 && !isNoteExpired(note, today);
}

/** 홈에 떠 있는 메모의 수 */
export function activeNoteCount(notes: Note[], today: string): number {
  return notes.filter((note) => isNoteOnHome(note, today)).length;
}

/** 이 사람의 홈에 보일 메모: 내가 썼거나 나에게 온 것 중 홈에 떠 있는 것. 새 것부터 */
export function visibleNotes(notes: Note[], uid: string, today: string): Note[] {
  return notes
    .filter((note) => isNoteOnHome(note, today) && (note.createdBy === uid || isNoteFor(note, uid)))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 기록(캘린더)에서 볼 수 있는 메모인지: 쓴 사람, 받은 사람, 그리고 부모 */
export function canSeeNoteRecord(note: Note, uid: string, isParent: boolean): boolean {
  return isParent || note.createdBy === uid || isNoteFor(note, uid);
}

/** 메모를 남긴 날(YYYY-MM-DD) */
export const noteDay = (note: Note): string => dateKey(new Date(note.createdAt));

/** 그날 남긴 메모 중 이 사람이 볼 수 있는 것. 먼저 쓴 것부터 */
export function notesOnDay(notes: Note[], day: string, uid: string, isParent: boolean): Note[] {
  return notes.filter((note) => noteDay(note) === day && canSeeNoteRecord(note, uid, isParent)).sort((a, b) => a.createdAt - b.createdAt);
}

/** 이 사람이 볼 수 있는 메모가 있는 날들(달력의 점) */
export function noteDays(notes: Note[], uid: string, isParent: boolean): Set<string> {
  return new Set(notes.filter((note) => canSeeNoteRecord(note, uid, isParent)).map(noteDay));
}

/** 내가 아직 확인하지 않은, 남이 보낸 메모인지 */
export function isUnreadFor(note: Note, uid: string): boolean {
  return note.createdBy !== uid && isNoteFor(note, uid) && !note.readBy.includes(uid);
}

/** 이 메모를 확인해야 하는 사람들(쓴 사람 제외) */
export function noteReaders(note: Note, members: Member[]): Member[] {
  return members.filter((member) => member.uid !== note.createdBy && isNoteFor(note, member.uid));
}

/** '가족 모두', '딸', '아빠, 엄마' */
export function noteTargetText(note: Note, members: Member[]): string {
  if (note.toUids.length === 0) return '가족 모두';
  const names = members.filter((member) => note.toUids.includes(member.uid)).map((member) => member.displayName);
  return names.length > 0 ? names.join(', ') : '가족';
}

/** 쓴 사람에게 보여 주는 확인 상황: '딸 확인 · 엄마 아직'. 모두 확인했으면 '모두 확인' */
export function noteReceiptText(note: Note, members: Member[]): string {
  const readers = noteReaders(note, members);
  if (readers.length === 0) return '';
  const read = readers.filter((member) => note.readBy.includes(member.uid));
  const waiting = readers.filter((member) => !note.readBy.includes(member.uid));
  if (waiting.length === 0) return readers.length === 1 ? `${readers[0].displayName} 확인` : '모두 확인';
  return [
    read.length > 0 ? `${read.map((member) => member.displayName).join(', ')} 확인` : '',
    `${waiting.map((member) => member.displayName).join(', ')} 아직`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** 고치기와 (홈에서) 지우기는 쓴 사람과 부모만 */
export function canEditNote(note: Note, uid: string, isParent: boolean): boolean {
  return isParent || note.createdBy === uid;
}

/** '지울 때까지 보여요', '10월 12일까지 보여요' */
export function noteUntilText(note: Pick<Note, 'until'>, today: string): string {
  return note.until ? `${formatShortDay(note.until, today)}까지 보여요` : '지울 때까지 보여요';
}
