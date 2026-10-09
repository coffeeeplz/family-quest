import { useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Note } from '../../backend/types';
import { MAX_NOTE_TEXT } from '../../domain/notes';
import { Avatar } from '../../ui/Sprite';
import { Button, Field, FieldGroup, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';

interface Props {
  /** 고칠 메모. null 이면 새로 남긴다. */
  note: Note | null;
  onClose: () => void;
}

/** 메모를 남기거나 고치는 창: 내용, 누구에게 보일지, 언제 사라질지를 정한다. */
export function NoteSheet({ note, onClose }: Props) {
  const backend = useBackend();
  const { family, me, members } = useSession();
  const { today } = useFamilyData();
  const { busy, run } = useAction();
  const [text, setText] = useState(note?.text ?? '');
  const [toUids, setToUids] = useState<string[]>(note?.toUids ?? []);
  const [dated, setDated] = useState(Boolean(note?.until));
  const [until, setUntil] = useState(note?.until || today);

  // 받을 사람은 메모를 쓴 사람을 뺀 가족
  const authorUid = note?.createdBy ?? me.uid;
  const others = members.filter((member) => member.uid !== authorUid);
  const toggle = (uid: string) => setToUids(toUids.includes(uid) ? toUids.filter((id) => id !== uid) : [...toUids, uid]);

  async function save() {
    const input = { text, toUids, until: dated ? until : '' };
    const ok = note
      ? await run(() => backend.updateNote(family.id, note.id, input), '메모를 고쳤어요.')
      : await run(() => backend.createNote(family.id, input, me.uid), '메모를 남겼어요.');
    if (ok) onClose();
  }

  return (
    <Sheet title={note ? '메모 고치기' : '메모 남기기'} onClose={onClose}>
      <Field label="메모" hint={`${text.length}/${MAX_NOTE_TEXT}자`}>
        {(id) => (
          <textarea
            id={id}
            className="input area"
            rows={3}
            value={text}
            maxLength={MAX_NOTE_TEXT}
            placeholder="예: 학원 끝나면 전화해 줘"
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>

      <div className="field" role="group" aria-label="누구에게 보일까요?">
        <div className="label">누구에게 보일까요?</div>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={toUids.length === 0} onClick={() => setToUids([])}>
            가족 모두
          </button>
          {others.map((member) => (
            <button key={member.uid} type="button" className="chip" aria-pressed={toUids.includes(member.uid)} onClick={() => toggle(member.uid)}>
              <Avatar avatar={member.avatar} size={24} />
              {member.displayName}
            </button>
          ))}
        </div>
      </div>

      <FieldGroup label="언제까지 보일까요?">
        <div className="segmented">
          <button type="button" role="radio" className="chip" aria-checked={!dated} onClick={() => setDated(false)}>
            지울 때까지
          </button>
          <button type="button" role="radio" className="chip" aria-checked={dated} onClick={() => setDated(true)}>
            날짜 정하기
          </button>
        </div>
      </FieldGroup>
      {dated && (
        <Field label="이날까지 홈에 보여요(캘린더에는 남아요)">
          {(id) => <input id={id} className="input" type="date" value={until} min={today} onChange={(event) => setUntil(event.target.value)} />}
        </Field>
      )}

      <Button big block disabled={busy} onClick={() => void save()}>
        {note ? '고친 내용 저장하기' : '메모 남기기'}
      </Button>
      {note && <p className="t-cap center">내용을 고치면 받은 사람이 다시 확인해요.</p>}
      <Button tone="plain" big block onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}
