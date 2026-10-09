import { useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Member, Note } from '../../backend/types';
import { canEditNote, isNoteOnHome, noteTargetText, notesOnDay } from '../../domain/notes';
import { Avatar, Icon } from '../../ui/Sprite';
import { Button, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';

const clock = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * 캘린더에서 고른 날의 메모: 그날 남긴 메모가 홈에서 지웠더라도 기록으로 남아 보인다.
 * 홈에서 지운 메모는 다시 올릴 수 있고, 부모는 기록에서 완전히 지울 수 있다.
 */
export function DayNotes({ day, notes }: { day: string; notes: Note[] }) {
  const backend = useBackend();
  const { family, me, members, isParent } = useSession();
  const { today } = useFamilyData();
  const { busy, run } = useAction();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const list = notesOnDay(notes, day, me.uid, isParent);
  if (list.length === 0) return null;
  const memberOf = (uid: string): Member | undefined => members.find((member) => member.uid === uid);
  const nameOf = (uid: string) => memberOf(uid)?.displayName ?? '알 수 없음';
  const viewing = list.find((note) => note.id === openId);

  function close() {
    setOpenId(null);
    setConfirmDelete(false);
  }

  async function act(work: () => Promise<void>, done: string) {
    if (await run(work, done)) close();
  }

  return (
    <section className="stack" aria-label="이날의 메모" style={{ gap: 12 }}>
      <h2 className="t-capb">이날의 메모</h2>
      {list.map((note) => {
        const author = memberOf(note.createdBy);
        return (
          <button
            key={note.id}
            type="button"
            className="px cal-item memo"
            aria-label={`${nameOf(note.createdBy)}의 메모: ${note.text}`}
            onClick={() => setOpenId(note.id)}
          >
            {author ? <Avatar avatar={author.avatar} size={24} /> : <Icon name="log" size={24} />}
            <span className="card-main">
              <span className="t-body note-text">{note.text}</span>
              <span className="t-cap">
                {nameOf(note.createdBy)} · {clock(note.createdAt)}
                {isNoteOnHome(note, today) ? ' · 홈에 있음' : ''}
              </span>
            </span>
          </button>
        );
      })}

      {viewing && (
        <Sheet title="이날의 메모" onClose={close}>
          <p className="t-cap">
            {nameOf(viewing.createdBy)} → {noteTargetText(viewing, members)} · {clock(viewing.createdAt)}
          </p>
          <p className="t-body note-text">{viewing.text}</p>
          {viewing.hiddenAt > 0 && canEditNote(viewing, me.uid, isParent) && (
            <Button big block disabled={busy} onClick={() => void act(() => backend.hideNote(family.id, viewing.id, false), '홈에 다시 올렸어요.')}>
              홈에 다시 올리기
            </Button>
          )}
          {isParent &&
            (confirmDelete ? (
              <Button tone="plain" big block disabled={busy} onClick={() => void act(() => backend.deleteNote(family.id, viewing.id), '기록에서 지웠어요.')}>
                되돌릴 수 없어요. 한 번 더 누르면 지워요
              </Button>
            ) : (
              <button type="button" className="link" onClick={() => setConfirmDelete(true)}>
                기록에서 완전히 지우기
              </button>
            ))}
          <Button tone="plain" big block onClick={close}>
            닫기
          </Button>
        </Sheet>
      )}
    </section>
  );
}
