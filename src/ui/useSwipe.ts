import { useRef, type PointerEvent } from 'react';

/** 화면 가장자리는 휴대폰의 "뒤로 가기" 동작이 쓰므로 여기서 시작한 밀기는 무시한다. */
const EDGE = 24;
/** 이만큼은 밀어야 넘긴 것으로 친다. */
const MIN_DISTANCE = 56;

/**
 * 손가락으로 좌우로 미는 동작을 알아챈다. 돌려주는 값을 미는 영역의 요소에 펼쳐 넣는다.
 * 왼쪽으로 밀면 onSwipe('next'), 오른쪽으로 밀면 onSwipe('prev').
 * 위아래 스크롤은 그대로 두려면 그 요소에 touch-action: pan-y 를 준다.
 */
export function useSwipe(onSwipe: (direction: 'next' | 'prev') => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      start.current = null;
      if (event.pointerType === 'mouse') return;
      if (event.clientX < EDGE || event.clientX > window.innerWidth - EDGE) return;
      // 글자를 고치는 중이거나, 스스로 좌우로 움직이는 부품 위에서는 넘기지 않는다.
      if ((event.target as HTMLElement).closest('input, textarea, select, [data-no-swipe]')) return;
      start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const from = start.current;
      start.current = null;
      if (!from || from.id !== event.pointerId) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      onSwipe(dx < 0 ? 'next' : 'prev');
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}
