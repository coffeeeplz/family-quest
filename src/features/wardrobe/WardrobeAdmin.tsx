import { useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import { SLOT_NAMES, WARDROBE_ENTRIES, entryOffer, findEntry, findItem, type WardrobeEntry } from '../../domain/wardrobe';
import { avatarDef, colorHex } from '../../lib/sprites';
import { Avatar, PixelSprite } from '../../ui/Sprite';
import { Button, Fold, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { useWardrobePrices } from './useWardrobePrices';

/** 상품 그림: 캐릭터는 기본 색으로, 아이템은 분홍 캐릭터 색으로 */
export function EntryPicture({ entry, size }: { entry: WardrobeEntry; size: number }) {
  if (entry.slot === 'avatar') return <Avatar avatar={{ id: entry.id, color: avatarDef(entry.id).color }} size={size} />;
  return <PixelSprite rows={findItem(entry.id)!.rows} primary={colorHex('pink')} size={size} />;
}

/** 상점 관리의 꾸미기 상품: 가격 바꾸기와 숨기기. 목록이 길어서 접어 둔다. */
export function WardrobeAdmin() {
  const backend = useBackend();
  const { family } = useSession();
  const prices = useWardrobePrices();
  const { busy, run } = useAction();
  const [editing, setEditing] = useState<{ itemId: string; price: string; hidden: boolean } | null>(null);
  const entry = editing ? findEntry(editing.itemId) : null;
  const hiddenCount = WARDROBE_ENTRIES.filter((e) => entryOffer(e, prices).hidden).length;

  async function save() {
    if (!editing) return;
    const price = Number(editing.price);
    if (await run(() => backend.setWardrobePrice(family.id, editing.itemId, price, editing.hidden), '꾸미기 상품을 고쳤어요.')) setEditing(null);
  }

  return (
    <section className="stack" aria-label="꾸미기 상품">
      <div className="section-head">
        <h2 className="t-title">꾸미기 상품</h2>
        <span className="t-cap">부모는 모두 무료</span>
      </div>
      <Fold title="가격과 숨기기" summary={`${WARDROBE_ENTRIES.length}개${hiddenCount > 0 ? ` · 숨김 ${hiddenCount}개` : ''}`}>
        {WARDROBE_ENTRIES.map((e) => {
          const offer = entryOffer(e, prices);
          return (
            <button key={e.id} type="button" className="card card-row" aria-label={`${e.name} 가격 정하기`} onClick={() => setEditing({ itemId: e.id, price: String(offer.price), hidden: offer.hidden })}>
              <EntryPicture entry={e} size={36} />
              <span className="card-main">
                <span className="t-body item-title">{e.name}</span>
                <span className="t-cap">
                  {SLOT_NAMES[e.slot]} · {offer.hidden ? '숨김 · 자녀 상점에 안 보여요' : `${offer.price}코인`}
                </span>
              </span>
              <span className="t-title" aria-hidden="true">
                ›
              </span>
            </button>
          );
        })}
      </Fold>

      {editing && entry && (
        <Sheet title={entry.name} onClose={() => setEditing(null)}>
          <div className="wardrobe-preview">
            <EntryPicture entry={entry} size={96} />
          </div>
          <div className="field">
            <label className="label" htmlFor="wardrobe-price">
              가격(코인)
            </label>
            <input id="wardrobe-price" className="input" inputMode="numeric" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value.replace(/\D/g, '') })} />
          </div>
          <div className="segmented" role="radiogroup" aria-label="자녀 상점에 보이기">
            <button type="button" role="radio" className="chip" aria-checked={!editing.hidden} onClick={() => setEditing({ ...editing, hidden: false })}>
              보이기
            </button>
            <button type="button" role="radio" className="chip" aria-checked={editing.hidden} onClick={() => setEditing({ ...editing, hidden: true })}>
              숨기기
            </button>
          </div>
          <p className="t-cap">이미 산 것은 숨겨도 계속 쓸 수 있어요.</p>
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
