import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

export interface SwipePage {
  id: string;
  /** 읽어 줄 이름 */
  label: string;
  /** 위쪽 전환 버튼에 보일 내용 */
  tab: ReactNode;
  content: ReactNode;
}

interface SwipePagesProps {
  /** 이 묶음의 이름(읽어 주기용) */
  label: string;
  pages: SwipePage[];
  index: number;
  onChange: (index: number) => void;
  /** 처음 한 번만 보여 줄 안내. 한 번이라도 넘겨 보면 사라진다. */
  hint?: string;
}

/** 화면 가장자리는 휴대폰의 "뒤로 가기" 동작이 쓰므로 여기서 시작한 밀기는 무시한다. */
const EDGE = 24;
/** 이만큼은 밀어야 넘긴 것으로 친다. */
const MIN_DISTANCE = 56;
const HINT_KEY = 'family-quest-swipe-hint-seen';

function hintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * 좌우로 밀어서 넘기는 화면 묶음. 위쪽 버튼을 눌러도 넘어간다(마우스를 쓰는 PC용).
 * 왼쪽으로 밀면 다음 쪽, 오른쪽으로 밀면 이전 쪽. 위아래 스크롤은 그대로 둔다.
 */
export function SwipePages({ label, pages, index, onChange, hint }: SwipePagesProps) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const last = useRef(index);
  const direction = useRef<'next' | 'prev' | ''>('');
  const [showHint, setShowHint] = useState(() => Boolean(hint) && !hintSeen());

  // 어느 쪽에서 들어오는지에 따라 등장 방향을 바꾼다.
  if (last.current !== index) {
    direction.current = index > last.current ? 'next' : 'prev';
    last.current = index;
  }

  const safeIndex = Math.min(Math.max(index, 0), pages.length - 1);
  const page = pages[safeIndex];

  function go(next: number) {
    if (next < 0 || next >= pages.length || next === safeIndex) return;
    if (showHint) {
      setShowHint(false);
      try {
        localStorage.setItem(HINT_KEY, '1');
      } catch {
        // 저장이 막혀 있으면 안내가 다음에도 보일 뿐이다.
      }
    }
    onChange(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    start.current = null;
    if (event.pointerType === 'mouse') return;
    if (event.clientX < EDGE || event.clientX > window.innerWidth - EDGE) return;
    // 글자를 고치는 중이거나, 스스로 좌우로 움직이는 부품 위에서는 넘기지 않는다.
    if ((event.target as HTMLElement).closest('input, textarea, select, [data-no-swipe]')) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const from = start.current;
    start.current = null;
    if (!from || from.id !== event.pointerId) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    go(dx < 0 ? safeIndex + 1 : safeIndex - 1);
  }

  if (!page) return null;

  return (
    <div className="pager">
      <div className="pager-tabs" role="tablist" aria-label={label}>
        {pages.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`pager-tab-${item.id}`}
            className="pager-tab"
            aria-label={item.label}
            aria-selected={i === safeIndex}
            onClick={() => go(i)}
          >
            {item.tab}
          </button>
        ))}
      </div>
      <div className="pager-dots" aria-hidden="true">
        {pages.map((item, i) => (
          <span key={item.id} className={i === safeIndex ? 'on' : undefined} />
        ))}
      </div>
      {showHint && hint && <p className="t-cap center">{hint}</p>}
      <div
        className="pager-panel"
        role="tabpanel"
        aria-labelledby={`pager-tab-${page.id}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (start.current = null)}
      >
        <div key={page.id} className={`pager-page ${direction.current}`}>
          {page.content}
        </div>
      </div>
    </div>
  );
}
