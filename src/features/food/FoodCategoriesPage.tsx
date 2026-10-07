import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBackend, useSession } from '../../app/session';
import type { FoodCategoryDef } from '../../backend/types';
import { CATEGORY_ICONS, ETC_CATEGORY_ID, MAX_CATEGORY_NAME, MAX_FOOD_CATEGORIES, categoryOf, newCategoryId } from '../../domain/foods';
import { Icon } from '../../ui/Sprite';
import { BackLink, Button, Field, Sheet } from '../../ui/kit';
import { errorText, useToast } from '../../ui/toast';

/** 부모용: 뭐먹지의 분류를 고친다. "기타"는 지울 수 없고, 지운 분류의 메뉴는 기타로 모인다. */
export function FoodCategoriesPage() {
  const backend = useBackend();
  const { family } = useSession();
  const navigate = useNavigate();
  const notify = useToast();
  const [list, setList] = useState<FoodCategoryDef[]>(family.settings.foodCategories.filter((c) => c.id !== ETC_CATEGORY_ID));
  const [newName, setNewName] = useState('');
  const [iconFor, setIconFor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const etc = categoryOf(family.settings.foodCategories, ETC_CATEGORY_ID);
  const full = list.length >= MAX_FOOD_CATEGORIES - 1;
  const change = (id: string, patch: Partial<FoodCategoryDef>) => setList(list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  function add() {
    const name = newName.trim();
    if (!name) return setError('분류 이름을 적어 주세요.');
    if (full) return setError(`분류는 기타를 포함해 ${MAX_FOOD_CATEGORIES}개까지 만들 수 있어요.`);
    setList([...list, { id: newCategoryId(), name, icon: 'food' }]);
    setNewName('');
    setError('');
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      // 입력칸에 적어 두고 추가를 안 누른 분류도 함께 저장한다.
      const pending = newName.trim() && !full ? [{ id: newCategoryId(), name: newName.trim(), icon: 'food' }] : [];
      await backend.updateSettings(family.id, { ...family.settings, foodCategories: [...list, ...pending, etc] });
      notify('분류를 저장했어요.');
      navigate('/food');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <BackLink to="/food" label="뭐먹지" />
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">분류 관리</h1>
          <p className="t-cap">분류를 지우면 그 분류의 메뉴는 기타로 가요</p>
        </div>
      </header>

      <section className="stack" aria-label="분류 목록" style={{ gap: 12 }}>
        {list.map((c) => (
          <div key={c.id} className="row category-row">
            <button type="button" className="avatar-cell" aria-label={`${c.name || '새 분류'} 그림 바꾸기`} onClick={() => setIconFor(c.id)}>
              <Icon name={categoryOf([c], c.id).icon} size={36} />
            </button>
            <input
              className="input grow"
              type="text"
              aria-label="분류 이름"
              value={c.name}
              maxLength={MAX_CATEGORY_NAME}
              onChange={(event) => change(c.id, { name: event.target.value })}
            />
            <Button tone="plain" aria-label={`${c.name || '새 분류'} 분류 지우기`} onClick={() => setList(list.filter((item) => item.id !== c.id))}>
              지우기
            </Button>
          </div>
        ))}
        <div className="row category-row">
          <span className="avatar-cell fixed">
            <Icon name={etc.icon} size={36} />
          </span>
          <span className="t-body grow">{etc.name}</span>
          <span className="t-cap">지울 수 없어요</span>
        </div>
      </section>

      {!full && (
        <Field label="새 분류" hint={`이름은 ${MAX_CATEGORY_NAME}자까지. 그림은 추가한 뒤에 눌러서 바꿔요.`}>
          {(id) => (
            <div className="row" style={{ gap: 12 }}>
              <input
                id={id}
                className="input grow"
                type="text"
                value={newName}
                maxLength={MAX_CATEGORY_NAME}
                placeholder="예: 양식"
                onChange={(event) => setNewName(event.target.value)}
              />
              <Button tone="plain" onClick={add}>
                추가
              </Button>
            </div>
          )}
        </Field>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button big block disabled={busy} onClick={() => void save()}>
        분류 저장하기
      </Button>
      <Button tone="plain" big block onClick={() => navigate('/food')}>
        저장하지 않고 돌아가기
      </Button>

      {iconFor && (
        <Sheet title="그림 고르기" onClose={() => setIconFor(null)}>
          <div className="icon-grid" role="radiogroup" aria-label="그림">
            {CATEGORY_ICONS.map((choice) => (
              <button
                key={choice.icon}
                type="button"
                role="radio"
                className="avatar-cell"
                aria-label={choice.name}
                aria-checked={list.find((c) => c.id === iconFor)?.icon === choice.icon}
                onClick={() => {
                  change(iconFor, { icon: choice.icon });
                  setIconFor(null);
                }}
              >
                <Icon name={choice.icon} size={36} />
              </button>
            ))}
          </div>
          <Button tone="plain" big block onClick={() => setIconFor(null)}>
            닫기
          </Button>
        </Sheet>
      )}
    </main>
  );
}
