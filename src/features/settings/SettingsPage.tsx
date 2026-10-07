import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useSession } from '../../app/session';
import type { IconName } from '../../lib/sprites';
import { Icon } from '../../ui/Sprite';
import { BackLink } from '../../ui/kit';
import { useLocations } from '../location/useLocation';

interface Item {
  to: string;
  icon: IconName;
  title: string;
  /** 지금 값을 한 줄로 */
  now: string;
}

/**
 * 부모용 가족 설정의 첫 화면: 항목과 지금 값만 보여 준다.
 * 내용은 항목을 눌러 들어간 화면(SettingsSectionPage)에서 고친다.
 * 설정이 늘어나면 여기에 한 줄, SettingsSections 에 화면 하나를 더한다.
 */
export function SettingsPage() {
  const { family } = useSession();
  const { presets } = useFamilyData();
  const { places } = useLocations();
  const s = family.settings;

  const items: Item[] = [
    { to: '/settings/negotiation', icon: 'coin', title: '코인 협상', now: `제안 ${s.maxRounds}번까지 · 한 번에 ${s.maxProposalCoins}코인까지` },
    { to: '/settings/streak', icon: 'star', title: '연속 달성 보너스', now: s.streakOn ? `${s.streakDays}일마다 ${s.streakBonus}코인` : '꺼짐' },
    { to: '/settings/praises', icon: 'heart', title: '칭찬 한마디', now: s.praises.length > 0 ? `${s.praises.length}개` : '없음' },
    { to: '/settings/presets', icon: 'quest', title: '자주 쓰는 퀘스트 버튼', now: presets.length > 0 ? `${presets.length}개` : '없음' },
    { to: '/settings/checkin', icon: 'pin', title: '위치 공유 코인', now: s.checkinCoins > 0 ? `${s.checkinCoins}코인 · 하루 ${s.checkinPerDay}번` : '코인 없이 위치만' },
    { to: '/settings/places', icon: 'home', title: '장소', now: places.length > 0 ? places.map((p) => p.name).join(', ') : '없음' },
    { to: '/food/categories', icon: 'food', title: '뭐먹지 분류', now: s.foodCategories.map((c) => c.name).join(', ') },
  ];

  return (
    <main className="screen">
      <BackLink />
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">가족 설정</h1>
          <p className="t-cap">부모만 바꿀 수 있어요</p>
        </div>
      </header>

      <nav className="stack" aria-label="설정 항목">
        {items.map((item) => (
          <Link key={item.to} className="px list-button menu-row" to={item.to}>
            <Icon name={item.icon} size={36} />
            <span className="card-main">
              <span className="t-body item-title">{item.title}</span>
              <span className="t-cap">{item.now}</span>
            </span>
            <span className="t-title" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
