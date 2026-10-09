import { useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import { availableCoins } from '../../domain/shop';
import { STICKER_PACKS, packOffer, stickerRef, type StickerPack } from '../../domain/stickers';
import { Sticker } from '../../ui/Sticker';
import { Button, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { useStickerPrices } from './useStickerPrices';

/** 팩의 스티커 넷을 2×2로 작게 보여 준다. */
export function PackPreview({ pack, size = 32 }: { pack: StickerPack; size?: number }) {
  return (
    <div className="pack-preview" aria-hidden="true">
      {pack.stickers.slice(0, 4).map((s) => (
        <Sticker key={s.id} id={stickerRef(pack.id, s.id)} size={size} />
      ))}
    </div>
  );
}

/** 자녀 상점의 스티커 칸: 앱 안 상품이라 승인 없이 바로 사고, 부모에게 알림이 간다. */
export function StickerShop() {
  const backend = useBackend();
  const { family, me } = useSession();
  const { orders } = useFamilyData();
  const prices = useStickerPrices();
  const { busy, run } = useAction();
  const [openId, setOpenId] = useState<string | null>(null);

  const packs = STICKER_PACKS.map((pack) => ({ pack, ...packOffer(pack, prices), owned: me.stickerPacks.includes(pack.id) })).filter((p) => p.owned || !p.hidden);
  const free = availableCoins(me, orders);
  const open = packs.find((p) => p.pack.id === openId);

  async function buy(packId: string) {
    if (await run(() => backend.buyStickerPack(family.id, me.uid, packId), '샀어요! 메모를 쓸 때 붙여 보세요.')) setOpenId(null);
  }

  return (
    <section className="stack" aria-label="스티커">
      <div className="section-head" style={{ alignItems: 'center' }}>
        <h2 className="t-title">스티커</h2>
        <span className="t-cap">메모에 붙여요</span>
      </div>
      <div className="shop-grid">
        {packs.map(({ pack, price, owned }) => (
          <article key={pack.id} className="card shop-item">
            <PackPreview pack={pack} />
            <h3 className="t-body item-title center">{pack.name}</h3>
            {owned ? <p className="t-capb">가지고 있어요</p> : <p className="t-cap">{price}코인 · {pack.stickers.length}개</p>}
            <Button tone={owned ? 'plain' : 'pink'} block aria-label={`${pack.name} ${owned ? '보기' : '자세히'}`} onClick={() => setOpenId(pack.id)}>
              {owned ? '보기' : '자세히'}
            </Button>
          </article>
        ))}
      </div>

      {open && (
        <Sheet title={open.pack.name} onClose={() => setOpenId(null)}>
          <div className="sticker-grid">
            {open.pack.stickers.map((s) => (
              <div key={s.id} className="center">
                <Sticker id={stickerRef(open.pack.id, s.id)} size={64} />
                <div className="t-cap">{s.label}</div>
              </div>
            ))}
          </div>
          {open.owned ? (
            <p className="t-body center">가지고 있는 팩이에요. 메모를 쓸 때 붙일 수 있어요.</p>
          ) : (
            <>
              <p className="t-body center">한 번 사면 계속 쓸 수 있어요.</p>
              {free >= open.price ? (
                <Button big block disabled={busy} onClick={() => void buy(open.pack.id)}>
                  {open.price}코인으로 바로 사기
                </Button>
              ) : (
                <p className="t-capb center">코인이 {open.price - free}개 더 필요해요.</p>
              )}
              <p className="t-cap center">부모님 승인 없이 바로 사져요. 부모님께 알림이 가요.</p>
            </>
          )}
          <Button tone="plain" big block onClick={() => setOpenId(null)}>
            닫기
          </Button>
        </Sheet>
      )}
    </section>
  );
}

/** 상점 관리의 스티커 팩: 가격 바꾸기와 숨기기 */
export function StickerAdmin() {
  const backend = useBackend();
  const { family } = useSession();
  const prices = useStickerPrices();
  const { busy, run } = useAction();
  const [editing, setEditing] = useState<{ packId: string; price: string; hidden: boolean } | null>(null);
  const pack = editing ? STICKER_PACKS.find((p) => p.id === editing.packId) : undefined;

  async function save() {
    if (!editing) return;
    const price = Number(editing.price);
    if (await run(() => backend.setStickerPrice(family.id, editing.packId, price, editing.hidden), '스티커 팩을 고쳤어요.')) setEditing(null);
  }

  return (
    <section className="stack" aria-label="스티커 팩">
      <div className="section-head">
        <h2 className="t-title">스티커 팩</h2>
        <span className="t-cap">부모는 모두 무료</span>
      </div>
      {STICKER_PACKS.map((p) => {
        const offer = packOffer(p, prices);
        return (
          <button key={p.id} type="button" className="card card-row" aria-label={`${p.name} 가격 정하기`} onClick={() => setEditing({ packId: p.id, price: String(offer.price), hidden: offer.hidden })}>
            <PackPreview pack={p} size={16} />
            <span className="card-main">
              <span className="t-body item-title">{p.name}</span>
              <span className="t-cap">{offer.hidden ? '숨김 · 자녀 상점에 안 보여요' : `${offer.price}코인`}</span>
            </span>
            <span className="t-title" aria-hidden="true">
              ›
            </span>
          </button>
        );
      })}

      {editing && pack && (
        <Sheet title={pack.name} onClose={() => setEditing(null)}>
          <PackPreview pack={pack} size={48} />
          <div className="field">
            <label className="label" htmlFor="sticker-price">
              가격(코인)
            </label>
            <input id="sticker-price" className="input" inputMode="numeric" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value.replace(/\D/g, '') })} />
          </div>
          <div className="segmented" role="radiogroup" aria-label="자녀 상점에 보이기">
            <button type="button" role="radio" className="chip" aria-checked={!editing.hidden} onClick={() => setEditing({ ...editing, hidden: false })}>
              보이기
            </button>
            <button type="button" role="radio" className="chip" aria-checked={editing.hidden} onClick={() => setEditing({ ...editing, hidden: true })}>
              숨기기
            </button>
          </div>
          <p className="t-cap">이미 산 팩은 숨겨도 계속 쓸 수 있어요.</p>
          <Button big block disabled={busy} onClick={() => void save()}>
            저장하기
          </Button>
          <Button tone="plain" big block onClick={() => setEditing(null)}>
            닫기
          </Button>
        </Sheet>
      )}
    </section>
  );
}
