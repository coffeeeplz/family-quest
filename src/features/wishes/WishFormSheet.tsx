import { useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import { MAX_NOTE, MAX_TITLE } from '../../domain/quests';
import { MAX_PRICE, REWARD_ICONS } from '../../domain/shop';
import { MAX_OPEN_WISHES } from '../../domain/wishes';
import { CoinInput, parseCoins } from '../../ui/CoinInput';
import { Icon } from '../../ui/Sprite';
import { Button, Field, FieldGroup, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';

interface Props {
  /** 지금 걸어 둔 제안의 수 */
  openCount: number;
  onClose: () => void;
}

/** 자녀가 상점에 올려 달라고 보상을 제안하는 창 */
export function WishFormSheet({ openCount, onClose }: Props) {
  const backend = useBackend();
  const { family, me } = useSession();
  const { busy, run } = useAction();
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState<string>('shop');
  const [price, setPrice] = useState('50');
  const [note, setNote] = useState('');

  const full = openCount >= MAX_OPEN_WISHES;

  async function send() {
    const ok = await run(
      () => backend.createWish(family.id, { title, note, icon, price: parseCoins(price) }, me.uid),
      '부모님께 제안했어요. 답을 기다려요!',
    );
    if (ok) onClose();
  }

  return (
    <Sheet title="보상 제안하기" onClose={onClose}>
      {full ? (
        <p className="t-body">
          제안은 한 번에 {MAX_OPEN_WISHES}개까지 걸어 둘 수 있어요. 부모님의 답을 기다리거나, 걸어 둔 제안을 그만둔 뒤에 다시 해 주세요.
        </p>
      ) : (
        <>
          <p className="t-cap" style={{ lineHeight: '18px' }}>
            갖고 싶거나 하고 싶은 것을 적으면 부모님이 보고 상점에 올려 줘요. 가격은 부모님과 주고받으며 정해요. (지금 {openCount}/{MAX_OPEN_WISHES}개 제안 중)
          </p>
          <Field label="갖고 싶은 보상">
            {(id) => (
              <input id={id} className="input" type="text" value={title} maxLength={MAX_TITLE} placeholder="예: 놀이공원 가기" onChange={(e) => setTitle(e.target.value)} />
            )}
          </Field>
          <FieldGroup label="그림">
            <div className="chips">
              {REWARD_ICONS.map((choice) => (
                <button key={choice.icon} type="button" role="radio" className="chip" aria-checked={icon === choice.icon} aria-label={choice.name} onClick={() => setIcon(choice.icon)}>
                  <Icon name={choice.icon} size={24} />
                </button>
              ))}
            </div>
          </FieldGroup>
          <Field label="내가 생각하는 가격 (코인)" hint="부모님이 다른 가격을 제안할 수도 있어요.">
            {(id) => <CoinInput id={id} value={price} onChange={setPrice} presets={[30, 50, 100, 200]} min={1} max={MAX_PRICE} />}
          </Field>
          <Field label="하고 싶은 말 (안 적어도 돼요)">
            {(id) => <input id={id} className="input" type="text" value={note} maxLength={MAX_NOTE} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Button big block disabled={busy} onClick={() => void send()}>
            부모님께 제안하기
          </Button>
        </>
      )}
      <Button tone="plain" big block onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}
