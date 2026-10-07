interface Props {
  id: string;
  /** 입력칸의 글자 그대로(빈칸 허용) */
  value: string;
  onChange: (value: string) => void;
  /** 빠르게 고를 수 있는 금액 */
  presets: number[];
  max: number;
  min?: number;
}

/** 코인 금액 입력: 자주 쓰는 금액 버튼과 직접 적는 칸 */
export function CoinInput({ id, value, onChange, presets, max, min = 0 }: Props) {
  const choices = presets.filter((n) => n >= min && n <= max);
  return (
    <>
      {choices.length > 0 && (
        <div className={choices.length > 4 ? 'chips six' : 'chips'}>
          {choices.map((preset) => (
            <button
              key={preset}
              type="button"
              className="chip"
              aria-pressed={value === String(preset)}
              onClick={() => onChange(String(preset))}
            >
              {preset}
            </button>
          ))}
        </div>
      )}
      <input
        id={id}
        className="input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  );
}

/** 입력칸의 글자를 숫자로. 빈칸이나 숫자가 아니면 NaN(검사에서 걸러진다). */
export function parseCoins(value: string): number {
  return value.trim() === '' ? NaN : Number(value);
}
