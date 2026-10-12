import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBackend } from '../src/backend/demo';
import type { Backend, LedgerEntry, Member, WardrobePrice } from '../src/backend/types';
import { cleanProfile } from '../src/domain/profile';
import {
  WARDROBE_ENTRIES,
  WARDROBE_ITEMS,
  WEAR_SLOTS,
  avatarLayers,
  checkWardrobeItem,
  cleanAvatarChoice,
  entryOffer,
} from '../src/domain/wardrobe';
import { AVATARS, AVATAR_COLORS } from '../src/lib/sprites';

const FAMILY = 'demo-family';
let backend: Backend;

function snapshot<T>(subscribe: (cb: (value: T) => void) => () => void): T {
  let value!: T;
  subscribe((v) => (value = v))();
  return value;
}
const members = () => snapshot<Member[]>((cb) => backend.watchMembers(FAMILY, cb));
const kid = () => members().find((m) => m.uid === 'demo-kid')!;
const dad = () => members().find((m) => m.uid === 'demo-dad')!;
const ledger = () => snapshot<LedgerEntry[]>((cb) => backend.watchLedger(FAMILY, cb));
const prices = () => snapshot<WardrobePrice[]>((cb) => backend.watchWardrobePrices(FAMILY, cb));
const as = (uid: string) => backend.demo!.loginAs(uid);
const kidSum = () => ledger().filter((e) => e.uid === 'demo-kid').reduce((sum, e) => sum + e.amount, 0);

beforeEach(() => {
  backend = createDemoBackend(null);
});

describe('꾸미기 그림', () => {
  it('모든 캐릭터는 32×32 이고, 기본 색이 있고, 처음부터 쓰는 캐릭터는 12종', () => {
    for (const a of AVATARS) {
      expect(a.rows, a.id).toHaveLength(32);
      for (const row of a.rows) expect(row, a.id).toHaveLength(32);
      expect(AVATAR_COLORS.some((c) => c.id === a.color), a.id).toBe(true);
    }
    expect(AVATARS.filter((a) => a.price === 0)).toHaveLength(12);
  });

  it('모든 아이템이 형식에 맞고, 칸마다 하나 이상 있다', () => {
    for (const item of WARDROBE_ITEMS) expect(checkWardrobeItem(item), item.id).toEqual([]);
    for (const slot of WEAR_SLOTS) expect(WARDROBE_ITEMS.some((i) => i.slot === slot), slot).toBe(true);
  });

  it('상품 id 는 캐릭터와 아이템을 통틀어 겹치지 않는다', () => {
    const ids = [...AVATARS.map((a) => a.id), ...WARDROBE_ITEMS.map((i) => i.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('서버 규칙의 상품 목록과 가격이 그림 데이터와 같다', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    const prices = rules.match(/function wardrobeDefaultPrices\(\) \{\s*return \{([^}]*)\}/)?.[1] ?? '';
    const ruleEntries = [...prices.matchAll(/'([^']+)': (\d+)/g)].map((m) => [m[1], Number(m[2])]);
    expect(ruleEntries).toEqual(WARDROBE_ENTRIES.map((e) => [e.id, e.price]));
    const free = rules.match(/function freeAvatarIds\(\) \{\s*return \[([^\]]*)\]/)?.[1] ?? '';
    expect([...free.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual(AVATARS.filter((a) => a.price === 0).map((a) => a.id));
  });

  it('검사는 틀린 곳을 알려 준다', () => {
    const bad = checkWardrobeItem({ id: 'Hat', slot: 'shoes', name: '', price: 0, rows: ['.'.repeat(32), 'X'] });
    const text = bad.join('\n');
    expect(text).toMatch(/아이템 id/);
    expect(text).toMatch(/칸/);
    expect(text).toMatch(/이름/);
    expect(text).toMatch(/가격/);
    expect(text).toMatch(/줄이 32개/);
  });

  it('층은 배경, 캐릭터, 옷, 얼굴, 모자, 소품 순이고 모자는 캐릭터마다 위치를 옮긴다', () => {
    const layers = avatarLayers({ id: 'astronaut', color: 'peach', wear: { hand: 'wand', hat: 'crown', bg: 'sky', face: 'blush', outfit: 'cape' } });
    expect(layers.map((l) => l.key)).toEqual(['bg', 'avatar', 'outfit', 'face', 'hat', 'hand']);
    expect(layers.find((l) => l.key === 'hat')!.dy).toBe(AVATARS.find((a) => a.id === 'astronaut')!.hatY);
    // 옛 데이터(입은 것 없음)는 캐릭터만
    expect(avatarLayers({ id: 'rabbit', color: 'pink' }).map((l) => l.key)).toEqual(['avatar']);
    // 칸이 틀린 아이템은 그리지 않는다
    expect(avatarLayers({ id: 'rabbit', color: 'pink', wear: { hat: 'sky' } }).map((l) => l.key)).toEqual(['avatar']);
  });
});

describe('꾸미기 검사', () => {
  it('가진 것만 입고, 처음부터 쓰는 캐릭터는 누구나 고른다', () => {
    expect(cleanAvatarChoice({ id: 'cat', color: 'peach' }, [])).toEqual({ id: 'cat', color: 'peach' });
    expect(() => cleanAvatarChoice({ id: 'whale', color: 'sky' }, [])).toThrow('아직 갖지 않은 캐릭터');
    expect(() => cleanAvatarChoice({ id: 'cat', color: 'peach', wear: { hat: 'crown' } }, [])).toThrow('아직 갖지 않은 아이템');
    expect(() => cleanAvatarChoice({ id: 'cat', color: 'peach', wear: { hat: 'sky' } }, ['sky'])).toThrow('없는 꾸미기');
    expect(cleanAvatarChoice({ id: 'whale', color: 'sky', wear: { hat: 'crown', face: '' } }, ['whale', 'crown'])).toEqual({
      id: 'whale',
      color: 'sky',
      wear: { hat: 'crown' },
    });
    expect(cleanAvatarChoice({ id: 'panda', color: 'sky', wear: { bg: 'night' } }, 'all').wear).toEqual({ bg: 'night' });
  });

  it('프로필 검사도 같은 규칙을 따른다', () => {
    expect(() => cleanProfile({ displayName: '딸', avatar: { id: 'whale', color: 'sky' } })).toThrow('아직 갖지 않은');
    expect(cleanProfile({ displayName: '엄마', avatar: { id: 'whale', color: 'sky' } }, 'all').avatar.id).toBe('whale');
  });

  it('부모가 정한 가격과 숨김을 따른다', () => {
    const crown = WARDROBE_ENTRIES.find((e) => e.id === 'crown')!;
    expect(entryOffer(crown, [])).toEqual({ price: 200, hidden: false });
    expect(entryOffer(crown, [{ itemId: 'crown', price: 20, hidden: true }])).toEqual({ price: 20, hidden: true });
  });
});

describe('꾸미기 상점(체험 모드)', () => {
  it('코인이 모자라면 못 사고, 사면 잔액과 장부가 함께 바뀐다', async () => {
    as('demo-kid');
    await expect(backend.buyWardrobeItem(FAMILY, 'demo-kid', 'blush')).rejects.toThrow('코인이 20개 모자라요'); // 30코인뿐
    as('demo-dad');
    await backend.giveCoins(FAMILY, 'demo-kid', 400, '', 'demo-dad'); // 430코인
    as('demo-kid');
    await expect(backend.updateMyProfile(FAMILY, 'demo-kid', { displayName: '딸', avatar: { id: 'whale', color: 'sky' } })).rejects.toThrow('아직 갖지 않은');
    await backend.buyWardrobeItem(FAMILY, 'demo-kid', 'whale');
    await backend.buyWardrobeItem(FAMILY, 'demo-kid', 'blush');
    expect(kid()).toMatchObject({ coins: 430 - 300 - 50, wardrobe: ['whale', 'blush'] });
    expect(kid().coins).toBe(kidSum());
    expect(ledger().find((e) => e.id === 'wardrobe-demo-kid-whale')).toMatchObject({ type: 'wardrobe', amount: -300, by: 'demo-kid' });
    await expect(backend.buyWardrobeItem(FAMILY, 'demo-kid', 'whale')).rejects.toThrow('이미 가지고 있어요');
    await expect(backend.buyWardrobeItem(FAMILY, 'demo-kid', 'nothing')).rejects.toThrow('찾을 수 없어요');

    await backend.updateMyProfile(FAMILY, 'demo-kid', { displayName: '딸', avatar: { id: 'whale', color: 'sky', wear: { face: 'blush' } } });
    expect(kid().avatar).toEqual({ id: 'whale', color: 'sky', wear: { face: 'blush' } });
    await expect(
      backend.updateMyProfile(FAMILY, 'demo-kid', { displayName: '딸', avatar: { id: 'whale', color: 'sky', wear: { hat: 'crown' } } }),
    ).rejects.toThrow('아직 갖지 않은 아이템');
  });

  it('부모는 무료로 무엇이든 입고, 가격을 바꾸거나 숨긴다', async () => {
    as('demo-dad');
    await expect(backend.buyWardrobeItem(FAMILY, 'demo-dad', 'crown')).rejects.toThrow('부모는');
    await backend.updateMyProfile(FAMILY, 'demo-dad', { displayName: dad().displayName, avatar: { id: 'astronaut', color: 'peach', wear: { hat: 'crown', bg: 'night' } } });
    expect(dad().avatar.wear).toEqual({ hat: 'crown', bg: 'night' });
    await backend.setWardrobePrice(FAMILY, 'crown', 10, false);
    await backend.setWardrobePrice(FAMILY, 'cape', 150, true);
    await expect(backend.setWardrobePrice(FAMILY, 'crown', 0, false)).rejects.toThrow('가격은');
    await expect(backend.setWardrobePrice(FAMILY, 'nothing', 10, false)).rejects.toThrow('찾을 수 없어요');
    expect(prices()).toHaveLength(2);
    as('demo-kid');
    await expect(backend.setWardrobePrice(FAMILY, 'crown', 1, false)).rejects.toThrow();
    await expect(backend.buyWardrobeItem(FAMILY, 'demo-kid', 'cape')).rejects.toThrow('살 수 없는');
    await backend.buyWardrobeItem(FAMILY, 'demo-kid', 'crown');
    expect(kid()).toMatchObject({ coins: 20, wardrobe: ['crown'] });
  });
});
