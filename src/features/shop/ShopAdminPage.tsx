import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { limitLabel } from '../../domain/shop';
import type { IconName } from '../../lib/sprites';
import { Icon } from '../../ui/Sprite';
import { BackLink, CoinInline, Empty } from '../../ui/kit';

/** 부모용: 상점에 올린 보상 목록. 누르면 고칠 수 있다. */
export function ShopAdminPage() {
  const { rewards, loading } = useFamilyData();
  return (
    <main className="screen">
      <BackLink />
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">상점 관리</h1>
          <p className="t-cap">자녀가 코인으로 바꿀 수 있는 보상이에요</p>
        </div>
      </header>

      <Link className="btn big block" to="/shop/new">
        + 새 보상 올리기
      </Link>

      {!loading && rewards.length === 0 && (
        <Empty icon={<Icon name="shop" size={48} />} title="아직 올린 보상이 없어요" hint="예시에서 골라 바로 시작할 수 있어요." />
      )}

      <div className="stack">
        {rewards.map((reward) => (
          <Link key={reward.id} to={`/shop/${reward.id}`} className="card card-row" style={{ color: 'inherit', textDecoration: 'none' }}>
            <Icon name={reward.icon as IconName} size={36} />
            <span className="card-main">
              <span className="t-body item-title">{reward.title}</span>
              <span className="t-cap">{limitLabel(reward.limit) || '제한 없음'}</span>
            </span>
            <CoinInline amount={reward.price} />
          </Link>
        ))}
      </div>
    </main>
  );
}
