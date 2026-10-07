import { useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { Food } from '../../backend/types';
import { MAX_FOODS, MAX_FOOD_MEMO, MAX_FOOD_NAME, categoryOf, findSameName, isWanted, splitFoods } from '../../domain/foods';
import { Icon } from '../../ui/Sprite';
import { Button, Field, FieldGroup, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';

interface Props {
  /** 지금 올라와 있는 모든 메뉴(같은 이름 확인과 보관함 버튼에 쓴다) */
  foods: Food[];
  /** 고칠 메뉴. null 이면 새로 올린다. */
  food: Food | null;
  /** 처음에 골라 둘 분류의 id. 'all' 이면 첫 분류 */
  initialCategory: string;
  onClose: () => void;
}

/** 보관함에서 바로 올릴 수 있게 보여 줄 메뉴 수 */
const QUICK_COUNT = 8;

/** 메뉴를 새로 올리거나 고치는 창. 보관함에 있는 메뉴는 버튼 한 번으로 다시 올린다. */
export function FoodFormSheet({ foods, food, initialCategory, onClose }: Props) {
  const backend = useBackend();
  const { family, me } = useSession();
  const { busy, run } = useAction();
  const [name, setName] = useState(food?.name ?? '');
  const categories = family.settings.foodCategories;
  const [category, setCategory] = useState(
    food ? categoryOf(categories, food.category).id : initialCategory === 'all' ? categories[0].id : initialCategory,
  );
  const [link, setLink] = useState(food?.link ?? '');
  const [memo, setMemo] = useState(food?.memo ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const quick = food ? [] : splitFoods(foods).saved.slice(0, QUICK_COUNT);
  // 같은 이름이 이미 있으면 새로 만들지 않고 그 메뉴를 다시 올린다.
  const same = findSameName(foods, name, food?.id);
  const sameMine = same ? same.wantedBy.includes(me.uid) : false;
  const full = !food && foods.length >= MAX_FOODS;

  async function reuse(target: Food) {
    const ok = await run(() => backend.setFoodWant(family.id, target.id, me.uid, true), `"${target.name}" 먹고 싶은 목록에 올렸어요.`);
    if (ok) onClose();
  }

  async function save() {
    const input = { name, category, link, memo };
    const ok = food
      ? await run(() => backend.updateFood(family.id, food.id, input), '고쳤어요.')
      : await run(() => backend.createFood(family.id, input, me.uid), '메뉴를 올렸어요.');
    if (ok) onClose();
  }

  async function remove() {
    if (!food) return;
    const ok = await run(() => backend.archiveFood(family.id, food.id), '메뉴를 지웠어요.');
    if (ok) onClose();
  }

  return (
    <Sheet title={food ? '메뉴 고치기' : '메뉴 올리기'} onClose={onClose}>
      {quick.length > 0 && (
        <div className="field">
          <div className="label">보관함에서 바로 올리기</div>
          <div className="chips">
            {quick.map((item) => (
              <button key={item.id} type="button" className="chip" disabled={busy} onClick={() => void reuse(item)}>
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <Field label={food ? '메뉴 이름' : '새 메뉴 이름'}>
        {(id) => (
          <input
            id={id}
            className="input"
            type="text"
            value={name}
            maxLength={MAX_FOOD_NAME}
            placeholder="예: 떡볶이, ○○식당 돈가스"
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>

      {same && !food && (
        <p className="px note t-capb" style={{ lineHeight: '18px' }}>
          {isWanted(same)
            ? sameMine
              ? `"${same.name}" 메뉴는 이미 먹고 싶은 목록에 있어요.`
              : `"${same.name}" 메뉴는 이미 먹고 싶은 목록에 있어요. 나도 먹고 싶다고 표시할 수 있어요.`
            : `"${same.name}" 메뉴는 보관함에 있어요. 새로 만들지 않고 다시 올려요.`}
        </p>
      )}
      {same && food && (
        <p className="error" role="alert">
          같은 이름의 메뉴가 이미 있어요.
        </p>
      )}

      {same && !food ? (
        <Button big block disabled={busy || sameMine} onClick={() => void reuse(same)}>
          {isWanted(same) ? (sameMine ? '이미 올라와 있어요' : '나도 먹고 싶어') : '보관함에서 다시 올리기'}
        </Button>
      ) : (
        <>
          <FieldGroup label="분류">
            <div className="chips">
              {categories.map((c) => (
                <button key={c.id} type="button" role="radio" className="chip" aria-checked={category === c.id} onClick={() => setCategory(c.id)}>
                  <Icon name={categoryOf(categories, c.id).icon} size={24} />
                  {c.name}
                </button>
              ))}
            </div>
          </FieldGroup>

          <Field label="링크 (안 넣어도 돼요)" hint="맛집 지도, 레시피, 배달 페이지 주소를 넣으면 눌러서 바로 갈 수 있어요.">
            {(id) => (
              <input
                id={id}
                className="input"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={link}
                placeholder="https://"
                onChange={(event) => setLink(event.target.value)}
              />
            )}
          </Field>

          <Field label="메모 (안 적어도 돼요)">
            {(id) => (
              <input
                id={id}
                className="input"
                type="text"
                value={memo}
                maxLength={MAX_FOOD_MEMO}
                placeholder="예: 매운맛 말고 순한맛"
                onChange={(event) => setMemo(event.target.value)}
              />
            )}
          </Field>

          {full && (
            <p className="error" role="alert">
              메뉴는 {MAX_FOODS}개까지 올릴 수 있어요. 안 쓰는 메뉴를 지워 주세요.
            </p>
          )}
          <Button big block disabled={busy || full || Boolean(same)} onClick={() => void save()}>
            {food ? '고친 내용 저장하기' : '메뉴 올리기'}
          </Button>
        </>
      )}

      {food &&
        (confirmDelete ? (
          <Button tone="plain" big block disabled={busy} onClick={() => void remove()}>
            정말 지울까요? 먹은 기록도 함께 사라져요
          </Button>
        ) : (
          <button type="button" className="link" onClick={() => setConfirmDelete(true)}>
            이 메뉴 지우기
          </button>
        ))}

      <Button tone="plain" big block onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}
