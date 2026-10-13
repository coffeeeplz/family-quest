import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { AvatarChoice, WearSlot } from '../../backend/types';
import { MAX_NAME } from '../../domain/profile';
import { availableCoins } from '../../domain/shop';
import {
  SLOT_NAMES,
  WARDROBE_ITEMS,
  canUseAvatar,
  entryOffer,
  findEntry,
  findItem,
  ownedOf,
  owns,
  type WardrobeEntry,
} from '../../domain/wardrobe';
import { AVATARS, AVATAR_COLORS, colorHex } from '../../lib/sprites';
import { AvatarFrame, Avatar, PixelSprite } from '../../ui/Sprite';
import { Button, CoinPill, Field } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { useWardrobePrices } from './useWardrobePrices';

type Tab = WearSlot | 'avatar';
const TABS: Tab[] = ['avatar', 'hat', 'face', 'outfit', 'hand'];

/** 저장된 모양과 같은지 비교할 수 있게 빈 칸을 뺀다. */
function sameLook(a: AvatarChoice, b: AvatarChoice): boolean {
  const wear = (x: AvatarChoice) => TABS.filter((t) => t !== 'avatar' && x.wear?.[t as WearSlot]).map((t) => `${t}:${x.wear?.[t as WearSlot]}`).join(',');
  return a.id === b.id && a.color === b.color && wear(a) === wear(b);
}

/**
 * 내 캐릭터: 이름, 캐릭터와 색을 고르고 모자, 얼굴, 옷, 소품을 입어 본다.
 * 홈과 승인 화면의 내 캐릭터, 더보기 맨 위, 가족 화면, 상점에서 들어온다.
 * 갖지 않은 것도 눌러서 입어 볼 수 있고, 마음에 들면 바로 산다(스티커처럼 승인 없이, 부모에게 알림). 부모는 모두 무료.
 */
export function WardrobePage() {
  const backend = useBackend();
  const { family, me, isParent } = useSession();
  const { orders } = useFamilyData();
  const prices = useWardrobePrices();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<AvatarChoice>(me.avatar);
  const [name, setName] = useState(me.displayName);
  const [tab, setTab] = useState<Tab>('avatar');

  const owned = ownedOf(me);
  const free = availableCoins(me, orders);
  const offerOf = (entry: WardrobeEntry) => entryOffer(entry, prices);
  // 숨긴 상품은 이미 가진 사람에게만 보인다.
  const visible = (id: string) => {
    const entry = findEntry(id);
    return !entry || owns(owned, id) || !offerOf(entry).hidden;
  };

  // 입어 보는 것 중 아직 갖지 않은 것(저장하려면 사거나 벗어야 한다)
  const trying = [draft.id, ...Object.values(draft.wear ?? {})]
    .filter((id): id is string => Boolean(id) && !owns(owned, id) && !(id === draft.id && canUseAvatar(owned, id)))
    .map((id) => findEntry(id))
    .filter((entry): entry is WardrobeEntry => entry !== null);
  const changed = !sameLook(draft, me.avatar) || name.trim() !== me.displayName;

  function wear(slot: WearSlot, id: string | null) {
    const next = { ...(draft.wear ?? {}) };
    if (id) next[slot] = id;
    else delete next[slot];
    setDraft({ ...draft, wear: next });
  }

  async function buy(entry: WardrobeEntry) {
    await run(() => backend.buyWardrobeItem(family.id, me.uid, entry.id), `${entry.name}을(를) 샀어요! 저장하면 입어요.`);
  }

  function save() {
    void run(() => backend.updateMyProfile(family.id, me.uid, { displayName: name, avatar: draft }), '저장했어요!');
  }

  const priceTag = (id: string) => {
    if (owns(owned, id)) return null;
    const entry = findEntry(id);
    return entry ? <span className="t-cap">{offerOf(entry).price}코인</span> : null;
  };

  return (
    <main className="screen">
      {/* 홈의 캐릭터, 상점, 가족 화면 어디서든 들어오므로 들어온 곳으로 돌아간다. */}
      <button type="button" className="link back-link" onClick={() => navigate(-1)}>
        ‹ 뒤로
      </button>
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">내 캐릭터</h1>
          <p className="t-cap">{isParent ? '부모는 모두 무료예요' : '눌러서 입어 보고, 마음에 들면 사요'}</p>
        </div>
        <CoinPill amount={me.coins} />
      </header>

      <div className="wardrobe-preview">
        <AvatarFrame avatar={draft} size={160} background="var(--pink-soft)" />
      </div>

      {trying.length > 0 && (
        <section className="card stack wardrobe-try" aria-label="입어 보는 중">
          {trying.map((entry) => {
            const { price } = offerOf(entry);
            return (
              <div key={entry.id} className="row" style={{ gap: 10 }}>
                <span className="grow t-body">
                  {entry.name} <span className="t-cap">· {price}코인</span>
                </span>
                {free >= price ? (
                  <Button disabled={busy} onClick={() => void buy(entry)}>
                    사기
                  </Button>
                ) : (
                  <span className="t-capb">코인 {price - free}개 더 필요해요</span>
                )}
              </div>
            );
          })}
          <p className="t-cap">입어 보는 중이에요. 사거나 벗어야 저장할 수 있어요. 사면 부모님께 알림이 가요.</p>
        </section>
      )}

      <div className="wardrobe-tabs" role="radiogroup" aria-label="꾸미기 칸">
        {TABS.map((t) => (
          <button key={t} type="button" role="radio" className="chip" aria-checked={tab === t} onClick={() => setTab(t)}>
            {SLOT_NAMES[t]}
          </button>
        ))}
      </div>

      {tab === 'avatar' ? (
        <>
          <div className="avatar-grid" role="radiogroup" aria-label="캐릭터">
            {AVATARS.filter((a) => visible(a.id)).map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                className="avatar-cell wardrobe-cell"
                aria-label={canUseAvatar(owned, a.id) ? a.name : `${a.name}, ${findEntry(a.id) ? offerOf(findEntry(a.id)!).price : a.price}코인`}
                aria-checked={draft.id === a.id}
                onClick={() => setDraft({ ...draft, id: a.id, color: a.id === draft.id ? draft.color : a.color })}
              >
                <Avatar avatar={{ id: a.id, color: a.id === draft.id ? draft.color : a.color }} size={48} />
                {!canUseAvatar(owned, a.id) && priceTag(a.id)}
              </button>
            ))}
          </div>
          <div className="swatches" role="radiogroup" aria-label="색">
            {AVATAR_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                role="radio"
                className="swatch"
                aria-label={color.name}
                aria-checked={color.id === draft.color}
                style={{ background: color.hex }}
                onClick={() => setDraft({ ...draft, color: color.id })}
              />
            ))}
          </div>
          <Field label="이름">
            {(id) => (
              <input
                id={id}
                className="input"
                type="text"
                value={name}
                maxLength={MAX_NAME}
                placeholder="가족이 부르는 이름"
                autoComplete="nickname"
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
        </>
      ) : (
        <div className="avatar-grid" role="radiogroup" aria-label={SLOT_NAMES[tab]}>
          <button type="button" role="radio" className="avatar-cell wardrobe-cell" aria-label="안 입기" aria-checked={!draft.wear?.[tab]} onClick={() => wear(tab, null)}>
            <span className="t-capb">없음</span>
          </button>
          {WARDROBE_ITEMS.filter((item) => item.slot === tab && visible(item.id)).map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              className="avatar-cell wardrobe-cell"
              aria-label={owns(owned, item.id) ? item.name : `${item.name}, ${offerOf(findEntry(item.id)!).price}코인`}
              aria-checked={draft.wear?.[tab] === item.id}
              onClick={() => wear(tab, item.id)}
            >
              <PixelSprite rows={findItem(item.id)!.rows} primary={colorHex(draft.color)} size={48} />
              {priceTag(item.id)}
            </button>
          ))}
        </div>
      )}

      <Button big block disabled={busy || !changed || trying.length > 0} onClick={save}>
        이 모습으로 저장하기
      </Button>
      {changed && (
        <Button
          tone="plain"
          big
          block
          onClick={() => {
            setDraft(me.avatar);
            setName(me.displayName);
          }}
        >
          처음 모습으로
        </Button>
      )}
    </main>
  );
}
