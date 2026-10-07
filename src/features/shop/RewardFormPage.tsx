import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Reward, RewardInput, RewardLimit } from '../../backend/types';
import { MAX_NOTE, MAX_TITLE } from '../../domain/quests';
import { MAX_PRICE, REWARD_EXAMPLES, REWARD_ICONS } from '../../domain/shop';
import { CoinInput, parseCoins } from '../../ui/CoinInput';
import type { IconName } from '../../lib/sprites';
import { Icon } from '../../ui/Sprite';
import { Button, CoinInline, Field, FieldGroup, Sheet } from '../../ui/kit';
import { errorText, useToast } from '../../ui/toast';

const PERIODS: { period: RewardLimit['period']; label: string }[] = [
  { period: 'none', label: '제한 없음' },
  { period: 'day', label: '하루에' },
  { period: 'week', label: '일주일에' },
];
const COUNT_CHOICES = [1, 2, 3, 5];

/** 부모용: 보상 올리기와 고치기 */
export function RewardFormPage() {
  const { rewardId } = useParams();
  const { rewards, loading } = useFamilyData();
  const reward = rewardId ? rewards.find((r) => r.id === rewardId) : undefined;
  if (rewardId && !reward) return loading ? <main className="screen" /> : <Navigate to="/shop" replace />;
  return <RewardForm key={reward?.id ?? 'new'} reward={reward} />;
}

function RewardForm({ reward }: { reward: Reward | undefined }) {
  const backend = useBackend();
  const { family, me } = useSession();
  const navigate = useNavigate();
  const notify = useToast();

  const [title, setTitle] = useState(reward?.title ?? '');
  const [icon, setIcon] = useState(reward?.icon ?? 'shop');
  const [price, setPrice] = useState(String(reward?.price ?? 50));
  const [period, setPeriod] = useState<RewardLimit['period']>(reward?.limit.period ?? 'none');
  const [count, setCount] = useState(reward?.limit.count ?? 1);
  const [note, setNote] = useState(reward?.note ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function fillFrom(example: RewardInput) {
    setTitle(example.title);
    setIcon(example.icon);
    setPrice(String(example.price));
    setPeriod(example.limit.period);
    setCount(example.limit.count);
    setError('');
  }

  async function save(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    try {
      await work();
      notify(success);
      navigate('/shop');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const input: RewardInput = { title, note, icon, price: parseCoins(price), limit: { period, count } };
    if (reward) void save(() => backend.updateReward(family.id, reward.id, input), '보상을 고쳤어요.');
    else void save(() => backend.createReward(family.id, input, me.uid), '상점에 보상을 올렸어요.');
  }

  return (
    <main className="screen">
      <form className="stack" style={{ gap: 22 }} onSubmit={onSubmit}>
        <h1 className="t-title">{reward ? '보상 고치기' : '새 보상'}</h1>

        {!reward && (
          <div className="field">
            <div className="label">예시에서 고르기 (누르면 아래 칸이 채워져요)</div>
            <div className="stack" style={{ gap: 10 }}>
              {REWARD_EXAMPLES.map((example) => (
                <button key={example.title} type="button" className="px card-row list-button quick-row" onClick={() => fillFrom(example)}>
                  <Icon name={example.icon as IconName} size={24} />
                  <span className="grow t-body">{example.title}</span>
                  <CoinInline amount={example.price} />
                </button>
              ))}
            </div>
            <p className="t-cap">가격은 참고용이에요. 저장하기 전에 우리 집에 맞게 고쳐 주세요.</p>
          </div>
        )}

        {!reward && <div className="hr" />}

        <Field label="보상 이름">
          {(id) => (
            <input
              id={id}
              className="input"
              type="text"
              value={title}
              maxLength={MAX_TITLE}
              placeholder="예: 게임 30분"
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>

        <FieldGroup label="그림">
          <div className="icon-grid">
            {REWARD_ICONS.map((choice) => (
              <button
                key={choice.icon}
                type="button"
                role="radio"
                className="avatar-cell"
                aria-label={choice.name}
                aria-checked={icon === choice.icon}
                onClick={() => setIcon(choice.icon)}
              >
                <Icon name={choice.icon} size={36} />
              </button>
            ))}
          </div>
        </FieldGroup>

        <Field label="가격 (코인)" hint={`1부터 ${MAX_PRICE}까지 정할 수 있어요.`}>
          {(id) => <CoinInput id={id} value={price} onChange={setPrice} presets={[30, 50, 100, 150, 200, 300]} min={1} max={MAX_PRICE} />}
        </Field>

        <FieldGroup label="얼마나 자주 바꿀 수 있나요?">
          <div className="segmented">
            {PERIODS.map((option) => (
              <button
                key={option.period}
                type="button"
                role="radio"
                className="chip"
                aria-checked={period === option.period}
                onClick={() => setPeriod(option.period)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </FieldGroup>

        {period !== 'none' && (
          <FieldGroup label={period === 'day' ? '하루에 몇 번까지?' : '일주일에 몇 번까지?'}>
            <div className="segmented">
              {COUNT_CHOICES.map((n) => (
                <button key={n} type="button" role="radio" className="chip" aria-checked={count === n} onClick={() => setCount(n)}>
                  {n}번
                </button>
              ))}
            </div>
            <p className="t-cap">일주일은 월요일부터 일요일까지로 세요.</p>
          </FieldGroup>
        )}

        <Field label="설명 (안 적어도 돼요)">
          {(id) => (
            <textarea id={id} className="input" value={note} maxLength={MAX_NOTE} rows={2} onChange={(event) => setNote(event.target.value)} />
          )}
        </Field>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" big block disabled={busy}>
          {reward ? '고친 내용 저장하기' : '상점에 올리기'}
        </Button>
        <Button tone="plain" big block disabled={busy} onClick={() => navigate('/shop')}>
          취소
        </Button>
        {reward && (
          <button type="button" className="link" disabled={busy} onClick={() => setConfirmDelete(true)}>
            이 보상 내리기
          </button>
        )}
      </form>

      {confirmDelete && reward && (
        <Sheet title="보상을 내릴까요?" onClose={() => setConfirmDelete(false)}>
          <p className="t-body">"{reward.title}" 보상이 상점에서 사라져요. 이미 신청했거나 승인한 것은 그대로 남아요.</p>
          <Button
            big
            block
            onClick={() => {
              setConfirmDelete(false);
              void save(() => backend.archiveReward(family.id, reward.id), '보상을 내렸어요.');
            }}
          >
            내리기
          </Button>
          <Button tone="plain" big block onClick={() => setConfirmDelete(false)}>
            그대로 두기
          </Button>
        </Sheet>
      )}
    </main>
  );
}
