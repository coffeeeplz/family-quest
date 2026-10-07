import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LedgerEntry, Order, Preset, Proposal, Quest, Reward, Run } from '../backend/types';
import { MISSED_DAYS } from '../domain/settings';
import { addDays, dateKey } from '../lib/dates';
import { useBackend, useSession } from './session';

export interface FamilyData {
  /** 오늘 날짜(YYYY-MM-DD). 자정이 지나면 바뀐다. */
  today: string;
  quests: Quest[];
  runs: Run[];
  ledger: LedgerEntry[];
  presets: Preset[];
  /** 자녀가 직접 추가한 할 일(메모, 협상 중, 오늘 끝낸 메모) */
  proposals: Proposal[];
  /** 확인을 기다리는 완료 요청(오래된 것부터) */
  pending: Run[];
  /** 부모의 답을 기다리는 코인 제안 */
  offersForParent: Proposal[];
  /** 상점에 올라 있는 보상(싼 것부터) */
  rewards: Reward[];
  /** 진행 중인 보상 신청과 최근 일주일의 신청 기록 */
  orders: Order[];
  /** 부모의 승인을 기다리는 보상 신청 */
  ordersForParent: Order[];
  loading: boolean;
}

const FamilyDataContext = createContext<FamilyData | null>(null);

export function useFamilyData(): FamilyData {
  const data = useContext(FamilyDataContext);
  if (!data) throw new Error('FamilyDataContext 가 없습니다.');
  return data;
}

/** 앱을 켜 둔 채 날짜가 바뀌어도 '오늘'이 따라오게 한다. */
function useToday(): string {
  const [today, setToday] = useState(() => dateKey());
  useEffect(() => {
    const check = () => setToday(dateKey());
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

/** 가족의 퀘스트, 수행 기록, 장부 등을 한 번만 구독해서 모든 화면이 함께 쓴다. */
export function FamilyDataProvider({ children }: { children: ReactNode }) {
  const backend = useBackend();
  const { family } = useSession();
  const today = useToday();
  const [quests, setQuests] = useState<Quest[] | undefined>(undefined);
  const [runs, setRuns] = useState<Run[] | undefined>(undefined);
  const [ledger, setLedger] = useState<LedgerEntry[] | undefined>(undefined);
  const [presets, setPresets] = useState<Preset[] | undefined>(undefined);
  const [proposals, setProposals] = useState<Proposal[] | undefined>(undefined);
  const [rewards, setRewards] = useState<Reward[] | undefined>(undefined);
  const [orders, setOrders] = useState<Order[] | undefined>(undefined);

  useEffect(() => {
    const stops = [
      backend.watchQuests(family.id, setQuests),
      backend.watchLedger(family.id, setLedger),
      backend.watchPresets(family.id, setPresets),
      backend.watchRewards(family.id, setRewards),
    ];
    return () => stops.forEach((stop) => stop());
  }, [backend, family.id]);

  // 날짜에 따라 범위가 달라지는 것들: 놓친 일을 보여 주려면 며칠 전 기록까지 필요하다.
  useEffect(() => {
    const stops = [
      backend.watchRuns(family.id, addDays(today, -Math.max(7, MISSED_DAYS)), setRuns),
      backend.watchProposals(family.id, today, setProposals),
      // 구매 제한(하루, 일주일)을 세려면 이번 주의 신청 기록이 필요하다.
      backend.watchOrders(family.id, addDays(today, -7), setOrders),
    ];
    return () => stops.forEach((stop) => stop());
  }, [backend, family.id, today]);

  const value = useMemo<FamilyData>(() => {
    const allRuns = runs ?? [];
    const allProposals = proposals ?? [];
    const allOrders = orders ?? [];
    return {
      today,
      quests: quests ?? [],
      runs: allRuns,
      ledger: ledger ?? [],
      presets: presets ?? [],
      proposals: allProposals,
      pending: allRuns.filter((r) => r.status === 'submitted').sort((a, b) => a.submittedAt - b.submittedAt),
      offersForParent: allProposals
        .filter((p) => p.status === 'negotiating' && p.lastRole === 'child')
        .sort((a, b) => a.createdAt - b.createdAt),
      rewards: rewards ?? [],
      orders: allOrders,
      ordersForParent: allOrders.filter((o) => o.status === 'requested').sort((a, b) => a.requestedAt - b.requestedAt),
      loading: [quests, runs, ledger, presets, proposals, rewards, orders].some((list) => list === undefined),
    };
  }, [today, quests, runs, ledger, presets, proposals, rewards, orders]);

  return <FamilyDataContext.Provider value={value}>{children}</FamilyDataContext.Provider>;
}
