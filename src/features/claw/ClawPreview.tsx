import { useEffect, useMemo, useState } from 'react';
import type { ClawTune } from '../../backend/types';
import { boxAt, clawAt, placeBoxes, seededRandom } from '../../domain/claw';
import { ClawBoard, boxColors } from './ClawBoard';
import { CLAW_CLOSED, CLAW_OPEN } from './clawArt';

/** 상자에 닿은 뒤 집게를 오므리고 쉬는 시간(ms) */
const PAUSE = 800;

/**
 * 부모 설정의 미리보기: 지금 고른 값(네모 크기, 속도, 흔들림, 상자 수, 반짝 도움)으로
 * 집게가 상자 하나씩을 노려 오른쪽 → 위로 움직이기를 되풀이한다.
 */
export function ClawPreview({ tune }: { tune: ClawTune }) {
  const boxes = useMemo(() => placeBoxes(tune.boxes, seededRandom(4)), [tune.boxes]);
  const colors = useMemo(() => boxColors(4, boxes.length), [boxes.length]);
  const [now, setNow] = useState(() => performance.now());
  const [t0, setT0] = useState(now);

  useEffect(() => {
    let id = 0;
    const tick = () => {
      setNow(performance.now());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  // 값을 바꾸면 처음부터 다시 보여 준다.
  useEffect(() => setT0(performance.now()), [tune.speed, tune.wobble, tune.boxes]);

  // 한 번 노리는 데 걸리는 시간으로 지금이 몇 번째 상자 차례인지 센다.
  const motion = {
    vx: tune.speed,
    vy: tune.speed,
    wobble: tune.wobble,
    wobblePeriod: 900,
    wobblePhase: 0,
  };
  const plans = boxes.map((b) => {
    const press1 = (b.x / tune.speed) * 1000;
    const press2 = press1 + (b.y / tune.speed) * 1000;
    return { press1, press2, total: press2 + PAUSE };
  });
  const cycle = plans.reduce((sum, p) => sum + p.total, 0) || 1;
  let t = (now - t0) % cycle;
  let k = 0;
  while (k < plans.length - 1 && t >= plans[k].total) t -= plans[k++].total;
  const plan = plans[k];
  const claw = plan ? clawAt(motion, t, t >= plan.press1 ? plan.press1 : null, t >= plan.press2 ? plan.press2 : null) : { x: 0, y: 0 };
  const grabbing = !!plan && t >= plan.press2;
  const round = { targets: boxes, reach: tune.reach };

  return (
    <div className="claw-preview-wrap" aria-hidden="true">
      <div className="claw-machine claw-preview">
        <ClawBoard
          boxes={boxes}
          colors={colors}
          reach={tune.reach}
          glowBox={tune.glow ? boxAt(round, claw) : null}
          claw={claw}
          clawRows={grabbing ? CLAW_CLOSED : CLAW_OPEN}
          aim
          label="미리보기"
        />
      </div>
    </div>
  );
}
