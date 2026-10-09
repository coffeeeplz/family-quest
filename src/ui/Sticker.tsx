import { findSticker } from '../domain/stickers';
import { PixelSprite } from './Sprite';

/** 메모 스티커 한 장. 모르는 스티커(지워진 팩 등)는 그리지 않는다. */
export function Sticker({ id, size, label = false }: { id: string; size: number; label?: boolean }) {
  const found = id ? findSticker(id) : null;
  if (!found) return null;
  return <PixelSprite rows={found.sticker.rows} primary="#FFFFFF" size={size} label={label ? `${found.sticker.label} 스티커` : undefined} className="sticker" />;
}
