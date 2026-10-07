import { useFamilyData } from '../../app/familyData';
import { useSession } from '../../app/session';
import type { Member } from '../../backend/types';
import type { IconName } from '../../lib/sprites';
import { Icon } from '../../ui/Sprite';
import { CoinInline } from '../../ui/kit';

/**
 * 목표 저금통: 모으고 있는 보상까지 얼마나 남았는지 보여 준다. 목표가 없으면 아무것도 그리지 않는다.
 * member 를 주면 그 사람의 저금통을 보여 준다(부모가 자녀 현황을 볼 때).
 */
export function GoalCard({ onChange, member }: { onChange?: () => void; member?: Member }) {
  const { me } = useSession();
  const { rewards } = useFamilyData();
  const owner = member ?? me;
  const goal = rewards.find((r) => r.id === owner.goalRewardId);
  if (!goal) return null;

  const missing = Math.max(0, goal.price - owner.coins);
  const percent = Math.min(100, Math.round((owner.coins / goal.price) * 100));
  const steps = 10;
  const filled = Math.floor((percent / 100) * steps);

  return (
    <section className="px goal" aria-label="목표 저금통">
      <div className="card-row">
        <Icon name={goal.icon as IconName} size={36} />
        <div className="card-main" style={{ gap: 6 }}>
          <p className="t-cap">목표 저금통</p>
          <h2 className="t-body item-title">{goal.title}</h2>
        </div>
        <CoinInline amount={goal.price} />
      </div>
      <div className="progress small" role="img" aria-label={`목표의 ${percent}%를 모았어요`}>
        {Array.from({ length: steps }, (_, index) => (
          <span key={index} className={index < filled ? 'on' : undefined} />
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="t-capb">{missing > 0 ? `앞으로 ${missing}코인` : member ? '다 모았어요!' : '다 모았어요! 상점에서 바꿀 수 있어요'}</p>
        {onChange && (
          <button type="button" className="link" onClick={onChange}>
            목표 없애기
          </button>
        )}
      </div>
    </section>
  );
}
