// 이 기기(브라우저)의 알림 준비 상태를 살핀다.

const DEVICE_KEY = 'family-quest-push-device';
const ON_KEY = 'family-quest-push-on';

/** 아이폰·아이패드인지(아이패드는 PC 처럼 보이기도 한다) */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** 홈 화면에 추가한 앱으로 열었는지 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true;
}

/** 이 브라우저가 웹 푸시를 받을 수 있는지 */
export function pushCapable(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** 이 기기를 가리키는 이름(처음 한 번 만들어 이 기기에 저장한다) */
export function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'd-unknown';
  }
}

/** 이 기기에서 누구의 알림을 켜 두었는지 기억한다(가족 id:uid). */
export function markPushOn(familyId: string, uid: string): void {
  try {
    localStorage.setItem(ON_KEY, `${familyId}:${uid}`);
  } catch {
    // 저장이 막혀 있으면 상태를 다시 물어볼 뿐이다.
  }
}

export function markPushOff(): void {
  try {
    localStorage.removeItem(ON_KEY);
  } catch {
    // 무시해도 된다.
  }
}

export function isPushMarkedOn(familyId: string, uid: string): boolean {
  try {
    return localStorage.getItem(ON_KEY) === `${familyId}:${uid}`;
  } catch {
    return false;
  }
}

/** 앱의 서비스 워커가 준비될 때까지 기다린다(너무 오래 걸리면 포기한다). */
export function serviceWorkerReady(timeoutMs = 10_000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('서비스 워커가 준비되지 않았어요.')), timeoutMs)),
  ]);
}
