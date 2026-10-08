import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../ui/Sprite';
import { usePushStatus } from './usePush';

const DISMISS_KEY = 'family-quest-push-nudge';

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** 홈의 한 줄 안내: 이 기기에서 알림을 아직 켜지 않았으면 켜러 가는 길을 보여 준다. */
export function PushNudge() {
  const { status } = usePushStatus();
  const [hidden, setHidden] = useState(dismissed);
  if (hidden || (status !== 'off' && status !== 'install')) return null;
  return (
    <div className="row push-nudge" style={{ gap: 8 }}>
      <Link className="px today-line grow" to="/notify" aria-label="알림 켜러 가기">
        <Icon name="heart" size={24} />
        <span className="t-cap grow">{status === 'install' ? '홈 화면에 추가하면 알림을 받을 수 있어요' : '알림을 켜면 승인과 메모를 바로 받아요'}</span>
        <span className="t-capb" aria-hidden="true">
          ›
        </span>
      </Link>
      <button
        type="button"
        className="link"
        aria-label="알림 안내 닫기"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(DISMISS_KEY, '1');
          } catch {
            // 다음에 다시 보일 뿐이다.
          }
        }}
      >
        닫기
      </button>
    </div>
  );
}
