import type { ReactNode } from 'react';
import { BOARD, seededRandom } from '../../domain/claw';
import { spriteRects } from '../../lib/sprites';
import { BOX, BOX_COLORS, CLAW_OPEN } from './clawArt';

/*
 * 인형뽑기 기계 그림. 게임 화면(ClawPage)과 부모 설정의 미리보기(ClawSettings)가 같이 쓴다.
 * 게임판 좌표는 0~100(아래가 0)이고, 그림 좌표는 viewBox 0 0 120 140 이다.
 */

export const sx = (x: number) => 10 + x;
export const sy = (y: number) => 122 - y;
/** 집게 그림 가운데에서 조준점(집게 끝 사이)까지의 거리(그림 좌표, 크기 1일 때) */
const AIM_DROP = 3.3;

/** 그림 좌표 (cx, cy)를 가운데로 한 변 size 인 도트 그림 */
export function Pix({ rows, cx, cy, size, color = '#FFB3D1', opacity }: { rows: string[]; cx: number; cy: number; size: number; color?: string; opacity?: number }) {
  const n = rows.length;
  const s = size / n;
  return (
    <g transform={`translate(${cx - size / 2} ${cy - size / 2}) scale(${s})`} opacity={opacity}>
      {spriteRects(rows, color).map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </g>
  );
}

/** 상자마다의 색(판의 씨앗값으로 늘 같게) */
export function boxColors(seed: number, count: number): string[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => BOX_COLORS[Math.floor(random() * BOX_COLORS.length)]);
}

export interface Point {
  x: number;
  y: number;
}

export interface ClawBoardProps {
  /** 바닥의 상자들(들려 나간 상자는 hidden 으로 뺀다) */
  boxes: Point[];
  colors: string[];
  hidden?: number | null;
  /** 잡히는 범위(점선 네모의 반쪽). null 이면 네모를 그리지 않는다 */
  reach?: number | null;
  /** 조준점이 들어가 반짝이는 상자 번호 */
  glowBox?: number | null;
  claw: Point;
  clawRows?: string[];
  clawScale?: number;
  /** 빨간 조준점을 보일지 */
  aim?: boolean;
  /** 위로 올라갈 길(세로 점선)을 보일지 */
  guide?: boolean;
  carried?: (Point & { color: string }) | null;
  falling?: (Point & { color: string; spin: number }) | null;
  bubble?: string;
  label?: string;
  children?: ReactNode;
}

export function ClawBoard({
  boxes,
  colors,
  hidden = null,
  reach = null,
  glowBox = null,
  claw,
  clawRows = CLAW_OPEN,
  clawScale = 1,
  aim = false,
  guide = false,
  carried,
  falling,
  bubble,
  label = '인형뽑기 기계',
}: ClawBoardProps) {
  return (
    <svg viewBox="0 0 120 140" className="claw-svg" role="img" aria-label={label}>
      {/* 기계 틀과 유리 */}
      <rect x="2" y="2" width="116" height="136" rx="3" fill="var(--pink)" stroke="#4B3B66" strokeWidth="2" />
      <rect x="8" y="12" width="104" height="114" fill="#E8F4FF" stroke="#4B3B66" strokeWidth="1.5" />
      <rect x="8" y="12" width="104" height="4" fill="#FFFFFF" opacity="0.6" />
      {/* 출구 */}
      <rect x="9" y="17" width="16" height="12" fill="#4B3B66" />
      <text x="17" y="9" textAnchor="middle" fontSize="6" fill="#4B3B66" fontFamily="var(--font-title)">
        출구
      </text>
      {boxes.map((b, i) => (i === hidden ? null : <Pix key={`box-${i}`} rows={BOX} cx={sx(b.x)} cy={sy(b.y)} size={14} color={colors[i]} />))}
      {/* 잡히는 범위(점선 네모). 상자보다 작아도 보이게 상자 위에 옅게 그린다 */}
      {reach !== null &&
        boxes.map((b, i) =>
          i === hidden ? null : (
            <rect
              key={`zone-${i}`}
              x={sx(b.x - reach)}
              y={sy(b.y + reach)}
              width={reach * 2}
              height={reach * 2}
              fill={i === glowBox ? '#FFE38A' : '#FFFFFF'}
              fillOpacity={i === glowBox ? 0.55 : 0.2}
              stroke="#FF5C8A"
              strokeWidth={i === glowBox ? 1.3 : 0.8}
              strokeDasharray={i === glowBox ? undefined : '2 1.5'}
            />
          ),
        )}
      {/* 들고 가는 상자, 떨어지는 상자 */}
      {carried && <Pix rows={BOX} cx={sx(carried.x)} cy={sy(carried.y)} size={14} color={carried.color} />}
      {falling && (
        <g transform={`rotate(${falling.spin} ${sx(falling.x)} ${sy(falling.y)})`}>
          <Pix rows={BOX} cx={sx(falling.x)} cy={sy(falling.y)} size={14} color={falling.color} />
        </g>
      )}
      {/* 오른쪽으로 갈 때: 위로 올라갈 길을 점선으로 */}
      {guide && <line x1={sx(claw.x)} y1={sy(claw.y) - 8} x2={sx(claw.x)} y2={sy(BOARD)} stroke="#4B3B66" strokeWidth="0.5" strokeDasharray="1.5 1.5" opacity="0.45" />}
      {/* 집게 그림자와 집게 */}
      <ellipse cx={sx(claw.x)} cy={sy(claw.y) + 5} rx={6 * clawScale} ry={1.5} fill="#4B3B66" opacity="0.18" />
      <Pix rows={clawRows} cx={sx(claw.x)} cy={sy(claw.y) - AIM_DROP * clawScale} size={20 * clawScale} />
      {/* 조준점: 이 점이 점선 네모 안에 있을 때 멈추면 잡혀요 */}
      {aim && <circle cx={sx(claw.x)} cy={sy(claw.y)} r={1.3} fill="#FF5C8A" stroke="#FFFFFF" strokeWidth="0.5" />}
      {bubble && (
        <text x={Math.min(100, Math.max(20, sx(claw.x)))} y={Math.max(24, sy(claw.y) - 14)} textAnchor="middle" fontSize="7" fill="#4B3B66" fontFamily="var(--font-title)">
          {bubble}
        </text>
      )}
      {/* 버튼 판 */}
      <rect x="8" y="128" width="104" height="8" fill="#4B3B66" />
    </svg>
  );
}
