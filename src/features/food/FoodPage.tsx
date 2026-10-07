import { useMemo, useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Food, FoodCategory } from '../../backend/types';
import { FOOD_CATEGORIES, categoryOf, eatCount, eatenLabel, splitFoods } from '../../domain/foods';
import { Avatar, Icon } from '../../ui/Sprite';
import { Button, Empty } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { DrawSheet } from './DrawSheet';
import { FoodDetailSheet } from './FoodDetailSheet';
import { FoodFormSheet } from './FoodFormSheet';
import { useFoods } from './useFoods';

/** 보관함은 길어질 수 있어 처음에는 이만큼만 보여 준다. */
const SAVED_PREVIEW = 8;

type Open = { kind: 'form'; food: Food | null } | { kind: 'detail'; foodId: string } | { kind: 'draw' } | null;

/** 뭐먹지: 가족이 먹고 싶은 것을 올리고, 먹은 날을 기록하고, 뽑기로 고른다. */
export function FoodPage() {
  const backend = useBackend();
  const { family, me, members, isParent } = useSession();
  const { today } = useFamilyData();
  const { foods, loading, failed } = useFoods();
  const { busy, run } = useAction();
  const [category, setCategory] = useState<FoodCategory | 'all'>('all');
  const [open, setOpen] = useState<Open>(null);
  const [showAllSaved, setShowAllSaved] = useState(false);

  const memberById = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);
  const all = useMemo(() => splitFoods(foods), [foods]);
  const lists = useMemo(() => splitFoods(foods, category), [foods, category]);
  const saved = showAllSaved ? lists.saved : lists.saved.slice(0, SAVED_PREVIEW);
  const detail = open?.kind === 'detail' ? foods.find((food) => food.id === open.foodId) : undefined;

  function eat(food: Food) {
    void run(() => backend.addFoodEaten(family.id, food.id, today), `"${food.name}" 먹었어요! ${eatCount(food) + 1}번째`);
  }

  function want(food: Food, on: boolean) {
    void run(
      () => backend.setFoodWant(family.id, food.id, me.uid, on),
      on ? `"${food.name}" 먹고 싶은 목록에 올렸어요.` : '먹고 싶어요를 취소했어요.',
    );
  }

  return (
    <main className="screen">
      <header className="screen-head">
        <div className="px avatar-frame" style={{ width: 72, height: 72, background: 'var(--pink-soft)' }}>
          <Icon name="food" size={48} />
        </div>
        <div className="grow">
          <h1 className="t-title">뭐먹지</h1>
          <p className="t-cap">
            먹고 싶은 것 {all.wanted.length}개 · 보관함 {all.saved.length}개
          </p>
        </div>
      </header>

      <div className="segmented">
        <Button tone="mint" big onClick={() => setOpen({ kind: 'draw' })}>
          <Icon name="dice" size={24} />
          랜덤 뽑기
        </Button>
        <Button big onClick={() => setOpen({ kind: 'form', food: null })}>
          + 메뉴 올리기
        </Button>
      </div>

      <div className="chips" role="radiogroup" aria-label="분류">
        <button type="button" role="radio" className="chip" aria-checked={category === 'all'} onClick={() => setCategory('all')}>
          전체
        </button>
        {FOOD_CATEGORIES.map((c) => (
          <button key={c.id} type="button" role="radio" className="chip" aria-checked={category === c.id} onClick={() => setCategory(c.id)}>
            <Icon name={c.icon} size={24} />
            {c.name}
          </button>
        ))}
      </div>

      {failed && (
        <p className="px note t-capb" role="alert" style={{ lineHeight: '18px' }}>
          메뉴를 불러오지 못했어요. 앱을 닫았다가 다시 열어 주세요.
          {isParent && backend.mode === 'firebase' ? ' 계속되면 Firebase 규칙을 새로 게시했는지 확인해 주세요.' : ''}
        </p>
      )}

      <section className="stack" aria-label="먹고 싶어요">
        <div className="section-head">
          <h2 className="t-title">먹고 싶어요</h2>
          <span className="t-cap">{lists.wanted.length}개</span>
        </div>
        {!loading && !failed && lists.wanted.length === 0 && (
          <Empty
            icon={<Icon name="food" size={48} />}
            title="먹고 싶은 메뉴가 없어요"
            hint={lists.saved.length > 0 ? '아래 보관함에서 고르거나 새 메뉴를 올려 보세요.' : '"+ 메뉴 올리기"로 첫 메뉴를 올려 보세요.'}
          />
        )}
        {lists.wanted.map((food) => {
          const mine = food.wantedBy.includes(me.uid);
          const fans = food.wantedBy.map((uid) => memberById.get(uid)).filter((m) => m !== undefined);
          return (
            <article key={food.id} className="card">
              <div className="card-row">
                <Icon name={categoryOf(food.category).icon} size={36} />
                <button type="button" className="card-main food-open" aria-label={`${food.name} 자세히`} onClick={() => setOpen({ kind: 'detail', foodId: food.id })}>
                  <h3 className="t-body item-title">{food.name}</h3>
                  <p className="t-cap">{eatenLabel(food, today)}</p>
                  {food.memo && <p className="t-cap">{food.memo}</p>}
                </button>
                <span className="who" role="img" aria-label={`먹고 싶어하는 사람: ${fans.map((m) => m.displayName).join(', ')}`}>
                  {fans.map((m) => (
                    <Avatar key={m.uid} avatar={m.avatar} size={24} />
                  ))}
                </span>
              </div>
              <div className="food-foot card-foot">
                {food.link ? (
                  <a className="chip" href={food.link} target="_blank" rel="noopener noreferrer" aria-label={`${food.name} 링크 열기`}>
                    링크
                  </a>
                ) : (
                  <span />
                )}
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

      <section className="stack" aria-label="메뉴 보관함">
        <div className="section-head">
          <h2 className="t-title">메뉴 보관함</h2>
          <span className="t-cap">{lists.saved.length}개</span>
        </div>
        <p className="t-cap" style={{ lineHeight: '18px' }}>
          한 번 올린 메뉴는 여기에 남아요. "또 먹고 싶어"를 누르면 바로 다시 올라가요.
        </p>
        {!loading && !failed && lists.saved.length === 0 && <p className="t-cap">아직 보관된 메뉴가 없어요.</p>}
        {saved.map((food) => (
          <article key={food.id} className="card card-row food-saved">
            <Icon name={categoryOf(food.category).icon} size={36} />
            <button type="button" className="card-main food-open" aria-label={`${food.name} 자세히`} onClick={() => setOpen({ kind: 'detail', foodId: food.id })}>
              <h3 className="t-body item-title">{food.name}</h3>
              <p className="t-cap">{eatenLabel(food, today)}</p>
            </button>
            <Button tone="plain" fixed disabled={busy} aria-label={`${food.name} 또 먹고 싶어`} onClick={() => want(food, true)}>
              또 먹고 싶어
            </Button>
          </article>
        ))}
        {lists.saved.length > SAVED_PREVIEW && (
          <Button tone="plain" block onClick={() => setShowAllSaved(!showAllSaved)}>
            {showAllSaved ? '보관함 접기' : `보관함 ${lists.saved.length}개 모두 보기`}
          </Button>
        )}
      </section>

      {open?.kind === 'form' && <FoodFormSheet foods={foods} food={open.food} initialCategory={category} onClose={() => setOpen(null)} />}
      {open?.kind === 'detail' && detail && (
        <FoodDetailSheet food={detail} onClose={() => setOpen(null)} onEdit={() => setOpen({ kind: 'form', food: detail })} />
      )}
      {open?.kind === 'draw' && <DrawSheet foods={foods} initialCategory={category} onClose={() => setOpen(null)} />}
    </main>
  );
}
