// 코인을 받을 때의 효과음과 진동. 소리 파일 없이 브라우저가 직접 소리를 만든다.

const KEY = 'family-quest-feedback';

/** 효과음과 진동을 쓸지(이 기기에만 저장된다). 기본은 켜짐 */
export function feedbackOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setFeedbackOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // 저장이 막혀 있으면 다음에 다시 켜져 있을 뿐이다.
  }
}

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/**
 * 브라우저는 사람이 화면을 한 번 만진 뒤에만 소리를 허용한다.
 * 화면을 만질 때마다 소리 낼 준비를 해 둔다(휴대폰은 앱이 뒤로 갔다 오면 다시 막기도 한다).
 */
export function armSound(): () => void {
  const unlock = () => {
    if (!feedbackOn()) return;
    const c = audio();
    if (c && c.state === 'suspended') void c.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

/** [주파수(Hz), 시작(초), 길이(초)] */
type Note = [number, number, number];

const TUNES: Record<'coin' | 'big' | 'reward', Note[]> = {
  // 도트 게임의 코인 소리: 짧은 음 뒤에 높은 음
  coin: [
    [988, 0, 0.08],
    [1319, 0.08, 0.32],
  ],
  // 연속 달성, 목표 달성: 올라가는 팡파르
  big: [
    [523, 0, 0.1],
    [659, 0.1, 0.1],
    [784, 0.2, 0.1],
    [1047, 0.3, 0.14],
    [784, 0.44, 0.08],
    [1047, 0.52, 0.4],
  ],
  // 보상 획득
  reward: [
    [784, 0, 0.1],
    [1047, 0.1, 0.1],
    [1319, 0.2, 0.1],
    [1568, 0.3, 0.36],
  ],
};

export type Tune = keyof typeof TUNES;

/** 효과음을 낸다. 꺼 두었거나 브라우저가 아직 소리를 허용하지 않았으면 조용히 넘어간다. */
export function playTune(tune: Tune): void {
  if (!feedbackOn()) return;
  const c = audio();
  if (!c || c.state !== 'running') return;
  try {
    const t0 = c.currentTime + 0.02;
    for (const [freq, start, length] of TUNES[tune]) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.07, t0 + start);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + start + length);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + length + 0.02);
    }
  } catch {
    // 소리를 못 내도 화면 연출은 그대로 나온다.
  }
}

/** 사람이 버튼을 누른 순간에 부른다: 소리 낼 준비를 하고 바로 들려준다(효과음을 켰을 때 미리 듣기). */
export function previewTune(tune: Tune): void {
  const c = audio();
  if (!c) return;
  if (c.state === 'running') return playTune(tune);
  void c
    .resume()
    .then(() => playTune(tune))
    .catch(() => {});
}

/** 진동(안드로이드만 된다. 아이폰은 웹앱의 진동을 막아 둔다). */
export function buzz(pattern: number[]): void {
  if (!feedbackOn()) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    // 진동이 막혀 있어도 문제없다.
  }
}

/** 움직임을 줄이도록 설정한 기기인지 */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 축하 화면이 떠 있는 동안에는 위쪽 코인 숫자가 화면에 가려지므로, 끝날 즈음에 올라가게 한다.
let celebratingUntil = 0;

export function markCelebrating(ms: number): void {
  celebratingUntil = Date.now() + ms;
}

/** 축하 화면이 앞으로 몇 ms 더 떠 있는지 */
export function celebratingFor(): number {
  return Math.max(0, celebratingUntil - Date.now());
}
