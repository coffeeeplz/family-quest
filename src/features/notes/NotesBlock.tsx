import { useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Member, Note } from '../../backend/types';
import { timeAgo } from '../../domain/location';
import { NOTE_LINES, canEditNote, isUnreadFor, noteReceiptText, noteTargetText, noteUntilText, visibleNotes } from '../../domain/notes';
import { formatWhen } from '../../lib/dates';
import { Avatar, Icon } from '../../ui/Sprite';
import { Button, Fold, Sheet } from '../../ui/kit';
import { useAction, useToast } from '../../ui/toast';
import { NoteSheet } from './NoteSheet';
import { useNotes } from './useNotes';

type Open = { kind: 'new' } | { kind: 'view'; id: string } | { kind: 'edit'; note: Note } | null;

/**
 * 홈 화면의 가족 메모: 아직 확인하지 않은 메모는 큰 카드로, 나머지는 한 줄로 보여 준다.
 * 한 줄을 누르면 전체 내용과 누가 확인했는지가 나온다.
 */
export function NotesBlock() {
  const backend = useBackend();
  const { family, me, members, isParent } = useSession();
  const { today } = useFamilyData();
  const { notes, failed } = useNotes();
  const { busy, run } = useAction();
  const notify = useToast();
  const [open, setOpen] = useState<Open>(null);

  /** 지우기 = 홈에서 내리기. 기록(캘린더)에는 남고, 잠깐 동안 되돌릴 수 있다. */
  async function remove(note: Note) {
    const ok = await run(() => backend.hideNote(family.id, note.id, true));
    if (!ok) return;
    setOpen(null);
    notify('메모를 지웠어요. 캘린더에는 남아요.', {
      label: '되돌리기',
      run: () => void run(() => backend.hideNote(family.id, note.id, false), '메모를 되돌렸어요.'),
    });
  }

  const mine = visibleNotes(notes, me.uid, today);
  const unread = mine.filter((note) => isUnreadFor(note, me.uid));
  const rest = mine.filter((note) => !isUnreadFor(note, me.uid));
  const memberOf = (uid: string): Member | undefined => members.find((member) => member.uid === uid);
  const nameOf = (uid: string) => memberOf(uid)?.displayName ?? '알 수 없음';
  const when = (note: Note) => timeAgo(note.createdAt) ?? formatWhen(note.createdAt, today);
  const viewing = open?.kind === 'view' ? mine.find((note) => note.id === open.id) : undefined;

  /** 한 줄 오른쪽에 보일 상태: 내가 쓴 메모는 누가 확인했는지, 받은 메모는 '확인함' */
  const stateOf = (note: Note) => (note.createdBy === me.uid ? noteReceiptText(note, members) : note.readBy.includes(me.uid) ? '확인함' : '');

  const line = (note: Note) => {
    const author = memberOf(note.createdBy);
    return (
      <button key={note.id} type="button" className="px today-line note-line" aria-label={`${nameOf(note.createdBy)}의 메모: ${note.text}. 자세히 보기`} onClick={() => setOpen({ kind: 'view', id: note.id })}>
        {author ? <Avatar avatar={author.avatar} size={24} /> : <Icon name="log" size={24} />}
        <span className="t-capb">{nameOf(note.createdBy)}</span>
        <span className="t-cap grow">{note.text}</span>
        {stateOf(note) && <span className="t-cap note-state">{stateOf(note)}</span>}
      </button>
    );
  };

  return (
    <section className="stack" aria-label="가족 메모" style={{ gap: 12 }}>
      <div className="section-head" style={{ alignItems: 'center' }}>
        <h2 className="t-title">가족 메모</h2>
        <Button tone="plain" onClick={() => setOpen({ kind: 'new' })}>
          + 메모
        </Button>
      </div>

      {failed && (
        <p className="px note t-capb" role="alert" style={{ lineHeight: '18px' }}>
          메모를 불러오지 못했어요. 앱을 닫았다가 다시 열어 주세요.
        </p>
      )}

      {unread.map((note) => {
        const author = memberOf(note.createdBy);
        return (
          <article key={note.id} className="card is-wait">
            <div className="card-row" style={{ alignItems: 'flex-start' }}>
              {author ? <Avatar avatar={author.avatar} size={36} /> : <Icon name="log" size={36} />}
              <div className="card-main">
                <p className="t-cap">
                  {nameOf(note.createdBy)} → {note.toUids.length === 0 ? '가족 모두' : noteTargetText(note, members)} · {when(note)}
                </p>
                <p className="t-body note-text">{note.text}</p>
              </div>
            </div>
            <div className="stack" style={{ marginTop: 14 }}>
              <Button tone="mint" block disabled={busy} aria-label={`${nameOf(note.createdBy)}의 메모 확인했어요`} onClick={() => void run(() => backend.markNoteRead(family.id, note.id, me.uid))}>
                확인했어요
              </Button>
            </div>
          </article>
        );
      })}

      {rest.slice(0, NOTE_LINES).map(line)}
      {rest.length > NOTE_LINES && (
        <Fold title="지난 메모" summary={`${rest.length - NOTE_LINES}개`}>
          {rest.slice(NOTE_LINES).map(line)}
        </Fold>
      )}
      {!failed && mine.length === 0 && <p className="t-cap">남겨 둔 메모가 없어요. 가족에게 전할 말을 적어 보세요.</p>}

      {viewing && (
        <Sheet title="가족 메모" onClose={() => setOpen(null)}>
          <div className="card-row" style={{ alignItems: 'flex-start' }}>
            {memberOf(viewing.createdBy) ? <Avatar avatar={memberOf(viewing.createdBy)!.avatar} size={36} /> : <Icon name="log" size={36} />}
            <div className="card-main">
              <p className="t-cap">
                {nameOf(viewing.createdBy)} → {noteTargetText(viewing, members)} · {when(viewing)}
              </p>
              <p className="t-body note-text">{viewing.text}</p>
            </div>
          </div>
          <p className="t-cap">
            {noteUntilText(viewing, today)}
            {noteReceiptText(viewing, members) ? ` · ${noteReceiptText(viewing, members)}` : ''}
          </p>
          {canEditNote(viewing, me.uid, isParent) ? (
            <div className="action-row">
              <Button big onClick={() => setOpen({ kind: 'edit', note: viewing })}>
                고치기
              </Button>
              <Button tone="plain" big disabled={busy} onClick={() => void remove(viewing)}>
                지우기
              </Button>
            </div>
          ) : (
            <p className="t-cap">메모는 쓴 사람과 부모님만 고치거나 지울 수 있어요.</p>
          )}
          <Button tone="plain" big block onClick={() => setOpen(null)}>
            닫기
          </Button>
        </Sheet>
      )}
      {open?.kind === 'new' && <NoteSheet note={null} onClose={() => setOpen(null)} />}
      {open?.kind === 'edit' && <NoteSheet note={open.note} onClose={() => setOpen(null)} />}
    </section>
  );
}
