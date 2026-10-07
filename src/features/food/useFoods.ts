import { useEffect, useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { Food } from '../../backend/types';

/** 뭐먹지 목록을 구독한다. 이 화면에서만 쓰므로 다른 화면의 불러오기를 막지 않는다. */
export function useFoods(): { foods: Food[]; loading: boolean; failed: boolean } {
  const backend = useBackend();
  const { family } = useSession();
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFoods(null);
    setFailed(false);
    return backend.watchFoods(
      family.id,
      (list) => {
        setFoods(list);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [backend, family.id]);

  return { foods: foods ?? [], loading: foods === null && !failed, failed };
}
