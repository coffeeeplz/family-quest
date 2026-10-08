import { AppError, type FamilySettings, type Role, type Wish, type WishInput } from '../backend/types';
import { MAX_NOTE, MAX_TITLE } from './quests';
import { MAX_PRICE, REWARD_ICONS } from './shop';

/** 자녀 한 명이 동시에 걸어 둘 수 있는 제안의 수 */
export const MAX_OPEN_WISHES = 3;
/** 거절하며 남기는 한마디의 길이 */
export const MAX_DECLINE_NOTE = 40;
/** 끝난 제안(합의, 거절)을 목록에 남겨 두는 기간(일) */
export const WISH_KEEP_DAYS = 7;

/** 자녀가 적은 보상 제안을 검사한다. */
export function cleanWishInput(input: WishInput): WishInput {
  const title = input.title.trim();
  const note = input.note.trim();
  if (!title) throw new AppError('갖고 싶은 보상의 이름을 적어 주세요.');
  if (title.length > MAX_TITLE) throw new AppError(`보상 이름은 ${MAX_TITLE}자까지 쓸 수 있어요.`);
  if (note.length > MAX_NOTE) throw new AppError(`설명은 ${MAX_NOTE}자까지 쓸 수 있어요.`);
  const icon = REWARD_ICONS.some((choice) => choice.icon === input.icon) ? input.icon : 'shop';
  return { title, note, icon, price: cleanWishPrice(input.price) };
}

export function cleanWishPrice(price: number): number {
  if (!Number.isInteger(price) || price < 1 || price > MAX_PRICE) {
    throw new AppError(`가격은 1부터 ${MAX_PRICE} 사이의 숫자로 적어 주세요.`);
  }
  return price;
}

/** 지금 답할 차례인 역할. 협상이 끝났으면 null */
export function wishTurn(wish: Wish): Role | null {
  if (wish.status !== 'negotiating') return null;
  return wish.lastRole === 'child' ? 'parent' : 'child';
}

/** 정해 둔 횟수(코인 협상과 같은 설정) 안에서만 다른 가격을 다시 제안할 수 있다. */
export function canCounterWish(wish: Wish, settings: FamilySettings): boolean {
  return wish.status === 'negotiating' && wish.offerCount < settings.maxRounds;
}

/** 이 자녀가 지금 협상 중인 제안의 수 */
export function openWishCount(wishes: Wish[], uid: string): number {
  return wishes.filter((wish) => wish.ownerUid === uid && wish.status === 'negotiating').length;
}

/** 새 제안을 더 걸 수 있는지 */
export function canAddWish(wishes: Wish[], uid: string): boolean {
  return openWishCount(wishes, uid) < MAX_OPEN_WISHES;
}

/** 차례인 사람이 맞는지 검사한다. 자녀는 자기 제안에만 답할 수 있다. */
export function checkWishTurn(wish: Wish, role: Role, uid: string): void {
  const turn = wishTurn(wish);
  if (!turn) throw new AppError('이미 끝난 제안이에요.');
  if (role === 'child' && wish.ownerUid !== uid) throw new AppError('내 제안에만 답할 수 있어요.');
  if (role !== turn) throw new AppError('지금은 상대가 답할 차례예요.');
}

/** 자녀 화면에서 제안을 나눈다: 내가 답할 것, 부모의 답을 기다리는 것, 오늘 거절된 것 */
export function splitMyWishes(
  wishes: Wish[],
  uid: string,
  isToday: (at: number) => boolean,
): { toAnswer: Wish[]; waiting: Wish[]; declinedToday: Wish[] } {
  const mine = wishes.filter((wish) => wish.ownerUid === uid).sort((a, b) => a.createdAt - b.createdAt);
  return {
    toAnswer: mine.filter((wish) => wishTurn(wish) === 'child'),
    waiting: mine.filter((wish) => wishTurn(wish) === 'parent'),
    declinedToday: mine.filter((wish) => wish.status === 'declined' && wish.decidedAt !== null && isToday(wish.decidedAt)),
  };
}

/** 부모가 답해야 하는 제안(오래된 것부터) */
export function wishesForParent(wishes: Wish[]): Wish[] {
  return wishes.filter((wish) => wishTurn(wish) === 'parent').sort((a, b) => a.createdAt - b.createdAt);
}
