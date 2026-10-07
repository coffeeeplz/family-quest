import { useEffect } from 'react';
import { useBackend, useSession } from '../../app/session';
import { recordAuto } from './auto';

/** 자녀가 앱을 열거나 다시 화면에 띄울 때 위치를 남긴다. 화면에는 아무것도 그리지 않는다. */
export function LocationAuto() {
  const backend = useBackend();
  const { family, me } = useSession();

  useEffect(() => {
    const record = () => {
      if (document.visibilityState === 'visible') void recordAuto(backend, family.id, me.uid, 'open');
    };
    record();
    document.addEventListener('visibilitychange', record);
    return () => document.removeEventListener('visibilitychange', record);
  }, [backend, family.id, me.uid]);

  return null;
}
