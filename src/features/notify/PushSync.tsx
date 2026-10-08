import { useEffect } from 'react';
import { useBackend, useSession } from '../../app/session';

/** 앱을 열 때마다 이 기기의 알림 주소를 새로 적어 둔다(주소는 가끔 바뀐다). 화면에는 아무것도 그리지 않는다. */
export function PushSync() {
  const backend = useBackend();
  const { family, me } = useSession();
  useEffect(() => {
    void backend.refreshPush(family.id, me.uid);
  }, [backend, family.id, me.uid]);
  return null;
}
