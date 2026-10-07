import { useEffect, useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import { checkinCountToday } from '../../domain/location';
import { dayNumber } from '../../lib/dates';
import { currentPosition, geoPermission, type GeoPermission } from '../../lib/geo';
import { Icon } from '../../ui/Sprite';
import { Button, Sheet } from '../../ui/kit';
import { errorText, useToast } from '../../ui/toast';
import { rememberLocationAllowed } from './auto';

const NOTICE_KEY = 'family-quest-location-notice';

export const PERMISSION_TEXT: Record<GeoPermission, string> = {
  granted: '위치 공유가 켜져 있어요. "지금 여기예요"를 누를 때, 앱을 열 때, 퀘스트를 끝낼 때 부모님께 위치가 전해져요.',
  denied: '위치 권한이 꺼져 있어요. 휴대폰 설정에서 이 앱의 위치를 허용하면 쓸 수 있어요.',
  prompt: '아직 위치를 허용하지 않았어요. 퀘스트 화면의 "지금 여기예요"를 누르면 허용할지 물어봐요.',
  unknown: '"지금 여기예요"를 누르면 지금 있는 곳이 부모님께 전해져요.',
};

function noticeSeen(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * 자녀 홈의 "지금 여기예요" 버튼: 누르면 지금 위치를 가족에게 알리고, 하루 정해진 횟수까지 코인을 받는다.
 * 처음 성공했을 때 한 번, 위치가 언제 전해지는지 알려 준다.
 */
export function CheckinButton() {
  const backend = useBackend();
  const { family, me } = useSession();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(false);

  const { checkinCoins, checkinPerDay } = family.settings;
  const count = checkinCountToday(me.checkin, dayNumber());
  const coinLeft = checkinCoins > 0 && count < checkinPerDay;

  async function share() {
    setBusy(true);
    try {
      const fix = await currentPosition(true);
      const result = await backend.shareLocation(family.id, me.uid, fix, 'button');
      rememberLocationAllowed();
      if (result.coins > 0) notify(`위치를 알렸어요! 오늘 ${count + 1}/${checkinPerDay}번째 코인`);
      else notify(checkinCoins > 0 ? '위치를 알렸어요. 오늘 코인은 다 받았어요.' : '위치를 알렸어요.');
      if (!noticeSeen()) {
        setNotice(true);
        try {
          localStorage.setItem(NOTICE_KEY, '1');
        } catch {
          // 저장이 막혀 있으면 안내가 다음에도 보일 뿐이다.
        }
      }
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button tone="mint" className="with-corner" disabled={busy} aria-label="지금 여기예요: 부모님께 위치 알리기" onClick={() => void share()}>
        <Icon name="pin" size={24} />
        {busy ? '찾는 중...' : '지금 여기예요'}
        {coinLeft && !busy && (
          <span className="corner-badge" aria-label={`누르면 코인 ${checkinCoins}개`}>
            +{checkinCoins}
          </span>
        )}
      </Button>
      {notice && (
        <Sheet title="위치 공유가 켜졌어요" onClose={() => setNotice(false)}>
          <p className="t-body">{PERMISSION_TEXT.granted}</p>
          <p className="t-cap">더보기의 "위치 공유"에서 언제든 다시 볼 수 있어요.</p>
          <Button big block onClick={() => setNotice(false)}>
            알겠어요
          </Button>
        </Sheet>
      )}
    </>
  );
}

/** 더보기에 두는 한 줄: 위치 공유가 켜져 있는지와 언제 전해지는지 알려 준다. */
export function LocationInfoRow() {
  const [permission, setPermission] = useState<GeoPermission>('unknown');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void geoPermission().then(setPermission);
  }, []);

  const status = permission === 'granted' ? '켜짐' : permission === 'denied' ? '꺼짐' : '아직 허용 안 함';
  return (
    <>
      <button type="button" className="px list-button menu-row" onClick={() => setOpen(true)}>
        <Icon name="pin" size={36} />
        <span className="card-main">
          <span className="t-body item-title">위치 공유</span>
          <span className="t-cap">{status}</span>
        </span>
        <span className="t-title" aria-hidden="true">
          ›
        </span>
      </button>
      {open && (
        <Sheet title="위치 공유" onClose={() => setOpen(false)}>
          <p className="t-body">{PERMISSION_TEXT[permission]}</p>
          <p className="t-cap">앱을 꺼 둔 동안에는 위치가 전해지지 않아요. 기록은 가족만 볼 수 있고 7일 뒤에 지워져요.</p>
          <Button tone="plain" big block onClick={() => setOpen(false)}>
            닫기
          </Button>
        </Sheet>
      )}
    </>
  );
}
