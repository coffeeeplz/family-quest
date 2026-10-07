import { AppError, type CalendarEvent, type EventInput, type EventRepeat } from '../backend/types';
import { WEEKDAYS, addDays, formatShortDay, isDateKey, parseDateKey, weekdayOf } from '../lib/dates';
import { MAX_TITLE } from './quests';

export const MAX_EVENT_MEMO = 100;
/** 한 일정이 이어질 수 있는 날수 */
export const MAX_EVENT_DAYS = 31;
/** 되풀이되는 일정이 이어질 수 있는 날수(다음 번과 겹치지 않게) */
export const MAX_REPEAT_DAYS = 6;
export const MAX_EVENTS = 500;

export const REPEAT_CHOICES: { id: EventRepeat; name: string }[] = [
  { id: 'none', name: '반복 안 함' },
  { id: 'weekly', name: '매주' },
  { id: 'monthly', name: '매달' },
  { id: 'yearly', name: '매년' },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 86_400_000;

/** 두 날짜 사이의 날수(b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / DAY_MS);
}

export function cleanEventInput(input: EventInput): EventInput {
  const title = input.title.trim();
  const memo = input.memo.trim();
  if (!title) throw new AppError('일정 이름을 적어 주세요.');
  if (title.length > MAX_TITLE) throw new AppError(`일정 이름은 ${MAX_TITLE}자까지 쓸 수 있어요.`);
  if (memo.length > MAX_EVENT_MEMO) throw new AppError(`메모는 ${MAX_EVENT_MEMO}자까지 쓸 수 있어요.`);
  if (!isDateKey(input.startDay)) throw new AppError('날짜를 골라 주세요.');
  const endDay = input.endDay || input.startDay;
  if (!isDateKey(endDay)) throw new AppError('끝나는 날을 다시 골라 주세요.');
  if (endDay < input.startDay) throw new AppError('끝나는 날은 시작하는 날보다 앞설 수 없어요.');
  const span = daysBetween(input.startDay, endDay);
  if (span >= MAX_EVENT_DAYS) throw new AppError(`일정은 ${MAX_EVENT_DAYS}일까지 이어질 수 있어요.`);

  let startTime = '';
  let endTime = '';
  if (!input.allDay) {
    if (!TIME.test(input.startTime)) throw new AppError('시작 시각을 정해 주세요.');
    startTime = input.startTime;
    if (input.endTime) {
      if (!TIME.test(input.endTime)) throw new AppError('끝나는 시각을 다시 정해 주세요.');
      if (span === 0 && input.endTime <= startTime) throw new AppError('끝나는 시각은 시작 시각보다 뒤여야 해요.');
      endTime = input.endTime;
    }
  }

  if (!REPEAT_CHOICES.some((choice) => choice.id === input.repeat)) throw new AppError('반복을 다시 골라 주세요.');
  let repeatUntil = '';
  if (input.repeat !== 'none') {
    if (span > MAX_REPEAT_DAYS) throw new AppError(`되풀이되는 일정은 ${MAX_REPEAT_DAYS + 1}일까지만 이어질 수 있어요.`);
    if (input.repeatUntil) {
      if (!isDateKey(input.repeatUntil)) throw new AppError('반복을 끝내는 날을 다시 골라 주세요.');
      if (input.repeatUntil < input.startDay) throw new AppError('반복을 끝내는 날은 시작하는 날보다 앞설 수 없어요.');
      repeatUntil = input.repeatUntil;
    }
  }

  return {
    title,
    memo,
    startDay: input.startDay,
    endDay,
    allDay: input.allDay,
    startTime,
    endTime,
    who: [...new Set(input.who.filter((uid) => typeof uid === 'string' && uid))],
    repeat: input.repeat,
    repeatUntil,
  };
}

/** 달력에 놓이는 일정 한 번: 반복 일정은 날짜마다 하나씩 생긴다. */
export interface Occurrence {
  event: CalendarEvent;
  /** 이번 회차가 시작하는 날과 끝나는 날 */
  start: string;
  end: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** from~to 와 겹치는 회차의 시작일들 */
function occurrenceStarts(event: CalendarEvent, from: string, to: string): string[] {
  const span = daysBetween(event.startDay, event.endDay);
  const earliest = addDays(from, -span); // 이날 이후에 시작해야 from 과 겹친다
  const last = event.repeat !== 'none' && event.repeatUntil && event.repeatUntil < to ? event.repeatUntil : to;
  const fits = (day: string) => day >= event.startDay && day >= earliest && day <= last;

  if (event.repeat === 'none') return event.startDay >= earliest && event.startDay <= to ? [event.startDay] : [];

  const starts: string[] = [];
  if (event.repeat === 'weekly') {
    const first = event.startDay >= earliest ? event.startDay : addDays(earliest, (weekdayOf(event.startDay) - weekdayOf(earliest) + 7) % 7);
    for (let day = first; day <= last; day = addDays(day, 7)) starts.push(day);
    return starts;
  }

  const [, month, dayOfMonth] = event.startDay.split('-').map(Number);
  const fromYear = Number(earliest.slice(0, 4));
  const toYear = Number(last.slice(0, 4));
  for (let year = fromYear; year <= toYear; year += 1) {
    const months = event.repeat === 'yearly' ? [month] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const m of months) {
      const day = `${year}-${pad(m)}-${pad(dayOfMonth)}`;
      // 31일이 없는 달이나 평년의 2월 29일은 건너뛴다.
      if (isDateKey(day) && fits(day)) starts.push(day);
    }
  }
  return starts;
}

/** from~to 사이의 날짜마다 그날에 걸치는 일정을 모은다. 하루 안에서는 하루 종일·여러 날 일정이 먼저, 그다음 시각 순. */
export function occurrencesByDay(events: CalendarEvent[], from: string, to: string): Map<string, Occurrence[]> {
  const byDay = new Map<string, Occurrence[]>();
  for (const event of events) {
    const span = daysBetween(event.startDay, event.endDay);
    for (const start of occurrenceStarts(event, from, to)) {
      const occurrence: Occurrence = { event, start, end: addDays(start, span) };
      for (let offset = 0; offset <= span; offset += 1) {
        const day = addDays(start, offset);
        if (day < from || day > to) continue;
        const list = byDay.get(day);
        if (list) list.push(occurrence);
        else byDay.set(day, [occurrence]);
      }
    }
  }
  const rank = (o: Occurrence) => (o.event.allDay || o.start !== o.end ? '0' : `1${o.event.startTime}`);
  for (const list of byDay.values()) {
    list.sort((a, b) => rank(a).localeCompare(rank(b)) || a.event.title.localeCompare(b.event.title, 'ko'));
  }
  return byDay;
}

export function occurrencesOn(events: CalendarEvent[], day: string): Occurrence[] {
  return occurrencesByDay(events, day, day).get(day) ?? [];
}

/** '15:30' → '오후 3:30' */
export function clockLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}:${pad(m)}`;
}

/** 일정 한 번이 언제인지: '하루 종일', '오후 3:30', '오후 3:30~오후 5:00', '10월 9일~11일' */
export function whenLabel(occurrence: Occurrence, today: string): string {
  const { event, start, end } = occurrence;
  const time = event.allDay ? '' : event.endTime ? `${clockLabel(event.startTime)}~${clockLabel(event.endTime)}` : clockLabel(event.startTime);
  if (start === end) return event.allDay ? '하루 종일' : time;
  const range = `${formatShortDay(start, today)}~${formatShortDay(end, today)}`;
  return time ? `${range} · ${time}` : range;
}

/** '매주 수요일', '매달 9일', '매년 10월 9일'. 반복하지 않으면 빈 문자열 */
export function repeatText(event: Pick<EventInput, 'repeat' | 'startDay' | 'repeatUntil'>): string {
  if (event.repeat === 'none' || !isDateKey(event.startDay)) return '';
  const d = parseDateKey(event.startDay);
  const base =
    event.repeat === 'weekly'
      ? `매주 ${WEEKDAYS[d.getDay()]}요일`
      : event.repeat === 'monthly'
        ? `매달 ${d.getDate()}일`
        : `매년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  return event.repeatUntil ? `${base} (${formatShortDay(event.repeatUntil, event.startDay)}까지)` : base;
}

/** 이 사람의 일정인지(가족 모두의 일정 포함) */
export function isFor(event: CalendarEvent, uid: string): boolean {
  return event.who.length === 0 || event.who.includes(uid);
}

/** 고치기와 지우기는 올린 사람과 부모만 */
export function canEditEvent(event: CalendarEvent, uid: string, isParent: boolean): boolean {
  return isParent || event.createdBy === uid;
}

/** 달력에 그릴 주(일요일 시작)들. 앞뒤 달의 날짜도 채워서 돌려준다. month 는 1~12. */
export function monthGrid(year: number, month: number): string[][] {
  const first = `${year}-${pad(month)}-01`;
  const start = addDays(first, -weekdayOf(first));
  const weeks: string[][] = [];
  for (let day = start; weeks.length < 6; day = addDays(day, 7)) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(day, i));
    // 다음 달 날짜만 있는 주는 그리지 않는다.
    if (weeks.length >= 4 && week[0].slice(0, 7) !== first.slice(0, 7)) break;
    weeks.push(week);
  }
  return weeks;
}

/** 한 달 앞뒤로 옮긴 { year, month } */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** 홈에 보일 "오늘 일정" 한 줄: '오후 3:30 치과 외 1개'. 일정이 없으면 null */
export function todayLine(occurrences: Occurrence[]): string | null {
  if (occurrences.length === 0) return null;
  const first = occurrences[0];
  const time = first.event.allDay || first.start !== first.end ? '' : `${clockLabel(first.event.startTime)} `;
  const more = occurrences.length > 1 ? ` 외 ${occurrences.length - 1}개` : '';
  return `${time}${first.event.title}${more}`;
}
