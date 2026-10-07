import { useEffect, useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import { checkinCountToday, latestOf, placeLabel, timeAgo } from '../../domain/location';
import { dayNumber, formatWhen } from '../../lib/dates';
import { currentPosition, geoPermission, type GeoPermission } from '../../lib/geo';
import { Icon } from '../../ui/Sprite';
import { Button } from '../../ui/kit';
import { errorText, useToast } from '../../ui/toast';
import { rememberLocationAllowed } from './auto';
import { useLocations } from './useLocation';

const PERMISSION_TEXT: Record<GeoPermission, string> = {
  granted: '위치 공유 켜짐 · 앱을 열 때와 퀘스트를 끝낼 때도 부모님께 위치가 전해져요.',
  denied: '위치 권한이 꺼져 있어요. 휴대폰 설정에서 이 앱의 위치를 허용해 주세요.',
  prompt: '처음 누르면 위치를 써도 되는지 물어봐요. "허용"을 눌러 주세요.',
  unknown: '누르면 지금 있는 곳이 부모님께 전해져요.',
};

/** 자녀 홈의 "지금 여기예요": 누르면 지금 위치를 가족에게 알리고, 하루 정해진 횟수까지 코인을 받는다. */
export function CheckinCard() {
  const backend = useBackend();
  const { family, me } = useSession();
  const { today } = useFamilyData();
  const { records, places } = useLocations();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<GeoPermission>('unknown');

  useEffect(() => {
    void geoPermission().then(setPermission);
  }, []);

  const { checkinCoins, checkinPerDay } = family.settings;
  const count = checkinCountToday(me.checkin, dayNumber());
  const left = checkinCoins > 0 ? Math.max(0, checkinPerDay - count) : 0;
  const last = latestOf(records, me.uid);
  const lastPlace = last ? placeLabel(places, last) : null;

  async function share() {
    setBusy(true);
    try {
      const fix = await currentPosition(true);
      const result = await backend.shareLocation(family.id, me.uid, fix, 'button');
      rememberLocationAllowed();
      if (result.coins > 0) notify('위치를 알렸어요!');
      else notify(checkinCoins > 0 ? '위치를 알렸어요. 오늘 코인은 다 받았어요.' : '위치를 알렸어요.');
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
      void geoPermission().then(setPermission);
    }
  }

  return (
    <section className="px checkin" aria-label="위치 알리기">
      <div className="card-row">
        <Icon name="pin" size={36} />
        <div className="card-main">
          <h2 className="t-body item-title">지금 여기예요</h2>
          <p className="t-cap">부모님께 지금 위치를 알려요</p>
        </div>
        <Button disabled={busy} onClick={() => void share()}>
          {busy ? '찾는 중...' : '알리기'}
        </Button>
      </div>
      {checkinCoins > 0 && (
        <p className="t-capb">
          {left > 0 ? `누르면 +${checkinCoins}코인 · 오늘 ${count}/${checkinPerDay}번 받음` : `오늘 코인 ${checkinPerDay}번을 다 받았어요`}
        </p>
      )}
      {last && (
        <p className="t-cap">
          마지막으로 알린 때: {timeAgo(last.at) ?? formatWhen(last.at, today)}
          {lastPlace ? ` · ${lastPlace}` : ''}
        </p>
      )}
      <p className="t-cap" style={{ lineHeight: '18px' }}>
        {PERMISSION_TEXT[permission]}
      </p>
    </section>
  );
}
