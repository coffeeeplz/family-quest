import { useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { CalendarEvent, EventRepeat } from '../../backend/types';
import { MAX_EVENT_MEMO, REPEAT_CHOICES, canEditEvent, clockLabel, repeatText } from '../../domain/calendar';
import { MAX_TITLE } from '../../domain/quests';
import { formatDay } from '../../lib/dates';
import { Avatar } from '../../ui/Sprite';
import { Button, Field, FieldGroup, Sheet } from '../../ui/kit';
import { Sticker } from '../../ui/Sticker';
import { StickerAttach } from '../stickers/StickerAttach';
import { useAction } from '../../ui/toast';

interface Props {
  /** 고칠 일정. null 이면 새로 올린다. */
  event: CalendarEvent | null;
  /** 새 일정의 날짜로 미리 넣어 둘 날 */
  day: string;
  onClose: () => void;
}

/** 일정을 올리거나 고치는 창. 고칠 수 없는 사람에게는 내용만 보여 준다. */
export function EventSheet({ event, day, onClose }: Props) {
  const backend = useBackend();
  const { family, me, members, isParent } = useSession();
  const { busy, run } = useAction();

  const [title, setTitle] = useState(event?.title ?? '');
  const [startDay, setStartDay] = useState(event?.startDay ?? day);
  const [manyDays, setManyDays] = useState(event ? event.endDay !== event.startDay : false);
  const [endDay, setEndDay] = useState(event?.endDay ?? day);
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [startTime, setStartTime] = useState(event?.startTime ?? '');
  const [endTime, setEndTime] = useState(event?.endTime ?? '');
  const [who, setWho] = useState<string[]>(event?.who ?? []);
  const [repeat, setRepeat] = useState<EventRepeat>(event?.repeat ?? 'none');
  const [repeatUntil, setRepeatUntil] = useState(event?.repeatUntil ?? '');
  const [memo, setMemo] = useState(event?.memo ?? '');
  const [sticker, setSticker] = useState(event?.sticker ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleWho = (uid: string) => setWho(who.includes(uid) ? who.filter((id) => id !== uid) : [...who, uid]);

  if (event && !canEditEvent(event, me.uid, isParent)) {
    const people = event.who.length === 0 ? '가족 모두' : members.filter((m) => event.who.includes(m.uid)).map((m) => m.displayName).join(', ');
    const time = event.allDay ? '하루 종일' : event.endTime ? `${clockLabel(event.startTime)}~${clockLabel(event.endTime)}` : clockLabel(event.startTime);
    return (
      <Sheet title={event.title} onClose={onClose}>
        <p className="t-body">
          {event.startDay === event.endDay ? formatDay(event.startDay) : `${formatDay(event.startDay)} ~ ${formatDay(event.endDay)}`} · {time}
        </p>
        <p className="t-cap">
          {people}
          {repeatText(event) ? ` · ${repeatText(event)}` : ''}
        </p>
        {(event.memo || event.sticker) && (
          <p className="t-body">
            {event.memo}
            {event.sticker && (
              <span className="said-sticker">
                <Sticker id={event.sticker} size={32} label />
              </span>
            )}
          </p>
        )}
        <p className="t-cap">이 일정은 올린 사람과 부모님만 고칠 수 있어요.</p>
        <Button tone="plain" big block onClick={onClose}>
          닫기
        </Button>
      </Sheet>
    );
  }

  async function save() {
    const input = {
      title,
      memo,
      sticker,
      startDay,
      endDay: manyDays ? endDay : startDay,
      allDay,
      startTime,
      endTime,
      who,
      repeat,
      repeatUntil,
    };
    const ok = event
      ? await run(() => backend.updateEvent(family.id, event.id, input), '일정을 고쳤어요.')
      : await run(() => backend.createEvent(family.id, input, me.uid), '일정을 올렸어요.');
    if (ok) onClose();
  }

  async function remove() {
    if (!event) return;
    const ok = await run(() => backend.deleteEvent(family.id, event.id), '일정을 지웠어요.');
    if (ok) onClose();
  }

  return (
    <Sheet title={event ? '일정 고치기' : '일정 올리기'} onClose={onClose}>
      <Field label="일정 이름">
        {(id) => (
          <input id={id} className="input" type="text" value={title} maxLength={MAX_TITLE} placeholder="예: 치과, 가족 외식" onChange={(e) => setTitle(e.target.value)} />
        )}
      </Field>

      <Field label={manyDays ? '시작하는 날' : '날짜'}>
        {(id) => (
          <div className="row" style={{ gap: 12 }}>
            <input id={id} className="input grow" type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
            <button type="button" className="chip" aria-pressed={manyDays} onClick={() => setManyDays(!manyDays)}>
              여러 날
            </button>
          </div>
        )}
      </Field>
      {manyDays && (
        <Field label="끝나는 날">
          {(id) => <input id={id} className="input" type="date" value={endDay} min={startDay} onChange={(e) => setEndDay(e.target.value)} />}
        </Field>
      )}

      <FieldGroup label="시간">
        <div className="segmented">
          <button type="button" role="radio" className="chip" aria-checked={allDay} onClick={() => setAllDay(true)}>
            하루 종일
          </button>
          <button type="button" role="radio" className="chip" aria-checked={!allDay} onClick={() => setAllDay(false)}>
            시간 정하기
          </button>
        </div>
      </FieldGroup>
      {!allDay && (
        <div className="segmented">
          <Field label="시작 시각">
            {(id) => <input id={id} className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />}
          </Field>
          <Field label="끝나는 시각">
            {(id) => <input id={id} className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />}
          </Field>
        </div>
      )}

      <div className="field" role="group" aria-label="누구 일정인가요?">
        <div className="label">누구 일정인가요?</div>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={who.length === 0} onClick={() => setWho([])}>
            가족 모두
          </button>
          {members.map((m) => (
            <button key={m.uid} type="button" className="chip" aria-pressed={who.includes(m.uid)} onClick={() => toggleWho(m.uid)}>
              <Avatar avatar={m.avatar} size={24} />
              {m.displayName}
            </button>
          ))}
        </div>
      </div>

      <FieldGroup label="반복">
        <div className="chips">
          {REPEAT_CHOICES.map((choice) => (
            <button key={choice.id} type="button" role="radio" className="chip" aria-checked={repeat === choice.id} onClick={() => setRepeat(choice.id)}>
              {choice.name}
            </button>
          ))}
        </div>
        {repeat !== 'none' && <p className="t-cap">{repeatText({ repeat, startDay, repeatUntil })}</p>}
      </FieldGroup>
      {repeat !== 'none' && (
        <Field label="언제까지 반복할까요? (안 정해도 돼요)">
          {(id) => <input id={id} className="input" type="date" value={repeatUntil} min={startDay} onChange={(e) => setRepeatUntil(e.target.value)} />}
        </Field>
      )}

      <Field label="메모 (안 적어도 돼요)">
        {(id) => (
          <StickerAttach value={sticker} onChange={setSticker} onShop={onClose}>
            <input id={id} className="input" type="text" value={memo} maxLength={MAX_EVENT_MEMO} onChange={(e) => setMemo(e.target.value)} />
          </StickerAttach>
        )}
      </Field>

      <Button big block disabled={busy} onClick={() => void save()}>
        {event ? '고친 내용 저장하기' : '일정 올리기'}
      </Button>
      {event &&
        (confirmDelete ? (
          <Button tone="plain" big block disabled={busy} onClick={() => void remove()}>
            {event.repeat === 'none' ? '정말 지울까요? 한 번 더 누르면 지워요' : '정말 지울까요? 반복되는 날이 모두 지워져요'}
          </Button>
        ) : (
          <button type="button" className="link" onClick={() => setConfirmDelete(true)}>
            이 일정 지우기
          </button>
        ))}
      <Button tone="plain" big block onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}
