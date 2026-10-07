import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Food } from '../../backend/types';
import { categoryOf, eatCount, eatCountLabel, splitFoods } from '../../domain/foods';
import { Avatar, Icon } from '../../ui/Sprite';
import { Button, Empty, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { DrawSheet } from './DrawSheet';
import { FoodDetailSheet } from './FoodDetailSheet';
import { FoodFormSheet } from './FoodFormSheet';
import { RateSheet } from './RateSheet';
import { RatingInline } from './Stars';
import { useFoods } from './useFoods';

type Open =
  | { kind: 'form'; food: Food | null }
  | { kind: 'detail'; foodId: string }
  | { kind: 'rate'; foodId: string }
  | { kind: 'draw' }
  | { kind: 'menu' }
  | null;

/**
 * 뭐먹지의 첫 화면: 지금 먹고 싶은 메뉴만 보여 준다.
 * 분류로 거르기, 보관함, 분류 관리는 "더 보기" 버튼 안에 있고, 메뉴의 자세한 내용은 카드를 누르면 나온다.
 */
export function FoodPage() {
  const backend = useBackend();
  const { family, me, members, isParent } = useSession();
  const { today } = useFamilyData();
  const { foods, loading, failed } = useFoods();
  const { busy, run } = useAction();
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState<Open>(null);

  const categories = family.settings.foodCategories;
  // 거르던 분류가 설정에서 지워졌으면 전체로 돌아간다.
  const filter = category === 'all' || categories.some((c) => c.id === category) ? category : 'all';
  const memberById = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);
  const all = useMemo(() => splitFoods(foods), [foods]);
  const wanted = useMemo(() => splitFoods(foods, filter, categories).wanted, [foods, filter, categories]);
  const target = open?.kind === 'detail' || open?.kind === 'rate' ? foods.find((food) => food.id === open.foodId) : undefined;

  function eat(food: Food) {
    void run(() => backend.addFoodEaten(family.id, food.id, today), `"${food.name}" 먹었어요! ${eatCount(food) + 1}번째`).then(
      (ok) => ok && setOpen({ kind: 'rate', foodId: food.id }),
    );
  }

  function want(food: Food, on: boolean) {
    void run(
      () => backend.setFoodWant(family.id, food.id, me.uid, on),
      on ? `"${food.name}" 나도 먹고 싶다고 표시했어요.` : '먹고 싶어요를 취소했어요.',
    );
  }

  return (
    <main className="screen">
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">뭐먹지</h1>
          <p className="t-cap">먹고 싶은 메뉴 {all.wanted.length}개</p>
        </div>
      </header>

      <div className="food-actions">
        <Button tone="mint" big onClick={() => setOpen({ kind: 'draw' })}>
          <Icon name="dice" size={24} />
          뽑기
        </Button>
        <Button big onClick={() => setOpen({ kind: 'form', food: null })}>
          + 올리기
        </Button>
        <Button tone="plain" big aria-label="더 보기: 분류, 보관함" onClick={() => setOpen({ kind: 'menu' })}>
          <Icon name="more" size={24} />
        </Button>
      </div>

      {filter !== 'all' && (
        <button type="button" className="chip filter-chip" onClick={() => setCategory('all')} aria-label={`${categoryOf(categories, filter).name}만 보는 중. 누르면 전체 보기`}>
          <Icon name={categoryOf(categories, filter).icon} size={24} />
          {categoryOf(categories, filter).name}만 보는 중 ×
        </button>
      )}

      {failed && (
        <p className="px note t-capb" role="alert" style={{ lineHeight: '18px' }}>
          메뉴를 불러오지 못했어요. 앱을 닫았다가 다시 열어 주세요.
          {isParent && backend.mode === 'firebase' ? ' 계속되면 Firebase 규칙을 새로 게시했는지 확인해 주세요.' : ''}
        </p>
      )}

      <section className="stack" aria-label="먹고 싶어요">
        {!loading && !failed && wanted.length === 0 && (
          <Empty
            icon={<Icon name="food" size={48} />}
            title={filter === 'all' ? '먹고 싶은 메뉴가 없어요' : '이 분류에는 먹고 싶은 메뉴가 없어요'}
            hint={all.saved.length > 0 ? '"+ 올리기"를 누르면 보관함의 메뉴를 바로 다시 올릴 수 있어요.' : '"+ 올리기"로 첫 메뉴를 올려 보세요.'}
          />
        )}
        {wanted.map((food) => {
          const mine = food.wantedBy.includes(me.uid);
          const fans = food.wantedBy.map((uid) => memberById.get(uid)).filter((m) => m !== undefined);
          return (
            <article key={food.id} className="card">
              <button type="button" className="card-row food-open" aria-label={`${food.name} 자세히`} onClick={() => setOpen({ kind: 'detail', foodId: food.id })}>
                <Icon name={categoryOf(categories, food.category).icon} size={36} />
                <span className="card-main">
                  <span className="t-body item-title">{food.name}</span>
                  <span className="meta t-cap">
                    <RatingInline food={food} />
                    <span>{eatCountLabel(food)}</span>
                  </span>
                </span>
              </button>
              <div className="food-foot card-foot">
                <span className="who" role="img" aria-label={`먹고 싶어하는 사람: ${fans.map((m) => m.displayName).join(', ')}`}>
                  {fans.map((m) => (
                    <Avatar key={m.uid} avatar={m.avatar} size={24} />
                  ))}
                </span>
                <span className="row">
                  <button type="button" className="chip" aria-pressed={mine} disabled={busy} aria-label={`${food.name} 나도 먹고 싶어`} onClick={() => want(food, !mine)}>
                    <Icon name="heart" size={12} />
                    나도!
                  </button>
                  <Button disabled={busy} aria-label={`${food.name} 먹었어요`} onClick={() => eat(food)}>
                    먹었어요
                  </Button>
                </span>
              </div>
            </article>
          );
        })}
      </section>

      {open?.kind === 'menu' && (
        <Sheet title="뭐먹지 메뉴" onClose={() => setOpen(null)}>
          <div className="field" role="radiogroup" aria-label="분류로 거르기">
            <div className="label">분류로 거르기</div>
            <div className="chips">
              <button
                type="button"
                role="radio"
                className="chip"
                aria-checked={filter === 'all'}
                onClick={() => {
                  setCategory('all');
                  setOpen(null);
                }}
              >
                전체
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  className="chip"
                  aria-checked={filter === c.id}
                  onClick={() => {
                    setCategory(c.id);
                    setOpen(null);
                  }}
                >
                  <Icon name={categoryOf(categories, c.id).icon} size={24} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <Link className="btn plain big block" to="/food/saved">
            메뉴 보관함 ({all.saved.length}개)
          </Link>
          {isParent && (
            <Link className="btn plain big block" to="/food/categories">
              분류 관리
            </Link>
          )}
          <Button tone="plain" big block onClick={() => setOpen(null)}>
            닫기
          </Button>
        </Sheet>
      )}

      {open?.kind === 'form' && <FoodFormSheet foods={foods} food={open.food} initialCategory={filter} onClose={() => setOpen(null)} />}
      {open?.kind === 'detail' && target && (
        <FoodDetailSheet food={target} onClose={() => setOpen(null)} onEdit={() => setOpen({ kind: 'form', food: target })} />
      )}
      {open?.kind === 'rate' && target && <RateSheet food={target} onClose={() => setOpen(null)} />}
      {open?.kind === 'draw' && (
        <DrawSheet
          foods={foods}
          initialCategory={filter}
          onClose={() => setOpen(null)}
          onEaten={(food) => setOpen({ kind: 'rate', foodId: food.id })}
        />
      )}
    </main>
  );
}
