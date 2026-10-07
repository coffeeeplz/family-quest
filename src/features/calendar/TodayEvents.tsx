import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useSession } from '../../app/session';
import { isFor, occurrencesOn, todayLine } from '../../domain/calendar';
import { Icon } from '../../ui/Sprite';
import { useEvents } from './useEvents';

/**
 * 홈 화면의 "오늘 일정" 한 줄. 누르면 캘린더로 간다. 오늘 일정이 없으면 아무것도 그리지 않는다.
 * 자녀에게는 자기 일정과 가족 모두의 일정만, 부모에게는 가족의 모든 일정을 보여 준다.
 */
export function TodayEvents() {
  const { me, isParent } = useSession();
  const { today } = useFamilyData();
  const { events } = useEvents();
  const line = todayLine(occurrencesOn(events, today).filter((o) => isParent || isFor(o.event, me.uid)));
  if (!line) return null;
  return (
    <Link className="px today-line" to="/calendar" aria-label={`오늘 일정: ${line}. 캘린더 열기`}>
      <Icon name="calendar" size={24} />
      <span className="t-capb">오늘</span>
      <span className="t-cap grow">{line}</span>
      <span className="t-capb" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
