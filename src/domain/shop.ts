import { AppError, type Member, type Order, type Reward, type RewardInput, type RewardLimit } from '../backend/types';
import { weekStart } from '../lib/dates';
import type { IconName } from '../lib/sprites';
import { MAX_NOTE, MAX_TITLE } from './quests';
import { MAX_REWARD } from './settings';

export const MAX_PRICE = 10 * MAX_REWARD;
export const MAX_REWARDS = 30;

/** 보상에 붙일 수 있는 아이콘 */
export const REWARD_ICONS: { icon: IconName; name: string }[] = [
  { icon: 'game', name: '게임' },
  { icon: 'snack', name: '간식' },
  { icon: 'movie', name: '영상' },
  { icon: 'balloon', name: '놀이' },
  { icon: 'moon', name: '늦게 자기' },
  { icon: 'shop', name: '선물' },
  { icon: 'coin', name: '용돈' },
  { icon: 'star', name: '특별' },
  { icon: 'heart', name: '소원' },
];

/** 보상을 처음 만들 때 고를 수 있는 예시(가격은 참고용이라 저장 전에 고칠 수 있다) */
export const REWARD_EXAMPLES: RewardInput[] = [
  { title: '게임 30분', note: '', price: 50, icon: 'game', limit: { period: 'day', count: 1 } },
  { title: '먹고 싶은 간식', note: '', price: 30, icon: 'snack', limit: { period: 'none', count: 1 } },
  { title: '주말 영화 보기', note: '', price: 150, icon: 'movie', limit: { period: 'week', count: 1 } },
  { title: '30분 늦게 자기', note: '', price: 80, icon: 'moon', limit: { period: 'week', count: 2 } },
  { title: '가고 싶은 곳 가기', note: '', price: 200, icon: 'balloon', limit: { period: 'none', count: 1 } },
  { title: '갖고 싶은 선물', note: '', price: 300, icon: 'shop', limit: { period: 'none', count: 1 } },
];

export function cleanRewardInput(input: RewardInput): RewardInput {
  const title = input.title.trim();
  const note = input.note.trim();
  if (!title) throw new AppError('보상 이름을 적어 주세요.');
  if (title.length > MAX_TITLE) throw new AppError(`보상 이름은 ${MAX_TITLE}자까지 쓸 수 있어요.`);
  if (note.length > MAX_NOTE) throw new AppError(`설명은 ${MAX_NOTE}자까지 쓸 수 있어요.`);
  if (!Number.isInteger(input.price) || input.price < 1 || input.price > MAX_PRICE) {
    throw new AppError(`가격은 1부터 ${MAX_PRICE} 사이의 숫자로 적어 주세요.`);
  }
  const icon = REWARD_ICONS.some((choice) => choice.icon === input.icon) ? input.icon : 'shop';
  let limit: RewardLimit = { period: 'none', count: 1 };
  if (input.limit.period !== 'none') {
    if (!Number.isInteger(input.limit.count) || input.limit.count < 1 || input.limit.count > 20) {
      throw new AppError('살 수 있는 횟수는 1번에서 20번 사이로 정해 주세요.');
    }
    limit = { period: input.limit.period, count: input.limit.count };
  }
  return { title, note, price: input.price, icon, limit };
}

export function limitLabel(limit: RewardLimit): string {
  if (limit.period === 'day') return `하루 ${limit.count}번`;
  if (limit.period === 'week') return `일주일 ${limit.count}번`;
  return '';
}

/** 신청해 놓고 아직 승인되지 않은 보상에 묶인 코인 */
export function reservedCoins(orders: Order[], uid: string): number {
  return orders.filter((o) => o.uid === uid && o.status === 'requested').reduce((sum, o) => sum + o.price, 0);
}

/** 지금 새로 쓸 수 있는 코인 */
export function availableCoins(member: Member, orders: Order[]): number {
  return member.coins - reservedCoins(orders, member.uid);
}

/** 이번 기간(오늘 또는 이번 주)에 이 보상을 몇 번 샀는지. 거절된 신청은 세지 않는다. */
export function limitUsage(reward: Reward, orders: Order[], uid: string, today: string): { used: number; reached: boolean } {
  if (reward.limit.period === 'none') return { used: 0, reached: false };
  const from = reward.limit.period === 'day' ? today : weekStart(today);
  const used = orders.filter(
    (o) => o.uid === uid && o.rewardId === reward.id && o.status !== 'rejected' && o.requestedDay >= from,
  ).length;
  return { used, reached: used >= reward.limit.count };
}

export type BuyState =
  | { kind: 'ok' }
  | { kind: 'short'; missing: number } // 코인이 모자람
  | { kind: 'limit' }; // 구매 제한에 걸림

/** 이 보상을 지금 신청할 수 있는지 */
export function buyState(reward: Reward, member: Member, orders: Order[], today: string): BuyState {
  if (limitUsage(reward, orders, member.uid, today).reached) return { kind: 'limit' };
  const missing = reward.price - availableCoins(member, orders);
  return missing > 0 ? { kind: 'short', missing } : { kind: 'ok' };
}

/** 신청할 수 없는 이유를 문장으로. 신청할 수 있으면 null. */
export function buyBlockReason(reward: Reward, member: Member, orders: Order[], today: string): string | null {
  const state = buyState(reward, member, orders, today);
  if (state.kind === 'limit') {
    return reward.limit.period === 'day' ? '오늘은 더 바꿀 수 없어요.' : '이번 주에는 더 바꿀 수 없어요.';
  }
  if (state.kind === 'short') return `코인이 ${state.missing}개 모자라요.`;
  return null;
}
