import { useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { Wish } from '../../backend/types';
import { MAX_PRICE } from '../../domain/shop';
import { canCounterWish } from '../../domain/wishes';
import type { IconName } from '../../lib/sprites';
import { Icon } from '../../ui/Sprite';
import { Button, CoinInline } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { OfferSheet } from '../negotiation/OfferSheet';

/** 자녀 화면의 가격 협상 카드: 부모가 제안한 가격에 답한다. */
export function MyWishCard({ wish }: { wish: Wish }) {
  const backend = useBackend();
  const { family, me } = useSession();
  const { busy, run } = useAction();
  const [countering, setCountering] = useState(false);

  const settings = family.settings;
  const price = wish.lastPrice;
  const lastNote = wish.offers[wish.offers.length - 1]?.note ?? '';

  return (
    <article className="card is-wait">
      <div className="card-row">
        <Icon name={wish.icon as IconName} size={36} />
        <div className="card-main">
          <h3 className="t-body item-title">{wish.title}</h3>
          <p className="t-cap">
            제안 {wish.offerCount}/{settings.maxRounds}번째
          </p>
        </div>
        <CoinInline amount={price} />
      </div>
      <p className="t-capb" style={{ marginTop: 12, lineHeight: '18px' }}>
        부모님이 {price}코인에 올리자고 했어요.{lastNote ? ` "${lastNote}"` : ''}
      </p>
      <div className="stack" style={{ gap: 10, marginTop: 12 }}>
        <Button
          tone="mint"
          block
          disabled={busy}
          onClick={() => void run(() => backend.acceptWish(family.id, wish.id, me.uid), '좋아요! 상점에 올라갔어요.')}
        >
          좋아요, {price}코인에 올려요
        </Button>
        <div className="segmented">
          <Button tone="plain" disabled={busy} onClick={() => void run(() => backend.deleteWish(family.id, wish.id), '제안을 그만뒀어요.')}>
            그만두기
          </Button>
          {canCounterWish(wish, settings) && (
            <Button disabled={busy} onClick={() => setCountering(true)}>
              다시 제안하기
            </Button>
          )}
        </div>
      </div>

      {countering && (
        <OfferSheet
          title="가격 다시 제안하기"
          label="가격 (코인)"
          hint={`"${wish.title}"의 가격을 다시 적어요. 부모님은 ${price}코인을 제안했어요.`}
          initial={Math.max(1, price - 10)}
          presets={[30, 50, 100, 200]}
          max={MAX_PRICE}
          submitLabel="이 가격으로 제안하기"
          busy={busy}
          onClose={() => setCountering(false)}
          onSubmit={(value, note) =>
            void run(() => backend.counterWish(family.id, wish.id, value, note, me.uid), '다시 제안했어요.').then((ok) => ok && setCountering(false))
          }
        />
      )}
    </article>
  );
}
