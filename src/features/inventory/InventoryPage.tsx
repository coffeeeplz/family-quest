import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Order } from '../../backend/types';
import { inventoryGroups, monthLabel, usedByMonth } from '../../domain/inventory';
import { formatWhen } from '../../lib/dates';
import type { IconName } from '../../lib/sprites';
import { Icon } from '../../ui/Sprite';
import { Button, CoinInline, Empty, Fold, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { useUsedOrders } from './useUsedOrders';

/**
 * 자녀의 인벤토리: 상점에서 바꿔 승인받은 보상을 모아 두고, 쓸 때 꺼낸다.
 * 현실 보상은 부모님께 사용권 화면을 보여 주고 받은 뒤 자녀가 "사용 완료"를 누른다(부모 알림 없음).
 * 앱 안 상품(나중에 생길 이모티콘, 꾸미기)은 바로 쓰고, 썼다는 알림이 부모에게 간다.
 */
export function InventoryPage() {
  const backend = useBackend();
  const navigate = useNavigate();
  const { family, me } = useSession();
  const { orders, today } = useFamilyData();
  const { used } = useUsedOrders(me.uid);
  const { busy, run } = useAction();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const groups = inventoryGroups(orders, me.uid);
  const months = usedByMonth(used, me.uid);
  const usedTotal = used.length;
  const opened = groups.find((group) => group.key === openKey);
  // 같은 보상이 여러 개면 먼저 받은 것부터 쓴다.
  const ticket: Order | undefined = opened?.orders[0];

  function close() {
    setOpenKey(null);
    setConfirm(false);
  }

  async function redeem(order: Order) {
    const ok = await run(() => backend.redeemOrder(family.id, order.id, me.uid), order.useMode === 'instant' ? '썼어요! 부모님께 알렸어요.' : '사용 완료! 지난 기록에 남았어요.');
    if (ok) close();
  }

  return (
    <main className="screen">
      <button type="button" className="link back-link" onClick={() => navigate(-1)}>
        ‹ 돌아가기
      </button>
      <header className="screen-head">
        <Icon name="bag" size={48} />
        <div className="grow">
          <h1 className="t-title">인벤토리</h1>
          <p className="t-cap">상점에서 바꾼 보상을 모아 둬요</p>
        </div>
      </header>

      <section className="stack" aria-label="가지고 있는 보상">
        <h2 className="t-title">가지고 있는 보상</h2>
        {groups.length === 0 ? (
          <>
            <Empty icon={<Icon name="bag" size={48} />} title="아직 가진 보상이 없어요" hint="상점에서 코인으로 바꾸고 승인받으면 여기에 들어와요." />
            <Link className="btn plain big block" to="/shop">
              상점 가기
            </Link>
          </>
        ) : (
          <div className="shop-grid">
            {groups.map((group) => (
              <article key={group.key} className="card shop-item">
                <span className="with-corner inv-icon">
                  <Icon name={group.icon as IconName} size={48} />
                  {group.orders.length > 1 && (
                    <span className="corner-badge" aria-label={`${group.orders.length}개`}>
                      ×{group.orders.length}
                    </span>
                  )}
                </span>
                <h3 className="t-body item-title center">{group.title}</h3>
                <Button tone="mint" block aria-label={`${group.title} 쓰기`} onClick={() => setOpenKey(group.key)}>
                  쓰기
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>

      <Fold title="지난 기록" summary={usedTotal > 0 ? `${usedTotal}개 사용` : '없음'}>
        {months.length === 0 && <p className="t-cap">아직 쓴 보상이 없어요.</p>}
        {months.map((month) => (
          <div key={month.month} className="stack" style={{ gap: 8 }}>
            <h3 className="t-capb">{monthLabel(month.month)}</h3>
            {month.orders.map((order) => (
              <div key={order.id} className="px history-row">
                <Icon name={order.icon as IconName} size={24} />
                <div className="grow stack" style={{ gap: 4 }}>
                  <span className="t-body item-title">{order.rewardTitle}</span>
                  <span className="t-cap">{formatWhen(order.deliveredAt ?? order.decidedAt ?? order.requestedAt, today)} 사용</span>
                </div>
                <CoinInline amount={order.price} />
              </div>
            ))}
          </div>
        ))}
      </Fold>

      {opened && ticket && (
        <Sheet title="사용권" onClose={close}>
          <div className="ticket">
            <Icon name={ticket.icon as IconName} size={96} />
            <p className="t-title center">{ticket.rewardTitle}</p>
            <p className="t-cap center">
              {me.displayName} · {formatWhen(ticket.decidedAt ?? ticket.requestedAt, today)} 받음
              {opened.orders.length > 1 ? ` · ${opened.orders.length}개 중 1개` : ''}
            </p>
          </div>
          {ticket.useMode === 'instant' ? (
            <p className="t-body center">바로 쓸 수 있어요. 쓰면 부모님께 알림이 가요.</p>
          ) : (
            <p className="t-body center">부모님께 이 화면을 보여 주세요. 보상을 받고 나서 사용 완료를 눌러요.</p>
          )}
          {confirm ? (
            <Button tone="pink" big block disabled={busy} onClick={() => void redeem(ticket)}>
              정말 썼나요? 한 번 더 누르면 사용 완료
            </Button>
          ) : (
            <Button tone="mint" big block disabled={busy} onClick={() => setConfirm(true)}>
              {ticket.useMode === 'instant' ? '바로 쓰기' : '사용 완료'}
            </Button>
          )}
          <Button tone="plain" big block onClick={close}>
            닫기
          </Button>
        </Sheet>
      )}
    </main>
  );
}

/** 부모가 자녀 현황에서 보는 자녀의 인벤토리(보기만) */
export function InventorySummary({ uid }: { uid: string }) {
  const { orders } = useFamilyData();
  const groups = inventoryGroups(orders, uid);
  const total = groups.reduce((sum, group) => sum + group.orders.length, 0);
  return (
    <Fold title="인벤토리" summary={total > 0 ? `${total}개` : '없음'}>
      {groups.length === 0 && <p className="t-cap">가지고 있는 보상이 없어요.</p>}
      {groups.map((group) => (
        <div key={group.key} className="px history-row">
          <Icon name={group.icon as IconName} size={24} />
          <span className="t-body item-title grow">{group.title}</span>
          <span className="t-capb">×{group.orders.length}</span>
        </div>
      ))}
      <p className="t-cap">자녀가 보여 주면 보상을 주고, 자녀 휴대폰에서 사용 완료를 누르면 돼요.</p>
    </Fold>
  );
}
