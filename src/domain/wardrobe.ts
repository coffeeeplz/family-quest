import catalog from '../assets/wardrobe.json';
import { AppError, type AvatarChoice, type Member, type Wear, type WardrobePrice, type WearSlot } from '../backend/types';
import { AVATARS, avatarDef, isFreeAvatar } from '../lib/sprites';

/**
 * 캐릭터 꾸미기. 아이템 그림은 src/assets/wardrobe.json 에 있고, 유료 캐릭터는 sprites.json 의 avatars 에서 price 가 0 보다 큰 것이다.
 * 둘 다 "꾸미기 상품"으로 같은 방식(스티커처럼 자녀가 코인으로 바로 사고, 부모는 무료)으로 판다.
 * 그림은 tools/avatar_art.py 로 그리고, 다른 AI 가 그린 아이템은 tools/add-wardrobe-item.ts 로 검사해 더한다.
 */
export interface WardrobeItem {
  id: string;
  slot: WearSlot;
  name: string;
  /** 처음 가격(코인). 부모가 상점 관리에서 바꿀 수 있다. */
  price: number;
  /** 16줄 × 16글자. 글자는 팔레트와 . (투명), 캐릭터 색 A a L */
  rows: string[];
}

/** 상점에 보이는 꾸미기 상품 하나: 유료 캐릭터 또는 아이템 */
export interface WardrobeEntry {
  id: string;
  slot: WearSlot | 'avatar';
  name: string;
  price: number;
}

export const WARDROBE_ITEMS: WardrobeItem[] = catalog as WardrobeItem[];
export const WARDROBE_SIZE = 16;
export const MAX_WARDROBE_PRICE = 1000;
/** 칸을 그리는 순서(아래부터). 'avatar' 는 캐릭터 자신 */
export const LAYER_ORDER: (WearSlot | 'avatar')[] = ['avatar', 'outfit', 'face', 'hat', 'hand'];
export const WEAR_SLOTS: WearSlot[] = ['hat', 'face', 'outfit', 'hand'];
export const SLOT_NAMES: Record<WearSlot | 'avatar', string> = {
  avatar: '캐릭터',
  hat: '모자',
  face: '얼굴',
  outfit: '옷',
  hand: '소품',
};

export const findItem = (id: string) => WARDROBE_ITEMS.find((item) => item.id === id) ?? null;

/** 파는 상품 전체: 유료 캐릭터 다음에 아이템 */
export const WARDROBE_ENTRIES: WardrobeEntry[] = [
  ...AVATARS.filter((a) => a.price > 0).map((a) => ({ id: a.id, slot: 'avatar' as const, name: a.name, price: a.price })),
  ...WARDROBE_ITEMS.map(({ id, slot, name, price }) => ({ id, slot, name, price })),
];

export const findEntry = (id: string) => WARDROBE_ENTRIES.find((entry) => entry.id === id) ?? null;

/** 부모가 정한 가격(없으면 처음 가격)과 숨김 여부 */
export function entryOffer(entry: WardrobeEntry, prices: WardrobePrice[]): { price: number; hidden: boolean } {
  const set = prices.find((p) => p.itemId === entry.id);
  return { price: set?.price ?? entry.price, hidden: set?.hidden ?? false };
}

/** 쓸 수 있는 상품 목록: 부모는 전부('all'), 자녀는 산 것 */
export type Owned = string[] | 'all';
export const ownedOf = (member: Pick<Member, 'role' | 'wardrobe'>): Owned => (member.role === 'parent' ? 'all' : member.wardrobe);
export const owns = (owned: Owned, id: string) => owned === 'all' || owned.includes(id);

/** 이 캐릭터를 고를 수 있는지: 무료 캐릭터이거나 산 것 */
export const canUseAvatar = (owned: Owned, avatarId: string) => isFreeAvatar(avatarId) || owns(owned, avatarId);

/** 장부 id: 한 사람이 같은 상품을 두 번 사지 않도록 사람과 상품으로 정한다(서버 규칙과 같아야 한다). */
export const wardrobeLedgerId = (uid: string, itemId: string) => `wardrobe-${uid}-${itemId}`;

/** 입은 아이템을 검사한다: 칸이 맞고, 가진 것만. 빈 칸은 뺀다. */
export function cleanWear(wear: Wear | undefined, owned: Owned): Wear {
  const out: Wear = {};
  for (const slot of WEAR_SLOTS) {
    const id = wear?.[slot];
    if (!id) continue;
    const item = findItem(id);
    if (!item || item.slot !== slot) throw new AppError('없는 꾸미기 아이템이에요.');
    if (!owns(owned, id)) throw new AppError(`아직 갖지 않은 아이템이에요: ${item.name}`);
    out[slot] = id;
  }
  return out;
}

/** 저장할 캐릭터 모양: 고를 수 있는 캐릭터와 가진 아이템만 */
export function cleanAvatarChoice(avatar: AvatarChoice, owned: Owned): AvatarChoice {
  if (!canUseAvatar(owned, avatar.id)) throw new AppError(`아직 갖지 않은 캐릭터예요: ${avatarDef(avatar.id).name}`);
  const wear = cleanWear(avatar.wear, owned);
  return Object.keys(wear).length > 0 ? { id: avatar.id, color: avatar.color, wear } : { id: avatar.id, color: avatar.color };
}

/** 그릴 층(아래부터): 그림, 위아래로 옮길 칸 수 */
export function avatarLayers(avatar: AvatarChoice): { key: string; rows: string[]; dy: number }[] {
  const def = avatarDef(avatar.id);
  const layers: { key: string; rows: string[]; dy: number }[] = [];
  for (const slot of LAYER_ORDER) {
    if (slot === 'avatar') {
      layers.push({ key: 'avatar', rows: def.rows, dy: 0 });
      continue;
    }
    const id = avatar.wear?.[slot];
    const item = id ? findItem(id) : null;
    if (item && item.slot === slot) layers.push({ key: slot, rows: item.rows, dy: slot === 'hat' ? def.hatY : slot === 'face' ? def.faceY : 0 });
  }
  return layers;
}

/** 그림 글자로 쓸 수 있는 것: 팔레트 + 캐릭터 색(A a L) + 투명(.) */
export const WARDROBE_CHARS = '.AaLKWCPYORGBMNDE';

/** 다른 AI 가 그려 준 아이템 JSON 을 검사한다. 문제가 없으면 빈 배열 */
export function checkWardrobeItem(value: unknown): string[] {
  const problems: string[] = [];
  const item = value as Partial<WardrobeItem> | null;
  if (!item || typeof item !== 'object') return ['JSON 객체가 아니에요.'];
  if (typeof item.id !== 'string' || !/^[a-z][a-z0-9-]{0,19}$/.test(item.id)) problems.push('아이템 id 는 영문 소문자로 시작하는 20자 이하여야 해요.');
  if (typeof item.slot !== 'string' || !(WEAR_SLOTS as string[]).includes(item.slot)) problems.push(`칸(slot)은 ${WEAR_SLOTS.join(', ')} 중 하나여야 해요.`);
  if (typeof item.name !== 'string' || item.name.trim() === '' || item.name.trim().length > 12) problems.push('아이템 이름은 1~12자여야 해요.');
  if (!Number.isInteger(item.price) || (item.price as number) < 1 || (item.price as number) > MAX_WARDROBE_PRICE) {
    problems.push(`가격은 1부터 ${MAX_WARDROBE_PRICE} 사이의 정수여야 해요.`);
  }
  if (!Array.isArray(item.rows) || item.rows.length !== WARDROBE_SIZE) {
    problems.push(`그림은 줄이 ${WARDROBE_SIZE}개여야 해요.`);
  } else {
    item.rows.forEach((row, y) => {
      if (typeof row !== 'string' || row.length !== WARDROBE_SIZE) problems.push(`${y + 1}번째 줄은 ${WARDROBE_SIZE}글자여야 해요.`);
      else if ([...row].some((ch) => !WARDROBE_CHARS.includes(ch))) problems.push(`${y + 1}번째 줄에 쓸 수 없는 글자가 있어요.`);
    });
  }
  return problems;
}
