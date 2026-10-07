import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { FamilySettings } from '../../backend/types';
import { MAX_TITLE } from '../../domain/quests';
import {
  MAX_PRAISES,
  MAX_PRAISE_LENGTH,
  MAX_PRESETS,
  MAX_REWARD,
  ROUND_CHOICES,
  STREAK_DAY_CHOICES,
} from '../../domain/settings';
import { CoinInput, parseCoins } from '../../ui/CoinInput';
import { Icon } from '../../ui/Sprite';
import { BackLink, Button, CoinInline, Field, FieldGroup } from '../../ui/kit';
import { errorText, useAction, useToast } from '../../ui/toast';

/** 부모용 가족 설정: 코인 협상, 연속 달성 보너스, 칭찬 한마디, 자주 쓰는 퀘스트 버튼 */
export function SettingsPage() {
  const backend = useBackend();
  const { family } = useSession();
  const { presets } = useFamilyData();
  const navigate = useNavigate();
  const notify = useToast();
  const { busy, run } = useAction();

  const initial = family.settings;
  const [maxRounds, setMaxRounds] = useState(initial.maxRounds);
  const [maxProposalCoins, setMaxProposalCoins] = useState(String(initial.maxProposalCoins));
  const [streakOn, setStreakOn] = useState(initial.streakOn);
  const [streakDays, setStreakDays] = useState(initial.streakDays);
  const [streakBonus, setStreakBonus] = useState(String(initial.streakBonus));
  const [praises, setPraises] = useState(initial.praises);
  const [newPraise, setNewPraise] = useState('');
  const [error, setError] = useState('');

  const [presetTitle, setPresetTitle] = useState('');
  const [presetReward, setPresetReward] = useState('10');
  const [presetForKid, setPresetForKid] = useState(true);

  function addPraise() {
    const text = newPraise.trim();
    if (!text) return;
    if (praises.includes(text)) return setNewPraise('');
    if (praises.length >= MAX_PRAISES) return setError(`칭찬 한마디는 ${MAX_PRAISES}개까지 등록할 수 있어요.`);
    setPraises([...praises, text]);
    setNewPraise('');
    setError('');
  }

  async function saveSettings() {
    setError('');
    const next: FamilySettings = {
      maxRounds,
      maxProposalCoins: parseCoins(maxProposalCoins),
      streakOn,
      streakDays,
      streakBonus: parseCoins(streakBonus),
      // 입력칸에 적어 두고 추가를 안 누른 한마디도 함께 저장한다.
      praises: newPraise.trim() ? [...praises, newPraise.trim()] : praises,
    };
    try {
      await backend.updateSettings(family.id, next);
      setPraises(next.praises);
      setNewPraise('');
      notify('설정을 저장했어요.');
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function addPreset() {
    const ok = await run(
      () => backend.createPreset(family.id, { title: presetTitle, reward: parseCoins(presetReward), childCanAdd: presetForKid }),
      '버튼을 추가했어요.',
    );
    if (ok) setPresetTitle('');
  }

  return (
    <main className="screen">
      <BackLink />
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">가족 설정</h1>
          <p className="t-cap">부모만 바꿀 수 있어요</p>
        </div>
      </header>

      <section className="stack" aria-label="코인 협상">
        <h2 className="t-title">코인 협상</h2>
        <FieldGroup label="주고받을 수 있는 제안 횟수">
          <div className="chips six">
            {ROUND_CHOICES.map((n) => (
              <button key={n} type="button" role="radio" className="chip" aria-checked={maxRounds === n} onClick={() => setMaxRounds(n)}>
                {n}번
              </button>
            ))}
          </div>
          <p className="t-cap">횟수를 다 쓰면 마지막 제안을 받은 사람이 수락하거나 거절해요.</p>
        </FieldGroup>
        <Field label="자녀가 한 번에 제안할 수 있는 코인" hint={`1부터 ${MAX_REWARD}까지 정할 수 있어요.`}>
          {(id) => (
            <CoinInput id={id} value={maxProposalCoins} onChange={setMaxProposalCoins} presets={[20, 30, 50, 100]} min={1} max={MAX_REWARD} />
          )}
        </Field>
      </section>

      <section className="stack" aria-label="연속 달성 보너스">
        <h2 className="t-title">연속 달성 보너스</h2>
        <p className="t-cap">그날의 반복 퀘스트를 모두 제때 끝낸 날이 이어지면 보너스 코인을 줘요. 퀘스트가 없는 날은 건너뛰어요.</p>
        <FieldGroup label="보너스 주기">
          <div className="segmented">
            <button type="button" role="radio" className="chip" aria-checked={streakOn} onClick={() => setStreakOn(true)}>
              켜기
            </button>
            <button type="button" role="radio" className="chip" aria-checked={!streakOn} onClick={() => setStreakOn(false)}>
              끄기
            </button>
          </div>
        </FieldGroup>
        {streakOn && (
          <>
            <FieldGroup label="며칠 연속마다 줄까요?">
              <div className="segmented">
                {STREAK_DAY_CHOICES.map((n) => (
                  <button key={n} type="button" role="radio" className="chip" aria-checked={streakDays === n} onClick={() => setStreakDays(n)}>
                    {n}일
                  </button>
                ))}
              </div>
            </FieldGroup>
            <Field label="보너스 코인">
              {(id) => <CoinInput id={id} value={streakBonus} onChange={setStreakBonus} presets={[5, 10, 20, 30]} max={MAX_REWARD} />}
            </Field>
          </>
        )}
      </section>

      <section className="stack" aria-label="칭찬 한마디">
        <h2 className="t-title">칭찬 한마디</h2>
        <p className="t-cap">승인하거나 칭찬 코인을 줄 때 버튼으로 나와요. 누르면 지워져요.</p>
        <div className="chips">
          {praises.map((praise) => (
            <button
              key={praise}
              type="button"
              className="chip"
              aria-label={`${praise} 지우기`}
              onClick={() => setPraises(praises.filter((p) => p !== praise))}
            >
              {praise} ×
            </button>
          ))}
          {praises.length === 0 && <p className="t-cap">등록한 한마디가 없어요.</p>}
        </div>
        <Field label="새 한마디">
          {(id) => (
            <div className="row" style={{ gap: 12 }}>
              <input
                id={id}
                className="input grow"
                type="text"
                value={newPraise}
                maxLength={MAX_PRAISE_LENGTH}
                placeholder="예: 스스로 해서 멋져!"
                onChange={(event) => setNewPraise(event.target.value)}
              />
              <Button tone="plain" onClick={addPraise}>
                추가
              </Button>
            </div>
          )}
        </Field>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button big block onClick={() => void saveSettings()}>
        설정 저장하기
      </Button>

      <div className="hr" />

      <section className="stack" aria-label="자주 쓰는 퀘스트 버튼">
        <h2 className="t-title">자주 쓰는 퀘스트 버튼</h2>
        <p className="t-cap">새 퀘스트 화면에서 한 번만 누르면 오늘 할 일로 추가돼요. 여기서 바꾼 내용은 바로 저장돼요.</p>
        {presets.map((preset) => (
          <article key={preset.id} className="card card-row">
            <Icon name="quest" size={36} />
            <div className="card-main">
              <h3 className="t-body item-title">{preset.title}</h3>
              <p className="t-cap">{preset.childCanAdd ? '자녀도 스스로 추가할 수 있어요' : '부모만 추가해요'}</p>
            </div>
            <CoinInline amount={preset.reward} sign />
            <Button
              tone="plain"
              disabled={busy}
              aria-label={`${preset.title} 버튼 지우기`}
              onClick={() => void run(() => backend.deletePreset(family.id, preset.id), '버튼을 지웠어요.')}
            >
              지우기
            </Button>
          </article>
        ))}

        {presets.length < MAX_PRESETS ? (
          <div className="px stack" style={{ padding: 14, gap: 16 }}>
            <Field label="새 버튼: 퀘스트 이름">
              {(id) => (
                <input
                  id={id}
                  className="input"
                  type="text"
                  value={presetTitle}
                  maxLength={MAX_TITLE}
                  placeholder="예: 설거지 돕기"
                  onChange={(event) => setPresetTitle(event.target.value)}
                />
              )}
            </Field>
            <Field label="새 버튼: 코인">
              {(id) => <CoinInput id={id} value={presetReward} onChange={setPresetReward} presets={[5, 10, 15, 20]} max={MAX_REWARD} />}
            </Field>
            <FieldGroup label="자녀가 스스로 추가해도 될까요?">
              <div className="segmented">
                <button type="button" role="radio" className="chip" aria-checked={presetForKid} onClick={() => setPresetForKid(true)}>
                  돼요
                </button>
                <button type="button" role="radio" className="chip" aria-checked={!presetForKid} onClick={() => setPresetForKid(false)}>
                  부모만
                </button>
              </div>
              <p className="t-cap">자녀가 추가해도 코인은 승인한 뒤에만 지급돼요. 버튼마다 하루 한 번만 추가할 수 있어요.</p>
            </FieldGroup>
            <Button tone="mint" block disabled={busy} onClick={() => void addPreset()}>
              버튼 추가
            </Button>
          </div>
        ) : (
          <p className="t-cap">버튼은 {MAX_PRESETS}개까지 만들 수 있어요.</p>
        )}
      </section>

      <Button tone="plain" big block onClick={() => navigate('/more')}>
        더보기로 돌아가기
      </Button>
    </main>
  );
}
