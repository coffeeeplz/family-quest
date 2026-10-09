import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STICKER_PACKS, checkPack, cleanSaid, findSticker, packOffer, saidPlain, splitSticker, stickerRef, withSticker } from '../src/domain/stickers';

describe('스티커', () => {
  it('모든 팩이 형식에 맞다', () => {
    for (const pack of STICKER_PACKS) expect(checkPack(pack), pack.id).toEqual([]);
    expect(new Set(STICKER_PACKS.map((p) => p.id)).size).toBe(STICKER_PACKS.length);
  });

  it('처음 가격은 서버 규칙과 같다(기본 팩 50, 나머지 100)', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    expect(rules).toContain("(packId == 'basic' ? 50 : 100)");
    for (const pack of STICKER_PACKS) expect(pack.price, pack.id).toBe(pack.id === 'basic' ? 50 : 100);
  });

  it('검사는 틀린 곳을 알려 준다', () => {
    const rows = Array(16).fill('.'.repeat(16));
    expect(checkPack({ id: 'sea', name: '바다 팩', stickers: [{ id: 'whale', label: '고래', rows }] })).toEqual([]);
    const bad = checkPack({ id: 'Sea', name: '', stickers: [{ id: 'whale', label: '고래', rows: [...rows.slice(0, 15), 'X'.repeat(16)] }, { id: 'whale', label: '', rows: rows.slice(1) }] });
    expect(bad.join('\n')).toMatch(/팩 id/);
    expect(bad.join('\n')).toMatch(/팩 이름/);
    expect(bad.join('\n')).toMatch(/쓸 수 없는 글자/);
    expect(bad.join('\n')).toMatch(/겹쳐요/);
    expect(bad.join('\n')).toMatch(/줄이 16개/);
  });

  it('스티커 찾기와 가격', () => {
    expect(findSticker(stickerRef('animal', 'cat'))?.sticker.label).toBe('고양이');
    expect(findSticker('animal/none')).toBeNull();
    const basic = STICKER_PACKS.find((p) => p.id === 'basic')!;
    expect(packOffer(basic, [])).toEqual({ price: 50, hidden: false });
    expect(packOffer(basic, [{ packId: 'basic', price: 30, hidden: true }])).toEqual({ price: 30, hidden: true });
  });

  it('한마디 끝에 붙이는 스티커', () => {
    expect(withSticker(' 잘했어 ', 'animal/cat')).toBe('잘했어 {s:animal/cat}');
    expect(withSticker('', 'animal/cat')).toBe('{s:animal/cat}');
    expect(withSticker('잘했어', '')).toBe('잘했어');
    expect(splitSticker('잘했어 {s:animal/cat}')).toEqual({ text: '잘했어', sticker: 'animal/cat' });
    expect(splitSticker('그냥 글 {중괄호}')).toEqual({ text: '그냥 글 {중괄호}', sticker: '' });
    expect(splitSticker('모르는 {s:zzz/none}')).toEqual({ text: '모르는', sticker: '' });
    expect(cleanSaid('가'.repeat(30) + ' {s:basic/heart}', 20)).toBe('가'.repeat(20) + ' {s:basic/heart}');
    expect(cleanSaid('좋아 {s:zzz/none}', 20)).toBe('좋아');
    expect(saidPlain('최고야 {s:cheer/best}')).toBe('최고야 [최고]');
  });
});
