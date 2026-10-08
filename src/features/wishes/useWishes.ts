import { useEffect, useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { Wish } from '../../backend/types';

/** 자녀의 보상 제안을 구독한다. 읽지 못해도(권한 없음 등) 다른 화면의 불러오기를 막지 않는다. */
export function useWishes(): { wishes: Wish[]; loading: boolean; failed: boolean } {
  const backend = useBackend();
  const { family } = useSession();
  const [wishes, setWishes] = useState<Wish[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setWishes(null);
    setFailed(false);
    return backend.watchWishes(
      family.id,
      (list) => {
        setWishes(list);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [backend, family.id]);

  return { wishes: wishes ?? [], loading: wishes === null && !failed, failed };
}
