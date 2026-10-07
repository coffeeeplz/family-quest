import { useEffect, useRef, useState } from 'react';
import { HashRouter, Link, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ApprovalsPage } from '../features/approvals/ApprovalsPage';
import { FamilyPage } from '../features/family/FamilyPage';
import { FoodPage } from '../features/food/FoodPage';
import { LedgerPage } from '../features/ledger/LedgerPage';
import { LocationAuto } from '../features/location/LocationAuto';
import { MorePage } from '../features/more/MorePage';
import { QuestFormPage } from '../features/quests/QuestFormPage';
import { QuestListPage } from '../features/quests/QuestListPage';
import { TodayPage } from '../features/quests/TodayPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { RewardFormPage } from '../features/shop/RewardFormPage';
import { ShopAdminPage } from '../features/shop/ShopAdminPage';
import { ShopPage } from '../features/shop/ShopPage';
import type { LedgerEntry, Order } from '../backend/types';
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
const MORE_PATHS = ['/family', '/log', '/settings'];

/**
 * 로그인 뒤의 화면 틀: 주소에 따라 화면을 바꾸고 아래에 탭을 둔다.
 * 새 기능은 여기에 Route 를 추가하고, 자주 쓰면 탭에, 아니면 더보기(MorePage)에 한 줄을 더한다.
 * 탭은 휴대폰에서 다섯 개까지만 둔다.
 */
export function Shell() {
  const { isParent } = useSession();
  const { pending, offersForParent, ordersForParent } = useFamilyData();

  const tabs: TabDef[] = isParent
    ? [
        { to: '/approve', label: '승인', icon: 'check_inbox', count: pending.length + offersForParent.length + ordersForParent.length },
        { to: '/quests', label: '퀘스트', icon: 'quest' },
        { to: '/shop', label: '상점', icon: 'shop' },
        { to: '/food', label: '뭐먹지', icon: 'food' },
        { to: '/more', label: '더보기', icon: 'more', also: MORE_PATHS },
      ]
    : [
        { to: '/quests', label: '퀘스트', icon: 'quest' },
        { to: '/shop', label: '상점', icon: 'shop' },
        { to: '/food', label: '뭐먹지', icon: 'food' },
        { to: '/more', label: '더보기', icon: 'more', also: MORE_PATHS },
      ];

  return (
    <Router>
      <Routes>
        {isParent ? (
          <>
            <Route path="/approve" element={<ApprovalsPage />} />
            <Route path="/quests" element={<QuestListPage />} />
            <Route path="/quests/new" element={<QuestFormPage />} />
            <Route path="/quests/:questId" element={<QuestFormPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/shop" element={<ShopAdminPage />} />
            <Route path="/shop/new" element={<RewardFormPage />} />
            <Route path="/shop/:rewardId" element={<RewardFormPage />} />
          </>
        ) : (
          <>
            <Route path="/quests" element={<TodayPage />} />
            <Route path="/shop" element={<ShopPage />} />
          </>
        )}
        <Route path="/food" element={<FoodPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/log" element={<LedgerPage />} />
        <Route path="/family" element={<FamilyPage />} />
        <Route path="*" element={<Navigate to={tabs[0].to} replace />} />
      </Routes>

      <TabBar tabs={tabs} />

      {!isParent && <LocationAuto />}
      <CoinCelebration />
      <RewardCelebration />
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

/** 내 장부에 코인이 새로 들어오는 순간(승인, 보너스, 칭찬 코인) 획득 연출을 보여 준다. */
function CoinCelebration() {
  const { me } = useSession();
  const { ledger, loading } = useFamilyData();
  const seen = useRef<Set<string> | null>(null);
  const [gain, setGain] = useState<LedgerEntry[] | null>(null);

  useEffect(() => {
    if (loading) return;
    const mine = ledger.filter((entry) => entry.uid === me.uid && entry.amount > 0);
    if (seen.current === null) {
      // 처음 불러온 기록은 이미 본 것으로 친다.
      seen.current = new Set(mine.map((entry) => entry.id));
      return;
    }
    const fresh = mine.filter((entry) => !seen.current!.has(entry.id));
    if (fresh.length === 0) return;
    fresh.forEach((entry) => seen.current!.add(entry.id));
    setGain(fresh);
  }, [ledger, loading, me.uid]);

  useEffect(() => {
    if (!gain) return;
    const timer = window.setTimeout(() => setGain(null), 2800);
    return () => window.clearTimeout(timer);
  }, [gain]);

  if (!gain) return null;
  const total = gain.reduce((sum, entry) => sum + entry.amount, 0);
  const notes = gain.map((entry) => entry.note).filter(Boolean);
  return (
    <div className="celebrate" key={gain[0].id} role="status">
      <Icon name="coin" size={96} className="coin" />
      <div className="t-title" style={{ fontSize: 36, lineHeight: '40px' }}>
        +{total} 코인!
      </div>
      {gain.map((entry) => (
        <div key={entry.id} className="t-capb">
          {entry.memo} +{entry.amount}
        </div>
      ))}
      {notes.length > 0 && <div className="t-body celebrate-note">"{notes[0]}"</div>}
    </div>
  );
}

/** 내가 신청한 보상이 승인되는 순간 알려 준다. */
function RewardCelebration() {
  const { me } = useSession();
  const { orders, loading } = useFamilyData();
  const seen = useRef<Set<string> | null>(null);
  const [won, setWon] = useState<Order | null>(null);

  useEffect(() => {
    if (loading) return;
    const approved = orders.filter((order) => order.uid === me.uid && order.status !== 'requested' && order.status !== 'rejected');
    if (seen.current === null) {
      seen.current = new Set(approved.map((order) => order.id));
      return;
    }
    const fresh = approved.filter((order) => !seen.current!.has(order.id));
    if (fresh.length === 0) return;
    fresh.forEach((order) => seen.current!.add(order.id));
    setWon(fresh[0]);
  }, [orders, loading, me.uid]);

  useEffect(() => {
    if (!won) return;
    const timer = window.setTimeout(() => setWon(null), 2800);
    return () => window.clearTimeout(timer);
  }, [won]);

  if (!won) return null;
  return (
    <div className="celebrate" key={won.id} role="status">
      <Icon name={won.icon as IconName} size={96} className="coin" />
      <div className="t-title" style={{ fontSize: 36, lineHeight: '40px' }}>
        보상 획득!
      </div>
      <div className="t-body celebrate-note">{won.rewardTitle}</div>
      <div className="t-capb">부모님께 말하면 받을 수 있어요</div>
    </div>
  );
}
