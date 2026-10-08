import { useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Reward } from '../../backend/types';
import { buyState, limitLabel, limitUsage, reservedCoins } from '../../domain/shop';
import { openWishCount, splitMyWishes } from '../../domain/wishes';
import { dateKey } from '../../lib/dates';
import type { IconName } from '../../lib/sprites';
import { Icon } from '../../ui/Sprite';
import { Button, CoinInline, CoinPill, Empty, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { MyWishCard } from '../wishes/MyWishCard';
import { WishFormSheet } from '../wishes/WishFormSheet';
import { useWishes } from '../wishes/useWishes';
import { GoalCard } from './GoalCard';

/** 자녀의 상점: 모은 코인으로 보상을 신청하고, 받을 보상을 확인한다. */
export function ShopPage() {
  const backend = useBackend();
  const { me, family } = useSession();
  const { rewards, orders, today, loading } = useFamilyData();
  const { busy, run } = useAction();
  const [picked, setPicked] = useState<Reward | null>(null);
  const [showMine, setShowMine] = useState(false);
  const [wishing, setWishing] = useState(false);
  const { wishes } = useWishes();

  const mine = orders.filter((o) => o.uid === me.uid);
  const requested = mine.filter((o) => o.status === 'requested').sort((a, b) => a.requestedAt - b.requestedAt);
  const toReceive = mine.filter((o) => o.status === 'approved').sort((a, b) => (a.decidedAt ?? 0) - (b.decidedAt ?? 0));
  // 오늘 거절된 신청은 이유와 함께 하루 동안 보여 준다.
  const rejectedToday = mine.filter((o) => o.status === 'rejected' && dateKey(new Date(o.decidedAt ?? 0)) === today);
  const reserved = reservedCoins(orders, me.uid);
  // 내가 상점에 올려 달라고 한 보상: 내가 답할 것은 화면에, 나머지는 "내 신청" 안에 둔다.
  const myWishes = splitMyWishes(wishes, me.uid, (at) => dateKey(new Date(at)) === today);
  const mineCount = requested.length + toReceive.length + rejectedToday.length + myWishes.waiting.length + myWishes.declinedToday.length;
  // 첫 화면에는 한 줄만: 자세한 내용은 눌러서 본다.
  const summary = [
    toReceive.length > 0 ? `받을 보상 ${toReceive.length}개` : '',
    requested.length > 0 ? `승인 대기 ${requested.length}개` : '',
    rejectedToday.length > 0 ? `거절 ${rejectedToday.length}개` : '',
    myWishes.waiting.length > 0 ? `제안 대기 ${myWishes.waiting.length}개` : '',
    myWishes.declinedToday.length > 0 ? `제안 거절 ${myWishes.declinedToday.length}개` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const pickedState = picked ? buyState(picked, me, orders, today) : null;
  const pickedUsage = picked ? limitUsage(picked, orders, me.uid, today) : null;

  function request(reward: Reward) {
    setPicked(null);
    void run(() => backend.requestReward(family.id, reward, me.uid, today), '부모님께 신청했어요. 승인을 기다려요!');
  }

  function setGoal(rewardId: string | null) {
    setPicked(null);
    void run(() => backend.setGoal(family.id, me.uid, rewardId), rewardId ? '목표로 정했어요!' : '목표를 없앴어요.');
  }

  return (
    <main className="screen">
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">상점</h1>
          <p className="t-cap">모은 코인으로 바꿔요</p>
        </div>
        <CoinPill amount={me.coins} />
      </header>

      {mineCount > 0 && (
        <button type="button" className="px today-line" aria-label={`내 신청 보기: ${summary}`} onClick={() => setShowMine(true)}>
          <Icon name="check_inbox" size={24} />
          <span className="t-capb">내 신청</span>
          <span className="t-cap grow">{summary}</span>
          <span className="t-title" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      {myWishes.toAnswer.length > 0 && (
        <section className="stack" aria-label="가격 협상">
          <h2 className="t-title">가격 협상</h2>
          {myWishes.toAnswer.map((wish) => (
            <MyWishCard key={wish.id} wish={wish} />
          ))}
        </section>
      )}

      <GoalCard onChange={() => setGoal(null)} />

      <section className="stack" aria-label="보상 목록">
        <div className="section-head" style={{ alignItems: 'center' }}>
          <h2 className="t-title">보상 목록</h2>
          <Button tone="plain" onClick={() => setWishing(true)}>
            + 보상 제안
          </Button>
        </div>
        {!loading && rewards.length === 0 && (
          <Empty icon={<Icon name="shop" size={48} />} title="아직 보상이 없어요" hint="부모님이 보상을 올리면 여기에 나타나요." />
        )}
        <div className="shop-grid">
          {rewards.map((reward) => {
            const state = buyState(reward, me, orders, today);
            const label = limitLabel(reward.limit);
            return (
              <article key={reward.id} className="card shop-item">
                <Icon name={reward.icon as IconName} size={48} />
                <h3 className="t-body item-title center">{reward.title}</h3>
                <CoinInline amount={reward.price} />
                {label && <p className="t-cap">{label}</p>}
                <Button
                  tone={state.kind === 'ok' ? 'pink' : 'plain'}
                  block
                  aria-label={`${reward.title} ${state.kind === 'ok' ? '바꾸기' : '자세히 보기'}`}
                  onClick={() => setPicked(reward)}
                >
                  {state.kind === 'ok' && '바꾸기'}
                  {state.kind === 'short' && `${state.missing}코인 더!`}
                  {state.kind === 'limit' && (reward.limit.period === 'day' ? '오늘은 끝' : '이번 주는 끝')}
                </Button>
              </article>
            );
          })}
        </div>
      </section>

      {showMine && mineCount > 0 && (
        <Sheet title="내 신청" onClose={() => setShowMine(false)}>
          {reserved > 0 && (
            <p className="t-cap" style={{ lineHeight: '18px' }}>
              신청한 보상에 {reserved}코인이 묶여 있어요. 지금 쓸 수 있는 코인은 {me.coins - reserved}개예요.
            </p>
          )}
          {toReceive.length > 0 && (
            <section className="stack" aria-label="받을 보상">
              <h3 className="t-title" style={{ fontSize: 15 }}>받을 보상</h3>
              {toReceive.map((order) => (
                <article key={order.id} className="card is-done card-row">
                  <Icon name={order.icon as IconName} size={36} />
                  <div className="card-main">
                    <h3 className="t-body item-title">{order.rewardTitle}</h3>
                    <p className="t-cap">승인됐어요. 부모님께 말하면 받을 수 있어요.</p>
                  </div>
                </article>
              ))}
            </section>
          )}

          {(requested.length > 0 || rejectedToday.length > 0) && (
            <section className="stack" aria-label="신청한 보상">
              <h3 className="t-title" style={{ fontSize: 15 }}>신청한 보상</h3>
              {requested.map((order) => (
                <article key={order.id} className="card is-wait card-row">
                  <Icon name={order.icon as IconName} size={36} />
                  <div className="card-main">
                    <h3 className="t-body item-title">{order.rewardTitle}</h3>
                    <div className="meta t-cap">
                      <span>승인을 기다리는 중</span>
                      <CoinInline amount={order.price} />
                    </div>
                  </div>
                  <Button tone="plain" disabled={busy} onClick={() => void run(() => backend.cancelOrder(family.id, order.id), '신청을 취소했어요.')}>
                    취소
                  </Button>
                </article>
              ))}
              {rejectedToday.map((order) => (
                <article key={order.id} className="card is-redo card-row">
                  <Icon name={order.icon as IconName} size={36} />
                  <div className="card-main">
                    <h3 className="t-body item-title">{order.rewardTitle}</h3>
                    <p className="t-capb">
                      이번에는 안 된대요.{order.rejectReason ? ` "${order.rejectReason}"` : ''} 코인은 그대로예요.
                    </p>
                  </div>
                </article>
              ))}
            </section>
          )}
          {(myWishes.waiting.length > 0 || myWishes.declinedToday.length > 0) && (
            <section className="stack" aria-label="내가 제안한 보상">
              <h3 className="t-title" style={{ fontSize: 15 }}>내가 제안한 보상</h3>
              {myWishes.waiting.map((wish) => (
                <article key={wish.id} className="card is-wait card-row">
                  <Icon name={wish.icon as IconName} size={36} />
                  <div className="card-main">
                    <h3 className="t-body item-title">{wish.title}</h3>
                    <div className="meta t-cap">
                      <span>부모님의 답을 기다리는 중</span>
                      <CoinInline amount={wish.lastPrice} />
                    </div>
                  </div>
                  <Button tone="plain" disabled={busy} aria-label={`${wish.title} 제안 그만두기`} onClick={() => void run(() => backend.deleteWish(family.id, wish.id), '제안을 그만뒀어요.')}>
                    그만두기
                  </Button>
                </article>
              ))}
              {myWishes.declinedToday.map((wish) => (
                <article key={wish.id} className="card is-redo card-row">
                  <Icon name={wish.icon as IconName} size={36} />
                  <div className="card-main">
                    <h3 className="t-body item-title">{wish.title}</h3>
                    <p className="t-capb">이번에는 안 된대요.{wish.declineNote ? ` "${wish.declineNote}"` : ''}</p>
                  </div>
                </article>
              ))}
            </section>
          )}
          <Button tone="plain" big block onClick={() => setShowMine(false)}>
            닫기
          </Button>
        </Sheet>
      )}

      {wishing && <WishFormSheet openCount={openWishCount(wishes, me.uid)} onClose={() => setWishing(false)} />}

      {picked && pickedState && pickedUsage && (
        <Sheet title={picked.title} onClose={() => setPicked(null)}>
          <div className="row" style={{ gap: 14 }}>
            <Icon name={picked.icon as IconName} size={48} />
            <div className="grow stack" style={{ gap: 6 }}>
              <CoinInline amount={picked.price} />
              {picked.limit.period !== 'none' && (
                <p className="t-cap">
                  {limitLabel(picked.limit)}까지 · 지금까지 {pickedUsage.used}번
                </p>
              )}
            </div>
          </div>
          {picked.note && <p className="t-body">{picked.note}</p>}
          {pickedState.kind === 'ok' && (
            <>
              <p className="t-body">부모님이 승인하면 {picked.price}코인이 빠지고 보상을 받을 수 있어요.</p>
              <Button big block disabled={busy} onClick={() => request(picked)}>
                {picked.price}코인으로 바꾸기 신청
              </Button>
            </>
          )}
          {pickedState.kind === 'short' && <p className="t-body">코인이 {pickedState.missing}개 더 필요해요. 목표로 정해 두고 모아 볼까요?</p>}
          {pickedState.kind === 'limit' && (
            <p className="t-body">{picked.limit.period === 'day' ? '오늘은' : '이번 주에는'} 정해진 횟수만큼 다 바꿨어요.</p>
          )}
          {me.goalRewardId === picked.id ? (
            <Button tone="plain" big block disabled={busy} onClick={() => setGoal(null)}>
              목표에서 빼기
            </Button>
          ) : (
            <Button tone="mint" big block disabled={busy} onClick={() => setGoal(picked.id)}>
              목표 저금통으로 정하기
            </Button>
          )}
          <Button tone="plain" big block onClick={() => setPicked(null)}>
            닫기
          </Button>
        </Sheet>
      )}
    </main>
  );
}
