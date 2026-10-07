import { useEffect, useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { LocationRecord, Place } from '../../backend/types';
import { locationsSince } from '../../domain/location';

/**
 * 최근 위치 기록과 등록한 장소를 구독한다. 위치를 보여 주는 화면에서만 쓰므로
 * 읽지 못해도(권한 없음 등) 다른 화면의 불러오기를 막지 않는다.
 */
export function useLocations(): { records: LocationRecord[]; places: Place[]; failed: boolean } {
  const backend = useBackend();
  const { family, isParent } = useSession();
  const [records, setRecords] = useState<LocationRecord[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const since = locationsSince();
    const stops = [
      backend.watchLocations(family.id, since, setRecords, () => setFailed(true)),
      backend.watchPlaces(family.id, setPlaces, () => setFailed(true)),
    ];
    // 보관 기간이 지난 기록은 부모가 앱을 열 때 정리한다.
    if (isParent) void backend.pruneLocations(family.id, since).catch(() => undefined);
    return () => stops.forEach((stop) => stop());
  }, [backend, family.id, isParent]);

  return { records, places, failed };
}
