import { useEffect, useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { Order } from '../../backend/types';

/** 이 자녀가 다 쓴 보상 전체. 읽지 못해도 다른 화면을 막지 않는다. */
export function useUsedOrders(uid: string): { used: Order[]; failed: boolean } {
  const backend = useBackend();
  const { family } = useSession();
  const [used, setUsed] = useState<Order[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    return backend.watchUsedOrders(
      family.id,
      uid,
      (list) => {
        setUsed(list);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, [backend, family.id, uid]);

  return { used, failed };
}
