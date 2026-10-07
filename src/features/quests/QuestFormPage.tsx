import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Preset, Quest, QuestInput, Repeat } from '../../backend/types';
import { MAX_NOTE, MAX_REWARD, MAX_TITLE } from '../../domain/quests';
import { WEEKDAYS } from '../../lib/dates';
import { CoinInput, parseCoins } from '../../ui/CoinInput';
import { Avatar, Icon } from '../../ui/Sprite';
import { Button, CoinInline, Field, FieldGroup, Sheet } from '../../ui/kit';
import { errorText, useToast } from '../../ui/toast';

const REWARD_PRESETS = [5, 10, 15, 20, 30, 50];
const REPEAT_OPTIONS: { type: Repeat['type']; label: string }[] = [
  { type: 'none', label: '한 번' },
  { type: 'daily', label: '매일' },
  { type: 'weekly', label: '요일마다' },
];

/** 부모용: 퀘스트 만들기와 고치기 */
export function QuestFormPage() {
  const { questId } = useParams();
  const { quests, loading } = useFamilyData();
  const quest = questId ? quests.find((q) => q.id === questId) : undefined;

  if (questId && !quest) {
    // 불러오는 중이면 기다리고, 없는 퀘스트면 목록으로 돌아간다.
    return loading ? <main className="screen" /> : <Navigate to="/quests" replace />;
  }
  return <QuestForm key={quest?.id ?? 'new'} quest={quest} />;
}

function QuestForm({ quest }: { quest: Quest | undefined }) {
  const backend = useBackend();
  const { family, me, kids } = useSession();
  const { today, presets } = useFamilyData();
  const navigate = useNavigate();
  const notify = useToast();

  const [title, setTitle] = useState(quest?.title ?? '');
  const [note, setNote] = useState(quest?.note ?? '');
  // 자녀 현황에서 "퀘스트 추가"로 넘어오면 그 자녀가 미리 골라져 있다.
  const [search] = useSearchParams();
  const preselected = kids.find((kid) => kid.uid === search.get('for'))?.uid;
  const [assigneeUid, setAssigneeUid] = useState(quest?.assigneeUid ?? preselected ?? kids[0]?.uid ?? '');
  const [reward, setReward] = useState(String(quest?.reward ?? 10));
  const [repeatType, setRepeatType] = useState<Repeat['type']>(quest?.repeat.type ?? 'none');
  const [days, setDays] = useState<number[]>(quest?.repeat.type === 'weekly' ? quest.repeat.days : []);
  const [date, setDate] = useState(quest?.repeat.type === 'none' ? quest.repeat.date : today);
  const [important, setImportant] = useState(quest?.important ?? false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggleDay(day: number) {
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));
  }

  function buildInput(): QuestInput {
    const repeat: Repeat =
      repeatType === 'daily' ? { type: 'daily' } : repeatType === 'weekly' ? { type: 'weekly', days } : { type: 'none', date };
    return { title, note, assigneeUid, reward: parseCoins(reward), repeat, important };
  }

  async function save(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    try {
      await work();
      notify(success);
      navigate('/quests');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (quest) void save(() => backend.updateQuest(family.id, quest.id, buildInput()), '퀘스트를 고쳤어요.');
    else void save(() => backend.createQuest(family.id, buildInput(), me.uid), '새 퀘스트를 만들었어요.');
  }

  /** 자주 쓰는 퀘스트 버튼: 고른 사람에게 오늘 할 한 번짜리 퀘스트를 바로 만든다. */
  function addFromPreset(preset: Preset) {
    const input: QuestInput = {
      title: preset.title,
      note: '',
      assigneeUid,
      reward: preset.reward,
      repeat: { type: 'none', date: today },
      important: false,
    };
    void save(() => backend.createQuest(family.id, input, me.uid), `"${preset.title}" 퀘스트를 오늘 할 일로 추가했어요.`);
  }

  if (kids.length === 0) {
    return (
      <main className="screen">
        <h1 className="t-title">새 퀘스트</h1>
        <p className="t-body">퀘스트를 받을 자녀가 아직 없어요. 가족 화면에서 초대코드를 만들어 자녀를 먼저 불러 주세요.</p>
        <Button tone="plain" big block onClick={() => navigate('/family')}>
          가족 화면으로 가기
        </Button>
      </main>
    );
  }

  return (
    <main className="screen">
      <form className="stack" style={{ gap: 22 }} onSubmit={onSubmit}>
        <h1 className="t-title">{quest ? '퀘스트 고치기' : '새 퀘스트'}</h1>

        <FieldGroup label="누가 할까요?">
          <div className="chips">
            {kids.map((kid) => (
              <button
                key={kid.uid}
                type="button"
                role="radio"
                className="chip"
                aria-checked={assigneeUid === kid.uid}
                onClick={() => setAssigneeUid(kid.uid)}
              >
                <Avatar avatar={kid.avatar} size={24} />
                {kid.displayName}
              </button>
            ))}
          </div>
        </FieldGroup>

        {!quest && (
          <div className="field">
            <div className="label">자주 쓰는 퀘스트 (누르면 오늘 할 일로 바로 추가)</div>
            {presets.length > 0 ? (
              <div className="stack" style={{ gap: 10 }}>
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="px card-row list-button quick-row"
                    disabled={busy}
                    onClick={() => addFromPreset(preset)}
                  >
                    <Icon name="quest" size={24} />
                    <span className="grow t-body">{preset.title}</span>
                    <CoinInline amount={preset.reward} sign />
                  </button>
                ))}
              </div>
            ) : (
              <p className="t-cap">아직 등록한 버튼이 없어요.</p>
            )}
            <Link className="link link-row" to="/settings">
              버튼 추가하거나 바꾸기
            </Link>
          </div>
        )}

        {!quest && <div className="hr" />}

        <Field label={quest ? '퀘스트 이름' : '직접 만들기: 퀘스트 이름'}>
          {(id) => (
            <input
              id={id}
              className="input"
              type="text"
              value={title}
              maxLength={MAX_TITLE}
              placeholder="예: 책 30분 읽기"
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>

        <Field label="코인" hint={`0부터 ${MAX_REWARD}까지 정할 수 있어요.`}>
          {(id) => <CoinInput id={id} value={reward} onChange={setReward} presets={REWARD_PRESETS} max={MAX_REWARD} />}
        </Field>

        <FieldGroup label="얼마나 자주 할까요?">
          <div className="segmented">
            {REPEAT_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                role="radio"
                className="chip"
                aria-checked={repeatType === option.type}
                onClick={() => setRepeatType(option.type)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </FieldGroup>

        {repeatType === 'weekly' && (
          <div className="field">
            <div className="label">요일 고르기</div>
            <div className="week-grid">
              {WEEKDAYS.map((name, day) => (
                <button
                  key={name}
                  type="button"
                  className="chip"
                  aria-label={`${name}요일`}
                  aria-pressed={days.includes(day)}
                  onClick={() => toggleDay(day)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {repeatType === 'none' && (
          <Field label="언제까지 할까요?">
            {(id) => (
              <input id={id} className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            )}
          </Field>
        )}

        <div className="field">
          <div className="label">표시</div>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={important} onClick={() => setImportant(!important)}>
              <Icon name="star" size={12} />꼭 해야 하는 일
            </button>
          </div>
          <p className="t-cap">켜면 자녀 화면에서 별과 함께 맨 위에 보여요.</p>
        </div>

        <Field label="설명 (안 적어도 돼요)">
          {(id) => (
            <textarea
              id={id}
              className="input"
              value={note}
              maxLength={MAX_NOTE}
              rows={2}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" big block disabled={busy}>
          {quest ? '고친 내용 저장하기' : '퀘스트 만들기'}
        </Button>
        <Button tone="plain" big block disabled={busy} onClick={() => navigate('/quests')}>
          취소
        </Button>
        {quest && (
          <button type="button" className="link" disabled={busy} onClick={() => setConfirmDelete(true)}>
            이 퀘스트 지우기
          </button>
        )}
      </form>

      {confirmDelete && quest && (
        <Sheet title="퀘스트를 지울까요?" onClose={() => setConfirmDelete(false)}>
          <p className="t-body">"{quest.title}" 퀘스트가 목록에서 사라져요. 이미 받은 코인과 기록은 그대로 남아요.</p>
          <Button
            big
            block
            onClick={() => {
              setConfirmDelete(false);
              void save(() => backend.archiveQuest(family.id, quest.id), '퀘스트를 지웠어요.');
            }}
          >
            지우기
          </Button>
          <Button tone="plain" big block onClick={() => setConfirmDelete(false)}>
            그대로 두기
          </Button>
        </Sheet>
      )}
    </main>
  );
}
