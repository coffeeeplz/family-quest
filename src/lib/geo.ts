import { AppError, type LocationFix } from '../backend/types';

export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

/** 이 기기와 브라우저가 위치를 알려 줄 수 있는지 */
export function geoSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/** 위치 권한의 현재 상태. 알 수 없는 브라우저에서는 unknown. */
export async function geoPermission(): Promise<GeoPermission> {
  if (!geoSupported()) return 'denied';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unknown';
  }
}

/**
 * 지금 위치를 한 번 물어본다. 권한을 아직 묻지 않았다면 이때 묻는다.
 * fresh 가 true 면 조금 전에 재 둔 위치를 다시 쓰지 않고 새로 잰다.
 */
export function currentPosition(fresh = false): Promise<LocationFix> {
  return new Promise((resolve, reject) => {
    if (!geoSupported()) {
      reject(new AppError('이 기기에서는 위치를 쓸 수 없어요.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new AppError('위치 권한이 꺼져 있어요. 휴대폰 설정에서 이 앱의 위치를 허용해 주세요.'));
        } else {
          reject(new AppError('지금은 위치를 찾지 못했어요. 잠시 뒤에 다시 해 주세요.'));
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: fresh ? 0 : 60_000 },
    );
  });
}
