import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useSession } from '../../app/session';
import { ownedCount } from '../../domain/inventory';
import { Icon } from '../../ui/Sprite';

/** 가방 그림의 인벤토리 버튼. 가지고 있는 보상의 수가 모서리에 붙는다. */
export function InventoryButton({ compact = false, uid, name }: { compact?: boolean; uid?: string; name?: string }) {
  const { me } = useSession();
  const { orders } = useFamilyData();
  // uid 가 있으면 부모가 그 자녀의 인벤토리를 보러 간다.
  const owner = uid ?? me.uid;
  const count = ownedCount(orders, owner);
  const label = `${name ? `${name}의 ` : ''}인벤토리`;
  return (
    <Link
      className={compact ? 'btn plain with-corner compact inventory-btn' : 'btn plain with-corner inventory-btn'}
      to={uid ? `/inventory/${uid}` : '/inventory'}
      aria-label={count > 0 ? `${label}: 보상 ${count}개` : label}
    >
      <Icon name="bag" size={24} />
      {!compact && '인벤토리'}
      {count > 0 && (
        <span className="corner-badge" aria-hidden="true">
          {count}
        </span>
      )}
    </Link>
  );
}
