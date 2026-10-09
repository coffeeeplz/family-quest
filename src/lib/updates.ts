import { useSyncExternalStore } from 'react';
import { APP_VERSION, CHANGELOG, compareVersions } from '../domain/changelog';

// 이 기기에서 마지막으로 본 업데이트 소식의 버전
const KEY = 'family-quest-seen-version';
const listeners = new Set<() => void>();
/** 기록이 없는 기기는 바로 앞 버전까지 본 것으로 둔다: 이번 소식만 한 번 "새로"로 보인다. */
const before = CHANGELOG[1]?.version ?? APP_VERSION;

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? before;
  } catch {
    return APP_VERSION;
  }
}

function write(version: string) {
  try {
    localStorage.setItem(KEY, version);
  } catch {
    // 저장이 막혀 있으면 표시가 다시 보일 뿐이다.
  }
  listeners.forEach((listener) => listener());
}

export function markUpdatesSeen() {
  if (read() !== APP_VERSION) write(APP_VERSION);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 아직 보지 않은 업데이트 소식이 있는지 */
export function useHasNewUpdate(): boolean {
  const seen = useSyncExternalStore(subscribe, read, () => APP_VERSION);
  return compareVersions(APP_VERSION, seen) > 0;
}

/** 소식 화면에서 "새로" 표시를 붙일 기준: 화면을 연 순간의 본 버전 */
export function seenVersion(): string {
  return read();
}
