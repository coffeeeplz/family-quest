import { useEffect } from 'react';
import { serviceWorkerReady } from '../../lib/pushDevice';

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** 휴대폰 알림창에 쌓인 우리 앱 알림을 지운다(앱을 열었으면 본 것으로 친다). */
async function clearShownNotifications() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await serviceWorkerReady(3000);
    const shown = await registration.getNotifications();
    shown.forEach((notification) => notification.close());
  } catch {
    // 알림을 지원하지 않거나 서비스 워커가 아직 없으면 그냥 둔다.
  }
}

/** 앱 아이콘 숫자를 맞춘다. 0 이면 숫자를 지운다. */
function setBadge(count: number) {
  const nav = navigator as BadgeNavigator;
  try {
    if (count > 0) void nav.setAppBadge?.(count)?.catch(() => {});
    else void nav.clearAppBadge?.()?.catch(() => {});
  } catch {
    // 숫자를 지원하지 않는 휴대폰
  }
}

/**
 * 앱 아이콘의 숫자 = 아직 확인하지 않은 것(답할 승인, 안 읽은 메모, 내 차례인 협상).
 * 앱을 열거나 다시 볼 때 알림창의 알림을 지우고 숫자를 다시 맞춘다. 화면에는 아무것도 그리지 않는다.
 */
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    setBadge(count);
  }, [count]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void clearShownNotifications();
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);

  // 알림을 지운 뒤 휴대폰이 숫자를 지웠을 수 있으므로, 다시 볼 때마다 숫자를 다시 적는다.
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') setBadge(count);
    };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [count]);

  return null;
}
