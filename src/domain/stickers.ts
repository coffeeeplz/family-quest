import catalog from '../assets/stickers.json';
import type { Member, StickerPrice } from '../backend/types';

/**
 * 메모에 붙이는 도트 스티커. 그림은 src/assets/stickers.json 에 팩 단위로 들어 있다.
 * 새 팩은 다른 AI 가 그린 JSON 을 tools/add-sticker-pack.mjs 로 검사해 더한다.
 */
export interface StickerDef {
  id: string;
  label: string;
  /** 16줄 × 16글자. 글자는 팔레트(K W C P Y O R G B M N)와 . (투명) */
  rows: string[];
}

export interface StickerPack {
  id: string;
  name: string;
  /** 처음 가격(코인). 부모가 상점 관리에서 바꿀 수 있다. */
  price: number;
  stickers: StickerDef[];
}

export const STICKER_PACKS: StickerPack[] = catalog as StickerPack[];
export const STICKER_SIZE = 16;
export const MAX_STICKER_PRICE = 1000;
export const STICKER_COLORS = 'KWCPYORGBMN';

/** 메모에 저장하는 스티커 이름: '팩id/스티커id' */
export const stickerRef = (packId: string, stickerId: string) => `${packId}/${stickerId}`;

export function findSticker(ref: string): { pack: StickerPack; sticker: StickerDef } | null {
  const [packId, stickerId] = ref.split('/');
  const pack = STICKER_PACKS.find((p) => p.id === packId);
  const sticker = pack?.stickers.find((s) => s.id === stickerId);
  return pack && sticker ? { pack, sticker } : null;
}

export const findPack = (packId: string) => STICKER_PACKS.find((p) => p.id === packId) ?? null;

/** 부모가 정한 가격(없으면 처음 가격)과 숨김 여부 */
export function packOffer(pack: StickerPack, prices: StickerPrice[]): { price: number; hidden: boolean } {
  const set = prices.find((p) => p.packId === pack.id);
  return { price: set?.price ?? pack.price, hidden: set?.hidden ?? false };
}

/** 이 사람이 쓸 수 있는 팩인지. 부모는 모든 스티커를 무료로 쓴다. */
export function canUsePack(member: Member, packId: string): boolean {
  return member.role === 'parent' || member.stickerPacks.includes(packId);
}

/** 장부 id: 한 사람이 같은 팩을 두 번 사지 않도록 사람과 팩으로 정한다(서버 규칙과 같아야 한다). */
export const stickerLedgerId = (uid: string, packId: string) => `sticker-${uid}-${packId}`;

/** 다른 AI 가 그려 준 팩 JSON 을 검사한다. 문제가 없으면 빈 배열 */
export function checkPack(value: unknown): string[] {
  const problems: string[] = [];
  const pack = value as Partial<StickerPack> | null;
  if (!pack || typeof pack !== 'object') return ['JSON 객체가 아니에요.'];
  if (typeof pack.id !== 'string' || !/^[a-z][a-z0-9-]{0,19}$/.test(pack.id)) problems.push('팩 id 는 영문 소문자로 시작하는 20자 이하여야 해요.');
  if (typeof pack.name !== 'string' || pack.name.trim() === '') problems.push('팩 이름이 없어요.');
  if (!Array.isArray(pack.stickers) || pack.stickers.length === 0) return [...problems, '스티커가 없어요.'];
  const ids = new Set<string>();
  pack.stickers.forEach((s, n) => {
    const where = `스티커 ${n + 1}(${s?.id ?? '?'})`;
    if (typeof s?.id !== 'string' || !/^[a-z][a-z0-9-]{0,19}$/.test(s.id)) problems.push(`${where}: id 는 영문 소문자여야 해요.`);
    else if (ids.has(s.id)) problems.push(`${where}: id 가 겹쳐요.`);
    else ids.add(s.id);
    if (typeof s?.label !== 'string' || s.label.trim() === '') problems.push(`${where}: 한글 이름이 없어요.`);
    if (!Array.isArray(s?.rows) || s.rows.length !== STICKER_SIZE) {
      problems.push(`${where}: 줄이 ${STICKER_SIZE}개여야 해요.`);
      return;
    }
    s.rows.forEach((row, y) => {
      if (typeof row !== 'string' || row.length !== STICKER_SIZE) problems.push(`${where}: ${y + 1}번째 줄이 ${STICKER_SIZE}글자가 아니에요.`);
      else if (![...row].every((c) => c === '.' || STICKER_COLORS.includes(c))) problems.push(`${where}: ${y + 1}번째 줄에 쓸 수 없는 글자가 있어요.`);
    });
  });
  return problems;
}

// ── 한마디(칭찬, 거절 이유)에 붙이는 스티커 ────────────────────────────────
// 따로 칸을 두지 않고 글 끝에 {s:팩id/스티커id} 로 붙여 저장한다(서버 규칙과 옛 기록을 그대로 쓸 수 있다).
const SAID_TOKEN = /\s*\{s:([a-z][a-z0-9-]*\/[a-z][a-z0-9-]*)\}\s*$/;

/** '잘했어 {s:animal/cat}' → { text: '잘했어', sticker: 'animal/cat' } */
export function splitSticker(said: string): { text: string; sticker: string } {
  const match = said.match(SAID_TOKEN);
  if (!match) return { text: said, sticker: '' };
  return { text: said.slice(0, match.index).trimEnd(), sticker: findSticker(match[1]) ? match[1] : '' };
}

/** 글 끝에 스티커를 붙인다. 스티커가 없으면 글만 */
export function withSticker(text: string, sticker: string): string {
  const clean = text.trim();
  return sticker ? `${clean} {s:${sticker}}`.trim() : clean;
}

/** 저장 전에 다듬기: 글은 max 자까지, 모르는 스티커는 뗀다. */
export function cleanSaid(said: string, max: number): string {
  const { text, sticker } = splitSticker(said);
  return withSticker(text.trim().slice(0, max), sticker);
}

/** 알림처럼 그림을 못 보여 주는 곳에서 쓰는 글: 스티커는 [고양이] 처럼 이름으로 */
export function saidPlain(said: string): string {
  const { text, sticker } = splitSticker(said);
  const label = sticker ? findSticker(sticker)?.sticker.label : '';
  return [text, label ? `[${label}]` : ''].filter(Boolean).join(' ');
}
