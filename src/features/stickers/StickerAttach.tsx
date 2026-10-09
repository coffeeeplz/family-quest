import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { STICKER_PACKS, canUsePack, findSticker, splitSticker, stickerRef } from '../../domain/stickers';
import { Sticker } from '../../ui/Sticker';

const BUTTON_STICKER = 'basic/laugh';

interface Props {
  /** 붙인 스티커('팩/스티커'), 없으면 '' */
  value: string;
  onChange: (ref: string) => void;
  /** 입력칸. 오른쪽 안에 스티커 버튼이 붙는다. 없으면 버튼만 한 줄로 */
  children?: ReactNode;
  /** 상점으로 갈 때(창을 닫는 등) */
  onShop?: () => void;
}

/**
 * 카톡처럼 입력칸 오른쪽의 스티커 버튼. 누르면 아래에 스티커 판이 열리고, 고르면 닫힌다.
 * 고른 스티커는 입력칸 위에 작게 보이고 × 로 뗀다.
 */
export function StickerAttach({ value, onChange, children, onShop }: Props) {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const usable = STICKER_PACKS.filter((p) => canUsePack(me, p.id));
  const [packId, setPackId] = useState(() => findSticker(value)?.pack.id ?? usable[0]?.id ?? '');
  const pack = usable.find((p) => p.id === packId) ?? usable[0];
  const chosen = value ? findSticker(value) : null;

  const button = (
    <button type="button" className="sticker-btn" aria-label={open ? '스티커 판 닫기' : '스티커 붙이기'} aria-expanded={open} onClick={() => setOpen(!open)}>
      <Sticker id={BUTTON_STICKER} size={24} />
    </button>
  );

  return (
    <div className="sticker-attach">
      {chosen && (
        <div className="sticker-chosen">
          <Sticker id={value} size={32} />
          <span className="t-cap grow">{chosen.sticker.label} 스티커</span>
          <button type="button" className="link" aria-label="스티커 떼기" onClick={() => onChange('')}>
            × 떼기
          </button>
        </div>
      )}
      {children ? (
        <div className="sticker-input">
          {children}
          {button}
        </div>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          {button}
          <span className="t-cap">스티커 붙이기</span>
        </div>
      )}
      {open && (
        <div className="px sticker-tray" role="group" aria-label="스티커 판">
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
                    <button key={p.id} type="button" className="chip" aria-pressed={can && p.id === pack?.id} disabled={!can} onClick={() => setPackId(p.id)}>
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
                      <button
                        key={s.id}
                        type="button"
                        className="chip sticker-pick"
                        aria-pressed={value === ref}
                        aria-label={`${s.label} 스티커`}
                        onClick={() => {
                          onChange(value === ref ? '' : ref);
                          setOpen(false);
                        }}
                      >
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
      )}
    </div>
  );
}

/** 스티커가 붙은 한마디를 보여 준다: "잘했어" 🐱 */
export function Said({ said, quote = true, size = 24 }: { said: string; quote?: boolean; size?: number }) {
  const { text, sticker } = splitSticker(said);
  return (
    <>
      {text && (quote ? `"${text}"` : text)}
      {sticker && (
        <span className="said-sticker">
          <Sticker id={sticker} size={size} label />
        </span>
      )}
    </>
  );
}
