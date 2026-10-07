import { useMemo, useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Food } from '../../backend/types';
import { categoryOf, lastEatenLabel, sortSaved, splitFoods, type SavedSort } from '../../domain/foods';
import { Icon } from '../../ui/Sprite';
import { BackLink, Button, Empty } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { FoodDetailSheet } from './FoodDetailSheet';
import { FoodFormSheet } from './FoodFormSheet';
import { RatingInline } from './Stars';
import { useFoods } from './useFoods';

/** 메뉴 보관함: 한 번 올렸던 메뉴가 모두 남아 있다. 누르면 바로 다시 먹고 싶은 목록에 올라간다. */
export function FoodSavedPage() {
  const backend = useBackend();
  const { family, me } = useSession();
  const { today } = useFamilyData();
  const { foods, loading, failed } = useFoods();
  const { busy, run } = useAction();
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<SavedSort>('recent');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Food | null>(null);

  const categories = family.settings.foodCategories;
  const saved = useMemo(() => sortSaved(splitFoods(foods, category, categories).saved, sort), [foods, category, categories, sort]);
  const detail = detailId ? foods.find((food) => food.id === detailId) : undefined;

  return (
    <main className="screen">
      <BackLink to="/food" label="뭐먹지" />
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">메뉴 보관함</h1>
          <p className="t-cap">"또 먹고 싶어"를 누르면 바로 다시 올라가요</p>
        </div>
      </header>

      <div className="segmented">
        <select className="input select" aria-label="분류" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">분류: 전체</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input select" aria-label="정렬" value={sort} onChange={(event) => setSort(event.target.value as SavedSort)}>
          <option value="recent">최근 먹은 순</option>
          <option value="rating">별점 높은 순</option>
        </select>
      </div>

      <section className="stack" aria-label="메뉴 보관함">
        {!loading && !failed && saved.length === 0 && (
          <Empty icon={<Icon name="food" size={48} />} title="보관된 메뉴가 없어요" hint="먹고 싶은 메뉴를 먹으면 여기로 와요." />
        )}
        {saved.map((food) => (
          <article key={food.id} className="card card-row">
            <button type="button" className="card-row food-open grow" aria-label={`${food.name} 자세히`} onClick={() => setDetailId(food.id)}>
              <Icon name={categoryOf(categories, food.category).icon} size={36} />
              <span className="card-main">
                <span className="t-body item-title">{food.name}</span>
                <span className="meta t-cap">
                  <RatingInline food={food} />
                  <span>{lastEatenLabel(food, today)}</span>
                </span>
              </span>
            </button>
            <Button
              tone="plain"
              disabled={busy}
              aria-label={`${food.name} 또 먹고 싶어`}
              onClick={() => void run(() => backend.setFoodWant(family.id, food.id, me.uid, true), `"${food.name}" 먹고 싶은 목록에 올렸어요.`)}
            >
              또 먹고 싶어
            </Button>
          </article>
        ))}
      </section>

      {detail && !editing && (
        <FoodDetailSheet
          food={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setEditing(detail);
            setDetailId(null);
          }}
        />
      )}
      {editing && <FoodFormSheet foods={foods} food={editing} initialCategory="all" onClose={() => setEditing(null)} />}
    </main>
  );
}
