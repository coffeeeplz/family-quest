import { useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { Wish } from '../../backend/types';
import { MAX_PRICE } from '../../domain/shop';
import { MAX_DECLINE_NOTE, canCounterWish } from '../../domain/wishes';
import type { IconName } from '../../lib/sprites';
import { Icon } from '../../ui/Sprite';
import { Button, CoinInline, Field, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { OfferSheet } from '../negotiation/OfferSheet';

/** 부모의 승인 화면에 나오는 "보상 제안": 자녀가 올려 달라고 한 보상에 답한다. */
export function WishInbox({ wishes }: { wishes: Wish[] }) {
  const backend = useBackend();
  const { family, me, members } = useSession();
  const { busy, run } = useAction();
  const [counterTarget, setCounterTarget] = useState<Wish | null>(null);
  const [declineTarget, setDeclineTarget] = useState<Wish | null>(null);
  const [reason, setReason] = useState('');

  const settings = family.settings;
  const nameOf = (uid: string) => members.find((m) => m.uid === uid)?.displayName ?? '알 수 없음';

  if (wishes.length === 0) return null;
  return (
    <section className="stack" aria-label="보상 제안">
      <h2 className="t-title">보상 제안</h2>
      {wishes.map((wish) => {
        const lastNote = wish.offers[wish.offers.length - 1]?.note ?? '';
        return (
          <article key={wish.id} className="card">
            <div className="card-row">
              <Icon name={wish.icon as IconName} size={36} />
              <div className="card-main">
                <h3 className="t-body item-title">{wish.title}</h3>
                <p className="t-cap">
                  {nameOf(wish.ownerUid)} · 상점에 올려 주세요 · 제안 {wish.offerCount}/{settings.maxRounds}번째
                </p>
              </div>
              <CoinInline amount={wish.lastPrice} />
            </div>
            {(wish.note || lastNote) && <p className="t-capb card-foot">"{lastNote || wish.note}"</p>}
            <div className="stack" style={{ gap: 10, marginTop: 14 }}>
              <Button
                tone="mint"
                block
                disabled={busy}
                onClick={() => void run(() => backend.acceptWish(family.id, wish.id, me.uid), `"${wish.title}"을(를) ${wish.lastPrice}코인으로 상점에 올렸어요.`)}
              >
                {wish.lastPrice}코인으로 상점에 올리기
              </Button>
              <div className="segmented">
                <Button
                  tone="plain"
                  disabled={busy}
                  onClick={() => {
                    setReason('');
                    setDeclineTarget(wish);
                  }}
                >
                  거절
                </Button>
                {canCounterWish(wish, settings) && (
                  <Button disabled={busy} onClick={() => setCounterTarget(wish)}>
                    다른 가격 제안
                  </Button>
                )}
              </div>
            </div>
          </article>
        );
      })}

      {counterTarget && (
        <OfferSheet
          title="다른 가격 제안"
          label="가격 (코인)"
          hint={`"${counterTarget.title}"에 대한 ${nameOf(counterTarget.ownerUid)}의 제안은 ${counterTarget.lastPrice}코인이에요. 알맞은 가격을 적어 주세요.`}
          initial={Math.min(MAX_PRICE, counterTarget.lastPrice * 2)}
          presets={[50, 100, 200, 300]}
          max={MAX_PRICE}
          submitLabel="이 가격으로 제안하기"
          busy={busy}
          onClose={() => setCounterTarget(null)}
          onSubmit={(value, note) =>
            void run(() => backend.counterWish(family.id, counterTarget.id, value, note, me.uid), '다른 가격을 제안했어요.').then(
              (ok) => ok && setCounterTarget(null),
            )
          }
        />
      )}

      {declineTarget && (
        <Sheet title="보상 제안 거절" onClose={() => setDeclineTarget(null)}>
          <p className="t-body">"{declineTarget.title}" 제안을 거절해요. 상점에는 올라가지 않아요.</p>
          <Field label="한마디 (안 적어도 돼요)">
            {(id) => (
              <input id={id} className="input" type="text" value={reason} maxLength={MAX_DECLINE_NOTE} placeholder="예: 다음 방학에 다시 얘기하자" onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
          <Button
            big
            block
            disabled={busy}
            onClick={() => {
              const target = declineTarget;
              setDeclineTarget(null);
              void run(() => backend.declineWish(family.id, target.id, reason, me.uid), '제안을 거절했어요.');
            }}
          >
            거절하기
          </Button>
          <Button tone="plain" big block onClick={() => setDeclineTarget(null)}>
            닫기
          </Button>
        </Sheet>
      )}
    </section>
  );
}
