import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { CalendarEvent, Member, Quest } from '../../backend/types';
import { isFor, monthGrid, occurrencesByDay, shiftMonth, whenLabel, type Occurrence } from '../../domain/calendar';
import { holidayName, holidaysComplete, HOLIDAY_TABLE_UNTIL } from '../../domain/holidays';
import { WEEKDAYS, formatDay, parseDateKey, weekdayOf } from '../../lib/dates';
import { colorHex } from '../../lib/sprites';
import { Avatar, Icon } from '../../ui/Sprite';
import { Button, CoinInline, Sheet } from '../../ui/kit';
import { useSwipe } from '../../ui/useSwipe';
import { EventSheet } from './EventSheet';
import { useEvents } from './useEvents';

const PREFS_KEY = 'family-quest-calendar-quests';
/** 달력 한 칸에 그리는 점의 최대 개수 */
const MAX_DOTS = 3;

function readShowQuests(): boolean {
  try {
    return localStorage.getItem(PREFS_KEY) !== 'off';
  } catch {
    return true;
  }
}

type Open = { kind: 'new' } | { kind: 'event'; event: CalendarEvent } | { kind: 'menu' } | null;

/**
 * 가족 캘린더: 월 달력에서 날짜를 누르면 그날 일정이 아래에 나온다.
 * 누구 일정만 볼지, 퀘스트 기한을 함께 볼지는 "더 보기" 안에 있다.
 */
export function CalendarPage() {
  const backend = useBackend();
  const { members, isParent } = useSession();
  const { today, quests } = useFamilyData();
  const { events, failed } = useEvents();
  const [view, setView] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [selected, setSelected] = useState(today);
  const [whoFilter, setWhoFilter] = useState('all');
  const [showQuests, setShowQuests] = useState(readShowQuests);
  const [open, setOpen] = useState<Open>(null);

  const memberById = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);
  const filterMember = whoFilter === 'all' ? undefined : memberById.get(whoFilter);
  const weeks = useMemo(() => monthGrid(view.year, view.month), [view]);
  const shown = useMemo(() => (filterMember ? events.filter((e) => isFor(e, filterMember.uid)) : events), [events, filterMember]);
  const byDay = useMemo(() => occurrencesByDay(shown, weeks[0][0], weeks[weeks.length - 1][6]), [shown, weeks]);

  // 한 번짜리 퀘스트의 기한. 매일 되풀이되는 퀘스트는 달력이 복잡해져서 넣지 않는다.
  const dueByDay = useMemo(() => {
    const map = new Map<string, Quest[]>();
    if (!showQuests) return map;
    for (const quest of quests) {
      if (!quest.active || quest.repeat.type !== 'none') continue;
      if (filterMember && quest.assigneeUid !== filterMember.uid) continue;
      map.set(quest.repeat.date, [...(map.get(quest.repeat.date) ?? []), quest]);
    }
    return map;
  }, [quests, showQuests, filterMember]);

  function move(delta: number) {
    const next = shiftMonth(view.year, view.month, delta);
    setView(next);
    // 달을 넘기면 그 달의 1일(이번 달이면 오늘)을 골라 둔다.
    const sameAsToday = next.year === Number(today.slice(0, 4)) && next.month === Number(today.slice(5, 7));
    setSelected(sameAsToday ? today : `${next.year}-${String(next.month).padStart(2, '0')}-01`);
  }

  function goToday() {
    setView({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
    setSelected(today);
  }

  function setQuests(on: boolean) {
    setShowQuests(on);
    try {
      localStorage.setItem(PREFS_KEY, on ? 'on' : 'off');
    } catch {
      // 저장이 막혀 있으면 다음에 다시 켜져 있을 뿐이다.
    }
  }

  const swipe = useSwipe((way) => move(way === 'next' ? 1 : -1));
  const monthKey = `${view.year}-${String(view.month).padStart(2, '0')}`;
  const dayEvents = byDay.get(selected) ?? [];
  const dayQuests = dueByDay.get(selected) ?? [];
  const holiday = holidayName(selected);

  const dotColor = (occurrence: Occurrence) => {
    const first = occurrence.event.who.map((uid) => memberById.get(uid)).find((m): m is Member => m !== undefined);
    return first ? colorHex(first.avatar.color) : 'var(--ink)';
  };

  return (
    <main className="screen">
      <header className="cal-head">
        <Button tone="plain" aria-label="이전 달" onClick={() => move(-1)}>
          ‹
        </Button>
        <h1 className="t-title">
          {view.year}년 {view.month}월
        </h1>
        <Button tone="plain" aria-label="다음 달" onClick={() => move(1)}>
          ›
        </Button>
      </header>

      <div className="action-row">
        <Button big onClick={() => setOpen({ kind: 'new' })}>
          + 일정
        </Button>
        <Button tone="plain" big onClick={goToday}>
          오늘
        </Button>
        <Button tone="plain" big aria-label="더 보기: 누구 일정, 퀘스트 기한" onClick={() => setOpen({ kind: 'menu' })}>
          <Icon name="more" size={24} />
        </Button>
      </div>

      {filterMember && (
        <button type="button" className="chip filter-chip" onClick={() => setWhoFilter('all')} aria-label={`${filterMember.displayName} 일정만 보는 중. 누르면 전체 보기`}>
          <Avatar avatar={filterMember.avatar} size={24} />
          {filterMember.displayName} 일정만 보는 중 ×
        </button>
      )}

      {failed && (
        <p className="px note t-capb" role="alert" style={{ lineHeight: '18px' }}>
          일정을 불러오지 못했어요. 앱을 닫았다가 다시 열어 주세요.
          {isParent && backend.mode === 'firebase' ? ' 계속되면 Firebase 규칙을 새로 게시했는지 확인해 주세요.' : ''}
        </p>
      )}

      <div className="px cal" role="grid" aria-label={`${view.year}년 ${view.month}월 달력`} {...swipe}>
        <div className="cal-week" role="row">
          {WEEKDAYS.map((name, index) => (
            <span key={name} role="columnheader" className={index === 0 ? 'cal-name sun' : index === 6 ? 'cal-name sat' : 'cal-name'}>
              {name}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="cal-week" role="row">
            {week.map((day) => {
              const occurrences = byDay.get(day) ?? [];
              const due = dueByDay.get(day) ?? [];
              const dayHoliday = holidayName(day);
              const weekday = weekdayOf(day);
              const classes = ['cal-day'];
              if (day.slice(0, 7) !== monthKey) classes.push('other');
              if (weekday === 0 || dayHoliday) classes.push('sun');
              else if (weekday === 6) classes.push('sat');
              if (day === today) classes.push('today');
              const count = occurrences.length + due.length;
              const label = `${formatDay(day)}${dayHoliday ? `, ${dayHoliday}` : ''}${count > 0 ? `, 일정 ${count}개` : ''}`;
              return (
                <button key={day} type="button" role="gridcell" className={classes.join(' ')} aria-label={label} aria-selected={day === selected} onClick={() => setSelected(day)}>
                  <span className="num">{parseDateKey(day).getDate()}</span>
                  <span className="dots" aria-hidden="true">
                    {occurrences.slice(0, MAX_DOTS).map((o) => (
                      <i key={`${o.event.id}-${o.start}`} style={{ background: dotColor(o) }} />
                    ))}
                    {due.slice(0, Math.max(0, MAX_DOTS - occurrences.length)).map((q) => (
                      <i key={q.id} className="quest" />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <section className="stack" aria-label="고른 날의 일정" style={{ gap: 12 }}>
        <div className="section-head">
          <h2 className="t-capb">
            {formatDay(selected)}
            {selected === today ? ' · 오늘' : ''}
          </h2>
          {holiday && <span className="t-capb holiday">{holiday}</span>}
        </div>
        {dayEvents.length === 0 && dayQuests.length === 0 && <p className="t-cap">일정이 없어요.</p>}
        {dayEvents.map((occurrence) => {
          const { event } = occurrence;
          const people = event.who.map((uid) => memberById.get(uid)).filter((m): m is Member => m !== undefined);
          return (
            <button
              key={`${event.id}-${occurrence.start}`}
              type="button"
              className="px cal-item"
              aria-label={`${event.title}, ${whenLabel(occurrence, today)}`}
              onClick={() => setOpen({ kind: 'event', event })}
            >
              <i className="bar" style={{ background: dotColor(occurrence) }} aria-hidden="true" />
              <span className="card-main">
                <span className="t-body item-title">{event.title}</span>
                <span className="t-cap">
                  {whenLabel(occurrence, today)}
                  {event.who.length === 0 ? ' · 가족 모두' : ''}
                </span>
              </span>
              <span className="who" aria-hidden="true">
                {people.map((m) => (
                  <Avatar key={m.uid} avatar={m.avatar} size={24} />
                ))}
              </span>
            </button>
          );
        })}
        {dayQuests.map((quest) => {
          const kid = memberById.get(quest.assigneeUid);
          const body = (
            <>
              <Icon name="quest" size={24} />
              <span className="card-main">
                <span className="t-body item-title">{quest.title}</span>
                <span className="t-cap">퀘스트 기한{kid ? ` · ${kid.displayName}` : ''}</span>
              </span>
              <CoinInline amount={quest.reward} sign />
            </>
          );
          return isParent ? (
            <Link key={quest.id} className="px cal-item" to={`/quests/${quest.id}`}>
              {body}
            </Link>
          ) : (
            <div key={quest.id} className="px cal-item">
              {body}
            </div>
          );
        })}
      </section>

      {open?.kind === 'menu' && (
        <Sheet title="캘린더 메뉴" onClose={() => setOpen(null)}>
          <div className="field" role="radiogroup" aria-label="누구 일정만 보기">
            <div className="label">누구 일정만 보기</div>
            <div className="chips">
              <button
                type="button"
                role="radio"
                className="chip"
                aria-checked={whoFilter === 'all'}
                onClick={() => {
                  setWhoFilter('all');
                  setOpen(null);
                }}
              >
                전체
              </button>
              {members.map((m) => (
                <button
                  key={m.uid}
                  type="button"
                  role="radio"
                  className="chip"
                  aria-checked={whoFilter === m.uid}
                  onClick={() => {
                    setWhoFilter(m.uid);
                    setOpen(null);
                  }}
                >
                  <Avatar avatar={m.avatar} size={24} />
                  {m.displayName}
                </button>
              ))}
            </div>
            <p className="t-cap">가족 모두의 일정은 누구를 골라도 함께 보여요.</p>
          </div>
          <div className="field" role="radiogroup" aria-label="퀘스트 기한 함께 보기">
            <div className="label">퀘스트 기한 함께 보기</div>
            <div className="segmented">
              <button type="button" role="radio" className="chip" aria-checked={showQuests} onClick={() => setQuests(true)}>
                보기
              </button>
              <button type="button" role="radio" className="chip" aria-checked={!showQuests} onClick={() => setQuests(false)}>
                숨기기
              </button>
            </div>
            <p className="t-cap">한 번짜리 퀘스트의 기한이 달력에 노란 점으로 보여요.</p>
          </div>
          {!holidaysComplete(view.year) && (
            <p className="t-cap" style={{ lineHeight: '18px' }}>
              설·추석처럼 해마다 바뀌는 공휴일은 {HOLIDAY_TABLE_UNTIL}년까지만 들어 있어요.
            </p>
          )}
          <Button tone="plain" big block onClick={() => setOpen(null)}>
            닫기
          </Button>
        </Sheet>
      )}
      {open?.kind === 'new' && <EventSheet event={null} day={selected} onClose={() => setOpen(null)} />}
      {open?.kind === 'event' && <EventSheet event={open.event} day={selected} onClose={() => setOpen(null)} />}
    </main>
  );
}
