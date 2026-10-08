import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useSession } from '../../app/session';
import { splitMyWishes } from '../../domain/wishes';
import { Icon } from '../../ui/Sprite';
import { Button, CoinPill, Empty, Fold } from '../../ui/kit';
import { MyOfferCard } from '../negotiation/MyOfferCard';
import { useWishes } from '../wishes/useWishes';
import { AddTaskSheet } from './AddTaskSheet';
import { QuestCards, useMyBoard } from './QuestCards';

/**
 * 자녀의 퀘스트 화면: 놓친 일과 오늘 할 일을 하고, 코인 협상에 답한다.
 * 다가오는 일은 접어 두고, 상점은 코인 아래 버튼으로 들어간다. 메모와 일정은 홈에 있다.
 */
export function TodayPage() {
  const { me } = useSession();
  const { proposals, loading } = useFamilyData();
  const { board, progress, streak } = useMyBoard();
  const { wishes } = useWishes();
  const [adding, setAdding] = useState(false);

  const myOffers = proposals
    .filter((p) => p.ownerUid === me.uid && p.status === 'negotiating')
    .sort((a, b) => Number(b.lastRole === 'parent') - Number(a.lastRole === 'parent') || a.createdAt - b.createdAt);
  // 상점에서 내가 답할 가격 협상의 수
  const shopAsks = splitMyWishes(wishes, me.uid, () => false).toAnswer.length;

  return (
    <main className="screen">
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">퀘스트</h1>
          <p className="t-cap">{progress.total === 0 ? '오늘은 퀘스트가 없어요' : `퀘스트 ${progress.total}개 중 ${progress.done}개 완료`}</p>
          {streak > 0 && (
            <p className="t-capb row" style={{ gap: 4 }}>
              <Icon name="star" size={12} />
              {streak}일 연속 달성 중
            </p>
          )}
        </div>
        <div className="head-side">
          <CoinPill amount={me.coins} />
          <Link className="btn compact with-corner" to="/shop" aria-label={shopAsks > 0 ? `상점, 답할 가격 협상 ${shopAsks}개` : '상점'}>
            <Icon name="shop" size={24} />
            상점
            {shopAsks > 0 && (
              <span className="corner-badge ask" aria-hidden="true">
                {shopAsks}
              </span>
            )}
          </Link>
        </div>
      </header>

      {progress.total > 0 && progress.total <= 10 && (
        <div className="progress" role="img" aria-label={`${progress.total}개 중 ${progress.done}개 완료`}>
          {Array.from({ length: progress.total }, (_, index) => (
            <span key={index} className={index < progress.done ? 'on' : undefined} />
          ))}
        </div>
      )}

      {board.missed.length > 0 && (
        <section className="stack" aria-label="놓친 일">
          <div className="section-head">
            <h2 className="t-title">놓친 일</h2>
            <span className="t-cap">{board.missed.length}개</span>
          </div>
          <QuestCards items={board.missed} />
        </section>
      )}

      <section className="stack" aria-label="오늘 할 일">
        <div className="section-head" style={{ alignItems: 'center' }}>
          <h2 className="t-title">오늘 할 일</h2>
          <Button tone="plain" aria-label="내 할 일 추가" onClick={() => setAdding(true)}>
            + 추가
          </Button>
        </div>
        {!loading && board.today.length === 0 && (
          <Empty icon={<Icon name="star" size={48} />} title="오늘 할 일이 없어요" hint="새 퀘스트가 생기면 여기에 나타나요." />
        )}
        <QuestCards items={board.today} />
      </section>

      {myOffers.length > 0 && (
        <section className="stack" aria-label="코인 협상">
          <h2 className="t-title">코인 협상</h2>
          {myOffers.map((proposal) => (
            <MyOfferCard key={proposal.id} proposal={proposal} />
          ))}
        </section>
      )}

      {board.upcoming.length > 0 && (
        <Fold title="다가오는 일" summary={`${board.upcoming.length}개`}>
          <QuestCards items={board.upcoming} />
        </Fold>
      )}

      {adding && <AddTaskSheet onClose={() => setAdding(false)} />}
    </main>
  );
}
