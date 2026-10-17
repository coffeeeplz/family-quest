import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { ClawRound } from '../../backend/types';
import { BOARD, boxAt, cannotStart, clawAt, playsToday, winLabel } from '../../domain/claw';
import { availableCoins } from '../../domain/shop';
import { findPack } from '../../domain/stickers';
import { findEntry } from '../../domain/wardrobe';
import { buzz, markCelebrating, playTune, previewTune, reducedMotion } from '../../lib/feedback';
import { Icon } from '../../ui/Sprite';
import { Button, CoinPill } from '../../ui/kit';
import { errorText } from '../../ui/toast';
import { PackPreview } from '../stickers/StickerShop';
import { EntryPicture } from '../wardrobe/WardrobeAdmin';
import { ClawBoard, Pix, boxColors } from './ClawBoard';
import { BOX, BOX_LIFT, CLAW_CLOSED, CLAW_HALF, CLAW_OPEN } from './clawArt';

/*
 * 인형뽑기 화면. 시간 흐름(ms, 움직임 줄이기 설정이면 짧게):
 *   x: 오른쪽으로 → [버튼] → y: 위로 → [버튼] → grab: 내려가며 오므림
 *   → (못 잡음) miss: 빈 집게가 올라옴
 *   → (잡음) rise: 상자를 들고 올라옴 → carry: 출구로 옮김(흔들흔들 위기)
 *        → drop: 중간에 상자가 미끄러져 떨어짐   또는   → open: 상자가 점점 세게 흔들리다 번쩍, 내용물 공개
 */

type Phase = 'idle' | 'starting' | 'x' | 'y' | 'grab' | 'wait' | 'miss' | 'rise' | 'carry' | 'open' | 'done';

const slow = () => (reducedMotion() ? 0.4 : 1);
const T = {
  grab: 900,
  rise: 650,
  carry: 2800,
  dropFall: 1500,
  open: 3600,
};
/** 출구(왼쪽 위)의 게임판 위치 */
const EXIT = { x: 7, y: 93 };
/** 떨어뜨리는 판에서 상자가 미끄러지는 지점(옮기는 길의 비율)과 위기 순간들 */
const DROP_AT = 0.62;
const CRISES = [0.3, 0.48];

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export function ClawPage() {
  const backend = useBackend();
  const navigate = useNavigate();
  const { family, me, isParent } = useSession();
  const { orders, today } = useFamilyData();
  const settings = family.settings.claw;

  const [rounds, setRounds] = useState<ClawRound[]>([]);
  useEffect(() => backend.watchMyClawRounds(family.id, me.uid, today, setRounds), [backend, family.id, me.uid, today]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState<ClawRound | null>(null);
  const [result, setResult] = useState<ClawRound | null>(null);
  const [error, setError] = useState('');
  const [, setFrame] = useState(0);
  // 움직임에 쓰는 값들: 그릴 때마다 바뀌므로 ref 에 둔다.
  const g = useRef({
    t0: 0,
    phaseAt: 0,
    press1: null as number | null,
    press2: null as number | null,
    crisesPlayed: 0,
    drumAt: 0,
    finishing: false,
    cues: new Set<string>(),
  });

  const free = availableCoins(me, orders);
  const plays = playsToday(rounds, me.uid, today);
  const blocked = cannotStart(settings, isParent, free, plays);
  const colors = useMemo(() => (round ? boxColors(round.seed, round.targets.length) : []), [round]);

  // ── 시간이 흐르게 하기 ─────────────────────────────────────────────────────
  const moving = phase !== 'idle' && phase !== 'done' && phase !== 'starting';
  useEffect(() => {
    if (!moving) return;
    let id = 0;
    const tick = () => {
      setFrame((f) => f + 1);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [moving]);

  const now = performance.now();
  const sinceStart = now - g.current.t0;
  const inPhase = now - g.current.phaseAt;

  function go(next: Phase) {
    g.current.phaseAt = performance.now();
    g.current.cues = new Set();
    setPhase(next);
  }
  /** 한 번만 나는 소리·진동 */
  function cue(key: string, fn: () => void) {
    if (g.current.cues.has(key)) return;
    g.current.cues.add(key);
    fn();
  }

  // ── 단계 넘기기(그릴 때마다 살핀다) ────────────────────────────────────────
  useEffect(() => {
    // 끝까지 가도록 누르지 않으면 벽에서 저절로 다음으로 넘어간다.
    if (round && phase === 'x' && clawAt(round, sinceStart, null, null).x >= BOARD) press();
    if (round && phase === 'y' && clawAt(round, sinceStart, g.current.press1, null).y >= BOARD) press();
    if (phase === 'grab' && inPhase >= T.grab * slow()) go(result ? (result.outcome === 'miss' ? 'miss' : 'rise') : 'wait');
    if (phase === 'wait' && result) go(result.outcome === 'miss' ? 'miss' : 'rise');
    if (phase === 'miss' && inPhase >= 900 * slow()) {
      playTune('fail');
      buzz([60, 60, 60]);
      setPhase('done');
    }
    if (phase === 'rise' && inPhase >= T.rise * slow()) go('carry');
    if (phase === 'carry') {
      const total = (result?.outcome === 'drop' ? T.carry * DROP_AT + T.dropFall : T.carry) * slow();
      if (inPhase >= total) {
        if (result?.outcome === 'win') {
          go('open');
        } else {
          playTune('fail');
          buzz([60, 60, 60]);
          setPhase('done');
        }
      }
    }
    if (phase === 'open' && inPhase >= T.open * slow()) setPhase('done');
  });

  // ── 버튼 ───────────────────────────────────────────────────────────────────
  async function start() {
    if (phase !== 'idle' && phase !== 'done') return;
    setError('');
    setResult(null);
    previewTune('tick');
    setPhase('starting');
    try {
      const r = await backend.startClaw(family.id, me.uid);
      g.current = {
        t0: performance.now(),
        phaseAt: performance.now(),
        press1: null,
        press2: null,
        crisesPlayed: 0,
        drumAt: 0,
        finishing: false,
        cues: new Set(),
      };
      setRound(r);
      setPhase('x');
    } catch (e) {
      setError(errorText(e));
      setPhase('idle');
    }
  }

  function press() {
    if (!round) return;
    const t = performance.now() - g.current.t0;
    if (phase === 'x') {
      g.current.press1 = t;
      playTune('tick');
      go('y');
    } else if (phase === 'y' && !g.current.finishing) {
      g.current.press2 = t;
      g.current.finishing = true;
      playTune('tick');
      go('grab');
      backend
        .finishClaw(family.id, round.id, [g.current.press1 ?? 0, t])
        .then((done) => {
          // 상품 코인이 들어와도 위쪽 숫자는 연출이 끝날 즈음에 올라가게 한다.
          markCelebrating((T.grab + T.rise + T.carry + T.open) * slow());
          setResult(done);
        })
        .catch((e) => {
          setError(errorText(e));
          setResult({ ...round, status: 'done', outcome: 'miss' });
        });
    }
  }

  // ── 지금 집게와 상자의 자리 ────────────────────────────────────────────────
  const stop = round && g.current.press2 !== null ? clawAt(round, g.current.press2, g.current.press1, g.current.press2) : null;
  let claw = { x: 0, y: 0 };
  let clawRows = CLAW_OPEN;
  let clawScale = 1;
  let carried: { x: number; y: number } | null = null;
  let falling: { x: number; y: number; spin: number } | null = null;
  let bubble = '';

  if (phase === 'idle' || phase === 'starting') claw = { x: 0, y: 0 };
  else if (round && (phase === 'x' || phase === 'y')) claw = clawAt(round, sinceStart, g.current.press1, null);
  else if (stop) {
    const k = slow();
    if (phase === 'grab' || phase === 'wait') {
      const p = phase === 'wait' ? 1 : clamp01(inPhase / (T.grab * k));
      claw = stop;
      clawScale = 1 - 0.2 * Math.sin(Math.min(p, 1) * Math.PI * 0.5);
      clawRows = p < 0.35 ? CLAW_OPEN : p < 0.65 ? CLAW_HALF : CLAW_CLOSED;
      if (p >= 0.65)
        cue('grab', () => {
          playTune('grab');
          buzz([40]);
        });
    } else if (phase === 'miss') {
      const p = clamp01(inPhase / (900 * k));
      claw = stop;
      clawScale = 0.8 + 0.2 * p;
      clawRows = p < 0.3 ? CLAW_CLOSED : CLAW_HALF;
      bubble = p > 0.4 ? '헛손질…' : '';
    } else if (phase === 'rise') {
      const p = clamp01(inPhase / (T.rise * k));
      claw = stop;
      clawScale = 0.8 + 0.2 * p;
      clawRows = CLAW_CLOSED;
      carried = { x: claw.x, y: claw.y - 7 * clawScale };
      bubble = '잡았다!';
      cue('caught', () => buzz([30, 40, 30]));
    } else if (phase === 'carry' || (phase === 'done' && result?.outcome === 'drop')) {
      const dropping = result?.outcome === 'drop';
      const pathMs = T.carry * k;
      // 끝난 뒤에는 마지막 모습(상자는 바닥, 집게는 출구)에 멈춰 둔다.
      const elapsed = phase === 'done' ? pathMs * DROP_AT + T.dropFall * k : inPhase;
      const p = clamp01(elapsed / pathMs);
      // 옮기는 길: 처음엔 천천히, 위기 순간엔 크게 흔들림
      let shake = phase === 'done' ? 0 : Math.sin(elapsed / 70) * 0.8;
      for (const c of phase === 'done' ? [] : dropping ? CRISES : [0.5]) {
        const d = Math.abs(p - c);
        if (d < 0.06) {
          shake += Math.sin(elapsed / 28) * (dropping ? 4 : 2.5) * (1 - d / 0.06);
          cue(`crisis-${c}`, () => {
            playTune('tick');
            buzz([25, 30, 25]);
          });
        }
      }
      const along = (q: number) => ({
        x: stop.x + (EXIT.x - stop.x) * easeInOut(q),
        y: stop.y + 6 + (EXIT.y - stop.y - 6) * easeInOut(q),
      });
      const pos = along(dropping ? Math.min(p, DROP_AT) + Math.max(0, p - DROP_AT) : p);
      claw = { x: pos.x + shake, y: pos.y };
      clawRows = CLAW_CLOSED;
      if (dropping && p >= DROP_AT) {
        // 미끄러져 떨어짐: 처음엔 느리게(멈칫), 그다음 빠르게, 바닥에서 두 번 튕김
        const at = along(DROP_AT);
        const f = clamp01((elapsed - pathMs * DROP_AT) / (T.dropFall * k));
        const slowStart = f < 0.25 ? f * 0.3 : 0.075 + (f - 0.25) * 1.233;
        const floor = 6;
        const fallDist = at.y - 6 - floor;
        let y = at.y - 6 - fallDist * Math.min(1, slowStart ** 1.6);
        if (slowStart >= 1) y = floor + Math.abs(Math.sin((f - 0.92) * 40)) * 3 * (1 - f);
        falling = { x: at.x + slowStart * 6, y, spin: slowStart * 200 };
        clawRows = f < 0.1 ? CLAW_HALF : CLAW_OPEN;
        bubble = f < 0.25 ? '어어…?' : '';
        cue('drop', () => buzz([80]));
      } else {
        carried = { x: claw.x, y: claw.y - 7 };
        if (!dropping && p > 0.9) bubble = '휴~';
      }
    } else if (phase === 'open' || (phase === 'done' && result?.outcome === 'win')) {
      claw = EXIT;
      clawRows = CLAW_OPEN;
    }
  }

  // ── 상자 열기 연출 ─────────────────────────────────────────────────────────
  const opening = phase === 'open' || (phase === 'done' && result?.outcome === 'win');
  const openMs = phase === 'open' ? inPhase / slow() : Infinity;
  let boxShake = 0;
  let lid = false;
  if (phase === 'open') {
    const stage = openMs < 1000 ? 1 : openMs < 1900 ? 2 : openMs < 2700 ? 3 : 4;
    const amp = [0, 1.5, 3, 5, 0][stage];
    const hz = [0, 5, 10, 18, 0][stage];
    boxShake = amp * Math.sin((openMs / 1000) * hz * Math.PI * 2);
    lid = stage === 3 && Math.sin((openMs / 1000) * 14 * Math.PI) > 0;
    const beat = [0, 500, 300, 160, 0][stage];
    if (beat && openMs - g.current.drumAt >= beat) {
      g.current.drumAt = openMs;
      playTune('drum');
      buzz([20]);
    }
    if (stage === 4)
      cue('reveal', () => {
        playTune(result?.prize?.kind === 'coin' ? 'coin' : 'reward');
        buzz([60, 40, 120]);
      });
  }
  const rays = phase === 'open' && openMs > 1900 && openMs < 3000;
  const flash = phase === 'open' && openMs >= 2700 && openMs < 3000 ? 1 - (openMs - 2700) / 300 : 0;
  const revealed = phase === 'done' || (phase === 'open' && openMs >= 2700);

  const tapToPress = phase === 'x' || phase === 'y';
  // 맞출 곳: 상자마다 둘레의 점선 네모(잡히는 범위). 반짝 도움이 켜져 있으면 조준점이 들어간 네모가 반짝인다.
  const glowBox = round?.glow && tapToPress ? boxAt(round, claw) : null;
  // 잡은 상자는 바닥에서 빼고 집게와 함께 그린다.
  const caught = result?.caught ?? null;
  const lifted = caught !== null && phase !== 'grab' && phase !== 'wait';
  const caughtColor = caught !== null ? colors[caught] : '#FFB3D1';

  return (
    <main className="screen claw-screen">
      <button type="button" className="link back-link" onClick={() => navigate(-1)}>
        ‹ 뒤로
      </button>
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">인형뽑기</h1>
          <p className="t-cap">{isParent ? '연습 판(공짜)' : `한 판 ${settings.price}코인${settings.perDay > 0 ? ` · 오늘 ${plays}/${settings.perDay}번` : ''}`}</p>
        </div>
        <CoinPill amount={me.coins} />
      </header>

      <div className="claw-machine" onPointerDown={tapToPress ? press : undefined}>
        <ClawBoard
          boxes={round?.targets ?? []}
          colors={colors}
          hidden={lifted ? caught : null}
          reach={round && tapToPress ? round.reach : null}
          glowBox={glowBox}
          claw={claw}
          clawRows={clawRows}
          clawScale={clawScale}
          aim={tapToPress}
          guide={phase === 'x'}
          carried={carried && { ...carried, color: caughtColor }}
          falling={falling && { ...falling, color: caughtColor }}
          bubble={bubble}
        />

        {opening && (
          <div className="claw-open" aria-live="polite">
            {rays && <div className="claw-rays" aria-hidden="true" />}
            {!revealed && (
              <svg
                viewBox="0 0 40 40"
                className="claw-bigbox"
                style={{
                  transform: `translateX(${boxShake}px) rotate(${boxShake * 1.5}deg)`,
                }}
                aria-hidden="true"
              >
                <Pix rows={lid ? BOX_LIFT : BOX} cx={20} cy={20} size={36} color={caughtColor} />
              </svg>
            )}
            {revealed && result?.prize && <PrizeReveal round={result} />}
            {flash > 0 && <div className="claw-flash" style={{ opacity: flash }} aria-hidden="true" />}
          </div>
        )}
        {/* 놓치거나 떨어뜨린 결과는 기계 위에 띄운다(버튼 아래로 밀리지 않게) */}
        {phase === 'done' && result && result.outcome !== 'win' && (
          <p className="claw-banner t-title" role="status">
            {result.outcome === 'drop' ? '앗, 떨어졌어요! 아깝다!' : '아깝다! 다시 해 볼까요?'}
          </p>
        )}
      </div>

      {/* 버튼은 기계 바로 밑에 둔다(한 화면에 보이게) */}
      {tapToPress ? (
        <>
          <Button big block onPointerDown={press} aria-label={phase === 'x' ? '멈추고 위로' : '멈추고 집기'}>
            {phase === 'x' ? '여기서 위로!' : '여기서 집기!'}
          </Button>
          <p className="t-cap center">기계를 아무 데나 눌러도 돼요</p>
        </>
      ) : (
        <>
          <Button big block disabled={!!blocked || (phase !== 'idle' && phase !== 'done')} onClick={() => void start()}>
            {phase === 'starting'
              ? '준비 중…'
              : phase !== 'idle' && phase !== 'done'
                ? '두근두근…'
                : isParent
                  ? '연습하기(공짜)'
                  : phase === 'done'
                    ? `한 번 더! (${settings.price}코인)`
                    : `시작! (${settings.price}코인)`}
          </Button>
          {blocked && (phase === 'idle' || phase === 'done') && <p className="t-capb center">{blocked}</p>}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {(phase === 'idle' || phase === 'starting') && (
        <p className="t-cap center">
          집게가 오른쪽으로 가요. 버튼을 누르면 위로, 한 번 더 누르면 집어요. 집게 끝의 빨간 점이 아무 상자의 점선 네모 안에 있을 때 멈추면 그 상자를 잡아요!
        </p>
      )}
    </main>
  );
}

/** 상자에서 나온 것 */
function PrizeReveal({ round }: { round: ClawRound }) {
  const prize = round.prize!;
  let picture = <Icon name="game" size={72} />;
  let note = '';
  if (prize.kind === 'coin') {
    picture = <Icon name="coin" size={72} />;
    if (prize.converted) note = '이미 다 가지고 있어서 코인으로 바꿨어요';
  } else if (prize.kind === 'wardrobe') {
    const entry = findEntry(prize.itemId);
    if (entry) picture = <EntryPicture entry={entry} size={88} />;
    note = '새 꾸미기! 내 캐릭터에서 입어 보세요';
  } else if (prize.kind === 'sticker') {
    const pack = findPack(prize.packId);
    if (pack) picture = <PackPreview pack={pack} size={40} />;
    note = '새 스티커 팩! 메모에 붙여 보세요';
  } else {
    note = '인벤토리에 들어갔어요. 부모님께 보여 주고 써요';
  }
  return (
    <div className="claw-prize">
      <div className="claw-prize-pic">{picture}</div>
      <p className="t-title">{prize.kind === 'coin' ? `+${prize.amount}코인` : winLabel(prize)}</p>
      {note && <p className="t-cap">{note}</p>}
      {round.practice && <p className="t-capb">연습 판이라 실제로 받지는 않아요</p>}
    </div>
  );
}
