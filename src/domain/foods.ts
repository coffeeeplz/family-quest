import { AppError, type Food, type FoodCategory, type FoodInput } from '../backend/types';
import { addDays, formatShortDay, isDateKey } from '../lib/dates';
import type { IconName } from '../lib/sprites';

export const MAX_FOOD_NAME = 30;
export const MAX_FOOD_MEMO = 60;
export const MAX_FOOD_LINK = 300;
/** 보관함까지 합쳐 올려 둘 수 있는 메뉴 수 */
export const MAX_FOODS = 200;
/** 메뉴 하나에 남기는 먹은 날 기록 수 */
export const MAX_EATEN = 200;

export const FOOD_CATEGORIES: { id: FoodCategory; name: string; icon: IconName }[] = [
  { id: 'home', name: '집밥', icon: 'home' },
  { id: 'out', name: '외식', icon: 'fork' },
  { id: 'delivery', name: '배달', icon: 'delivery' },
  { id: 'snack', name: '간식', icon: 'snack' },
];

export function categoryOf(id: string): (typeof FOOD_CATEGORIES)[number] {
  return FOOD_CATEGORIES.find((c) => c.id === id) ?? FOOD_CATEGORIES[0];
}

/**
 * 링크를 다듬는다. "naver.com/..." 처럼 앞부분을 빼고 적어도 받아 주고,
 * 웹 주소(http, https)가 아닌 것은 막는다.
 */
export function cleanLink(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  // "host:8080/..." 의 콜론은 주소 종류 표시가 아니라 포트 번호다.
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text);
  const withScheme = hasScheme ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new AppError('링크 주소를 다시 확인해 주세요.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AppError('링크는 웹 주소(https://...)만 넣을 수 있어요.');
  if (!url.hostname.includes('.')) throw new AppError('링크 주소를 다시 확인해 주세요.');
  if (url.href.length > MAX_FOOD_LINK) throw new AppError(`링크는 ${MAX_FOOD_LINK}자까지 넣을 수 있어요.`);
  return url.href;
}

export function cleanFoodInput(input: FoodInput): FoodInput {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const memo = input.memo.trim();
  if (!name) throw new AppError('메뉴 이름을 적어 주세요.');
  if (name.length > MAX_FOOD_NAME) throw new AppError(`메뉴 이름은 ${MAX_FOOD_NAME}자까지 쓸 수 있어요.`);
  if (memo.length > MAX_FOOD_MEMO) throw new AppError(`메모는 ${MAX_FOOD_MEMO}자까지 쓸 수 있어요.`);
  if (!FOOD_CATEGORIES.some((c) => c.id === input.category)) throw new AppError('분류를 골라 주세요.');
  return { name, category: input.category, link: cleanLink(input.link), memo };
}

const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** 이미 올라와 있는 같은 이름의 메뉴(띄어쓰기 차이와 대소문자는 무시) */
export function findSameName(foods: Food[], name: string, exceptId?: string): Food | null {
  const key = nameKey(name);
  if (!key) return null;
  return foods.find((food) => food.id !== exceptId && nameKey(food.name) === key) ?? null;
}

export const isWanted = (food: Food) => food.wantedBy.length > 0;
export const eatCount = (food: Food) => food.eaten.length;
export const lastEaten = (food: Food): string | null => food.eaten[food.eaten.length - 1] ?? null;

/** 먹은 날을 더한다(오래된 날부터 정렬, 같은 날은 한 번만). */
export function withEaten(eaten: string[], day: string, today: string): string[] {
  if (!isDateKey(day)) throw new AppError('날짜를 다시 골라 주세요.');
  if (day > today) throw new AppError('아직 오지 않은 날은 기록할 수 없어요.');
  if (eaten.includes(day)) throw new AppError('그날은 이미 기록했어요.');
  const next = [...eaten, day].sort();
  // 기록이 너무 많아지면 가장 오래된 날부터 지운다.
  return next.slice(Math.max(0, next.length - MAX_EATEN));
}

export interface FoodLists {
  /** 먹고 싶어요: 원하는 사람이 많은 것부터, 같으면 최근에 올린 것부터 */
  wanted: Food[];
  /** 보관함: 최근에 먹은 것부터, 안 먹어 본 것은 뒤로 */
  saved: Food[];
}

export function splitFoods(foods: Food[], category: FoodCategory | 'all' = 'all'): FoodLists {
  const shown = foods.filter((food) => food.active && (category === 'all' || food.category === category));
  const wanted = shown
    .filter(isWanted)
    .sort((a, b) => b.wantedBy.length - a.wantedBy.length || b.createdAt - a.createdAt || a.name.localeCompare(b.name, 'ko'));
  const saved = shown
    .filter((food) => !isWanted(food))
    .sort((a, b) => (lastEaten(b) ?? '').localeCompare(lastEaten(a) ?? '') || a.name.localeCompare(b.name, 'ko'));
  return { wanted, saved };
}

export type DrawScope = 'wanted' | 'all';

/** 뽑기 후보: 먹고 싶은 것만 또는 보관함까지 전부 */
export function drawPool(foods: Food[], scope: DrawScope, category: FoodCategory | 'all'): Food[] {
  const lists = splitFoods(foods, category);
  return scope === 'wanted' ? lists.wanted : [...lists.wanted, ...lists.saved];
}

/** 후보에서 하나를 뽑는다. 다시 뽑을 때는 방금 나온 것을 피한다. */
export function pickRandom(pool: Food[], exceptId: string | null = null, random: () => number = Math.random): Food | null {
  if (pool.length === 0) return null;
  const candidates = pool.length > 1 && exceptId ? pool.filter((food) => food.id !== exceptId) : pool;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

/** 오늘, 어제, 그저께 또는 짧은 날짜 */
export function eatenDayText(day: string, today: string): string {
  if (day === today) return '오늘';
  if (day === addDays(today, -1)) return '어제';
  if (day === addDays(today, -2)) return '그저께';
  return formatShortDay(day, today);
}

/** "3번 먹음 · 마지막 10월 3일" 같은 한 줄 */
export function eatenLabel(food: Food, today: string): string {
  const last = lastEaten(food);
  if (!last) return '아직 안 먹어 봤어요';
  return `${eatCount(food)}번 먹음 · 마지막 ${eatenDayText(last, today)}`;
}

/** 수정과 삭제는 올린 사람과 부모만 */
export function canEditFood(food: Food, uid: string, isParent: boolean): boolean {
  return isParent || food.addedBy === uid;
}
