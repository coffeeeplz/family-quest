import { useEffect, useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { CalendarEvent } from '../../backend/types';

/** 가족 일정을 구독한다. 읽지 못해도(권한 없음 등) 다른 화면의 불러오기를 막지 않는다. */
export function useEvents(): { events: CalendarEvent[]; loading: boolean; failed: boolean } {
  const backend = useBackend();
  const { family } = useSession();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setEvents(null);
    setFailed(false);
    return backend.watchEvents(
      family.id,
      (list) => {
        setEvents(list);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [backend, family.id]);

  return { events: events ?? [], loading: events === null && !failed, failed };
}
