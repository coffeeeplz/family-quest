import { useState } from 'react';
import type { ClawPreset, ClawTune } from '../../backend/types';
import { MAX_PRESET_NAME, TUNE_LIMITS, estimateCatch, sameTune, savePreset } from '../../domain/claw';
import { Button, Field, FieldGroup } from '../../ui/kit';
import { errorText } from '../../ui/toast';
import { ClawPreview } from './ClawPreview';

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
 * 게임 세부 옵션을 고치는 전체 화면 창. 위에는 움직이는 미리보기가 늘 보이고, 아래 칸만 스크롤된다.
 * [적용]은 설정 화면의 값만 바꾼다(가족 설정에 남기려면 설정 화면에서 "설정 저장하기").
 */
export function ClawTuneEditor({
  initial,
  initialPresets,
  onApply,
  onClose,
}: {
  initial: ClawTune;
  initialPresets: ClawPreset[];
  onApply: (tune: ClawTune, presets: ClawPreset[]) => void;
  onClose: () => void;
}) {
  const [tune, setTune] = useState<ClawTune>(initial);
  const [presets, setPresets] = useState<ClawPreset[]>(initialPresets);
  const [presetName, setPresetName] = useState('');
  const [presetError, setPresetError] = useState('');
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

  return (
    <div className="sheet-back">
      <div className="claw-editor" role="dialog" aria-modal="true" aria-label="게임 세부 옵션">
        <div className="claw-editor-top">
          <h2 className="t-title">게임 세부 옵션</h2>
          <ClawPreview tune={tune} />
          <p className="t-cap center">대략 {Math.round(estimateCatch(tune) * 100)}%쯤 잡을 거예요(아이 솜씨에 따라 달라요).</p>
        </div>
        <div className="claw-editor-body stack">
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
        </div>
        <div className="claw-editor-foot">
          <Button big tone="plain" onClick={onClose}>
            취소
          </Button>
          <Button big onClick={() => onApply(tune, presets)}>
            적용
          </Button>
        </div>
      </div>
    </div>
  );
}
