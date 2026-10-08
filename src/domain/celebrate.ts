import type { LedgerEntry, Reward } from '../backend/types';

/** 연출 한 장면에 보여 줄 내역의 최대 줄 수 */
export const MAX_SCENE_LINES = 4;
/** 쏟아지는 코인의 최소·최대 개수 */
const MIN_RAIN = 8;
const MAX_RAIN = 28;

/** 코인이 들어온 내역만(쓴 내역 제외) */
export function gainsOf(ledger: LedgerEntry[], uid: string): LedgerEntry[] {
  return ledger.filter((entry) => entry.uid === uid && entry.amount > 0);
}

/** 내역 가운데 가장 늦은 시각. 내역이 없으면 0 */
export function latestAt(entries: LedgerEntry[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.at), 0);
}

/** 마지막으로 본 시각 뒤에 들어온 내역(앱을 꺼 둔 사이 받은 코인). 오래된 것부터 */
export function missedGains(gains: LedgerEntry[], lastSeenAt: number): LedgerEntry[] {
  return gains.filter((entry) => entry.at > lastSeenAt).sort((a, b) => a.at - b.at);
}

export interface CoinScene {
  total: number;
  /** '수학 문제집 2쪽 +10' 같은 줄. MAX_SCENE_LINES 까지만 */
  lines: string[];
  /** 줄 수를 넘겨서 보여 주지 못한 내역의 수 */
  more: number;
  /** 함께 온 칭찬 한마디(가장 최근 것) */
  note: string;
  /** 연속 달성 보너스가 들어 있으면 더 크게 축하한다. */
  streak: boolean;
  /** 쏟아지는 코인의 개수 */
  rain: number;
}

/** 새로 들어온 내역들을 한 장면으로 묶는다. */
export function coinScene(entries: LedgerEntry[]): CoinScene {
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const notes = entries.map((entry) => entry.note).filter(Boolean);
  return {
    total,
    lines: entries.slice(0, MAX_SCENE_LINES).map((entry) => `${entry.memo} +${entry.amount}`),
    more: Math.max(0, entries.length - MAX_SCENE_LINES),
    note: notes[notes.length - 1] ?? '',
    streak: entries.some((entry) => entry.type === 'bonus'),
    rain: Math.min(MAX_RAIN, Math.max(MIN_RAIN, total)),
  };
}

/**
 * 이번에 받은 코인으로 목표 저금통을 처음 채웠는지.
 * coins 는 지금 잔액, gained 는 방금 받은 코인, reserved 는 신청한 보상에 묶인 코인.
 */
export function goalJustReached(goal: Reward | undefined, coins: number, gained: number, reserved: number): boolean {
  if (!goal || gained <= 0) return false;
  const usable = coins - reserved;
  return usable >= goal.price && usable - gained < goal.price;
}
