import { useEffect, useMemo, useRef, useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Food, FoodCategory } from '../../backend/types';
import { FOOD_CATEGORIES, categoryOf, drawPool, eatCount, eatenLabel, pickRandom, type DrawScope } from '../../domain/foods';
import { Icon } from '../../ui/Sprite';
import { Button, FieldGroup, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';

interface Props {
  foods: Food[];
  initialCategory: FoodCategory | 'all';
  onClose: () => void;
}

/** 이름이 바뀌며 돌아가는 횟수와 간격 */
const SPINS = 12;
const SPIN_MS = 90;

const reducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 랜덤 뽑기: 먹고 싶은 것 중에서(또는 보관함까지) 하나를 골라 준다. */
export function DrawSheet({ foods, initialCategory, onClose }: Props) {
  const backend = useBackend();
  const { family } = useSession();
  const { today } = useFamilyData();
  const { busy, run } = useAction();
  const [scope, setScope] = useState<DrawScope>('wanted');
  const [category, setCategory] = useState<FoodCategory | 'all'>(initialCategory);
  const [pickedId, setPickedId] = useState<string | null>(null);
  /** 돌아가는 동안 스쳐 지나가는 이름 */
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const pool = useMemo(() => drawPool(foods, scope, category), [foods, scope, category]);
  const picked = pool.find((food) => food.id === pickedId) ?? null;
  const spinning = flash !== null;

  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  function draw() {
    const result = pickRandom(pool, pickedId);
    if (!result) return;
    stop();
    if (pool.length === 1 || reducedMotion()) {
      setFlash(null);
      setPickedId(result.id);
      return;
    }
    let left = SPINS;
    setPickedId(null);
    setFlash(pool[0].name);
    timer.current = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        stop();
        setFlash(null);
        setPickedId(result.id);
        return;
      }
      setFlash(pool[left % pool.length].name);
    }, SPIN_MS);
  }

  function change(next: { scope?: DrawScope; category?: FoodCategory | 'all' }) {
    stop();
    setFlash(null);
    setPickedId(null);
    if (next.scope) setScope(next.scope);
    if (next.category) setCategory(next.category);
  }

  return (
    <Sheet title="랜덤 뽑기" onClose={onClose}>
      <FieldGroup label="어디에서 뽑을까요?">
        <div className="chips">
          <button type="button" role="radio" className="chip" aria-checked={scope === 'wanted'} onClick={() => change({ scope: 'wanted' })}>
            먹고 싶은 것 중에서
          </button>
          <button type="button" role="radio" className="chip" aria-checked={scope === 'all'} onClick={() => change({ scope: 'all' })}>
            보관함까지 전부
          </button>
        </div>
      </FieldGroup>

      <FieldGroup label="분류">
        <div className="chips">
          <button type="button" role="radio" className="chip" aria-checked={category === 'all'} onClick={() => change({ category: 'all' })}>
            전체
          </button>
          {FOOD_CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="radio" className="chip" aria-checked={category === c.id} onClick={() => change({ category: c.id })}>
              {c.name}
            </button>
          ))}
        </div>
      </FieldGroup>

      <div className="px draw-box" role="status" aria-live="polite">
        {pool.length === 0 ? (
          <>
            <Icon name="dice" size={48} />
            <p className="t-body">뽑을 메뉴가 없어요</p>
            <p className="t-cap">{scope === 'wanted' ? '"보관함까지 전부"로 바꾸거나 메뉴를 올려 주세요.' : '먼저 메뉴를 올려 주세요.'}</p>
          </>
        ) : spinning ? (
          <>
            <Icon name="dice" size={48} className="dice-roll" />
            <p className="draw-name" aria-hidden="true">
              {flash}
            </p>
          </>
        ) : picked ? (
          <>
            <Icon name={categoryOf(picked.category).icon} size={48} />
            <p className="draw-name">{picked.name}</p>
            <p className="t-cap">{eatenLabel(picked, today)}</p>
            {picked.memo && <p className="t-cap">{picked.memo}</p>}
          </>
        ) : (
          <>
            <Icon name="dice" size={48} />
            <p className="t-body">후보 {pool.length}개</p>
            <p className="t-cap">버튼을 누르면 하나를 골라 줘요.</p>
          </>
        )}
      </div>

      <Button tone="mint" big block disabled={pool.length === 0 || spinning} onClick={draw}>
        <Icon name="dice" size={24} />
        {picked ? '다시 뽑기' : '뽑기!'}
      </Button>

      {picked && (
        <>
          {picked.link && (
            <a className="btn plain big block" href={picked.link} target="_blank" rel="noopener noreferrer">
              링크 열기
            </a>
          )}
          <Button
            big
            block
            disabled={busy || picked.eaten.includes(today)}
            onClick={() =>
              void run(
                () => backend.addFoodEaten(family.id, picked.id, today),
                `"${picked.name}" 먹었어요! ${eatCount(picked) + 1}번째`,
              ).then((ok) => ok && onClose())
            }
          >
            {picked.eaten.includes(today) ? '오늘 이미 먹었어요' : '이걸로 먹었어요!'}
          </Button>
        </>
      )}

      <Button tone="plain" big block onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}
