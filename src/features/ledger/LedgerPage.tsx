import { useMemo, useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useSession } from '../../app/session';
import type { LedgerEntry } from '../../backend/types';
import { formatWhen } from '../../lib/dates';
import type { IconName } from '../../lib/sprites';
import { Avatar, Icon } from '../../ui/Sprite';
import { BackLink, CoinInline, CoinPill, Empty } from '../../ui/kit';

const TYPE_ICON: Record<LedgerEntry['type'], IconName> = {
  quest: 'coin',
  bonus: 'star',
  gift: 'heart',
  reward: 'shop',
  adjust: 'coin',
};

/** 코인 기록. 자녀는 자기 기록을, 부모는 자녀별 기록을 본다. */
export function LedgerPage() {
  const { me, members, kids, isParent } = useSession();
  const { ledger, today, loading } = useFamilyData();
  const [filterUid, setFilterUid] = useState<string>(isParent ? 'all' : me.uid);

  const memberById = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);
  const entries = ledger.filter((entry) => filterUid === 'all' || entry.uid === filterUid);

  return (
    <main className="screen">
      <BackLink />
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">코인 기록</h1>
          <p className="t-cap">{isParent ? '누가 언제 코인을 받았는지 볼 수 있어요' : '내가 모은 코인이에요'}</p>
        </div>
        {!isParent && <CoinPill amount={me.coins} />}
      </header>

      {isParent && kids.length > 1 && (
        <div className="chips" role="radiogroup" aria-label="누구의 기록을 볼까요">
          <button type="button" role="radio" className="chip" aria-checked={filterUid === 'all'} onClick={() => setFilterUid('all')}>
            모두
          </button>
          {kids.map((kid) => (
            <button
              key={kid.uid}
              type="button"
              role="radio"
              className="chip"
              aria-checked={filterUid === kid.uid}
              onClick={() => setFilterUid(kid.uid)}
            >
              <Avatar avatar={kid.avatar} size={24} />
              {kid.displayName}
            </button>
          ))}
        </div>
      )}

      <div className="stack">
        {!loading && entries.length === 0 && (
          <Empty icon={<Icon name="log" size={48} />} title="아직 기록이 없어요" hint="퀘스트가 승인되면 여기에 쌓여요." />
        )}
        {entries.map((entry) => {
          const owner = memberById.get(entry.uid);
          const giver = memberById.get(entry.by);
          return (
            <article key={entry.id} className="card card-row">
              {isParent && owner ? <Avatar avatar={owner.avatar} size={36} /> : <Icon name={TYPE_ICON[entry.type]} size={36} />}
              <div className="card-main">
                <h2 className="t-body item-title">{entry.memo}</h2>
                <p className="t-cap">
                  {isParent && owner ? `${owner.displayName} · ` : ''}
                  {formatWhen(entry.at, today)}
                  {giver ? ` · ${giver.displayName}` : ''}
                </p>
                {entry.note && <p className="t-capb">"{entry.note}"</p>}
              </div>
              <CoinInline amount={entry.amount} sign />
            </article>
          );
        })}
      </div>
    </main>
  );
}
