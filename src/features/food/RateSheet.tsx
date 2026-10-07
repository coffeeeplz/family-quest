import { useBackend, useSession } from '../../app/session';
import type { Food } from '../../backend/types';
import { Button, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { StarInput } from './Stars';

/** 먹은 뒤에 바로 뜨는 별점 창. 별을 누르면 저장하고 닫힌다. 건너뛸 수 있다. */
export function RateSheet({ food, onClose }: { food: Food; onClose: () => void }) {
  const backend = useBackend();
  const { family, me } = useSession();
  const { busy, run } = useAction();
  const mine = food.ratings[me.uid] ?? 0;

  return (
    <Sheet title="어땠어요?" onClose={onClose}>
      <p className="t-body">
        "{food.name}" 별점을 남겨 주세요.{mine > 0 ? ` 지난번에는 별 ${mine}개를 줬어요.` : ''}
      </p>
      <StarInput
        value={mine}
        disabled={busy}
        onChange={(stars) =>
          void run(() => backend.rateFood(family.id, food.id, me.uid, stars), `별 ${stars}개를 줬어요.`).then((ok) => ok && onClose())
        }
      />
      <Button tone="plain" big block onClick={onClose}>
        {mine > 0 ? '그대로 둘게요' : '건너뛰기'}
      </Button>
    </Sheet>
  );
}
