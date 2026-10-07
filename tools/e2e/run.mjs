// 체험 모드로 앱의 주요 흐름을 실제 브라우저에서 눌러 보는 검사.
// 준비: npm run build:e2e 로 체험 모드 빌드를 만들고, playwright 를 따로 설치한다(npm i --no-save playwright).
// 실행: node tools/e2e/run.mjs [스크린샷을 저장할 폴더]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = process.env.APP_DIR ?? fileURLToPath(new URL('../..', import.meta.url));
const OUT = process.argv[2] ?? 'e2e-shots';
mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:4173/';

const server = spawn(APP + '/node_modules/.bin/vite', ['preview', '--outDir', 'dist-e2e', '--port', '4173', '--strictPort'], { cwd: APP, stdio: 'pipe', detached: true });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes('4173') && resolve());
  server.on('exit', (c) => reject(new Error('preview exited ' + c)));
  setTimeout(() => reject(new Error('preview timeout')), 20000);
});

const problems = [];
const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? '  -> ' + detail : ''}`);
  if (!ok) problems.push(name);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block' });
const watch = (page, tag) => {
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${tag}] console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${e.message}`));
};
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const loginAs = (page, label) => page.getByRole('button', { name: new RegExp('^' + label) }).click();
const switchUser = async (page, label) => {
  await page.getByRole('link', { name: '가족' }).click();
  await page.getByRole('button', { name: '다른 사람으로 들어가 보기' }).click();
  await loginAs(page, label);
};
// 같은 브라우저의 새 탭은 마지막에 들어온 사람으로 열리므로, 필요하면 사람을 바꾼다.
const enter = async (page, label) => {
  await page.goto(URL);
  await page.locator('.tabbar, .list-button').first().waitFor();
  if (await page.locator('.tabbar').count()) await switchUser(page, label);
  else await loginAs(page, label);
};
const coins = async (page) => Number(await page.locator('.coin-pill span').innerText());
const expectCoins = async (page, n, name) => {
  await page.locator('.celebrate').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForFunction((want) => document.querySelector('.coin-pill span')?.textContent === String(want), n, { timeout: 5000 }).catch(() => {});
  check(name, (await coins(page)) === n, String(await coins(page)));
};
const region = (page, name) => page.getByRole('region', { name });
const toast = (page, text) => page.locator('.toast', { hasText: text }).waitFor({ timeout: 5000 });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

try {
  // ── 1. 자녀 홈: 놓친 일 / 오늘 할 일 / 다가오는 일 ─────────────────────────
  const kid = await context.newPage();
  watch(kid, 'kid');
  await kid.goto(URL);
  await kid.getByText('가족 퀘스트').first().waitFor();
  await loginAs(kid, '딸');
  await kid.getByRole('heading', { name: '오늘 할 일' }).waitFor();
  check('자녀 시작 코인 30', (await coins(kid)) === 30, String(await coins(kid)));
  check('연속 달성 표시', await kid.getByText('2일 연속 달성 중').isVisible());
  const missed = region(kid, '놓친 일');
  check('놓친 일 1개(그저께 책 읽기, 절반)', (await missed.locator('article').count()) === 1 && (await missed.getByText('그저께 못 한 일 · 늦어서 절반').isVisible()));
  check('놓친 일 코인은 절반(+5)', await missed.locator('.coin-inline', { hasText: '+5' }).isVisible());
  check('꼭 표시가 맨 위', (await region(kid, '오늘 할 일').locator('article').first().innerText()).includes('피아노 연습'));
  check('다가오는 일에 내 메모', await region(kid, '다가오는 일').getByText('준비물 챙기기').isVisible());
  check('목표 저금통: 게임 30분까지 20코인', await region(kid, '목표 저금통').getByText('앞으로 20코인').isVisible());
  check('협상 카드: 답을 기다리는 중', await region(kid, '코인 협상').getByText('부모님의 답을 기다리는 중이에요').isVisible());
  await shot(kid, '01-kid-home', true);

  // 완료 알림: 오늘 것과 놓친 것
  await region(kid, '오늘 할 일').locator('article', { hasText: '수학 문제집 2쪽' }).getByRole('button', { name: '다 했어요!' }).click();
  await toast(kid, '완료를 알렸어요');
  await missed.getByRole('button', { name: '늦게 했어요!' }).click();
  await missed.getByRole('button', { name: '확인 중...' }).waitFor();
  check('완료 알림만으로는 코인 변화 없음', (await coins(kid)) === 30);

  // ── 2. 내 할 일 추가: 버튼으로 바로, 메모, 코인 제안 ─────────────────────
  await kid.getByRole('button', { name: '+ 내 할 일 추가' }).click();
  await kid.getByRole('dialog').waitFor();
  check('부모 전용 버튼은 자녀에게 안 보임', (await kid.getByRole('dialog').getByText('심부름').count()) === 0);
  await shot(kid, '02-kid-add-sheet');
  await kid.getByRole('dialog').getByRole('button', { name: /설거지 돕기/ }).click();
  await region(kid, '오늘 할 일').locator('article', { hasText: '설거지 돕기' }).waitFor();
  check('버튼으로 추가한 퀘스트가 오늘 할 일에', true);
  await kid.getByRole('button', { name: '+ 내 할 일 추가' }).click();
  await kid.getByRole('dialog').getByRole('button', { name: /설거지 돕기/ }).click();
  await toast(kid, '오늘은 이미 추가했어요');
  check('같은 버튼은 하루 한 번', true);
  await kid.getByRole('dialog').getByRole('button', { name: '추가하기' }).click();
  await toast(kid, '할 일을 적어 주세요');
  check('빈 할 일은 막음', true);
  await kid.getByLabel('직접 적기').fill('체육복 챙기기');
  await kid.getByRole('dialog').getByRole('button', { name: '추가하기' }).click();
  const gym = region(kid, '오늘 할 일').locator('article', { hasText: '체육복 챙기기' });
  await gym.getByRole('button', { name: '끝냈어요' }).click();
  await gym.getByRole('button', { name: /끝냄/ }).waitFor();
  check('메모는 스스로 끝냄 표시', true);

  await kid.getByRole('button', { name: '+ 내 할 일 추가' }).click();
  await kid.getByLabel('직접 적기').fill('창문 닦기');
  await kid.getByRole('radio', { name: '코인 제안하기' }).click();
  await kid.getByLabel('받고 싶은 코인').fill('80');
  await kid.getByRole('dialog').getByRole('button', { name: '코인 제안하기' }).click();
  await toast(kid, '50까지 제안할 수 있어요');
  check('상한을 넘는 제안은 막음', true);
  await kid.getByRole('dialog').getByRole('button', { name: '30', exact: true }).click();
  await shot(kid, '03-kid-offer-form', false);
  await kid.getByRole('dialog').getByRole('button', { name: '코인 제안하기' }).click();
  await region(kid, '코인 협상').locator('article', { hasText: '창문 닦기' }).waitFor();
  check('협상 카드 2개', (await region(kid, '코인 협상').locator('article').count()) === 2);

  // ── 3. 부모: 제안에 답하기 ───────────────────────────────────────────────
  const dad = await context.newPage();
  watch(dad, 'dad');
  await enter(dad, '아빠');
  await dad.getByRole('heading', { name: '승인 대기' }).waitFor();
  check('탭 배지 = 승인 3 + 제안 2', (await dad.locator('.tab-count').innerText()) === '5', await dad.locator('.tab-count').innerText());
  check('자녀 요약에 놓친 일 표시 없음(모두 제출됨)', (await dad.locator('.member-strip').getByText(/놓친 일/).count()) === 0);
  await shot(dad, '04-parent-home', true);

  const offers = region(dad, '코인 제안');
  const shoesOffer = offers.locator('article', { hasText: '신발장 정리하기' });
  await shoesOffer.getByRole('button', { name: '다른 금액 제안' }).click();
  await dad.getByRole('dialog').getByLabel('코인').fill('10');
  await dad.getByRole('dialog').getByLabel('한마디 (안 적어도 돼요)').fill('10이면 어때?');
  await shot(dad, '05-parent-counter');
  await dad.getByRole('dialog').getByRole('button', { name: '이 금액으로 제안하기' }).click();
  await offers.locator('article', { hasText: '신발장 정리하기' }).getByText('딸의 답을 기다리는 중').waitFor();

  const kidShoes = region(kid, '코인 협상').locator('article', { hasText: '신발장 정리하기' });
  await kidShoes.getByText('부모님이 10코인을 제안했어요. "10이면 어때?"').waitFor();
  await shot(kid, '06-kid-counter-offer', false);
  await kidShoes.getByRole('button', { name: '다시 제안하기' }).click();
  await kid.getByRole('dialog').getByLabel('코인').fill('15');
  await kid.getByRole('dialog').getByRole('button', { name: '이 금액으로 제안하기' }).click();

  const shoes3 = offers.locator('article', { hasText: '신발장 정리하기' });
  await shoes3.getByText('제안 3/3번째').waitFor();
  check('횟수를 다 쓰면 다른 금액 버튼이 없음', (await shoes3.getByRole('button', { name: '다른 금액 제안' }).count()) === 0);
  await shoes3.getByRole('button', { name: '15코인으로 수락' }).click();
  const shoesQuest = region(kid, '오늘 할 일').locator('article', { hasText: '신발장 정리하기' });
  await shoesQuest.waitFor();
  check('합의하면 15코인 퀘스트가 됨', await shoesQuest.locator('.coin-inline', { hasText: '+15' }).isVisible());

  await offers.locator('article', { hasText: '창문 닦기' }).getByRole('button', { name: '거절' }).click();
  const windowMemo = region(kid, '오늘 할 일').locator('article', { hasText: '창문 닦기' });
  await windowMemo.getByText('코인 제안은 거절됐어요').waitFor();
  check('거절하면 코인 없는 메모로 남음', true);
  await expectCoins(kid, 30, '협상만으로는 코인 변화 없음');

  // ── 4. 승인: 한마디 버튼, 연속 달성 보너스, 늦은 퀘스트 절반 ────────────────
  const waiting = region(dad, '승인 대기');
  await waiting.locator('article', { hasText: '수학 문제집 2쪽' }).getByRole('button', { name: '승인하고 코인 주기' }).click();
  await dad.getByRole('dialog').waitFor();
  check('승인 창에 한마디 버튼 4개', (await dad.getByRole('dialog').locator('.btn.mint').count()) === 4);
  await shot(dad, '07-parent-praise');
  await dad.getByRole('dialog').getByRole('button', { name: '최고야!' }).click();
  await kid.locator('.celebrate').waitFor({ timeout: 5000 });
  check('코인 연출에 한마디가 보임', await kid.locator('.celebrate').getByText('"최고야!"').isVisible());
  await shot(kid, '08-kid-celebrate');
  await expectCoins(kid, 40, '승인 뒤 코인 40');
  check('완료 카드에 한마디', await region(kid, '오늘 할 일').locator('article', { hasText: '수학 문제집 2쪽' }).getByText('"최고야!"').isVisible());

  await waiting.locator('article', { hasText: '책 30분 읽기' }).filter({ hasNotText: '늦어서 절반' }).getByRole('button', { name: '승인하고 코인 주기' }).click();
  const bonusNote = dad.getByRole('dialog').getByText('이번 승인으로 3일 연속 달성! 보너스 10코인도 함께 줘요.');
  const isSaturday = new Date().getDay() === 6; // 토요일에는 주 1회 퀘스트가 남아 그날 완료가 아니다
  check('승인 창에 연속 달성 보너스 안내', isSaturday || (await bonusNote.isVisible()));
  await shot(dad, '09-parent-bonus');
  await dad.getByRole('dialog').getByRole('button', { name: '한마디 없이 승인' }).click();
  const afterBonus = isSaturday ? 50 : 60;
  await expectCoins(kid, afterBonus, `퀘스트 10 + 보너스 = ${afterBonus}`);
  if (!isSaturday) check('연속 달성 3일로 표시', await kid.getByText('3일 연속 달성 중').isVisible());

  const lateCard = waiting.locator('article', { hasText: '늦어서 절반' });
  check('늦은 요청은 절반으로 표시', await lateCard.locator('.coin-inline', { hasText: '+5' }).isVisible());
  await lateCard.getByRole('button', { name: '승인하고 코인 주기' }).click();
  await dad.getByRole('dialog').getByRole('button', { name: '한마디 없이 승인' }).click();
  await expectCoins(kid, afterBonus + 5, '늦은 퀘스트는 +5');
  check('놓친 일 구역이 사라짐', (await region(kid, '놓친 일').count()) === 0);

  // ── 5. 칭찬 코인 ─────────────────────────────────────────────────────────
  await dad.getByRole('button', { name: '칭찬 코인 주기' }).click();
  await dad.getByRole('dialog').getByRole('button', { name: '고마워!' }).click();
  await shot(dad, '10-parent-gift');
  await dad.getByRole('dialog').getByRole('button', { name: '딸에게 코인 주기' }).click();
  await kid.locator('.celebrate').getByText('칭찬 코인 +5').waitFor({ timeout: 5000 });
  await expectCoins(kid, afterBonus + 10, '칭찬 코인 +5');

  // ── 6. 새 퀘스트: 자주 쓰는 버튼, 꼭 표시 ─────────────────────────────────
  await dad.getByRole('link', { name: '+ 새 퀘스트 만들기' }).click();
  await dad.getByRole('heading', { name: '새 퀘스트' }).waitFor();
  await shot(dad, '11-quest-form', true);
  await dad.getByRole('button', { name: /심부름/ }).click();
  await dad.getByRole('heading', { name: '퀘스트 관리' }).waitFor();
  await region(kid, '오늘 할 일').locator('article', { hasText: '심부름' }).waitFor();
  check('버튼 한 번으로 오늘 할 일에 추가', true);

  await dad.getByRole('link', { name: '+ 새 퀘스트 만들기' }).click();
  await dad.getByRole('button', { name: '퀘스트 만들기' }).click();
  check('이름 없는 퀘스트는 오류', await dad.getByRole('alert').getByText('퀘스트 이름을 적어 주세요.').isVisible());
  await dad.getByLabel('직접 만들기: 퀘스트 이름').fill('강아지 산책');
  await dad.getByRole('button', { name: '30', exact: true }).click();
  await dad.getByRole('radio', { name: '요일마다' }).click();
  for (const d of ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']) await dad.getByRole('button', { name: d }).click();
  await dad.getByRole('button', { name: /꼭 해야 하는 일/ }).click();
  await dad.getByRole('button', { name: '퀘스트 만들기' }).click();
  await dad.getByRole('heading', { name: '퀘스트 관리' }).waitFor();
  await shot(dad, '12-quest-list', true);
  const walk = region(kid, '오늘 할 일').locator('article', { hasText: '강아지 산책' });
  await walk.waitFor();
  check('꼭 표시한 새 퀘스트가 맨 위', (await region(kid, '오늘 할 일').locator('article').first().innerText()).includes('강아지 산책'));
  await dad.getByRole('link', { name: /강아지 산책/ }).click();
  await dad.getByRole('button', { name: '이 퀘스트 지우기' }).click();
  await dad.getByRole('dialog').getByRole('button', { name: '지우기', exact: true }).click();
  await dad.getByRole('heading', { name: '퀘스트 관리' }).waitFor();
  check('지운 퀘스트는 목록에서 사라짐', (await dad.getByText('강아지 산책').count()) === 0);

  // ── 7. 가족 설정 ─────────────────────────────────────────────────────────
  await dad.getByRole('link', { name: '가족', exact: true }).click();
  await dad.getByRole('link', { name: '가족 설정' }).click();
  await dad.getByRole('heading', { name: '가족 설정' }).waitFor();
  await shot(dad, '13-settings', true);
  await dad.getByRole('radio', { name: '1번' }).click();
  await dad.getByLabel('새 한마디').fill('스스로 해서 멋져!');
  await dad.getByRole('button', { name: '추가', exact: true }).click();
  await dad.getByRole('button', { name: '참 잘했어요! 지우기' }).click();
  await dad.getByLabel('자녀가 한 번에 제안할 수 있는 코인').fill('0');
  await dad.getByRole('button', { name: '설정 저장하기' }).click();
  check('잘못된 설정은 오류', await dad.getByRole('alert').getByText(/1부터 1000 사이/).isVisible());
  await dad.getByLabel('자녀가 한 번에 제안할 수 있는 코인').fill('20');
  await dad.getByRole('button', { name: '설정 저장하기' }).click();
  await toast(dad, '설정을 저장했어요');
  await dad.getByLabel('새 버튼: 퀘스트 이름').fill('빨래 개기');
  await dad.getByRole('button', { name: '버튼 추가' }).click();
  await dad.locator('article', { hasText: '빨래 개기' }).waitFor();
  await dad.getByRole('button', { name: '분리수거 하기 버튼 지우기' }).click();
  await dad.locator('article', { hasText: '분리수거 하기' }).waitFor({ state: 'detached' });
  check('버튼 추가와 지우기', true);

  // 설정이 자녀 화면과 승인 창에 반영되는지
  await kid.getByRole('button', { name: '+ 내 할 일 추가' }).click();
  const sheet = kid.getByRole('dialog');
  check('자녀 추가 창에 새 버튼, 지운 버튼은 없음', (await sheet.getByText('빨래 개기').isVisible()) && (await sheet.getByText('분리수거 하기').count()) === 0);
  await kid.getByLabel('직접 적기').fill('화분 물 주기');
  await kid.getByRole('radio', { name: '코인 제안하기' }).click();
  check('바뀐 상한 안내(20코인)', await sheet.getByText('20코인까지 제안할 수 있어요.', { exact: false }).isVisible());
  await sheet.getByRole('button', { name: '20', exact: true }).click();
  await sheet.getByRole('button', { name: '코인 제안하기' }).click();
  await dad.getByRole('link', { name: '승인' }).click();
  const plant = region(dad, '코인 제안').locator('article', { hasText: '화분 물 주기' });
  await plant.getByText('제안 1/1번째').waitFor();
  check('횟수 1번이면 수락과 거절만', (await plant.getByRole('button', { name: '다른 금액 제안' }).count()) === 0);
  await plant.getByRole('button', { name: '20코인으로 수락' }).click();

  const kidDish = region(kid, '오늘 할 일').locator('article', { hasText: '설거지 돕기' });
  await kidDish.getByRole('button', { name: '다 했어요!' }).click();
  await region(dad, '승인 대기').locator('article', { hasText: '설거지 돕기' }).getByRole('button', { name: '승인하고 코인 주기' }).click();
  const praiseButtons = await dad.getByRole('dialog').locator('.btn.mint').allInnerTexts();
  check('승인 창에 바뀐 한마디', praiseButtons.includes('스스로 해서 멋져!') && !praiseButtons.includes('참 잘했어요!'), praiseButtons.join(' / '));
  await dad.getByRole('dialog').getByRole('button', { name: '스스로 해서 멋져!' }).click();
  await expectCoins(kid, afterBonus + 20, '설거지 +10');

  // ── 8. 기록 ──────────────────────────────────────────────────────────────
  await kid.getByRole('link', { name: '기록' }).click();
  await kid.getByRole('heading', { name: '코인 기록' }).waitFor();
  const kidRows = await kid.locator('article').count();
  check('자녀 기록 건수', kidRows === (isSaturday ? 8 : 9), String(kidRows));
  check('기록에 한마디와 보너스', (await kid.getByRole('main').getByText('"스스로 해서 멋져!"').isVisible()) && (isSaturday || (await kid.getByRole('main').getByText('3일 연속 달성 보너스').isVisible())));
  await shot(kid, '14-kid-ledger', true);

  // ── 8-1. 상점: 신청, 코인 묶임, 구매 제한, 승인과 거절, 보관함 ────────────
  const base = afterBonus + 20; // 지금 딸의 코인
  await kid.getByRole('link', { name: '상점' }).click();
  await kid.getByRole('heading', { name: '보상 목록' }).waitFor();
  const list = region(kid, '보상 목록');
  check('보상 5개', (await list.locator('article').count()) === 5);
  check('살 수 있는 보상은 바꾸기, 비싼 보상은 부족분 표시', (await list.locator('article', { hasText: '게임 30분' }).getByRole('button', { name: /바꾸기/ }).isVisible()) && (await list.locator('article', { hasText: '주말 영화 보기' }).getByText(`${150 - base}코인 더!`).isVisible()));
  await shot(kid, '19-kid-shop', false);
  await list.locator('article', { hasText: '게임 30분' }).getByRole('button').click();
  await shot(kid, '20-kid-shop-sheet');
  await kid.getByRole('dialog').getByRole('button', { name: '50코인으로 바꾸기 신청' }).click();
  await region(kid, '신청한 보상').locator('article', { hasText: '게임 30분' }).waitFor();
  check('신청만으로는 코인이 안 빠짐', (await coins(kid)) === base, String(await coins(kid)));
  check('묶인 코인 안내', await kid.getByText(`신청한 보상에 50코인이 묶여 있어요. 지금 쓸 수 있는 코인은 ${base - 50}개예요.`).isVisible());
  check('하루 1번 보상은 오늘은 끝', await list.locator('article', { hasText: '게임 30분' }).getByText('오늘은 끝').isVisible());
  await list.locator('article', { hasText: '먹고 싶은 간식' }).getByRole('button').click();
  await kid.getByRole('dialog').getByRole('button', { name: '30코인으로 바꾸기 신청' }).click();
  await region(kid, '신청한 보상').locator('article', { hasText: '먹고 싶은 간식' }).waitFor();
  check('남은 코인으로 못 사는 보상은 부족분 표시', await list.locator('article', { hasText: '30분 늦게 자기' }).getByText(`${80 - (base - 80)}코인 더!`).isVisible());

  await dad.getByRole('link', { name: '승인' }).click();
  const asks = region(dad, '보상 신청');
  check('부모 화면에 보상 신청 2건', (await asks.locator('article').count()) === 2);
  await shot(dad, '21-parent-orders', false);
  await asks.locator('article', { hasText: '게임 30분' }).getByRole('button', { name: '승인하고 코인 빼기' }).click();
  await kid.locator('.celebrate').getByText('보상 획득!').waitFor({ timeout: 5000 });
  await shot(kid, '22-kid-reward-won');
  await expectCoins(kid, base - 50, '승인되면 50코인 차감');
  check('받을 보상에 들어옴', await region(kid, '받을 보상').getByText('게임 30분').isVisible());
  await asks.locator('article', { hasText: '먹고 싶은 간식' }).getByRole('button', { name: '거절' }).click();
  await dad.getByRole('dialog').getByLabel('한마디 (안 적어도 돼요)').fill('저녁 먹고 나서');
  await dad.getByRole('dialog').getByRole('button', { name: '거절하기' }).click();
  await kid.getByText('이번에는 안 된대요. "저녁 먹고 나서" 코인은 그대로예요.').waitFor();
  await expectCoins(kid, base - 50, '거절되면 코인 그대로');
  check('묶인 코인 안내가 사라짐', (await kid.getByText(/묶여 있어요/).count()) === 0);
  await region(dad, '줄 보상').getByRole('button', { name: '게임 30분 줬어요' }).click();
  await region(kid, '받을 보상').waitFor({ state: 'detached' });
  check('줬어요 하면 받을 보상에서 빠짐', true);
  await shot(kid, '23-kid-shop-after', false);

  // 목표 저금통 바꾸기
  await list.locator('article', { hasText: '주말 영화 보기' }).getByRole('button').click();
  await kid.getByRole('dialog').getByRole('button', { name: '목표 저금통으로 정하기' }).click();
  await region(kid, '목표 저금통').getByText(`앞으로 ${150 - (base - 50)}코인`).waitFor();
  check('목표를 영화로 바꿈', true);

  // 부모: 보상 올리기(예시), 고치기, 내리기
  await dad.getByRole('link', { name: '상점' }).click();
  await dad.getByRole('heading', { name: '상점 관리' }).waitFor();
  await dad.getByRole('link', { name: '+ 새 보상 올리기' }).click();
  await dad.getByRole('button', { name: '상점에 올리기' }).click();
  check('이름 없는 보상은 오류', await dad.getByRole('alert').getByText('보상 이름을 적어 주세요.').isVisible());
  await dad.getByRole('button', { name: /가고 싶은 곳 가기/ }).click();
  check('예시를 누르면 칸이 채워짐', (await dad.getByLabel('보상 이름').inputValue()) === '가고 싶은 곳 가기' && (await dad.getByLabel('가격 (코인)').inputValue()) === '200');
  await dad.getByLabel('가격 (코인)').fill('20');
  await dad.getByRole('radio', { name: '일주일에' }).click();
  await dad.getByRole('radio', { name: '2번' }).click();
  await shot(dad, '24-reward-form', false);
  await dad.getByRole('button', { name: '상점에 올리기' }).click();
  await dad.getByRole('heading', { name: '상점 관리' }).waitFor();
  await shot(dad, '25-shop-admin', false);
  const trip = list.locator('article', { hasText: '가고 싶은 곳 가기' });
  await trip.waitFor();
  check('새 보상이 자녀 상점에 보이고 제한이 표시됨', await trip.getByText('일주일 2번').isVisible());
  await dad.getByRole('link', { name: /가고 싶은 곳 가기/ }).click();
  await dad.getByRole('button', { name: '이 보상 내리기' }).click();
  await dad.getByRole('dialog').getByRole('button', { name: '내리기', exact: true }).click();
  await trip.waitFor({ state: 'detached' });
  check('내린 보상은 자녀 상점에서 사라짐', true);
  await kid.getByRole('link', { name: '기록' }).click();
  await kid.getByRole('heading', { name: '코인 기록' }).waitFor();
  check('기록에 보상 사용 -50', await kid.getByRole('main').locator('article', { hasText: '게임 30분' }).getByText('-50').isVisible());

  // ── 9. 초대코드로 새 자녀 가입 ───────────────────────────────────────────
  await dad.getByRole('link', { name: '가족', exact: true }).click();
  await dad.getByRole('button', { name: '가족 초대하기' }).click();
  await dad.getByRole('button', { name: /^자녀 초대/ }).click();
  const code = (await dad.locator('.code-box').innerText()).trim();
  check('초대코드 6자리', /^[A-Z2-9]{6}$/.test(code), code);
  await dad.getByRole('button', { name: '닫기' }).click();
  const fresh = await context.newPage();
  watch(fresh, 'new');
  await enter(fresh, '처음 온 사람');
  await fresh.getByRole('heading', { name: '내 캐릭터 고르기' }).waitFor();
  await fresh.getByRole('radio', { name: '유니콘' }).click();
  await fresh.getByLabel('이름').fill('동생');
  await fresh.getByRole('button', { name: '이걸로 할래요!' }).click();
  await fresh.getByRole('button', { name: '초대코드로 가족에 들어가기' }).click();
  await fresh.getByLabel('초대코드').fill(code.toLowerCase());
  await fresh.getByRole('button', { name: '가족에 들어가기' }).click();
  await fresh.getByRole('heading', { name: '오늘 할 일' }).waitFor();
  check('새 자녀는 빈 홈으로 들어옴', await fresh.getByText('오늘 할 일이 없어요').isVisible());
  await dad.getByText('가족 4명').waitFor({ timeout: 5000 });
  await dad.getByRole('link', { name: '승인' }).click();
  await dad.getByRole('button', { name: '칭찬 코인 주기' }).click();
  check('자녀가 둘이면 받을 사람을 고름', await dad.getByRole('dialog').getByRole('radio', { name: '동생' }).isVisible());
  await dad.getByRole('dialog').getByRole('button', { name: '닫기' }).click();

  // ── 10. 화면 넘침 검사 ───────────────────────────────────────────────────
  await kid.getByRole('link', { name: '퀘스트' }).click();
  await shot(kid, '15-kid-home-end', true);
  for (const [page, tag] of [[kid, 'kid'], [dad, 'dad'], [fresh, 'new']]) check(`가로 넘침 없음 (${tag})`, (await overflow(page)) <= 0);

  const small = await browser.newContext({ viewport: { width: 320, height: 640 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block' });
  const sp = await small.newPage();
  watch(sp, 'small');
  await sp.goto(URL);
  await loginAs(sp, '딸');
  await sp.getByRole('heading', { name: '오늘 할 일' }).waitFor();
  await sp.screenshot({ path: `${OUT}/16-small-kid.png`, fullPage: true });
  const inner = () => sp.evaluate(() => { const s = document.querySelector('.screen'); return s.scrollWidth - s.clientWidth; });
  check('320px 자녀 홈 가로 넘침 없음', (await overflow(sp)) <= 0 && (await inner()) <= 0);
  await sp.getByRole('button', { name: '+ 내 할 일 추가' }).click();
  await sp.getByRole('radio', { name: '코인 제안하기' }).click();
  await sp.screenshot({ path: `${OUT}/17-small-add.png` });
  const sheetOver = await sp.evaluate(() => { const s = document.querySelector('.sheet'); return s.scrollWidth - s.clientWidth; });
  check('320px 추가 창 가로 넘침 없음', sheetOver <= 0, String(sheetOver));
  await sp.getByRole('dialog').getByRole('button', { name: '닫기' }).click();
  await sp.getByRole('link', { name: '상점' }).click();
  await sp.getByRole('heading', { name: '보상 목록' }).waitFor();
  await sp.screenshot({ path: `${OUT}/26-small-shop.png` });
  check('320px 상점 가로 넘침 없음', (await overflow(sp)) <= 0 && (await inner()) <= 0);
  await switchUser(sp, '아빠');
  await sp.getByRole('heading', { name: '승인 대기' }).waitFor();
  await sp.screenshot({ path: `${OUT}/18-small-parent.png`, fullPage: true });
  check('320px 부모 홈 가로 넘침 없음', (await overflow(sp)) <= 0 && (await inner()) <= 0);
  await sp.getByRole('link', { name: '가족', exact: true }).click();
  await sp.getByRole('link', { name: '가족 설정' }).click();
  await sp.getByRole('heading', { name: '가족 설정' }).waitFor();
  check('320px 설정 가로 넘침 없음', (await overflow(sp)) <= 0 && (await inner()) <= 0);
  await small.close();
} catch (error) {
  problems.push('중단: ' + error.message.split('\n').slice(0, 3).join(' | '));
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch {}
}

console.log(results.join('\n'));
console.log(problems.length ? '\nPROBLEMS\n' + problems.join('\n') : '\nALL OK');
process.exit(problems.length ? 1 : 0);
