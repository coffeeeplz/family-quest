import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBackend, useSession } from '../../app/session';
import type { ClawLevel, ClawPrize, ClawSettings } from '../../backend/types';
import { LEVELS, LEVEL_ORDER, MAX_CLAW_COINS, MAX_CLAW_PRICE, MAX_CLAW_PRIZES, MAX_CLAW_TITLE, expectedCoins, prizeLabel } from '../../domain/claw';
import { CoinInput, parseCoins } from '../../ui/CoinInput';
import { Button, Field, FieldGroup } from '../../ui/kit';

const PER_DAY_CHOICES = [0, 1, 2, 3, 5, 10];
const DROP_CHOICES = [0, 10, 20, 30, 50];
/** 평균 계산에 쓰는 "잡을 확률"(아이 실력에 따라 다르므로 참고용) */
const CATCH_GUESS: Record<ClawLevel, number> = { easy: 0.6, normal: 0.35, hard: 0.15 };

const KIND_NAMES: Record<ClawPrize['kind'], string> = { coin: '코인', wardrobe: '꾸미기 아이템', sticker: '스티커 팩', reward: '현실 보상' };

/** 상품 한 칸을 고치는 동안의 값(입력칸은 글자로 둔다) */
interface Row {
  kind: ClawPrize['kind'];
  weight: string;
  amount: string;
  title: string;
}

const toRow = (p: ClawPrize): Row => ({ kind: p.kind, weight: String(p.weight), amount: String(p.amount ?? ''), title: p.title ?? '' });
const fromRow = (r: Row): ClawPrize => ({
  kind: r.kind,
  weight: parseCoins(r.weight),
  ...(r.kind === 'coin' ? { amount: parseCoins(r.amount) } : {}),
  ...(r.kind === 'reward' ? { title: r.title } : {}),
});

/**
 * 가족 설정 → 인형뽑기: 켜기, 가격, 하루 횟수, 난이도, 떨어뜨릴 확률, 상자 내용물과 확률.
 * 확률은 부모만 본다(아이 화면에는 나오지 않는다).
 */
export function ClawSettingsBody({ save, error, busy }: { save: (patch: { claw: ClawSettings }) => Promise<void>; error: string; busy: boolean }) {
  const backend = useBackend();
  const { family } = useSession();
  const now = family.settings.claw;
  const [on, setOn] = useState(now.on);
  const [price, setPrice] = useState(String(now.price));
  const [perDay, setPerDay] = useState(now.perDay);
  const [level, setLevel] = useState<ClawLevel>(now.level);
  const [dropRate, setDropRate] = useState(now.dropRate);
  const [fallback, setFallback] = useState(String(now.fallbackCoins));
  const [rows, setRows] = useState<Row[]>(now.prizes.map(toRow));

  const draft: ClawSettings = { on, price: parseCoins(price), perDay, level, dropRate, fallbackCoins: parseCoins(fallback), prizes: rows.map(fromRow) };
  const total = rows.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  const average = Number.isFinite(draft.price) && Number.isFinite(draft.fallbackCoins) && total === 100 ? Math.round(expectedCoins(draft, CATCH_GUESS[level])) : null;

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
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

      <Field label="한 판 가격(코인)">
        {(id) => <CoinInput id={id} value={price} onChange={setPrice} presets={[5, 10, 20, 30]} max={MAX_CLAW_PRICE} />}
      </Field>

      <FieldGroup label="하루에 할 수 있는 횟수">
        <div className="chips six">
          {PER_DAY_CHOICES.map((n) => (
            <button key={n} type="button" role="radio" className="chip" aria-checked={perDay === n} onClick={() => setPerDay(n)}>
              {n === 0 ? '제한 없음' : `${n}번`}
            </button>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="난이도">
        <div className="segmented" role="radiogroup" aria-label="난이도">
          {LEVEL_ORDER.map((l) => (
            <button key={l} type="button" role="radio" className="chip" aria-checked={level === l} onClick={() => setLevel(l)}>
              {LEVELS[l].name}
            </button>
          ))}
        </div>
        <p className="t-cap">어려울수록 목표가 작아지고, 집게가 빨라지고, 위로 갈 때 더 흔들려요. 판마다 목표 자리와 속도가 조금씩 달라요.</p>
      </FieldGroup>

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
                <input className="input grow" placeholder="예: 게임 30분" maxLength={MAX_CLAW_TITLE} value={r.title} aria-label="현실 보상 이름" onChange={(e) => setRow(i, { title: e.target.value })} />
              )}
              {(r.kind === 'wardrobe' || r.kind === 'sticker') && <span className="t-cap grow">아직 없는 것 중 하나</span>}
              <label className="row" style={{ gap: 6 }}>
                <input className="input claw-weight" inputMode="numeric" value={r.weight} aria-label="확률(%)" onChange={(e) => setRow(i, { weight: e.target.value.replace(/\D/g, '') })} />
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
        <p className={total === 100 ? 't-cap' : 't-capb'}>확률 합계 {total}%{total === 100 ? '' : ' (100%가 되어야 저장돼요)'}</p>
      </FieldGroup>

      <Field label="이미 다 가진 꾸미기·스티커가 나오면 대신 줄 코인">
        {(id) => <CoinInput id={id} value={fallback} onChange={setFallback} presets={[10, 20, 30]} max={MAX_CLAW_COINS} min={1} />}
      </Field>

      {average !== null && (
        <p className="t-cap">
          참고: {LEVELS[level].name} 난이도에서 한 판에 평균 약 {average}코인을 돌려받아요(가격 {draft.price}코인, 꾸미기·스티커·현실 보상은 대신 줄 코인으로 셈).
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
