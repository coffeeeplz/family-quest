/** 날짜는 기기 현지 시간 기준의 'YYYY-MM-DD' 문자열(dateKey)로 다룬다. */

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return dateKey(parseDateKey(key)) === key;
}

export function addDays(key: string, n: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** 기기 현지 날짜를 하루에 1씩 커지는 번호로 바꾼다(서버 규칙이 날짜를 비교할 때 쓴다). */
export function dayNumber(d: Date = new Date()): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
}

/** 그 주의 월요일 */
export function weekStart(key: string): string {
  const weekday = parseDateKey(key).getDay(); // 0=일
  return addDays(key, weekday === 0 ? -6 : 1 - weekday);
}

export function weekdayOf(key: string): number {
  return parseDateKey(key).getDay();
}

/** 10월 6일 (화) */
export function formatDay(key: string): string {
  const d = parseDateKey(key);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

/** 10월 6일. 올해가 아니면 2025년 10월 6일 */
export function formatShortDay(key: string, today: string = dateKey()): string {
  const d = parseDateKey(key);
  const text = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return key.slice(0, 4) === today.slice(0, 4) ? text : `${d.getFullYear()}년 ${text}`;
}

/** 오후 3:10 */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const period = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}:${pad(d.getMinutes())}`;
}

/** 오늘이면 시간만, 아니면 날짜와 시간 */
export function formatWhen(ms: number, today: string = dateKey()): string {
  const key = dateKey(new Date(ms));
  if (key === today) return formatTime(ms);
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${formatTime(ms)}`;
}
