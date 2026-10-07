import { AppError, type Checkin, type FamilySettings, type LocationFix, type LocationRecord, type LocationTrigger, type Place, type PlaceInput } from '../backend/types';

/** 위치 기록을 며칠 치 보관할지 */
export const LOCATION_KEEP_DAYS = 7;
/** 자동 기록 사이의 최소 간격(앱을 열 때마다 쌓이지 않게) */
export const AUTO_MIN_INTERVAL_MS = 15 * 60_000;
export const MAX_PLACES = 20;
export const MAX_PLACE_NAME = 20;
export const DEFAULT_PLACE_RADIUS = 150;
export const PLACE_RADIUS_CHOICES = [100, 150, 300, 500];

const DAY_MS = 86_400_000;

export const locationsSince = (now: number = Date.now()) => now - LOCATION_KEEP_DAYS * DAY_MS;

/** 기기가 준 좌표를 검사하고 저장하기 좋게 다듬는다. */
export function cleanFix(fix: LocationFix): LocationFix {
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (!ok(fix.lat) || !ok(fix.lng) || fix.lat < -90 || fix.lat > 90 || fix.lng < -180 || fix.lng > 180) {
    throw new AppError('위치를 알 수 없어요. 잠시 뒤에 다시 해 주세요.');
  }
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const accuracy = ok(fix.accuracy) ? Math.min(100_000, Math.max(0, Math.round(fix.accuracy))) : 0;
  return { lat: round(fix.lat), lng: round(fix.lng), accuracy };
}

/** 두 지점 사이의 거리(미터) */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 이 위치가 등록해 둔 장소 근처인지. 여러 곳이 겹치면 가장 가까운 곳. */
export function nearestPlace(places: Place[], fix: { lat: number; lng: number }): Place | null {
  let best: Place | null = null;
  let bestDistance = Infinity;
  for (const place of places) {
    const d = distanceMeters(place, fix);
    if (d <= place.radius && d < bestDistance) {
      best = place;
      bestDistance = d;
    }
  }
  return best;
}

/** "학원 근처" 또는 등록한 장소가 아니면 null */
export function placeLabel(places: Place[], fix: { lat: number; lng: number }): string | null {
  const place = nearestPlace(places, fix);
  return place ? `${place.name} 근처` : null;
}

/** "오차 약 30m" */
export function accuracyLabel(accuracy: number): string {
  if (accuracy <= 0) return '';
  if (accuracy >= 1000) return `오차 약 ${(accuracy / 1000).toFixed(1)}km`;
  return `오차 약 ${Math.max(10, Math.round(accuracy / 10) * 10)}m`;
}

export const TRIGGER_LABEL: Record<LocationTrigger, string> = {
  button: '직접 알림',
  open: '앱을 열 때',
  quest: '퀘스트를 끝낼 때',
};

/** 지도 앱으로 여는 주소 */
export function mapLinks(fix: { lat: number; lng: number }, name: string): { google: string; kakao: string } {
  const point = `${fix.lat},${fix.lng}`;
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${point}`,
    kakao: `https://map.kakao.com/link/map/${encodeURIComponent(name)},${point}`,
  };
}

/** 구글 패밀리 링크(자녀의 실시간 위치는 여기서 본다) */
export const FAMILY_LINK_URL = 'https://familylink.google.com/';

export interface CheckinPlan {
  coins: number;
  dayNum: number;
  count: number;
  /** 장부에 남길 기록의 id. 같은 날 같은 순번으로는 두 번 받을 수 없다. */
  ledgerId: string;
}

/** 오늘 위치 공유 코인을 이미 몇 번 받았는지 */
export function checkinCountToday(checkin: Checkin | null, todayNum: number): number {
  return checkin && checkin.dayNum === todayNum ? checkin.count : 0;
}

/**
 * 이번 위치 공유로 코인을 받을 수 있는지 계산한다. 받을 수 없으면 null.
 * 서버 규칙(firestore.rules 의 validCheckinUpdate)이 같은 조건을 다시 검사한다.
 */
export function planCheckin(uid: string, checkin: Checkin | null, settings: FamilySettings, todayNum: number): CheckinPlan | null {
  if (settings.checkinCoins <= 0) return null;
  // 기기 시계가 뒤로 간 경우: 이미 더 나중 날짜로 받은 기록이 있으면 주지 않는다.
  if (checkin && checkin.dayNum > todayNum) return null;
  const count = checkinCountToday(checkin, todayNum) + 1;
  if (count > settings.checkinPerDay) return null;
  return { coins: settings.checkinCoins, dayNum: todayNum, count, ledgerId: `checkin_${uid}_${todayNum}_${count}` };
}

export function cleanPlaceInput(input: PlaceInput): PlaceInput {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) throw new AppError('장소 이름을 적어 주세요.');
  if (name.length > MAX_PLACE_NAME) throw new AppError(`장소 이름은 ${MAX_PLACE_NAME}자까지 쓸 수 있어요.`);
  const point = cleanFix({ lat: input.lat, lng: input.lng, accuracy: 0 });
  if (!Number.isInteger(input.radius) || input.radius < 50 || input.radius > 1000) {
    throw new AppError('장소의 범위는 50m에서 1000m 사이로 정해 주세요.');
  }
  return { name, lat: point.lat, lng: point.lng, radius: input.radius };
}

/** 한 사람의 가장 최근 위치 기록(목록은 최근 것부터 정렬되어 있다) */
export function latestOf(records: LocationRecord[], uid: string): LocationRecord | null {
  return records.find((record) => record.uid === uid) ?? null;
}

/** "방금", "12분 전", "3시간 전". 하루가 넘으면 null(날짜로 보여 주는 편이 낫다). */
export function timeAgo(at: number, now: number = Date.now()): string | null {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}시간 전`;
  return null;
}
