// 다른 AI 가 그려 준 스티커 팩 JSON 을 검사해서 src/assets/stickers.json 에 더한다.
// 쓰는 법: npx tsx tools/add-sticker-pack.ts 팩.json
// 처음 가격은 100코인(서버 규칙의 stickerPrice 와 같아야 한다). 다른 가격은 앱의 상점 관리에서 바꾼다.
import { readFileSync, writeFileSync } from 'node:fs';
import { checkPack, STICKER_PACKS, type StickerPack } from '../src/domain/stickers';

const file = process.argv[2];
if (!file) {
  console.error('팩 JSON 파일을 알려 주세요: npx tsx tools/add-sticker-pack.ts 팩.json');
  process.exit(1);
}
let text = readFileSync(file, 'utf8');
// ```json ... ``` 으로 감싸 왔으면 벗긴다.
const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
if (fenced) text = fenced[1];
const raw = JSON.parse(text) as Partial<StickerPack>;
const problems = checkPack(raw);
if (STICKER_PACKS.some((p) => p.id === raw.id)) problems.push(`이미 있는 팩 id 예요: ${raw.id}`);
if (problems.length > 0) {
  console.error('고칠 곳:\n- ' + problems.join('\n- '));
  process.exit(1);
}
const pack: StickerPack = {
  id: raw.id!,
  name: raw.name!.trim(),
  price: 100,
  stickers: raw.stickers!.map((s) => ({ id: s.id, label: s.label.trim(), rows: s.rows })),
};
const all = [...STICKER_PACKS, pack];
const json = (p: StickerPack) =>
  `  {\n    "id": ${JSON.stringify(p.id)},\n    "name": ${JSON.stringify(p.name)},\n    "price": ${p.price},\n    "stickers": [\n` +
  p.stickers
    .map((s) => `      {\n        "id": ${JSON.stringify(s.id)},\n        "label": ${JSON.stringify(s.label)},\n        "rows": [\n${s.rows.map((r) => `          ${JSON.stringify(r)}`).join(',\n')}\n        ]\n      }`)
    .join(',\n') +
  `\n    ]\n  }`;
writeFileSync(new URL('../src/assets/stickers.json', import.meta.url), `[\n${all.map(json).join(',\n')}\n]\n`);
console.log(`더했어요: ${pack.name} (${pack.stickers.length}개, ${pack.price}코인)`);
