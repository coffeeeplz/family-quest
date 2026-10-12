// 다른 AI 가 그려 준 꾸미기 아이템 JSON 을 검사해서 src/assets/wardrobe.json 에 더한다.
// 쓰는 법: npx tsx tools/add-wardrobe-item.ts 아이템.json
// 아이템 JSON: { "id": "star-hat", "slot": "hat", "name": "별 모자", "price": 120, "rows": [16줄 × 16글자] }
//   slot: hat(모자) face(얼굴) outfit(옷) hand(소품) bg(배경)
//   글자: . 투명, A a L 캐릭터 색(밝기 셋), K W C P Y O R G B M N D E F 팔레트(src/assets/sprites.json)
//   기준 위치(토끼·곰): 머리 위 끝 y 4~5, 눈 y 7~8(x 4, 11), 볼 y 9(x 3, 12), 몸통 y 11~15(x 3~12), 소품은 오른쪽 x 12~15
// firestore.rules 의 꾸미기 목록(wardrobeDefaultPrices)도 함께 고친다.
import { readFileSync, writeFileSync } from 'node:fs';
import sprites from '../src/assets/sprites.json';
import { WARDROBE_ITEMS, checkWardrobeItem, type WardrobeItem } from '../src/domain/wardrobe';

const file = process.argv[2];
if (!file) {
  console.error('아이템 JSON 파일을 알려 주세요: npx tsx tools/add-wardrobe-item.ts 아이템.json');
  process.exit(1);
}
let text = readFileSync(file, 'utf8');
// ```json ... ``` 으로 감싸 왔으면 벗긴다.
const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
if (fenced) text = fenced[1];
const raw = JSON.parse(text) as Partial<WardrobeItem>;
const problems = checkWardrobeItem(raw);
const taken = [...sprites.avatars.map((a) => a.id), ...WARDROBE_ITEMS.map((i) => i.id)];
if (taken.includes(raw.id ?? '')) problems.push(`이미 있는 id 예요: ${raw.id}`);
if (problems.length > 0) {
  console.error('고칠 곳:\n- ' + problems.join('\n- '));
  process.exit(1);
}
const item: WardrobeItem = { id: raw.id!, slot: raw.slot!, name: raw.name!.trim(), price: raw.price!, rows: raw.rows! };
const items = [...WARDROBE_ITEMS, item];
writeFileSync(new URL('../src/assets/wardrobe.json', import.meta.url), JSON.stringify(items, null, 1) + '\n');

// 서버 규칙의 상품 목록과 처음 가격을 맞춘다(유료 캐릭터 다음에 아이템, tools/avatar_art.py 와 같은 순서).
const paid = [...sprites.avatars.filter((a) => a.price > 0).map((a) => [a.id, a.price] as const), ...items.map((i) => [i.id, i.price] as const)];
const rulesUrl = new URL('../firestore.rules', import.meta.url);
const rules = readFileSync(rulesUrl, 'utf8');
const updated = rules.replace(/(function wardrobeDefaultPrices\(\) \{\s*return )\{[^}]*\}/, `$1{${paid.map(([id, price]) => `'${id}': ${price}`).join(', ')}}`);
if (updated === rules) console.error('firestore.rules 의 wardrobeDefaultPrices 를 찾지 못했어요. 직접 고쳐 주세요.');
writeFileSync(rulesUrl, updated);
console.log(`더했어요: ${item.name} (${item.slot}, ${item.price}코인)`);
