import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useSession } from '../../app/session';
import type { LedgerEntry, Order, Reward } from '../../backend/types';
import { coinScene, gainsOf, goalJustReached, latestAt, missedGains } from '../../domain/celebrate';
import { reservedCoins } from '../../domain/shop';
import { armSound, buzz, markCelebrating, playTune, reducedMotion } from '../../lib/feedback';
import type { IconName } from '../../lib/sprites';
import { Said } from '../stickers/StickerAttach';
import { Icon } from '../../ui/Sprite';

type Scene =
  | { kind: 'coins'; id: string; entries: LedgerEntry[]; away: boolean }
  | { kind: 'goal'; id: string; reward: Reward }
  | { kind: 'reward'; id: string; order: Order };

/** 장면이 떠 있는 시간(ms) */
const SHOW_MS = { coins: 2600, away: 4500, goal: 3000, reward: 2800 };
/** 잔액이 장부보다 먼저 바뀌는 경우가 있어, 목표 달성 장면은 조금 기다렸다가 넣는다. */
const GOAL_DELAY_MS = 400;

const seenKey = (uid: string) => `family-quest-coins-seen-${uid}`;

function readSeenAt(uid: string): number | null {
  try {
    const raw = localStorage.getItem(seenKey(uid));
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeSeenAt(uid: string, at: number): void {
  try {
    const before = readSeenAt(uid) ?? 0;
    localStorage.setItem(seenKey(uid), String(Math.max(before, at)));
  } catch {
    // 저장이 막혀 있으면 "그동안 받은 코인"을 못 보여 줄 뿐이다.
  }
}

function useVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const check = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  return visible;
}

/**
 * 축하 장면: 코인이 들어올 때, 목표 저금통을 채웠을 때, 신청한 보상이 승인됐을 때.
 * 장면은 줄을 세워 하나씩 보여 주고, 화면이 꺼져 있는 동안 생긴 장면은 다시 켰을 때 보여 준다.
 * 앱을 꺼 둔 사이 받은 코인은 다음에 열 때 "그동안" 장면으로 한 번에 보여 준다.
 */
export function Celebrations() {
  const { me } = useSession();
  const { ledger, orders, rewards, loading } = useFamilyData();
  const visible = useVisible();
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const [queue, setQueue] = useState<Scene[]>([]);

  useEffect(() => armSound(), []);

  const goal = rewards.find((reward) => reward.id === me.goalRewardId);
  const reserved = reservedCoins(orders, me.uid);

  /** 코인 장면을 줄에 넣는다. 아직 화면에 나오지 않은 코인 장면이 있으면 거기에 합친다. */
  const pushCoins = useCallback((entries: LedgerEntry[], away: boolean) => {
    setQueue((current) => {
      const showing = visibleRef.current ? 1 : 0;
      const at = current.findIndex((scene, index) => index >= showing && scene.kind === 'coins');
      if (at >= 0) {
        const found = current[at] as Extract<Scene, { kind: 'coins' }>;
        const merged: Scene = { ...found, entries: [...found.entries, ...entries], away: found.away || away };
        return current.map((scene, index) => (index === at ? merged : scene));
      }
      const scene: Scene = { kind: 'coins', id: entries[0].id, entries, away };
      // 목표 달성 장면보다 코인 장면이 먼저 나오게 한다.
      const goalAt = current.findIndex((item, index) => index >= showing && item.kind === 'goal');
      if (goalAt >= 0) return [...current.slice(0, goalAt), scene, ...current.slice(goalAt)];
      return [...current, scene];
    });
  }, []);

  // ── 코인이 들어온 내역 ─────────────────────────────────────────────────────
  const seenIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    const gains = gainsOf(ledger, me.uid);
    if (seenIds.current === null) {
      seenIds.current = new Set(gains.map((entry) => entry.id));
      const lastSeen = readSeenAt(me.uid);
      if (lastSeen === null) {
        // 이 기기에서 처음: 지금까지의 내역은 이미 본 것으로 친다.
        writeSeenAt(me.uid, latestAt(gains));
        return;
      }
      const missed = missedGains(gains, lastSeen);
      if (missed.length === 0) return;
      pushCoins(missed, true);
      const total = missed.reduce((sum, entry) => sum + entry.amount, 0);
      if (goalJustReached(goal, me.coins, total, reserved)) {
        setQueue((current) => [...current, { kind: 'goal', id: `goal-${goal!.id}-${missed[0].id}`, reward: goal! }]);
      }
      return;
    }
    const fresh = gains.filter((entry) => !seenIds.current!.has(entry.id));
    if (fresh.length === 0) return;
    fresh.forEach((entry) => seenIds.current!.add(entry.id));
    pushCoins(fresh, !visibleRef.current);
    // 목표 달성은 아래에서 잔액이 바뀌는 순간에 따로 살핀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, loading, me.uid, pushCoins]);

  // ── 목표 저금통을 채운 순간 ─────────────────────────────────────────────────
  const reachable = goal !== undefined && me.coins - reserved >= goal.price;
  const before = useRef<{ coins: number; reachable: boolean; goalId: string | null } | null>(null);
  useEffect(() => {
    if (loading) return;
    const prev = before.current;
    before.current = { coins: me.coins, reachable, goalId: goal?.id ?? null };
    if (!prev || !goal) return;
    // 코인이 늘어서 채운 경우만(목표를 바꾸거나 신청을 취소해서 채워진 것은 아니다).
    if (!reachable || prev.reachable || prev.goalId !== goal.id || me.coins <= prev.coins) return;
    const scene: Scene = { kind: 'goal', id: `goal-${goal.id}-${me.coins}`, reward: goal };
    const timer = window.setTimeout(() => setQueue((current) => [...current, scene]), GOAL_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me.coins, reachable, goal?.id]);

  // ── 신청한 보상이 승인된 순간 ───────────────────────────────────────────────
  const seenOrders = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    const approved = orders.filter((order) => order.uid === me.uid && order.status !== 'requested' && order.status !== 'rejected');
    if (seenOrders.current === null) {
      seenOrders.current = new Set(approved.map((order) => order.id));
      return;
    }
    const fresh = approved.filter((order) => !seenOrders.current!.has(order.id));
    if (fresh.length === 0) return;
    fresh.forEach((order) => seenOrders.current!.add(order.id));
    setQueue((current) => [...current, ...fresh.map((order): Scene => ({ kind: 'reward', id: `order-${order.id}`, order }))]);
  }, [orders, loading, me.uid]);

  // ── 맨 앞 장면을 보여 주고, 시간이 지나면 다음으로 ──────────────────────────
  const current = visible ? queue[0] : undefined;
  const currentId = current?.id;
  const next = useCallback((id: string) => setQueue((items) => (items[0]?.id === id ? items.slice(1) : items)), []);

  useEffect(() => {
    if (!current) return;
    const ms = current.kind === 'coins' ? (current.away ? SHOW_MS.away : SHOW_MS.coins) : SHOW_MS[current.kind];
    markCelebrating(ms);
    if (current.kind === 'coins') {
      writeSeenAt(me.uid, latestAt(current.entries));
      const big = coinScene(current.entries).streak;
      playTune(big ? 'big' : 'coin');
      buzz(big ? [60, 50, 60, 50, 160] : [50, 60, 110]);
    } else if (current.kind === 'goal') {
      playTune('big');
      buzz([60, 50, 60, 50, 160]);
    } else {
      playTune('reward');
      buzz([80, 60, 160]);
    }
    const timer = window.setTimeout(() => next(current.id), ms);
    return () => window.clearTimeout(timer);
    // 장면이 바뀔 때만 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, next, me.uid]);

  if (!current) return null;

  if (current.kind === 'reward') {
    return (
      <div className="celebrate" key={current.id} role="status" style={{ animationDuration: `${SHOW_MS.reward}ms` }}>
        <Rain count={10} pieces={['star']} seed={current.id} />
        <Icon name={current.order.icon as IconName} size={96} className="coin" />
        <div className="t-title celebrate-title">보상 획득!</div>
        <div className="t-body celebrate-note">{current.order.rewardTitle}</div>
        <div className="t-capb">인벤토리에 들어갔어요</div>
      </div>
    );
  }

  if (current.kind === 'goal') {
    return (
      <div className="celebrate is-big" key={current.id} role="status" style={{ animationDuration: `${SHOW_MS.goal}ms` }}>
        <Rain count={18} pieces={['star', 'coin']} seed={current.id} />
        <Icon name={current.reward.icon as IconName} size={96} className="coin" />
        <div className="t-title celebrate-title">목표 달성!</div>
        <div className="t-body celebrate-note">{current.reward.title}</div>
        <div className="t-capb">코인을 다 모았어요. 상점에서 바꿀 수 있어요!</div>
      </div>
    );
  }

  const scene = coinScene(current.entries);
  const ms = current.away ? SHOW_MS.away : SHOW_MS.coins;
  return (
    <div
      className={`celebrate${scene.streak ? ' is-big' : ''}${current.away ? ' is-away' : ''}`}
      key={current.id}
      role="status"
      style={{ animationDuration: `${ms}ms` }}
      // 그동안 받은 코인은 내역이 길 수 있으니, 다 읽었으면 눌러서 바로 닫을 수 있다.
      onClick={current.away ? () => next(current.id) : undefined}
    >
      <Rain count={scene.rain} pieces={scene.streak ? ['coin', 'star'] : ['coin']} seed={current.id} />
      <Icon name={scene.streak ? 'star' : 'coin'} size={96} className="coin" />
      {current.away && <div className="t-capb">그동안 받은 코인</div>}
      <div className="t-title celebrate-title">+{scene.total} 코인!</div>
      {scene.streak && <div className="t-capb celebrate-badge">연속 달성 보너스!</div>}
      {scene.lines.map((line, index) => (
        <div key={index} className="t-capb">
          {line}
        </div>
      ))}
      {scene.more > 0 && <div className="t-cap">외 {scene.more}건</div>}
      {scene.note && (
        <div className="t-body celebrate-note">
          <Said said={scene.note} size={48} />
        </div>
      )}
      {current.away && <div className="t-cap">화면을 누르면 닫혀요</div>}
    </div>
  );
}

/** 위에서 쏟아지는 도트 그림. 움직임을 줄인 기기에서는 그리지 않는다. */
function Rain({ count, pieces, seed }: { count: number; pieces: IconName[]; seed: string }) {
  const drops = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        icon: pieces[index % pieces.length],
        left: Math.round(Math.random() * 92),
        delay: Math.round(Math.random() * 900),
        fall: 1100 + Math.round(Math.random() * 900),
        size: Math.random() < 0.35 ? 36 : 24,
      })),
    // 장면마다 한 번만 정한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed],
  );
  if (reducedMotion()) return null;
  return (
    <div className="rain" aria-hidden="true">
      {drops.map((drop, index) => (
        <span
          key={index}
          className="drop"
          style={{ left: `${drop.left}%`, animationDelay: `${drop.delay}ms`, animationDuration: `${drop.fall}ms` } as CSSProperties}
        >
          <Icon name={drop.icon} size={drop.size} />
        </span>
      ))}
    </div>
  );
}
