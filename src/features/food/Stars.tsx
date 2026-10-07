import type { Food } from '../../backend/types';
import { ratingSummary } from '../../domain/foods';
import { Icon } from '../../ui/Sprite';

interface StarInputProps {
  /** 지금 준 별의 수. 아직 안 줬으면 0 */
  value: number;
  disabled?: boolean;
  onChange: (stars: number) => void;
}

/** 별 다섯 개 중에서 고른다. */
export function StarInput({ value, disabled, onChange }: StarInputProps) {
  return (
    <div className="stars" role="radiogroup" aria-label="내 별점">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          className="star-button"
          aria-label={`별 ${n}개`}
          aria-checked={value === n}
          disabled={disabled}
          onClick={() => onChange(n)}
        >
          <Icon name={n <= value ? 'star' : 'star_off'} size={36} />
        </button>
      ))}
    </div>
  );
}

/** 가족 평균 별점을 한 줄로: ★ 4.3 (3명). 아무도 안 줬으면 아무것도 그리지 않는다. */
export function RatingInline({ food, withCount }: { food: Food; withCount?: boolean }) {
  const { average, count } = ratingSummary(food);
  if (average === null) return null;
  return (
    <span className="rating" aria-label={`가족 별점 평균 ${average.toFixed(1)}점, ${count}명`}>
      <Icon name="star" size={12} />
      <span aria-hidden="true">
        {average.toFixed(1)}
        {withCount ? ` (${count}명)` : ''}
      </span>
    </span>
  );
}
