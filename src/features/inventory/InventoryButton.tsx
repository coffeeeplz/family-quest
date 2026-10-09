import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useSession } from '../../app/session';
import { ownedCount } from '../../domain/inventory';
import { Icon } from '../../ui/Sprite';

/** 가방 그림의 인벤토리 버튼. 가지고 있는 보상의 수가 모서리에 붙는다. */
export function InventoryButton({ compact = false }: { compact?: boolean }) {
  const { me } = useSession();
  const { orders } = useFamilyData();
  const count = ownedCount(orders, me.uid);
  return (
    <Link
      className={compact ? 'btn plain with-corner compact inventory-btn' : 'btn plain with-corner inventory-btn'}
      to="/inventory"
      aria-label={count > 0 ? `인벤토리: 보상 ${count}개` : '인벤토리'}
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
