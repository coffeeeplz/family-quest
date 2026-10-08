import type { Role } from '../backend/types';

/**
 * 알림의 종류. 사람마다 종류별로 켜고 끈다.
 * approval=완료 요청(부모), quest=새 퀘스트(자녀), result=승인·반려·칭찬 코인(자녀),
 * offer=코인 협상과 가격 협상에서 내 차례, shop=보상 신청·승인·보상 제안, note=가족 메모,
 * remind=저녁에 아직 안 한 "꼭" 퀘스트(자녀), morning=아침 일정
 */
export type PushType = 'approval' | 'quest' | 'result' | 'offer' | 'shop' | 'note' | 'remind' | 'morning';

export interface PushPrefs {
  types: Record<PushType, boolean>;
  /** 조용한 시간(HH:MM). 시작과 끝이 같으면 조용한 시간 없음 */
  quietStart: string;
  quietEnd: string;
  /** 저녁 할 일 알림 시각(자녀) */
  remindAt: string;
  /** 아침 일정 알림 시각 */
  morningAt: string;
}

export const PUSH_TYPES: PushType[] = ['approval', 'quest', 'result', 'offer', 'shop', 'note', 'remind', 'morning'];

/** 역할마다 보여 줄 알림 종류와 이름 */
export const PUSH_TYPE_LABELS: Record<Role, { type: PushType; label: string; hint: string }[]> = {
  parent: [
    { type: 'approval', label: '완료 요청', hint: '자녀가 "다 했어요!"를 누르면' },
    { type: 'offer', label: '코인 제안', hint: '자녀가 코인을 제안하거나 다시 제안하면' },
    { type: 'shop', label: '보상 신청과 제안', hint: '자녀가 보상을 신청하거나 상점에 올려 달라고 하면' },
    { type: 'note', label: '가족 메모', hint: '나에게 메모가 오면' },
    { type: 'morning', label: '아침 일정', hint: '정한 시각에 오늘 일정을 알려 줘요' },
  ],
  child: [
    { type: 'quest', label: '새 퀘스트', hint: '부모님이 퀘스트를 주면' },
    { type: 'result', label: '승인과 코인', hint: '승인, 다시 하기, 칭찬 코인' },
    { type: 'offer', label: '협상 내 차례', hint: '부모님이 다른 코인이나 가격을 제안하면' },
    { type: 'shop', label: '보상', hint: '보상 신청이 승인되거나 제안이 상점에 올라가면' },
    { type: 'note', label: '가족 메모', hint: '나에게 메모가 오면' },
    { type: 'remind', label: '저녁 할 일', hint: '정한 시각에 아직 안 한 "꼭" 할 일을 알려 줘요' },
    { type: 'morning', label: '아침 일정', hint: '정한 시각에 오늘 일정을 알려 줘요' },
  ],
};

export const DEFAULT_PUSH_PREFS: PushPrefs = {
  types: { approval: true, quest: true, result: true, offer: true, shop: true, note: true, remind: true, morning: true },
  quietStart: '22:00',
  quietEnd: '07:00',
  remindAt: '20:00',
  morningAt: '07:30',
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 저장된 값이 비었거나 모양이 틀려도 기본값으로 채운다. */
export function normalizePushPrefs(raw: unknown): PushPrefs {
  const d = (raw ?? {}) as Partial<PushPrefs> & { types?: Partial<Record<PushType, unknown>> };
  const types = { ...DEFAULT_PUSH_PREFS.types };
  for (const type of PUSH_TYPES) {
    if (typeof d.types?.[type] === 'boolean') types[type] = d.types[type] as boolean;
  }
  const time = (value: unknown, fallback: string) => (typeof value === 'string' && TIME.test(value) ? value : fallback);
  return {
    types,
    quietStart: time(d.quietStart, DEFAULT_PUSH_PREFS.quietStart),
    quietEnd: time(d.quietEnd, DEFAULT_PUSH_PREFS.quietEnd),
    remindAt: time(d.remindAt, DEFAULT_PUSH_PREFS.remindAt),
    morningAt: time(d.morningAt, DEFAULT_PUSH_PREFS.morningAt),
  };
}

export function isTime(value: string): boolean {
  return TIME.test(value);
}

/** 'HH:MM' 을 0시부터 지난 분으로 */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 지금(HH:MM)이 조용한 시간 안인지. 밤을 넘기는 구간(22:00~07:00)도 다룬다. */
export function inQuietHours(now: string, start: string, end: string): boolean {
  const n = minutesOf(now);
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === e) return false;
  return s < e ? n >= s && n < e : n >= s || n < e;
}

/**
 * 정해 둔 시각의 알림을 지금 보낼지. 오늘 이미 보냈으면 보내지 않고,
 * 시각이 지난 지 lateLimit 분이 넘었으면(서버가 잠깐 멈췄던 경우 등) 그날은 건너뛴다.
 */
export function dueNow(now: string, at: string, sentDay: string | undefined, today: string, lateLimit = 120): boolean {
  if (sentDay === today) return false;
  const diff = minutesOf(now) - minutesOf(at);
  return diff >= 0 && diff < lateLimit;
}

/** 서울 시각 기준의 'YYYY-MM-DD' 와 'HH:MM' */
export function seoulClock(ms: number = Date.now()): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** 알림 한 건의 내용. url 은 앱 안의 주소(#/home 등) */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** 같은 tag 의 알림은 하나로 합쳐진다. */
  tag: string;
}

/** 알림 문구가 너무 길면 줄인다. */
export function clip(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
