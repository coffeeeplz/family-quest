import type { AvatarChoice } from '../backend/types';
import { avatarLayers } from '../domain/wardrobe';
import { ICONS, colorHex, spriteRects, type IconName } from '../lib/sprites';

interface PixelSpriteProps {
  rows: string[];
  primary: string;
  size: number;
  /** 읽어 줄 이름. 없으면 장식으로 취급한다. */
  label?: string;
  className?: string;
}

/** 글자 격자로 된 도트 그림을 SVG로 그린다. */
export function PixelSprite({ rows, primary, size, label, className }: PixelSpriteProps) {
  const rects = spriteRects(rows, primary);
  const n = rows.length;
  return (
    <svg
      className={className ? `sprite ${className}` : 'sprite'}
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}

/** 캐릭터와 입은 꾸미기 아이템을 층으로 겹쳐 한 그림으로 그린다. */
export function Avatar({ avatar, size, label }: { avatar: AvatarChoice; size: number; label?: string }) {
  const primary = colorHex(avatar.color);
  const layers = avatarLayers(avatar);
  const n = layers[0]?.rows.length ?? 32;
  return (
    <svg
      className="sprite"
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {layers.map((layer) => (
        <g key={layer.key} transform={layer.dy ? `translate(0 ${layer.dy})` : undefined}>
          {spriteRects(layer.rows, primary).map((r) => (
            <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return <PixelSprite rows={ICONS[name]} primary="#FFFFFF" size={size} className={className} />;
}

/** 테두리 상자 안에 든 큰 아바타 */
export function AvatarFrame({ avatar, size, background }: { avatar: AvatarChoice; size: number; background?: string }) {
  const box = size + 8;
  return (
    <div className="px avatar-frame" style={{ width: box, height: box, background: background ?? 'var(--sky-soft)' }}>
      <Avatar avatar={avatar} size={size} />
    </div>
  );
}
