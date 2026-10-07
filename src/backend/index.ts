import { isFirebaseConfigured } from '../config/firebase';
import type { Backend } from './types';

/** 설정이 있으면 Firebase, 없으면 체험 모드 저장소를 불러온다. */
export async function loadBackend(): Promise<Backend> {
  // 체험판 전용 빌드(--mode demo)에서는 Firebase 코드를 아예 싣지 않는다.
  if (import.meta.env.MODE !== 'demo' && isFirebaseConfigured) {
    const { createFirebaseBackend } = await import('./firebase');
    return createFirebaseBackend();
  }
  const { createDemoBackend } = await import('./demo');
  return createDemoBackend();
}
