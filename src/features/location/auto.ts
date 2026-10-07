import type { Backend } from '../../backend/types';
import { AUTO_MIN_INTERVAL_MS } from '../../domain/location';
import { currentPosition, geoPermission } from '../../lib/geo';

const lastKey = (uid: string) => `family-quest-location-auto-${uid}`;
const OK_KEY = 'family-quest-location-ok';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장이 막혀 있으면 다음에도 같은 판단을 다시 할 뿐이다.
  }
}

/** 직접 눌러서 위치를 알리는 데 성공했음을 기억해 둔다(권한 상태를 알려 주지 않는 브라우저용). */
export function rememberLocationAllowed() {
  write(OK_KEY, '1');
}

/** 권한 창을 띄우지 않고 위치를 읽을 수 있는 상태인지 */
export async function canLocateQuietly(): Promise<boolean> {
  const state = await geoPermission();
  if (state === 'granted') return true;
  if (state === 'unknown') return read(OK_KEY) === '1';
  return false;
}

/**
 * 앱을 열 때와 퀘스트를 끝낼 때 위치를 조용히 남긴다.
 * 이미 위치 권한을 허용한 경우에만 동작하고, 실패해도 알리지 않는다.
 */
export async function recordAuto(backend: Backend, familyId: string, uid: string, trigger: 'open' | 'quest'): Promise<void> {
  try {
    if (!(await canLocateQuietly())) return;
    // 앱을 여닫을 때마다 쌓이지 않게 간격을 둔다. 퀘스트 완료는 그때의 위치가 중요하므로 짧게 둔다.
    const gap = trigger === 'open' ? AUTO_MIN_INTERVAL_MS : 60_000;
    const last = Number(read(lastKey(uid)) ?? 0);
    if (Date.now() - last < gap) return;
    write(lastKey(uid), String(Date.now()));
    const fix = await currentPosition();
    await backend.shareLocation(familyId, uid, fix, trigger);
  } catch {
    // 자동 기록은 실패해도 사용에 지장이 없다.
  }
}
