import { useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Food } from '../../backend/types';
import { canEditFood, categoryOf, eatCount } from '../../domain/foods';
import { addDays, formatDay } from '../../lib/dates';
import { Icon } from '../../ui/Sprite';
import { Button, Field, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { RatingInline, StarInput } from './Stars';

interface Props {
  food: Food;
  onClose: () => void;
  onEdit: () => void;
}

/** 링크가 어디로 가는지 알 수 있게 사이트 이름만 뽑는다. */
function hostOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** 메뉴 하나의 자세한 내용: 누가 먹고 싶어 하는지, 링크, 먹은 날 기록 */
export function FoodDetailSheet({ food, onClose, onEdit }: Props) {
  const backend = useBackend();
  const { family, me, members, isParent } = useSession();
  const { today } = useFamilyData();
  const { busy, run } = useAction();
  const [day, setDay] = useState(addDays(today, -1));

  const category = categoryOf(family.settings.foodCategories, food.category);
  const myStars = food.ratings[me.uid] ?? 0;
  const others = members.filter((m) => m.uid !== me.uid && food.ratings[m.uid] !== undefined);
  const mine = food.wantedBy.includes(me.uid);
  const fans = members.filter((m) => food.wantedBy.includes(m.uid)).map((m) => m.displayName);
  const history = [...food.eaten].reverse();

  return (
    <Sheet title={food.name} onClose={onClose}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="must" style={{ background: 'var(--card)' }}>
          <Icon name={category.icon} size={12} />
          {category.name}
        </span>
        <span className="t-cap">{fans.length > 0 ? `먹고 싶어하는 사람: ${fans.join(', ')}` : '지금은 보관함에 있어요'}</span>
      </div>
      {food.memo && <p className="t-body">{food.memo}</p>}

      {food.link && (
        <a className="btn plain big block" href={food.link} target="_blank" rel="noopener noreferrer">
          링크 열기{hostOf(food.link) ? ` (${hostOf(food.link)})` : ''}
        </a>
      )}

      <div className="segmented">
        <Button
          tone="plain"
          big
          disabled={busy}
          onClick={() =>
            void run(
              () => backend.setFoodWant(family.id, food.id, me.uid, !mine),
              mine ? '먹고 싶어요를 취소했어요.' : '먹고 싶은 목록에 올렸어요.',
            )
          }
        >
          {mine ? '먹고 싶어요 취소' : fans.length > 0 ? '나도 먹고 싶어' : '또 먹고 싶어'}
        </Button>
        <Button
          big
          disabled={busy || food.eaten.includes(today)}
          onClick={() => void run(() => backend.addFoodEaten(family.id, food.id, today), `먹었어요! ${eatCount(food) + 1}번째`)}
        >
          {food.eaten.includes(today) ? '오늘은 기록했어요' : '오늘 먹었어요!'}
        </Button>
      </div>

      <section className="stack" style={{ gap: 10 }} aria-label="별점">
        <div className="section-head">
          <h3 className="t-title" style={{ fontSize: 15 }}>
            별점
          </h3>
          <RatingInline food={food} withCount />
        </div>
        <StarInput
          value={myStars}
          disabled={busy}
          onChange={(stars) => void run(() => backend.rateFood(family.id, food.id, me.uid, stars), `별 ${stars}개를 줬어요.`)}
        />
        <p className="t-cap">
          {myStars > 0 ? '별을 다시 누르면 내 점수를 바꿀 수 있어요.' : '별을 눌러 내 점수를 남겨 주세요.'}
          {others.length > 0 ? ` ${others.map((m) => `${m.displayName} ${food.ratings[m.uid]}점`).join(' · ')}` : ''}
        </p>
      </section>

      <section className="stack" style={{ gap: 10 }} aria-label="먹은 기록">
        <div className="section-head">
          <h3 className="t-title" style={{ fontSize: 15 }}>
            먹은 기록
          </h3>
          <span className="t-cap">{eatCount(food)}번</span>
        </div>
        {history.length === 0 && <p className="t-cap">아직 안 먹어 봤어요.</p>}
        {history.map((eatenDay) => (
          <div key={eatenDay} className="px history-row">
            <span className="t-body">{formatDay(eatenDay)}</span>
            <button
              type="button"
              className="link"
              disabled={busy}
              aria-label={`${formatDay(eatenDay)} 기록 지우기`}
              onClick={() => void run(() => backend.removeFoodEaten(family.id, food.id, eatenDay), '기록을 지웠어요.')}
            >
              지우기
            </button>
          </div>
        ))}
      </section>

      <Field label="다른 날 먹은 것 기록하기">
        {(id) => (
          <div className="row" style={{ gap: 12 }}>
            <input id={id} className="input grow" type="date" value={day} max={today} onChange={(event) => setDay(event.target.value)} />
            <Button
              tone="plain"
              disabled={busy || !day}
              onClick={() => void run(() => backend.addFoodEaten(family.id, food.id, day), '기록했어요.')}
            >
              기록
            </Button>
          </div>
        )}
      </Field>

      {canEditFood(food, me.uid, isParent) && (
        <Button tone="plain" big block onClick={onEdit}>
          이름, 분류, 링크 고치기
        </Button>
      )}
      <Button tone="plain" big block onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}
