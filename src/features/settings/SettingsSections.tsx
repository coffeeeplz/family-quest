import { useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import { AppError, type FamilySettings } from '../../backend/types';
import { DEFAULT_PLACE_RADIUS, MAX_PLACES, MAX_PLACE_NAME } from '../../domain/location';
import { MAX_TITLE } from '../../domain/quests';
import {
  CHECKIN_PER_DAY_CHOICES,
  MAX_CHECKIN_COINS,
  MAX_PRAISES,
  MAX_PRAISE_LENGTH,
  MAX_PRESETS,
  MAX_REWARD,
  ROUND_CHOICES,
  STREAK_DAY_CHOICES,
} from '../../domain/settings';
import { currentPosition } from '../../lib/geo';
import { CoinInput, parseCoins } from '../../ui/CoinInput';
import { Icon } from '../../ui/Sprite';
import { BackLink, Button, CoinInline, Field, FieldGroup } from '../../ui/kit';
import { errorText, useAction, useToast } from '../../ui/toast';
import { useLocations } from '../location/useLocation';

const SECTIONS: Record<string, { title: string; hint: string; Body: () => ReactNode }> = {
  negotiation: { title: '코인 협상', hint: '자녀가 직접 추가한 일의 코인을 주고받으며 정해요', Body: NegotiationSection },
  streak: { title: '연속 달성 보너스', hint: '반복 퀘스트를 며칠 이어서 다 끝내면 주는 코인', Body: StreakSection },
  praises: { title: '칭찬 한마디', hint: '승인하거나 칭찬 코인을 줄 때 버튼으로 나와요', Body: PraisesSection },
  presets: { title: '자주 쓰는 퀘스트 버튼', hint: '한 번만 누르면 오늘 할 일로 추가돼요', Body: PresetsSection },
  checkin: { title: '위치 공유 코인', hint: '자녀가 "지금 여기예요"를 누르면 바로 받는 코인', Body: CheckinSection },
  places: { title: '장소', hint: '이름을 붙인 장소 근처는 "학원 근처"처럼 보여요', Body: PlacesSection },
};

/** 가족 설정의 안쪽 화면: 주소의 항목 이름에 맞는 내용을 보여 준다. */
export function SettingsSectionPage() {
  const { section = '' } = useParams();
  const found = SECTIONS[section];
  if (!found) return <Navigate to="/settings" replace />;
  const { Body } = found;
  return (
    <main className="screen">
      <BackLink to="/settings" label="가족 설정" />
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">{found.title}</h1>
          <p className="t-cap">{found.hint}</p>
        </div>
      </header>
      <Body />
    </main>
  );
}

/** 설정의 일부만 바꿔 저장하고, 성공하면 설정 목록으로 돌아간다. */
function useSaveSettings() {
  const backend = useBackend();
  const { family } = useSession();
  const navigate = useNavigate();
  const notify = useToast();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(patch: Partial<FamilySettings>) {
    setBusy(true);
    setError('');
    try {
      await backend.updateSettings(family.id, { ...family.settings, ...patch });
      notify('설정을 저장했어요.');
      navigate('/settings');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return { save, error, setError, busy };
}

function SaveBar({ error, busy, onSave }: { error: string; busy: boolean; onSave: () => void }) {
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button big block disabled={busy} onClick={onSave}>
        설정 저장하기
      </Button>
    </>
  );
}

function NegotiationSection() {
  const { family } = useSession();
  const { save, error, busy } = useSaveSettings();
  const [maxRounds, setMaxRounds] = useState(family.settings.maxRounds);
  const [maxProposalCoins, setMaxProposalCoins] = useState(String(family.settings.maxProposalCoins));
  return (
    <>
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
        {(id) => <CoinInput id={id} value={maxProposalCoins} onChange={setMaxProposalCoins} presets={[20, 30, 50, 100]} min={1} max={MAX_REWARD} />}
      </Field>
      <SaveBar error={error} busy={busy} onSave={() => void save({ maxRounds, maxProposalCoins: parseCoins(maxProposalCoins) })} />
    </>
  );
}

function StreakSection() {
  const { family } = useSession();
  const { save, error, busy } = useSaveSettings();
  const [streakOn, setStreakOn] = useState(family.settings.streakOn);
  const [streakDays, setStreakDays] = useState(family.settings.streakDays);
  const [streakBonus, setStreakBonus] = useState(String(family.settings.streakBonus));
  return (
    <>
      <p className="t-cap" style={{ lineHeight: '18px' }}>
        그날의 반복 퀘스트를 모두 제때 끝낸 날이 이어지면 보너스 코인을 줘요. 퀘스트가 없는 날은 건너뛰어요.
      </p>
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
      <SaveBar error={error} busy={busy} onSave={() => void save({ streakOn, streakDays, streakBonus: parseCoins(streakBonus) })} />
    </>
  );
}

function PraisesSection() {
  const { family } = useSession();
  const { save, error, setError, busy } = useSaveSettings();
  const [praises, setPraises] = useState(family.settings.praises);
  const [newPraise, setNewPraise] = useState('');

  function add() {
    const text = newPraise.trim();
    if (!text) return;
    if (praises.includes(text)) return setNewPraise('');
    if (praises.length >= MAX_PRAISES) return setError(`칭찬 한마디는 ${MAX_PRAISES}개까지 등록할 수 있어요.`);
    setPraises([...praises, text]);
    setNewPraise('');
    setError('');
  }

  return (
    <>
      <div className="field">
        <div className="label">지금 한마디 (누르면 지워져요)</div>
        <div className="chips">
          {praises.map((praise) => (
            <button key={praise} type="button" className="chip" aria-label={`${praise} 지우기`} onClick={() => setPraises(praises.filter((p) => p !== praise))}>
              {praise} ×
            </button>
          ))}
          {praises.length === 0 && <p className="t-cap">등록한 한마디가 없어요.</p>}
        </div>
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
            <Button tone="plain" onClick={add}>
              추가
            </Button>
          </div>
        )}
      </Field>
      {/* 입력칸에 적어 두고 추가를 안 누른 한마디도 함께 저장한다. */}
      <SaveBar error={error} busy={busy} onSave={() => void save({ praises: newPraise.trim() ? [...praises, newPraise.trim()] : praises })} />
    </>
  );
}

function CheckinSection() {
  const { family } = useSession();
  const { save, error, busy } = useSaveSettings();
  const [checkinCoins, setCheckinCoins] = useState(String(family.settings.checkinCoins));
  const [checkinPerDay, setCheckinPerDay] = useState(family.settings.checkinPerDay);
  return (
    <>
      <p className="t-cap" style={{ lineHeight: '18px' }}>
        하루 횟수를 넘겨도 위치는 계속 알릴 수 있고, 코인만 주지 않아요.
      </p>
      <Field label="한 번 알릴 때 주는 코인" hint="0으로 두면 코인 없이 위치만 알려요.">
        {(id) => <CoinInput id={id} value={checkinCoins} onChange={setCheckinCoins} presets={[0, 1, 2, 5]} max={MAX_CHECKIN_COINS} />}
      </Field>
      <FieldGroup label="하루에 코인을 주는 횟수">
        <div className="chips six">
          {CHECKIN_PER_DAY_CHOICES.map((n) => (
            <button key={n} type="button" role="radio" className="chip" aria-checked={checkinPerDay === n} onClick={() => setCheckinPerDay(n)}>
              {n}번
            </button>
          ))}
        </div>
      </FieldGroup>
      <SaveBar error={error} busy={busy} onSave={() => void save({ checkinCoins: parseCoins(checkinCoins), checkinPerDay })} />
    </>
  );
}

/** 자주 쓰는 퀘스트 버튼: 여기서 바꾼 내용은 바로 저장된다. */
function PresetsSection() {
  const backend = useBackend();
  const { family } = useSession();
  const { presets } = useFamilyData();
  const { busy, run } = useAction();
  const [title, setTitle] = useState('');
  const [reward, setReward] = useState('10');
  const [forKid, setForKid] = useState(true);

  async function add() {
    const ok = await run(
      () => backend.createPreset(family.id, { title, reward: parseCoins(reward), childCanAdd: forKid }),
      '버튼을 추가했어요.',
    );
    if (ok) setTitle('');
  }

  return (
    <>
      <p className="t-cap">새 퀘스트 화면에서 누르면 오늘 할 일이 돼요. 여기서 바꾼 내용은 바로 저장돼요.</p>
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
              <input id={id} className="input" type="text" value={title} maxLength={MAX_TITLE} placeholder="예: 설거지 돕기" onChange={(event) => setTitle(event.target.value)} />
            )}
          </Field>
          <Field label="새 버튼: 코인">
            {(id) => <CoinInput id={id} value={reward} onChange={setReward} presets={[5, 10, 15, 20]} max={MAX_REWARD} />}
          </Field>
          <FieldGroup label="자녀가 스스로 추가해도 될까요?">
            <div className="segmented">
              <button type="button" role="radio" className="chip" aria-checked={forKid} onClick={() => setForKid(true)}>
                돼요
              </button>
              <button type="button" role="radio" className="chip" aria-checked={!forKid} onClick={() => setForKid(false)}>
                부모만
              </button>
            </div>
            <p className="t-cap">자녀가 추가해도 코인은 승인한 뒤에만 지급돼요. 버튼마다 하루 한 번만 추가할 수 있어요.</p>
          </FieldGroup>
          <Button tone="mint" block disabled={busy} onClick={() => void add()}>
            버튼 추가
          </Button>
        </div>
      ) : (
        <p className="t-cap">버튼은 {MAX_PRESETS}개까지 만들 수 있어요.</p>
      )}
    </>
  );
}

/** 장소: 여기서 바꾼 내용은 바로 저장된다. */
function PlacesSection() {
  const backend = useBackend();
  const { family, me } = useSession();
  const { places } = useLocations();
  const { busy, run } = useAction();
  const [name, setName] = useState('');

  /** 부모가 지금 서 있는 곳을 장소로 등록한다. */
  async function addHere() {
    const ok = await run(async () => {
      if (!name.trim()) throw new AppError('장소 이름을 적어 주세요.');
      const fix = await currentPosition(true);
      await backend.createPlace(family.id, { name, lat: fix.lat, lng: fix.lng, radius: DEFAULT_PLACE_RADIUS }, me.uid);
    }, '지금 위치를 장소로 등록했어요.');
    if (ok) setName('');
  }

  return (
    <>
      <p className="t-cap" style={{ lineHeight: '18px' }}>
        자녀 현황의 위치를 눌러 "이름 붙이기"로도 등록할 수 있어요. 여기서 바꾼 내용은 바로 저장돼요.
      </p>
      {places.length === 0 && <p className="t-cap">등록한 장소가 없어요.</p>}
      {places.map((place) => (
        <div key={place.id} className="px history-row">
          <div className="grow stack" style={{ gap: 4 }}>
            <span className="t-body item-title">{place.name}</span>
            <span className="t-cap">반경 {place.radius}m</span>
          </div>
          <button
            type="button"
            className="link"
            disabled={busy}
            aria-label={`${place.name} 장소 지우기`}
            onClick={() => void run(() => backend.deletePlace(family.id, place.id), '장소를 지웠어요.')}
          >
            지우기
          </button>
        </div>
      ))}
      {places.length < MAX_PLACES ? (
        <Field label="지금 내가 있는 곳을 등록하기">
          {(id) => (
            <div className="row" style={{ gap: 12 }}>
              <input id={id} className="input grow" type="text" value={name} maxLength={MAX_PLACE_NAME} placeholder="예: 집" onChange={(event) => setName(event.target.value)} />
              <Button tone="plain" disabled={busy} onClick={() => void addHere()}>
                등록
              </Button>
            </div>
          )}
        </Field>
      ) : (
        <p className="t-cap">장소는 {MAX_PLACES}곳까지 등록할 수 있어요.</p>
      )}
    </>
  );
}
