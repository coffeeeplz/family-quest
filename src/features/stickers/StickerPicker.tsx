import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { STICKER_PACKS, canUsePack, findSticker, stickerRef } from '../../domain/stickers';
import { Sticker } from '../../ui/Sticker';

/** 메모 창의 스티커 고르기: 팩을 고르고, 스티커를 누르면 붙는다(다시 누르면 뗀다). */
export function StickerPicker({ value, onChange, onShop }: { value: string; onChange: (ref: string) => void; onShop?: () => void }) {
  const { me } = useSession();
  const usable = STICKER_PACKS.filter((p) => canUsePack(me, p.id));
  const [packId, setPackId] = useState(() => findSticker(value)?.pack.id ?? usable[0]?.id ?? '');
  const pack = usable.find((p) => p.id === packId);

  return (
    <div className="field" role="group" aria-label="스티커 붙이기">
      <div className="label">스티커 붙이기 (안 붙여도 돼요)</div>
      {usable.length === 0 ? (
        <p className="t-cap">
          아직 스티커가 없어요.{' '}
          <Link className="link" to="/shop" onClick={onShop}>
            상점에서 사기 ›
          </Link>
        </p>
      ) : (
        <>
          <div className="chips">
            {STICKER_PACKS.map((p) => {
              const can = canUsePack(me, p.id);
              return (
                <button key={p.id} type="button" className="chip" aria-pressed={can && p.id === packId} disabled={!can} onClick={() => setPackId(p.id)}>
                  {p.name.replace(/ 팩$/, '')}
                  {!can && ' 🔒'}
                </button>
              );
            })}
          </div>
          {pack && (
            <div className="sticker-grid">
              {pack.stickers.map((s) => {
                const ref = stickerRef(pack.id, s.id);
                return (
                  <button key={s.id} type="button" className="chip sticker-pick" aria-pressed={value === ref} aria-label={`${s.label} 스티커`} onClick={() => onChange(value === ref ? '' : ref)}>
                    <Sticker id={ref} size={32} />
                  </button>
                );
              })}
            </div>
          )}
          {me.role !== 'parent' && usable.length < STICKER_PACKS.length && (
            <Link className="link" to="/shop" onClick={onShop}>
              상점에서 스티커 더 사기 ›
            </Link>
          )}
        </>
      )}
    </div>
  );
}
