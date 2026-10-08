import { HashRouter, Link, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ApprovalsPage } from '../features/approvals/ApprovalsPage';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { HomePage } from '../features/home/HomePage';
import { NotifyPage } from '../features/notify/NotifyPage';
import { PushSync } from '../features/notify/PushSync';
import { useNotes } from '../features/notes/useNotes';
import { useMyBoard } from '../features/quests/QuestCards';
import { isUnreadFor, visibleNotes } from '../domain/notes';
import { Celebrations } from '../features/celebrate/Celebrations';
import { FamilyPage } from '../features/family/FamilyPage';
import { FoodCategoriesPage } from '../features/food/FoodCategoriesPage';
import { FoodPage } from '../features/food/FoodPage';
import { FoodSavedPage } from '../features/food/FoodSavedPage';
import { LedgerPage } from '../features/ledger/LedgerPage';
import { LocationAuto } from '../features/location/LocationAuto';
import { MorePage } from '../features/more/MorePage';
import { QuestFormPage } from '../features/quests/QuestFormPage';
import { QuestListPage } from '../features/quests/QuestListPage';
import { TodayPage } from '../features/quests/TodayPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SettingsSectionPage } from '../features/settings/SettingsSections';
import { RewardFormPage } from '../features/shop/RewardFormPage';
import { ShopAdminPage } from '../features/shop/ShopAdminPage';
import { ShopPage } from '../features/shop/ShopPage';
import { useWishes } from '../features/wishes/useWishes';
import { splitMyWishes, wishesForParent } from '../domain/wishes';
import type { IconName } from '../lib/sprites';
import { Icon } from '../ui/Sprite';
import { useFamilyData } from './familyData';
import { useSession } from './session';

// 파일 하나짜리 체험판은 주소를 바꿀 수 없는 곳에서도 열리므로 주소 없이 화면만 바꾼다.
const Router = import.meta.env.MODE === 'demo' ? MemoryRouter : HashRouter;

interface TabDef {
  to: string;
  label: string;
  icon: IconName;
  count?: number;
  /** 이 탭에 딸린 다른 화면의 주소(그 화면에 있을 때도 탭이 켜진다) */
  also?: string[];
}

/** 더보기 탭 안쪽에 있는 화면들 */
const MORE_PATHS = ['/family', '/log', '/settings', '/notify'];

/**
 * 로그인 뒤의 화면 틀: 주소에 따라 화면을 바꾸고 아래에 탭을 둔다.
 * 새 기능은 여기에 Route 를 추가하고, 자주 쓰면 탭에, 아니면 더보기(MorePage)에 한 줄을 더한다.
 * 탭은 휴대폰에서 다섯 개까지만 둔다.
 */
export function Shell() {
  const { isParent, me } = useSession();
  const { pending, offersForParent, ordersForParent, proposals, today } = useFamilyData();
  const { notes } = useNotes();
  const { remaining } = useMyBoard();
  // 아직 확인하지 않은 가족 메모: 홈 탭에 숫자로 보인다.
  const unreadNotes = visibleNotes(notes, me.uid, today).filter((note) => isUnreadFor(note, me.uid)).length;
  // 자녀가 답할 차례인 코인 협상
  const offersForMe = proposals.filter((p) => p.ownerUid === me.uid && p.status === 'negotiating' && p.lastRole === 'parent').length;
  const { wishes } = useWishes();
  // 보상 제안 가운데 내가 답할 차례인 것: 부모는 홈 탭에, 자녀는 퀘스트 탭에 숫자로 보인다.
  const wishesForMe = isParent ? wishesForParent(wishes).length : splitMyWishes(wishes, me.uid, () => false).toAnswer.length;

  const tabs: TabDef[] = isParent
    ? [
        // 부모의 홈: 가족 메모와 일정, 그리고 답해야 할 승인 카드
        { to: '/home', label: '홈', icon: 'home', count: pending.length + offersForParent.length + ordersForParent.length + wishesForMe + unreadNotes },
        { to: '/quests', label: '퀘스트', icon: 'quest' },
        { to: '/calendar', label: '캘린더', icon: 'calendar' },
        { to: '/food', label: '뭐먹지', icon: 'food' },
        // 부모의 상점 관리는 자주 열지 않으므로 더보기 안에 있다(보상 신청은 승인 탭으로 온다).
        { to: '/more', label: '더보기', icon: 'more', also: [...MORE_PATHS, '/shop'] },
      ]
    : [
        { to: '/home', label: '홈', icon: 'home', count: unreadNotes },
        // 상점은 퀘스트 화면의 버튼으로 들어간다.
        { to: '/quests', label: '퀘스트', icon: 'quest', count: remaining + offersForMe + wishesForMe, also: ['/shop'] },
        { to: '/calendar', label: '캘린더', icon: 'calendar' },
        { to: '/food', label: '뭐먹지', icon: 'food' },
        { to: '/more', label: '더보기', icon: 'more', also: MORE_PATHS },
      ];

  return (
    <Router>
      <Routes>
        {isParent ? (
          <>
            <Route path="/home" element={<ApprovalsPage />} />
            <Route path="/quests" element={<QuestListPage />} />
            <Route path="/quests/new" element={<QuestFormPage />} />
            <Route path="/quests/:questId" element={<QuestFormPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/:section" element={<SettingsSectionPage />} />
            <Route path="/shop" element={<ShopAdminPage />} />
            <Route path="/shop/new" element={<RewardFormPage />} />
            <Route path="/shop/:rewardId" element={<RewardFormPage />} />
            <Route path="/food/categories" element={<FoodCategoriesPage />} />
          </>
        ) : (
          <>
            <Route path="/home" element={<HomePage />} />
            <Route path="/quests" element={<TodayPage />} />
            <Route path="/shop" element={<ShopPage />} />
          </>
        )}
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/food" element={<FoodPage />} />
        <Route path="/food/saved" element={<FoodSavedPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/log" element={<LedgerPage />} />
        <Route path="/family" element={<FamilyPage />} />
        <Route path="/notify" element={<NotifyPage />} />
        <Route path="*" element={<Navigate to={tabs[0].to} replace />} />
      </Routes>

      <TabBar tabs={tabs} />

      {!isParent && <LocationAuto />}
      <Celebrations />
      <PushSync />
    </Router>
  );
}

function TabBar({ tabs }: { tabs: TabDef[] }) {
  const { pathname } = useLocation();
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  return (
    <nav className="tabbar" aria-label="주요 메뉴">
      {tabs.map((tab) => {
        const active = under(tab.to) || (tab.also ?? []).some(under);
        return (
          <Link key={tab.to} to={tab.to} className={active ? 'tab active' : 'tab'} aria-current={active ? 'page' : undefined}>
            <Icon name={tab.icon} size={24} />
            <span>{tab.label}</span>
            {tab.count ? (
              <span className="tab-count" aria-label={`${tab.count}개 대기`}>
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
