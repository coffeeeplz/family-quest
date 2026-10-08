import { useEffect, useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { Note } from '../../backend/types';

/** 가족 메모를 구독한다. 읽지 못해도(권한 없음 등) 다른 화면의 불러오기를 막지 않는다. */
export function useNotes(): { notes: Note[]; loading: boolean; failed: boolean } {
  const backend = useBackend();
  const { family } = useSession();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setNotes(null);
    setFailed(false);
    return backend.watchNotes(
      family.id,
      (list) => {
        setNotes(list);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [backend, family.id]);

  return { notes: notes ?? [], loading: notes === null && !failed, failed };
}
