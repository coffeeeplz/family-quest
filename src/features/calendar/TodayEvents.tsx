import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useSession } from '../../app/session';
import { isFor, occurrencesOn, todayLine } from '../../domain/calendar';
import { addDays } from '../../lib/dates';
import { Icon } from '../../ui/Sprite';
import { useEvents } from './useEvents';

/**
 * 홈 화면의 일정: 오늘과 내일을 한 줄씩 보여 준다. 누르면 캘린더로 간다. 일정이 없는 날은 그리지 않는다.
 * 자녀에게는 자기 일정과 가족 모두의 일정만, 부모에게는 가족의 모든 일정을 보여 준다.
 */
export function HomeEvents() {
  const { me, isParent } = useSession();
  const { today } = useFamilyData();
  const { events } = useEvents();
  const lineOf = (day: string) => todayLine(occurrencesOn(events, day).filter((o) => isParent || isFor(o.event, me.uid)));
  const days = [
    { label: '오늘', line: lineOf(today) },
    { label: '내일', line: lineOf(addDays(today, 1)) },
  ].filter((day) => day.line);
  if (days.length === 0) return null;
  return (
    <>
      {days.map((day) => (
        <Link key={day.label} className={day.label === '오늘' ? 'px today-line' : 'px today-line is-next'} to="/calendar" aria-label={`${day.label} 일정: ${day.line}. 캘린더 열기`}>
          <Icon name="calendar" size={24} />
          <span className="t-capb">{day.label}</span>
          <span className="t-cap grow">{day.line}</span>
          <span className="t-capb" aria-hidden="true">
            ›
          </span>
        </Link>
      ))}
    </>
  );
}
