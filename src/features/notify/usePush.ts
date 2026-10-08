import { useCallback, useEffect, useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { PushStatus } from '../../backend/types';

/** 이 기기의 알림 상태. 켜거나 끈 뒤에는 reload 로 다시 읽는다. */
export function usePushStatus(): { status: PushStatus | null; reload: () => void } {
  const backend = useBackend();
  const { family, me } = useSession();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const reload = useCallback(() => {
    void backend.pushStatus(family.id, me.uid).then(setStatus, () => setStatus('unsupported'));
  }, [backend, family.id, me.uid]);
  useEffect(reload, [reload]);
  return { status, reload };
}
