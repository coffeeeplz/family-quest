import { useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import { MAX_TITLE } from '../../domain/quests';
import { addDays } from '../../lib/dates';
import { CoinInput, parseCoins } from '../../ui/CoinInput';
import { Icon } from '../../ui/Sprite';
import { Button, CoinInline, Field, FieldGroup, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';

type When = 'today' | 'tomorrow' | 'pick';

/** 자녀가 스스로 할 일을 추가하는 창: 버튼으로 바로 추가하거나, 직접 적고 코인을 제안한다. */
export function AddTaskSheet({ onClose }: { onClose: () => void }) {
  const backend = useBackend();
  const { family, me } = useSession();
  const { presets, today } = useFamilyData();
  const { busy, run } = useAction();

  const cap = family.settings.maxProposalCoins;
  const quickPresets = presets.filter((p) => p.childCanAdd);

  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<When>('today');
  const [pickedDate, setPickedDate] = useState(addDays(today, 2));
  const [important, setImportant] = useState(false);
  const [offering, setOffering] = useState(false);
  const [amount, setAmount] = useState(String(Math.min(10, cap)));

  const date = when === 'today' ? today : when === 'tomorrow' ? addDays(today, 1) : pickedDate;

  async function add() {
    const ok = await run(
      () =>
        backend.createProposal(
          family.id,
          { title, note: '', date, important, amount: offering ? parseCoins(amount) : null },
          me.uid,
        ),
      offering ? '부모님께 코인을 제안했어요.' : '내 할 일에 추가했어요.',
    );
    if (ok) onClose();
  }

  return (
    <Sheet title="내 할 일 추가" onClose={onClose}>
      {quickPresets.length > 0 && (
        <div className="field">
          <div className="label">바로 추가하기</div>
          <div className="stack" style={{ gap: 10 }}>
            {quickPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="px card-row list-button quick-row"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => backend.addPresetQuestAsChild(family.id, preset, me.uid, today),
                    `"${preset.title}" 퀘스트를 추가했어요.`,
                  ).then((ok) => ok && onClose())
                }
              >
                <Icon name="quest" size={24} />
                <span className="grow t-body">{preset.title}</span>
                <CoinInline amount={preset.reward} sign />
              </button>
            ))}
          </div>
          <p className="t-cap">코인이 미리 정해진 일이에요. 누르면 오늘의 퀘스트가 돼요.</p>
        </div>
      )}

      {quickPresets.length > 0 && <div className="hr" />}

      <Field label="직접 적기">
        {(id) => (
          <input
            id={id}
            className="input"
            type="text"
            value={title}
            maxLength={MAX_TITLE}
            placeholder="예: 준비물 챙기기"
            onChange={(event) => setTitle(event.target.value)}
          />
        )}
      </Field>

      <FieldGroup label="언제 할까요?">
        <div className="segmented">
          {(
            [
              ['today', '오늘'],
              ['tomorrow', '내일'],
              ['pick', '날짜 고르기'],
            ] as [When, string][]
          ).map(([value, label]) => (
            <button key={value} type="button" role="radio" className="chip" aria-checked={when === value} onClick={() => setWhen(value)}>
              {label}
            </button>
          ))}
        </div>
        {when === 'pick' && (
          <input
            className="input"
            type="date"
            aria-label="날짜"
            min={today}
            value={pickedDate}
            onChange={(event) => setPickedDate(event.target.value)}
          />
        )}
      </FieldGroup>

      <div className="field">
        <div className="label">표시</div>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={important} onClick={() => setImportant(!important)}>
            <Icon name="star" size={12} />꼭 해야 하는 일
          </button>
        </div>
      </div>

      <FieldGroup label="코인">
        <div className="segmented">
          <button type="button" role="radio" className="chip" aria-checked={!offering} onClick={() => setOffering(false)}>
            메모만
          </button>
          <button type="button" role="radio" className="chip" aria-checked={offering} onClick={() => setOffering(true)}>
            코인 제안하기
          </button>
        </div>
      </FieldGroup>

      {offering && (
        <Field label="받고 싶은 코인" hint={`${cap}코인까지 제안할 수 있어요. 부모님이 수락하면 퀘스트가 돼요.`}>
          {(id) => <CoinInput id={id} value={amount} onChange={setAmount} presets={[5, 10, 15, 20, 30]} min={1} max={cap} />}
        </Field>
      )}

      <Button big block disabled={busy} onClick={() => void add()}>
        {offering ? '코인 제안하기' : '추가하기'}
      </Button>
      <Button tone="plain" big block onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}
