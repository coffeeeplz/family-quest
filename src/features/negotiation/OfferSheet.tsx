import { useState } from 'react';
import { CoinInput, parseCoins } from '../../ui/CoinInput';
import { Button, Field, Sheet } from '../../ui/kit';
import { MAX_OFFER_NOTE } from '../../domain/proposals';

interface Props {
  title: string;
  hint: string;
  initial: number;
  presets: number[];
  max: number;
  submitLabel: string;
  busy: boolean;
  onSubmit: (amount: number, note: string) => void;
  onClose: () => void;
}

/** 코인 협상에서 다른 금액을 제안하는 창. 부모와 자녀가 함께 쓴다. */
export function OfferSheet({ title, hint, initial, presets, max, submitLabel, busy, onSubmit, onClose }: Props) {
  const [amount, setAmount] = useState(String(initial));
  const [note, setNote] = useState('');
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="t-body">{hint}</p>
      <Field label="코인" hint={`1부터 ${max}까지 적을 수 있어요.`}>
        {(id) => <CoinInput id={id} value={amount} onChange={setAmount} presets={presets} min={1} max={max} />}
      </Field>
      <Field label="한마디 (안 적어도 돼요)">
        {(id) => (
          <input
            id={id}
            className="input"
            type="text"
            value={note}
            maxLength={MAX_OFFER_NOTE}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>
      <Button big block disabled={busy} onClick={() => onSubmit(parseCoins(amount), note)}>
        {submitLabel}
      </Button>
      <Button tone="plain" big block onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}
