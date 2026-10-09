import type { Order } from '../backend/types';

/** 인벤토리에서 같은 보상을 한 줄로 묶은 것: "게임 30분 ×3" */
export interface InventoryGroup {
  key: string;
  title: string;
  icon: string;
  /** 먼저 승인된 것부터. 쓸 때는 맨 앞의 것을 쓴다. */
  orders: Order[];
}

/** 지난 기록의 한 달 묶음 */
export interface UsedMonth {
  /** YYYY-MM */
  month: string;
  orders: Order[];
}

/** 이 자녀가 가지고 있는(승인됐지만 아직 안 쓴) 보상을 같은 보상끼리 묶는다. 오래된 것부터 */
export function inventoryGroups(orders: Order[], uid: string): InventoryGroup[] {
  const owned = orders.filter((o) => o.uid === uid && o.status === 'approved').sort((a, b) => (a.decidedAt ?? 0) - (b.decidedAt ?? 0));
  const groups = new Map<string, InventoryGroup>();
  for (const order of owned) {
    // 같은 보상이라도 이름이나 그림이 바뀌었으면 따로 보여 준다.
    const key = `${order.rewardId}|${order.rewardTitle}|${order.icon}`;
    const group = groups.get(key) ?? { key, title: order.rewardTitle, icon: order.icon, orders: [] };
    group.orders.push(order);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** 가지고 있는 보상의 수 */
export function ownedCount(orders: Order[], uid: string): number {
  return orders.filter((o) => o.uid === uid && o.status === 'approved').length;
}

const monthOf = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** 다 쓴 보상을 달별로. 최근 것부터 */
export function usedByMonth(orders: Order[], uid: string): UsedMonth[] {
  const used = orders
    .filter((o) => o.uid === uid && o.status === 'delivered')
    .sort((a, b) => (b.deliveredAt ?? b.decidedAt ?? 0) - (a.deliveredAt ?? a.decidedAt ?? 0));
  const months: UsedMonth[] = [];
  for (const order of used) {
    const month = monthOf(order.deliveredAt ?? order.decidedAt ?? order.requestedAt);
    const last = months[months.length - 1];
    if (last?.month === month) last.orders.push(order);
    else months.push({ month, orders: [order] });
  }
  return months;
}

/** '2026-10' → '2026년 10월' */
export const monthLabel = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`;
