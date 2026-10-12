import data from '../assets/sprites.json';

export interface AvatarDef {
  id: string;
  name: string;
  /** 기본 색 id */
  color: string;
  /** 0 이면 처음부터 쓰는 캐릭터, 그 밖에는 상점에서 사는 캐릭터의 처음 가격 */
  price: number;
  /** 모자를 아래(+)나 위(-)로 옮길 칸 수(머리 위 끝이 뼈대와 다른 캐릭터) */
  hatY: number;
  /** 32줄 × 32글자 */
  rows: string[];
}

export interface AvatarColor {
  id: string;
  name: string;
  hex: string;
}

export const AVATARS: AvatarDef[] = data.avatars;
export const AVATAR_COLORS: AvatarColor[] = data.avatarColors;
export const ICONS: Record<string, string[]> = data.icons;
export type IconName = keyof typeof data.icons;

const PALETTE: Record<string, string> = data.palette;

/** 처음부터 누구나 쓰는 캐릭터인지 */
export const isFreeAvatar = (id: string) => AVATARS.some((a) => a.id === id && a.price === 0);

export function avatarDef(id: string): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

export function colorHex(colorId: string): string {
  return (AVATAR_COLORS.find((c) => c.id === colorId) ?? AVATAR_COLORS[0]).hex;
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(factor < 0 ? v * (1 + factor) : v + (255 - v) * factor),
  );
  return '#' + channels.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function pixelColor(ch: string, primary: string): string | null {
  if (ch === '.') return null;
  if (ch === 'A') return primary;
  if (ch === 'a') return shade(primary, -0.2);
  if (ch === 'L') return shade(primary, 0.4);
  return PALETTE[ch] ?? null;
}

export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  fill: string;
}

const cache = new Map<string, SpriteRect[]>();

/** 글자 격자를 가로로 이어 붙인 사각형 목록으로 바꾼다. */
export function spriteRects(rows: string[], primary: string): SpriteRect[] {
  const key = primary + rows.join('');
  const hit = cache.get(key);
  if (hit) return hit;
  const rects: SpriteRect[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const fill = pixelColor(row[x], primary);
      if (!fill) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < row.length && pixelColor(row[end], primary) === fill) end += 1;
      rects.push({ x, y, w: end - x, fill });
      x = end;
    }
  });
  cache.set(key, rects);
  return rects;
}
