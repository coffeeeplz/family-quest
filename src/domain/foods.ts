import { AppError, type Food, type FoodCategoryDef, type FoodInput } from '../backend/types';
import { addDays, formatShortDay, isDateKey } from '../lib/dates';
import type { IconName } from '../lib/sprites';

export const MAX_FOOD_NAME = 30;
export const MAX_FOOD_MEMO = 60;
export const MAX_FOOD_LINK = 300;
/** 보관함까지 합쳐 올려 둘 수 있는 메뉴 수 */
export const MAX_FOODS = 200;
/** 메뉴 하나에 남기는 먹은 날 기록 수 */
export const MAX_EATEN = 200;

/** 지울 수 없는 마지막 분류. 분류가 지워진 메뉴도 여기로 모인다. */
export const ETC_CATEGORY_ID = 'etc';
export const MAX_FOOD_CATEGORIES = 8;
export const MAX_CATEGORY_NAME = 6;

/** 분류에 붙일 수 있는 그림 */
export const CATEGORY_ICONS: { icon: IconName; name: string }[] = [
  { icon: 'food', name: '밥' },
  { icon: 'noodle', name: '면' },
  { icon: 'sushi', name: '초밥' },
  { icon: 'bread', name: '빵' },
  { icon: 'snack', name: '간식' },
  { icon: 'delivery', name: '배달' },
  { icon: 'home', name: '집' },
  { icon: 'heart', name: '하트' },
  { icon: 'star', name: '별' },
  { icon: 'fork', name: '식사' },
];

/** 분류의 기본값. 가족 설정에서 바꿀 수 있다. */
export const DEFAULT_FOOD_CATEGORIES: FoodCategoryDef[] = [
  { id: 'korean', name: '한식', icon: 'food' },
  { id: 'chinese', name: '중식', icon: 'noodle' },
  { id: 'japanese', name: '일식', icon: 'sushi' },
  { id: 'bread', name: '빵', icon: 'bread' },
  { id: ETC_CATEGORY_ID, name: '기타', icon: 'fork' },
];

const ETC: FoodCategoryDef = DEFAULT_FOOD_CATEGORIES[DEFAULT_FOOD_CATEGORIES.length - 1];
const isCategoryIcon = (icon: unknown): icon is IconName => CATEGORY_ICONS.some((choice) => choice.icon === icon);

/** 메뉴에 적힌 분류를 찾는다. 설정에서 지워졌거나 예전 분류라면 "기타". */
export function categoryOf(categories: FoodCategoryDef[], id: string): FoodCategoryDef & { icon: IconName } {
  const found = categories.find((c) => c.id === id) ?? categories.find((c) => c.id === ETC_CATEGORY_ID) ?? ETC;
  return { ...found, icon: isCategoryIcon(found.icon) ? found.icon : 'fork' };
}

/** 저장된 값이 없거나 일부가 잘못돼도 항상 쓸 수 있는 분류 목록을 돌려준다. "기타"는 늘 맨 뒤에 있다. */
export function normalizeFoodCategories(raw: unknown): FoodCategoryDef[] {
  if (!Array.isArray(raw)) return DEFAULT_FOOD_CATEGORIES;
  const seen = new Set<string>([ETC_CATEGORY_ID]);
  const list: FoodCategoryDef[] = [];
  for (const item of raw as Partial<FoodCategoryDef>[]) {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') continue;
    const name = item.name.trim().slice(0, MAX_CATEGORY_NAME);
    if (!item.id || !name || seen.has(item.id)) continue;
    seen.add(item.id);
    list.push({ id: item.id, name, icon: isCategoryIcon(item.icon) ? item.icon : 'fork' });
  }
  return [...list.slice(0, MAX_FOOD_CATEGORIES - 1), ETC];
}

/** 설정에서 저장하기 전에 분류 목록을 검사한다. */
export function cleanFoodCategories(input: FoodCategoryDef[]): FoodCategoryDef[] {
  const custom = input.filter((c) => c.id !== ETC_CATEGORY_ID).map((c) => ({ ...c, name: c.name.trim() }));
  if (custom.some((c) => !c.name)) throw new AppError('분류 이름을 적어 주세요.');
  if (custom.some((c) => c.name.length > MAX_CATEGORY_NAME)) throw new AppError(`분류 이름은 ${MAX_CATEGORY_NAME}자까지 쓸 수 있어요.`);
  const names = [...custom.map((c) => c.name), ETC.name];
  if (new Set(names).size !== names.length) throw new AppError('같은 이름의 분류가 있어요.');
  if (new Set(custom.map((c) => c.id)).size !== custom.length || custom.some((c) => !c.id)) throw new AppError('분류를 다시 확인해 주세요.');
  if (custom.length > MAX_FOOD_CATEGORIES - 1) throw new AppError(`분류는 기타를 포함해 ${MAX_FOOD_CATEGORIES}개까지 만들 수 있어요.`);
  return [...custom.map((c) => ({ id: c.id, name: c.name, icon: isCategoryIcon(c.icon) ? c.icon : 'fork' })), ETC];
}

export function newCategoryId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
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
  if (typeof input.category !== 'string' || !input.category || input.category.length > 20) throw new AppError('분류를 골라 주세요.');
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

/**
 * category 로 거를 때는 categories(가족 설정의 분류 목록)를 함께 넘긴다.
 * 지워진 분류의 메뉴가 "기타"로 걸러지게 하기 위해서다.
 */
export function splitFoods(foods: Food[], category: string = 'all', categories: FoodCategoryDef[] = DEFAULT_FOOD_CATEGORIES): FoodLists {
  const shown = foods.filter((food) => food.active && (category === 'all' || categoryOf(categories, food.category).id === category));
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
export function drawPool(foods: Food[], scope: DrawScope, category: string, categories: FoodCategoryDef[] = DEFAULT_FOOD_CATEGORIES): Food[] {
  const lists = splitFoods(foods, category, categories);
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

/** 별점은 1개부터 5개까지 */
export function cleanStars(stars: number): number {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new AppError('별은 1개부터 5개까지 줄 수 있어요.');
  return stars;
}

/** 가족이 준 별점의 평균(소수 첫째 자리)과 준 사람 수. 아무도 안 줬으면 average 는 null. */
export function ratingSummary(food: Food): { average: number | null; count: number } {
  const stars = Object.values(food.ratings).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  if (stars.length === 0) return { average: null, count: 0 };
  const mean = stars.reduce((sum, n) => sum + n, 0) / stars.length;
  return { average: Math.round(mean * 10) / 10, count: stars.length };
}

export type SavedSort = 'recent' | 'rating';

/** 보관함 정렬: 최근에 먹은 순(기본) 또는 별점 높은 순(별점이 없으면 뒤로) */
export function sortSaved(saved: Food[], sort: SavedSort): Food[] {
  if (sort === 'recent') return saved;
  const score = (food: Food) => ratingSummary(food).average ?? 0;
  return [...saved].sort((a, b) => score(b) - score(a) || ratingSummary(b).count - ratingSummary(a).count || a.name.localeCompare(b.name, 'ko'));
}

/** 보관함 카드에 보일 한 줄: "마지막 10월 3일" 또는 "아직 안 먹어 봤어요" */
export function lastEatenLabel(food: Food, today: string): string {
  const last = lastEaten(food);
  return last ? `마지막 ${eatenDayText(last, today)}` : '아직 안 먹어 봤어요';
}

/** 카드에 보일 한 줄: "3번 먹음" 또는 "아직 안 먹어 봤어요" */
export function eatCountLabel(food: Food): string {
  return eatCount(food) > 0 ? `${eatCount(food)}번 먹음` : '아직 안 먹어 봤어요';
}
