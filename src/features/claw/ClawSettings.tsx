import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBackend, useSession } from '../../app/session';
import type { ClawPrize, ClawPreset, ClawSettings, ClawTune } from '../../backend/types';
import {
  MAX_CLAW_COINS,
  MAX_CLAW_PRICE,
  MAX_CLAW_PRIZES,
  MAX_CLAW_TITLE,
  MAX_PRACTICE_PER_DAY,
  MAX_PRESET_NAME,
  PRACTICE_UNLIMITED,
  TUNE_LIMITS,
  estimateCatch,
  expectedCoins,
  prizeLabel,
  sameTune,
  savePreset,
} from '../../domain/claw';
import { CoinInput, parseCoins } from '../../ui/CoinInput';
import { Button, Field, FieldGroup } from '../../ui/kit';
import { errorText } from '../../ui/toast';
import { ClawPreview } from './ClawPreview';

const PER_DAY_CHOICES = [0, 1, 2, 3, 5, 10];
const DROP_CHOICES = [0, 10, 20, 30, 50];

const KIND_NAMES: Record<ClawPrize['kind'], string> = {
  coin: '코인',
  wardrobe: '꾸미기 아이템',
  sticker: '스티커 팩',
  reward: '현실 보상',
};

/** 상품 한 칸을 고치는 동안의 값(입력칸은 글자로 둔다) */
interface Row {
  kind: ClawPrize['kind'];
  weight: string;
  amount: string;
  title: string;
}

const toRow = (p: ClawPrize): Row => ({
  kind: p.kind,
  weight: String(p.weight),
  amount: String(p.amount ?? ''),
  title: p.title ?? '',
});
const fromRow = (r: Row): ClawPrize => ({
  kind: r.kind,
  weight: parseCoins(r.weight),
  ...(r.kind === 'coin' ? { amount: parseCoins(r.amount) } : {}),
  ...(r.kind === 'reward' ? { title: r.title } : {}),
});

/** 세부 옵션 한 줄: 슬라이더와 한 칸씩 움직이는 [−] [+] 버튼. scale 은 보여 줄 때 나누는 값(ms → 초) */
function TuneSlider({
  label,
  value,
  limits,
  unit,
  scale = 1,
  onChange,
}: {
  label: string;
  value: number;
  limits: { min: number; max: number; step: number };
  unit: string;
  scale?: number;
  onChange: (v: number) => void;
}) {
  // 0.1 같은 소수 단계에서 생기는 아주 작은 오차를 없앤다.
  const snap = (v: number) => Math.min(limits.max, Math.max(limits.min, Math.round(v / limits.step) * limits.step));
  const shown = Math.round((value / scale) * 10) / 10;
  return (
    <Field label={`${label}: ${shown}${unit}`}>
      {(id) => (
        <div className="row claw-slider">
          <button type="button" className="chip" aria-label={`${label} 줄이기`} disabled={value <= limits.min} onClick={() => onChange(snap(value - limits.step))}>
            −
          </button>
          <input
            id={id}
            type="range"
            className="claw-range grow"
            min={limits.min}
            max={limits.max}
            step={limits.step}
            value={value}
            onChange={(e) => onChange(snap(Number(e.target.value)))}
          />
          <button type="button" className="chip" aria-label={`${label} 늘리기`} disabled={value >= limits.max} onClick={() => onChange(snap(value + limits.step))}>
            +
          </button>
        </div>
      )}
    </Field>
  );
}

/**
 * 가족 설정 → 인형뽑기: 켜기, 가격, 하루 횟수, 세부 옵션(미리보기와 저장한 세팅), 떨어뜨릴 확률, 상자 내용물과 확률.
 * 확률은 부모만 본다(아이 화면에는 나오지 않는다).
 */
export function ClawSettingsBody({ save, error, busy }: { save: (patch: { claw: ClawSettings }) => Promise<void>; error: string; busy: boolean }) {
  const backend = useBackend();
  const { family } = useSession();
  const now = family.settings.claw;
  const [on, setOn] = useState(now.on);
  const [price, setPrice] = useState(String(now.price));
  const [perDay, setPerDay] = useState(now.perDay);
  const [practicePerDay, setPracticePerDay] = useState(now.practicePerDay);
  const [tune, setTune] = useState<ClawTune>(now.tune);
  const [presets, setPresets] = useState<ClawPreset[]>(now.presets);
  const [presetName, setPresetName] = useState('');
  const [presetError, setPresetError] = useState('');
  const [dropRate, setDropRate] = useState(now.dropRate);
  const [fallback, setFallback] = useState(String(now.fallbackCoins));
  const [rows, setRows] = useState<Row[]>(now.prizes.map(toRow));

  const draft: ClawSettings = {
    on,
    price: parseCoins(price),
    perDay,
    tune,
    presets,
    practicePerDay,
    dropRate,
    fallbackCoins: parseCoins(fallback),
    prizes: rows.map(fromRow),
  };
  const total = rows.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  const average = Number.isFinite(draft.price) && Number.isFinite(draft.fallbackCoins) && total === 100 ? Math.round(expectedCoins(draft, estimateCatch(tune))) : null;

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setTuneValue = (patch: Partial<ClawTune>) => setTune({ ...tune, ...patch });
  const keepPreset = () => {
    try {
      setPresets(savePreset(presets, presetName, tune));
      setPresetName('');
      setPresetError('');
    } catch (e) {
      setPresetError(errorText(e));
    }
  };
  const add = (kind: ClawPrize['kind']) => setRows([...rows, { kind, weight: '0', amount: kind === 'coin' ? '10' : '', title: '' }]);

  return (
    <>
      {backend.mode === 'firebase' && <p className="t-capb">실제 앱의 인형뽑기는 다음 업데이트에서 열려요. 설정은 미리 저장해 둘 수 있어요.</p>}

      <FieldGroup label="인형뽑기">
        <div className="segmented" role="radiogroup" aria-label="인형뽑기 켜기">
          <button type="button" role="radio" className="chip" aria-checked={on} onClick={() => setOn(true)}>
            켜기
          </button>
          <button type="button" role="radio" className="chip" aria-checked={!on} onClick={() => setOn(false)}>
            끄기
          </button>
        </div>
        <p className="t-cap">켜면 자녀의 상점에 "인형뽑기" 버튼이 생겨요.</p>
      </FieldGroup>

      <Field label="한 판 가격(코인)">{(id) => <CoinInput id={id} value={price} onChange={setPrice} presets={[5, 10, 20, 30]} max={MAX_CLAW_PRICE} />}</Field>

      <FieldGroup label="하루에 할 수 있는 횟수">
        <div className="chips six">
          {PER_DAY_CHOICES.map((n) => (
            <button key={n} type="button" role="radio" className="chip" aria-checked={perDay === n} onClick={() => setPerDay(n)}>
              {n === 0 ? '제한 없음' : `${n}번`}
            </button>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="자녀가 하루에 공짜로 연습할 수 있는 횟수">
        <div className="row" style={{ gap: 8 }}>
          <button type="button" role="radio" className="chip" aria-checked={practicePerDay === 0} onClick={() => setPracticePerDay(0)}>
            없음
          </button>
          <button type="button" role="radio" className="chip" aria-checked={practicePerDay === PRACTICE_UNLIMITED} onClick={() => setPracticePerDay(PRACTICE_UNLIMITED)}>
            무제한
          </button>
          <label className="row grow" style={{ gap: 6 }}>
            <input
              className="input grow"
              inputMode="numeric"
              placeholder="횟수 적기"
              aria-label="연습 횟수"
              value={practicePerDay > 0 ? String(practicePerDay) : ''}
              onChange={(e) => setPracticePerDay(Math.min(MAX_PRACTICE_PER_DAY, Number(e.target.value.replace(/\D/g, '')) || 0))}
            />
            <span className="t-cap">번</span>
          </label>
        </div>
        <p className="t-cap">연습 판은 코인을 내지 않고 상품도 없어요. 아이가 연습하지 않고 바로 시작할 수도 있어요.</p>
      </FieldGroup>

      <section className="stack claw-tune" aria-label="게임 세부 옵션">
        <p className="t-capb">게임 세부 옵션(미리보기를 보며 정해요)</p>
        <ClawPreview tune={tune} />
        <p className="t-cap center">
          빨간 점이 점선 네모 안에 있을 때 멈추면 그 상자를 잡아요. 대략 {Math.round(estimateCatch(tune) * 100)}%쯤 잡을 거예요(아이 솜씨에 따라 달라요).
        </p>

        <FieldGroup label="저장한 세팅">
          <div className="stack" style={{ gap: 8 }}>
            {presets.map((p) => (
              <div key={p.name} className="row" style={{ gap: 8 }}>
                <button type="button" className="chip grow" aria-pressed={sameTune(p.tune, tune)} onClick={() => setTune(p.tune)}>
                  {p.name} 불러오기
                </button>
                <button type="button" className="link" aria-label={`${p.name} 세팅 지우기`} onClick={() => setPresets(presets.filter((q) => q.name !== p.name))}>
                  지우기
                </button>
              </div>
            ))}
            {presets.length === 0 && <p className="t-cap">저장한 세팅이 없어요.</p>}
          </div>
        </FieldGroup>

        <TuneSlider label="네모 크기(잡히는 범위)" value={tune.reach} limits={TUNE_LIMITS.reach} unit="칸" onChange={(v) => setTuneValue({ reach: v })} />
        <TuneSlider label="집게 속도" value={tune.speed} limits={TUNE_LIMITS.speed} unit="" onChange={(v) => setTuneValue({ speed: v })} />
        <TuneSlider label="흔들림" value={tune.wobble} limits={TUNE_LIMITS.wobble} unit="" onChange={(v) => setTuneValue({ wobble: v })} />
        <FieldGroup label="상자 수">
          <div className="chips six">
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <button key={n} type="button" role="radio" className="chip" aria-checked={tune.boxes === n} onClick={() => setTuneValue({ boxes: n })}>
                {n}개
              </button>
            ))}
          </div>
        </FieldGroup>
        <FieldGroup label="반짝 도움(빨간 점이 네모에 들어오면 반짝)">
          <div className="segmented">
            <button type="button" role="radio" className="chip" aria-checked={tune.glow} onClick={() => setTuneValue({ glow: true })}>
              켜기
            </button>
            <button type="button" role="radio" className="chip" aria-checked={!tune.glow} onClick={() => setTuneValue({ glow: false })}>
              끄기
            </button>
          </div>
        </FieldGroup>

        <p className="t-capb">연출 시간(맨 아래 '연습해 보기'로 확인해요)</p>
        <TuneSlider label="집게가 오므리며 뜸 들이는 시간" value={tune.grabMs} limits={TUNE_LIMITS.grabMs} unit="초" scale={1000} onChange={(v) => setTuneValue({ grabMs: v })} />
        <TuneSlider label="출구까지 옮기는 시간" value={tune.carryMs} limits={TUNE_LIMITS.carryMs} unit="초" scale={1000} onChange={(v) => setTuneValue({ carryMs: v })} />
        <TuneSlider label="상자가 흔들리다 열리는 시간" value={tune.openMs} limits={TUNE_LIMITS.openMs} unit="초" scale={1000} onChange={(v) => setTuneValue({ openMs: v })} />

        <Field label="지금 값을 세팅으로 저장" hint="같은 이름이면 덮어써요. 아래 '설정 저장하기'를 눌러야 가족 설정에 남아요.">
          {(id) => (
            <div className="row" style={{ gap: 8 }}>
              <input id={id} className="input grow" placeholder="예: 동생용" maxLength={MAX_PRESET_NAME} value={presetName} onChange={(e) => setPresetName(e.target.value)} />
              <Button onClick={keepPreset}>저장</Button>
            </div>
          )}
        </Field>
        {presetError && (
          <p className="error" role="alert">
            {presetError}
          </p>
        )}
      </section>

      <FieldGroup label="잡은 상자를 옮기다 떨어뜨릴 확률">
        <div className="chips six">
          {DROP_CHOICES.map((n) => (
            <button key={n} type="button" role="radio" className="chip" aria-checked={dropRate === n} onClick={() => setDropRate(n)}>
              {n}%
            </button>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="상자 내용물과 확률(부모만 봐요)">
        {rows.map((r, i) => (
          <div key={i} className="card stack claw-prize-row">
            <div className="row" style={{ gap: 8 }}>
              <span className="t-body grow">{KIND_NAMES[r.kind]}</span>
              <button type="button" className="link" aria-label={`${prizeLabel(fromRow(r))} 빼기`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                빼기
              </button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {r.kind === 'coin' && (
                <label className="row grow" style={{ gap: 6 }}>
                  <span className="t-cap">코인</span>
                  <input className="input" inputMode="numeric" value={r.amount} max={MAX_CLAW_COINS} onChange={(e) => setRow(i, { amount: e.target.value.replace(/\D/g, '') })} />
                </label>
              )}
              {r.kind === 'reward' && (
                <input
                  className="input grow"
                  placeholder="예: 게임 30분"
                  maxLength={MAX_CLAW_TITLE}
                  value={r.title}
                  aria-label="현실 보상 이름"
                  onChange={(e) => setRow(i, { title: e.target.value })}
                />
              )}
              {(r.kind === 'wardrobe' || r.kind === 'sticker') && <span className="t-cap grow">아직 없는 것 중 하나</span>}
              <label className="row" style={{ gap: 6 }}>
                <input
                  className="input claw-weight"
                  inputMode="numeric"
                  value={r.weight}
                  aria-label="확률(%)"
                  onChange={(e) => setRow(i, { weight: e.target.value.replace(/\D/g, '') })}
                />
                <span className="t-cap">%</span>
              </label>
            </div>
          </div>
        ))}
        {rows.length < MAX_CLAW_PRIZES && (
          <div className="chips">
            {(['coin', 'wardrobe', 'sticker', 'reward'] as const).map((k) => (
              <button key={k} type="button" className="chip" onClick={() => add(k)}>
                + {KIND_NAMES[k]}
              </button>
            ))}
          </div>
        )}
        <p className={total === 100 ? 't-cap' : 't-capb'}>
          확률 합계 {total}%{total === 100 ? '' : ' (100%가 되어야 저장돼요)'}
        </p>
      </FieldGroup>

      <Field label="이미 다 가진 꾸미기·스티커가 나오면 대신 줄 코인">
        {(id) => <CoinInput id={id} value={fallback} onChange={setFallback} presets={[10, 20, 30]} max={MAX_CLAW_COINS} min={1} />}
      </Field>

      {average !== null && (
        <p className="t-cap">
          참고: 지금 옵션이면 한 판에 평균 약 {average}코인을 돌려받아요(가격 {draft.price}코인, 꾸미기·스티커·현실 보상은 대신 줄 코인으로 셈).
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button big block disabled={busy} onClick={() => void save({ claw: draft })}>
        설정 저장하기
      </Button>
      <Link className="btn plain big block" to="/claw">
        연습해 보기(공짜)
      </Link>
    </>
  );
}
