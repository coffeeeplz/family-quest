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
// 위치 권한을 허용한 기기로 시작한다(체험 데이터의 '학교' 근처).
const SCHOOL = { latitude: 35.2476, longitude: 129.2192 };
const ELSEWHERE = { latitude: 35.262, longitude: 129.241 };
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block', geolocation: SCHOOL, permissions: ['geolocation'] });
const watch = (page, tag) => {
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${tag}] console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${e.message}`));
};
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const loginAs = (page, label) => page.getByRole('button', { name: new RegExp('^' + label) }).click();
const switchUser = async (page, label) => {
  await page.locator('.tabbar').getByRole('link', { name: '더보기' }).click();
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
// 더보기 탭 안쪽 화면으로 가기
const more = async (page, item) => {
  await page.locator('.tabbar').getByRole('link', { name: '더보기' }).click();
  await page.getByRole('navigation', { name: '더보기 메뉴' }).getByRole('link', { name: new RegExp('^' + item) }).click();
};
// 손가락으로 미는 동작을 흉내 낸다(화면 가운데에서 dx 만큼).
const swipe = (page, dx, dy = 0) =>
  page.evaluate(([dx, dy]) => {
    const el = document.querySelector('.pager-panel');
    const x = window.innerWidth / 2 - dx / 2;
    const y = 420;
    const at = (cx, cy) => ({ bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy });
    el.dispatchEvent(new PointerEvent('pointerdown', at(x, y)));
    el.dispatchEvent(new PointerEvent('pointerup', at(x + dx, y + dy)));
  }, [dx, dy]);
const selectedTab = (page) => page.getByRole('tab', { selected: true }).getAttribute('aria-label');

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

  // ── 3-1. 자녀 현황: 왼쪽으로 밀어서 보기 ─────────────────────────────────
  check('처음에는 승인 쪽, 미는 방법 안내가 보임', (await selectedTab(dad)) === '승인' && (await dad.getByText('옆으로 밀거나 위의 버튼을 누르면').isVisible()));
  await swipe(dad, 40);
  check('짧게 밀면 넘어가지 않음', (await selectedTab(dad)) === '승인');
  await swipe(dad, -120, 150);
  check('위아래로 미는 동작은 넘기지 않음', (await selectedTab(dad)) === '승인');
  await swipe(dad, -160);
  await dad.getByRole('tab', { name: '딸 현황', selected: true }).waitFor();
  check('왼쪽으로 밀면 자녀 현황', true);
  check('한 번 넘기면 안내가 사라짐', (await dad.getByText('옆으로 밀거나 위의 버튼을 누르면').count()) === 0);
  const status = dad.getByRole('tabpanel');
  check('자녀 현황: 코인 30, 연속 2일', (await status.locator('.coin-pill span').innerText()) === '30' && (await status.getByText('2일 연속 달성 중').isVisible()));
  check('자녀 현황: 오늘 할 일에 확인 중 표시', await region(dad, '오늘 할 일').locator('article', { hasText: '수학 문제집 2쪽' }).getByText('확인 중').isVisible());
  check('자녀 현황: 놓친 일과 다가오는 일', (await region(dad, '놓친 일').locator('article').count()) === 1 && (await region(dad, '다가오는 일').getByText('준비물 챙기기').isVisible()));
  check('자녀 현황: 목표 저금통과 최근 기록', (await region(dad, '목표 저금통').getByText('앞으로 20코인').isVisible()) && (await region(dad, '최근 코인 기록').locator('.history-row').count()) === 3);
  check('자녀 현황은 읽기 전용(완료 버튼 없음)', (await status.getByRole('button', { name: /했어요/ }).count()) === 0);
  await dad.waitForTimeout(300); // 넘어오는 움직임이 끝난 뒤에 찍는다
  await shot(dad, '27-parent-kid-status', true);
  await swipe(dad, -160);
  check('마지막 쪽에서 더 밀어도 그대로', (await selectedTab(dad)) === '딸 현황');
  await status.getByRole('button', { name: '칭찬 코인 주기' }).click();
  check('자녀 현황에서 칭찬 코인 창', await dad.getByRole('dialog').getByRole('button', { name: '딸에게 코인 주기' }).isVisible());
  await dad.getByRole('dialog').getByRole('button', { name: '닫기' }).click();
  await status.getByRole('link', { name: '+ 퀘스트 추가' }).click();
  await dad.getByRole('heading', { name: '새 퀘스트' }).waitFor();
  check('자녀 현황에서 퀘스트 추가로 이동', await dad.getByRole('radio', { name: '딸' }).isChecked());
  await dad.getByRole('link', { name: '승인' }).click();
  await dad.getByRole('button', { name: '딸 현황 보기' }).click();
  await dad.getByRole('tab', { name: '딸 현황', selected: true }).waitFor();
  check('가족 칸의 자녀를 눌러도 현황으로', true);
  await swipe(dad, 160);
  await dad.getByRole('heading', { name: '승인 대기' }).waitFor();
  check('오른쪽으로 밀면 승인으로 돌아옴', (await selectedTab(dad)) === '승인');

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
  await dad.getByRole('link', { name: '더보기' }).click();
  await dad.getByRole('navigation', { name: '더보기 메뉴' }).waitFor();
  check('더보기 탭이 켜짐', (await dad.locator('.tab.active').innerText()).includes('더보기'));
  await shot(dad, '28-parent-more');
  await dad.getByRole('navigation', { name: '더보기 메뉴' }).getByRole('link', { name: /^가족 설정/ }).click();
  await dad.getByRole('heading', { name: '가족 설정' }).waitFor();
  check('안쪽 화면에서도 더보기 탭이 켜져 있음', (await dad.locator('.tab.active').innerText()).includes('더보기'));
  await shot(dad, '13-settings', true);
  await region(dad, '코인 협상').getByRole('radio', { name: '1번' }).click();
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
  check('자녀 더보기에는 가족 설정이 없음', await (async () => {
    await kid.getByRole('link', { name: '더보기' }).click();
    await kid.getByRole('navigation', { name: '더보기 메뉴' }).waitFor();
    return (await kid.getByRole('navigation', { name: '더보기 메뉴' }).getByRole('link').count()) === 2;
  })());
  await more(kid, '코인 기록');
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
  await more(kid, '코인 기록');
  await kid.getByRole('heading', { name: '코인 기록' }).waitFor();
  check('기록에 보상 사용 -50', await kid.getByRole('main').locator('article', { hasText: '게임 30분' }).getByText('-50').isVisible());

  // ── 8-2. 뭐먹지: 첫 화면은 먹고 싶은 메뉴만, 나머지는 버튼 안에 ────────────
  await kid.locator('.tabbar').getByRole('link', { name: '뭐먹지' }).click();
  const wanted = region(kid, '먹고 싶어요');
  await wanted.locator('article').first().waitFor();
  check('첫 화면에는 먹고 싶은 메뉴 3개만', (await wanted.locator('article').count()) === 3 && (await kid.getByText('먹고 싶은 메뉴 3개').isVisible()));
  check('보관함과 분류 버튼은 첫 화면에 없음', (await kid.getByText('김치찌개').count()) === 0 && (await kid.getByRole('main').getByRole('radio').count()) === 0);
  check('원하는 사람이 많은 메뉴가 맨 위', (await wanted.locator('article').first().innerText()).includes('치킨'));
  check('카드에 가족 평균 별점과 먹은 횟수', (await wanted.locator('article', { hasText: '치킨' }).getByLabel('가족 별점 평균 4.5점, 2명').isVisible()) && (await wanted.locator('article', { hasText: '치킨' }).getByText('1번 먹음').isVisible()));
  await kid.locator('.toast').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await shot(kid, '29-food-home');

  // 나도!
  const sushiWant = kid.getByRole('button', { name: '초밥 나도 먹고 싶어' });
  await sushiWant.click();
  await kid.locator('.toast', { hasText: '나도 먹고 싶다고 표시했어요' }).waitFor();
  check('나도! 를 누르면 켜짐', (await sushiWant.getAttribute('aria-pressed')) === 'true');

  // 자세히: 링크, 별점, 기록은 카드를 눌러야 나온다
  await kid.getByRole('button', { name: '초밥 자세히' }).click();
  let foodDetail = kid.getByRole('dialog');
  check('자세히: 링크는 새 창으로 열림', (await foodDetail.getByRole('link', { name: /링크 열기/ }).getAttribute('target')) === '_blank' && (await foodDetail.getByText('역 앞 새로 생긴 집').isVisible()));
  check('남이 올린 메뉴는 자녀가 고칠 수 없음', (await foodDetail.getByRole('button', { name: '이름, 분류, 링크 고치기' }).count()) === 0);
  await foodDetail.getByRole('radio', { name: '별 4개' }).click();
  await toast(kid, '별 4개를 줬어요');
  check('자세히에서 준 별점이 평균에 반영', await foodDetail.getByLabel('가족 별점 평균 4.0점, 1명').isVisible());
  await shot(kid, '31-food-detail');
  await foodDetail.getByRole('button', { name: '닫기' }).click();

  // 더 보기 메뉴: 분류로 거르기, 보관함
  await kid.getByRole('button', { name: /더 보기/ }).click();
  const foodMenu = kid.getByRole('dialog');
  check('분류 기본값은 한식 중식 일식 빵 기타', (await foodMenu.getByRole('radio').allInnerTexts()).map((s) => s.trim()).join() === '전체,한식,중식,일식,빵,기타');
  check('자녀 메뉴에는 분류 관리가 없음', (await foodMenu.getByRole('link', { name: '분류 관리' }).count()) === 0);
  await shot(kid, '30-food-menu');
  await foodMenu.getByRole('radio', { name: '일식' }).click();
  check('분류로 거르면 그 분류만', (await wanted.locator('article').count()) === 1 && (await wanted.getByText('초밥').isVisible()));
  await kid.getByRole('button', { name: /일식만 보는 중/ }).click();
  check('거르기 해제', (await wanted.locator('article').count()) === 3);

  // 보관함: 한 번에 다시 올리기, 정렬
  await kid.getByRole('button', { name: /더 보기/ }).click();
  await kid.getByRole('dialog').getByRole('link', { name: '메뉴 보관함 (3개)' }).click();
  const savedBox = region(kid, '메뉴 보관함');
  await savedBox.locator('article').first().waitFor();
  check('보관함 3개, 마지막으로 먹은 날', (await savedBox.locator('article').count()) === 3 && (await savedBox.locator('article', { hasText: '김치찌개' }).getByText('마지막 그저께').isVisible()));
  check('뭐먹지 탭이 켜져 있음', (await kid.locator('.tab.active').innerText()).includes('뭐먹지'));
  await kid.getByRole('combobox', { name: '정렬' }).selectOption('rating');
  check('별점 높은 순 정렬', (await savedBox.locator('article').first().innerText()).includes('떡볶이'));
  await kid.getByRole('combobox', { name: '분류' }).selectOption('bread');
  check('보관함도 분류로 거름', await kid.getByText('보관된 메뉴가 없어요').isVisible());
  await kid.getByRole('combobox', { name: '분류' }).selectOption('all');
  await shot(kid, '32-food-saved');
  await savedBox.getByRole('button', { name: '김밥 또 먹고 싶어' }).click();
  await savedBox.locator('article', { hasText: '김밥' }).waitFor({ state: 'detached' });
  await kid.getByRole('link', { name: /뭐먹지/ }).first().click();
  await wanted.locator('article', { hasText: '김밥' }).waitFor();
  check('보관함의 "또 먹고 싶어" 한 번으로 다시 올라감', true);

  // 올리기: 보관함 버튼, 같은 이름, 새 메뉴
  await kid.getByRole('button', { name: '+ 올리기' }).click();
  const foodForm = kid.getByRole('dialog');
  check('올리기 창에 보관함 버튼', (await foodForm.getByRole('button', { name: '떡볶이', exact: true }).isVisible()) && (await foodForm.getByRole('button', { name: '김밥', exact: true }).count()) === 0);
  await foodForm.getByRole('button', { name: '떡볶이', exact: true }).click();
  await wanted.locator('article', { hasText: '떡볶이' }).waitFor();
  check('올리기 창의 보관함 버튼으로 다시 올라감', true);
  await kid.getByRole('button', { name: '+ 올리기' }).click();
  await kid.getByLabel('새 메뉴 이름').fill(' 김치찌개');
  check('보관함에 있는 이름이면 다시 올리기를 권함', (await foodForm.getByText('"김치찌개" 메뉴는 보관함에 있어요.', { exact: false }).isVisible()) && (await foodForm.getByRole('button', { name: '보관함에서 다시 올리기' }).isVisible()) && (await foodForm.getByRole('button', { name: '메뉴 올리기', exact: true }).count()) === 0);
  await kid.getByLabel('새 메뉴 이름').fill('짜장면');
  await foodForm.getByRole('radio', { name: '중식' }).click();
  await kid.getByLabel('링크 (안 넣어도 돼요)').fill('javascript:alert(1)');
  await foodForm.getByRole('button', { name: '메뉴 올리기', exact: true }).click();
  await toast(kid, '웹 주소');
  check('웹 주소가 아닌 링크는 막음', true);
  await kid.getByLabel('링크 (안 넣어도 돼요)').fill('example.com/jjajang');
  await foodForm.getByRole('button', { name: '메뉴 올리기', exact: true }).click();
  await wanted.locator('article', { hasText: '짜장면' }).waitFor();
  await kid.getByRole('button', { name: '짜장면 자세히' }).click();
  check('새 메뉴: 분류와 https 링크', (await kid.getByRole('dialog').getByText('중식').isVisible()) && (await kid.getByRole('dialog').getByRole('link', { name: /링크 열기/ }).getAttribute('href')) === 'https://example.com/jjajang');
  await kid.getByRole('dialog').getByRole('button', { name: '닫기' }).click();

  // 먹었어요: 바로 별점을 묻는다
  await kid.locator('.toast').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await kid.getByRole('button', { name: '치킨 먹었어요' }).click();
  await toast(kid, '"치킨" 먹었어요! 2번째');
  const rate = kid.getByRole('dialog');
  await rate.getByRole('heading', { name: '어땠어요?' }).waitFor();
  check('먹으면 별점 창이 뜨고 지난 점수가 골라져 있음', (await rate.getByText('지난번에는 별 5개를 줬어요.', { exact: false }).isVisible()) && (await rate.getByRole('radio', { name: '별 5개' }).getAttribute('aria-checked')) === 'true');
  await shot(kid, '33-food-rate');
  await rate.getByRole('radio', { name: '별 3개' }).click();
  await toast(kid, '별 3개를 줬어요');
  await rate.waitFor({ state: 'detached' });
  check('먹은 메뉴는 첫 화면에서 빠짐', (await wanted.locator('article', { hasText: '치킨' }).count()) === 0);
  await kid.getByRole('button', { name: '소금빵 먹었어요' }).click();
  await kid.getByRole('dialog').getByRole('button', { name: '그대로 둘게요' }).click();
  check('별점은 건너뛸 수 있음', (await kid.getByRole('dialog').count()) === 0);

  // 보관함의 자세히: 바뀐 평균, 먹은 기록
  await kid.getByRole('button', { name: /더 보기/ }).click();
  await kid.getByRole('dialog').getByRole('link', { name: /메뉴 보관함/ }).click();
  await savedBox.locator('article', { hasText: '치킨' }).getByText('마지막 오늘').waitFor();
  check('보관함에 평균 별점(3과 4의 평균 3.5)', await savedBox.locator('article', { hasText: '치킨' }).getByLabel('가족 별점 평균 3.5점, 2명').isVisible());
  await kid.getByRole('button', { name: '치킨 자세히' }).click();
  foodDetail = kid.getByRole('dialog');
  check('자세히: 먹은 기록 2번, 가족 점수 표시', (await region(kid, '먹은 기록').locator('.history-row').count()) === 2 && (await foodDetail.getByText('아빠 4점', { exact: false }).isVisible()) && (await foodDetail.getByRole('button', { name: '오늘은 기록했어요' }).isDisabled()));
  await kid.getByLabel('다른 날 먹은 것 기록하기').fill(new Date(Date.now() - 3 * 86400000).toLocaleDateString('sv-SE'));
  await foodDetail.getByRole('button', { name: '기록', exact: true }).click();
  await region(kid, '먹은 기록').locator('.history-row').nth(2).waitFor();
  await region(kid, '먹은 기록').locator('.history-row').nth(1).getByRole('button', { name: /기록 지우기/ }).click();
  await kid.locator('.toast', { hasText: '기록을 지웠어요' }).waitFor();
  check('지난 날짜 기록과 기록 지우기', (await region(kid, '먹은 기록').locator('.history-row').count()) === 2);
  check('내가 올린 메뉴는 고칠 수 있음', await foodDetail.getByRole('button', { name: '이름, 분류, 링크 고치기' }).isVisible());
  await foodDetail.getByRole('button', { name: '닫기' }).click();
  await kid.getByRole('link', { name: /뭐먹지/ }).first().click();

  // 랜덤 뽑기
  await kid.getByRole('button', { name: '뽑기', exact: true }).click();
  const drawSheet = kid.getByRole('dialog');
  await drawSheet.getByRole('radio', { name: '빵' }).click();
  check('후보가 없으면 안내', (await drawSheet.getByText('뽑을 메뉴가 없어요').isVisible()) && (await drawSheet.getByRole('button', { name: '뽑기!' }).isDisabled()));
  await drawSheet.getByRole('radio', { name: '보관함까지 전부' }).click();
  await drawSheet.getByRole('button', { name: '뽑기!' }).click();
  await drawSheet.locator('.draw-name', { hasText: '소금빵' }).waitFor();
  check('후보가 하나면 그 메뉴', await drawSheet.getByRole('button', { name: '오늘 이미 먹었어요' }).isDisabled());
  await drawSheet.getByRole('radio', { name: '전체' }).click();
  await drawSheet.getByRole('radio', { name: '먹고 싶은 것 중에서' }).click();
  check('먹고 싶은 것 후보 4개', await drawSheet.getByText('후보 4개').isVisible());
  await drawSheet.getByRole('button', { name: '뽑기!' }).click();
  await drawSheet.getByRole('button', { name: '다시 뽑기' }).waitFor({ timeout: 5000 });
  const first = await drawSheet.locator('.draw-name').innerText();
  check('뽑힌 메뉴는 먹고 싶은 것 중 하나', ['초밥', '김밥', '떡볶이', '짜장면'].includes(first), first);
  await drawSheet.getByRole('button', { name: '다시 뽑기' }).click();
  await drawSheet.getByRole('button', { name: '다시 뽑기' }).waitFor({ timeout: 5000 });
  const second = await drawSheet.locator('.draw-name').innerText();
  check('다시 뽑으면 다른 메뉴', second !== first, `${first} -> ${second}`);
  await drawSheet.getByRole('button', { name: '이걸로 먹었어요!' }).click();
  await kid.getByRole('dialog').getByRole('heading', { name: '어땠어요?' }).waitFor();
  check('뽑은 메뉴를 먹었다고 하면 별점을 물음', true);
  await kid.getByRole('dialog').getByRole('radio', { name: '별 5개' }).click();
  await kid.getByRole('dialog').waitFor({ state: 'detached' });

  // 부모: 분류 관리, 남의 메뉴 고치고 지우기
  await dad.locator('.tabbar').getByRole('link', { name: '뭐먹지' }).click();
  await region(dad, '먹고 싶어요').waitFor();
  await dad.getByRole('button', { name: /더 보기/ }).click();
  await dad.getByRole('dialog').getByRole('link', { name: '분류 관리' }).click();
  await dad.getByRole('heading', { name: '분류 관리' }).waitFor();
  check('분류 관리: 기타는 지울 수 없음', (await dad.getByText('지울 수 없어요').isVisible()) && (await dad.getByRole('button', { name: '기타 분류 지우기' }).count()) === 0);
  await dad.getByRole('button', { name: '빵 분류 지우기' }).click();
  await dad.getByLabel('새 분류').fill('양식');
  await dad.getByRole('button', { name: '추가', exact: true }).click();
  await dad.getByRole('button', { name: '양식 그림 바꾸기' }).click();
  await dad.getByRole('dialog').getByRole('radio', { name: '식사' }).click();
  await dad.getByLabel('분류 이름').first().fill('한식당');
  await shot(dad, '34-food-categories');
  await dad.getByLabel('분류 이름').nth(1).fill('한식당');
  await dad.getByRole('button', { name: '분류 저장하기' }).click();
  check('같은 이름의 분류는 오류', await dad.getByRole('alert').getByText('같은 이름의 분류가 있어요.').isVisible());
  await dad.getByLabel('분류 이름').nth(1).fill('중식');
  await dad.getByRole('button', { name: '분류 저장하기' }).click();
  await toast(dad, '분류를 저장했어요');
  await region(dad, '먹고 싶어요').waitFor();
  await kid.getByRole('button', { name: /더 보기/ }).click();
  check('바뀐 분류가 자녀 화면에 바로 반영', (await kid.getByRole('dialog').getByRole('radio').allInnerTexts()).map((s) => s.trim()).join() === '전체,한식당,중식,일식,양식,기타');
  await kid.getByRole('dialog').getByRole('radio', { name: '기타' }).click();
  await kid.getByRole('button', { name: /기타만 보는 중/ }).waitFor();
  await kid.getByRole('button', { name: /더 보기/ }).click();
  await kid.getByRole('dialog').getByRole('link', { name: /메뉴 보관함/ }).click();
  await kid.getByRole('combobox', { name: '분류' }).selectOption('etc');
  check('지운 분류(빵)의 메뉴는 기타로', (await savedBox.locator('article', { hasText: '소금빵' }).isVisible()) && (await savedBox.locator('article', { hasText: '치킨' }).isVisible()));
  await kid.getByRole('link', { name: /뭐먹지/ }).first().click();
  await wanted.locator('article').first().waitFor();
  check('다른 화면에 다녀오면 거르기는 풀려 있음', (await kid.getByRole('button', { name: /만 보는 중/ }).count()) === 0);

  const dadTarget = ['초밥', '김밥', '떡볶이', '짜장면'].find((name) => name !== second);
  await dad.getByRole('button', { name: `${dadTarget} 자세히` }).click();
  await dad.getByRole('dialog').getByRole('button', { name: '이름, 분류, 링크 고치기' }).click();
  await dad.getByLabel('메뉴 이름').fill(`맛있는 ${dadTarget}`);
  await dad.getByRole('dialog').getByRole('button', { name: '고친 내용 저장하기' }).click();
  await kid.getByRole('button', { name: `맛있는 ${dadTarget} 자세히` }).waitFor();
  check('부모가 고친 이름이 자녀 화면에 반영', true);
  await dad.getByRole('button', { name: `맛있는 ${dadTarget} 자세히` }).click();
  await dad.getByRole('dialog').getByRole('button', { name: '이름, 분류, 링크 고치기' }).click();
  await dad.getByRole('dialog').getByRole('button', { name: '이 메뉴 지우기' }).click();
  await dad.getByRole('dialog').getByRole('button', { name: /정말 지울까요/ }).click();
  await kid.getByRole('button', { name: `맛있는 ${dadTarget} 자세히` }).waitFor({ state: 'detached' });
  check('지운 메뉴는 모두의 화면에서 사라짐', (await dad.getByRole('button', { name: `맛있는 ${dadTarget} 자세히` }).count()) === 0);
  await dad.locator('.toast').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await shot(dad, '35-food-parent');

  // ── 8-3. 위치: 지금 여기예요, 코인 한도, 자녀 현황, 장소 이름, 설정 ─────────
  await kid.getByRole('link', { name: '퀘스트' }).click();
  const checkin = region(kid, '위치 알리기');
  await checkin.waitFor();
  await kid.locator('.toast').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  const startCoins = await coins(kid);
  check('알리기 카드: +1코인, 오늘 0/3번', await checkin.getByText('누르면 +1코인 · 오늘 0/3번 받음').isVisible());
  check('권한을 허용한 기기에는 위치 공유 켜짐 표시', await checkin.getByText('위치 공유 켜짐', { exact: false }).isVisible());
  check('앱을 열 때 자동으로 남은 기록이 보임', await checkin.getByText(/마지막으로 알린 때: .*학교 근처/).isVisible());
  await shot(kid, '37-kid-checkin', false);
  await checkin.getByRole('button', { name: '알리기' }).click();
  await toast(kid, '위치를 알렸어요!');
  await kid.locator('.celebrate').getByText('위치 공유 +1').waitFor({ timeout: 5000 });
  await expectCoins(kid, startCoins + 1, '위치를 알리면 바로 +1코인');
  await checkin.getByText('오늘 1/3번 받음', { exact: false }).waitFor();
  for (const n of [2, 3]) {
    await checkin.getByRole('button', { name: '알리기' }).click();
    await expectCoins(kid, startCoins + n, `${n}번째 공유 +1`);
  }
  await checkin.getByText('오늘 코인 3번을 다 받았어요').waitFor();
  await kid.locator('.toast').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await context.setGeolocation(ELSEWHERE);
  await checkin.getByRole('button', { name: '알리기' }).click();
  await toast(kid, '오늘 코인은 다 받았어요');
  await expectCoins(kid, startCoins + 3, '하루 3번을 넘기면 코인은 그대로');

  // 부모: 자녀 현황의 위치
  await dad.getByRole('link', { name: '승인' }).click();
  await dad.getByRole('tab', { name: '딸 현황' }).click();
  const where = region(dad, '위치');
  await where.locator('article').getByText('등록한 장소가 아니에요').waitFor();
  check('등록하지 않은 곳은 이름 없이 보이고 직접 알림으로 표시', await where.locator('article').getByText('방금 · 직접 알림').isVisible());
  check('지도 링크에 좌표가 들어감', (await where.locator('article').getByRole('link', { name: '구글 지도' }).getAttribute('href')) === 'https://www.google.com/maps/search/?api=1&query=35.262,129.241');
  check('패밀리 링크 바로가기', (await where.getByRole('link', { name: '패밀리 링크로 실시간 위치 보기' }).getAttribute('href')) === 'https://familylink.google.com/');
  check('지난 기록에 장소 이름', await where.locator('.history-row').first().getByText('학교 근처').isVisible());
  await where.getByRole('button', { name: '이름 붙이기' }).click();
  await dad.getByRole('dialog').getByRole('button', { name: '장소 등록하기' }).click();
  await toast(dad, '장소 이름을 적어 주세요');
  await dad.getByRole('dialog').getByRole('button', { name: '할머니 댁' }).click();
  await dad.getByRole('dialog').getByRole('radio', { name: '300m' }).click();
  await shot(dad, '38-place-sheet');
  await dad.getByRole('dialog').getByRole('button', { name: '장소 등록하기' }).click();
  await where.locator('article').getByText('할머니 댁 근처').waitFor();
  check('이름을 붙이면 그 이름으로 보이고 버튼은 사라짐', (await where.getByRole('button', { name: '이름 붙이기' }).count()) === 0);
  await kid.getByText(/마지막으로 알린 때: .*할머니 댁 근처/).waitFor();
  check('자녀 화면에도 장소 이름이 보임', true);
  await dad.locator('.toast').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await where.scrollIntoViewIfNeeded();
  await dad.evaluate(() => document.querySelector('.screen').scrollBy(0, -20));
  await shot(dad, '39-parent-location');
  check('위치 공유 코인이 자녀 현황의 최근 기록에', await region(dad, '최근 코인 기록').getByText('위치 공유').first().isVisible());

  // 설정: 코인과 하루 횟수, 장소 관리
  await more(dad, '가족 설정');
  const checkinSet = region(dad, '위치 공유 코인');
  await checkinSet.getByRole('button', { name: '5', exact: true }).click();
  await checkinSet.getByRole('radio', { name: '5번' }).click();
  await dad.getByRole('button', { name: '설정 저장하기' }).click();
  await toast(dad, '설정을 저장했어요');
  await checkin.getByText('누르면 +5코인 · 오늘 3/5번 받음').waitFor();
  await checkin.getByRole('button', { name: '알리기' }).click();
  await expectCoins(kid, startCoins + 8, '설정을 바꾸면 +5코인, 하루 5번까지');
  const placeBox = region(dad, '장소');
  check('설정의 장소 목록 4곳', (await placeBox.locator('.history-row').count()) === 4);
  await placeBox.getByRole('button', { name: '할머니 댁 장소 지우기' }).click();
  await placeBox.locator('.history-row', { hasText: '할머니 댁' }).waitFor({ state: 'detached' });
  await dad.getByLabel('지금 내가 있는 곳을 등록하기').fill('공원');
  await placeBox.getByRole('button', { name: '등록', exact: true }).click();
  await placeBox.locator('.history-row', { hasText: '공원' }).waitFor();
  check('장소 지우기와 지금 위치 등록', (await placeBox.locator('.history-row').count()) === 4);
  await kid.getByText(/마지막으로 알린 때: .*공원 근처/).waitFor();
  check('새로 등록한 장소가 바로 반영', true);
  await checkinSet.scrollIntoViewIfNeeded();
  await shot(dad, '40-settings-location');
  await placeBox.scrollIntoViewIfNeeded();
  await shot(dad, '41-settings-places');
  await context.setGeolocation(SCHOOL);

  // ── 9. 초대코드로 새 자녀 가입 ───────────────────────────────────────────
  await more(dad, '가족 구성원');
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
  check('자녀가 둘이면 현황도 두 쪽', (await dad.getByRole('tab').count()) === 3);
  await swipe(dad, -160);
  await swipe(dad, -160);
  await dad.getByRole('tab', { name: '동생 현황', selected: true }).waitFor();
  check('두 번 밀면 둘째의 현황', await dad.getByRole('tabpanel').getByText('오늘은 퀘스트가 없어요').isVisible());
  await dad.waitForTimeout(300);
  await shot(dad, '44-parent-two-kids');
  await dad.getByRole('tab', { name: '승인' }).click();

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
  // 위치 권한이 없는 기기: 자동 기록은 없고, 누르면 안내가 나온다.
  check('권한이 없으면 자동 기록 없음', (await sp.getByText(/마지막으로 알린 때: 방금/).count()) === 0);
  await region(sp, '위치 알리기').getByRole('button', { name: '알리기' }).click();
  await sp.locator('.toast', { hasText: '위치 권한이 꺼져 있어요' }).waitFor({ timeout: 20000 });
  check('위치 권한이 없으면 안내', (await sp.locator('.coin-pill span').innerText()) === '30');
  await sp.locator('.toast').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
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
  await sp.getByRole('tab', { name: '딸 현황' }).click();
  await sp.getByRole('heading', { name: '오늘 할 일' }).waitFor();
  check('넘어오는 중에도 가로 넘침 없음', (await overflow(sp)) <= 0 && (await inner()) <= 0);
  await sp.waitForTimeout(300);
  await sp.screenshot({ path: `${OUT}/45-small-kid-status.png`, fullPage: true });
  check('320px 자녀 현황 가로 넘침 없음', (await overflow(sp)) <= 0 && (await inner()) <= 0);
  await sp.locator('.tabbar').getByRole('link', { name: '뭐먹지' }).click();
  await region(sp, '먹고 싶어요').locator('article').first().waitFor();
  await sp.screenshot({ path: `${OUT}/36-small-food.png`, fullPage: true });
  check('320px 뭐먹지 가로 넘침 없음', (await overflow(sp)) <= 0 && (await inner()) <= 0);
  await sp.getByRole('button', { name: /더 보기/ }).click();
  await sp.getByRole('dialog').getByRole('link', { name: /메뉴 보관함/ }).click();
  await region(sp, '메뉴 보관함').locator('article').first().waitFor();
  await sp.screenshot({ path: `${OUT}/42-small-food-saved.png`, fullPage: true });
  check('320px 보관함 가로 넘침 없음', (await overflow(sp)) <= 0 && (await inner()) <= 0);
  await sp.getByRole('link', { name: /뭐먹지/ }).first().click();
  await sp.getByRole('button', { name: /더 보기/ }).click();
  await sp.getByRole('dialog').getByRole('link', { name: '분류 관리' }).click();
  await sp.getByRole('heading', { name: '분류 관리' }).waitFor();
  await sp.screenshot({ path: `${OUT}/43-small-food-categories.png`, fullPage: true });
  check('320px 분류 관리 가로 넘침 없음', (await overflow(sp)) <= 0 && (await inner()) <= 0);
  await sp.getByRole('link', { name: /뭐먹지/ }).first().click();
  await sp.getByRole('button', { name: '뽑기', exact: true }).click();
  const drawOver = await sp.evaluate(() => { const s = document.querySelector('.sheet'); return s.scrollWidth - s.clientWidth; });
  check('320px 뽑기 창 가로 넘침 없음', drawOver <= 0, String(drawOver));
  await sp.getByRole('dialog').getByRole('button', { name: '닫기' }).click();
  await more(sp, '가족 설정');
  await sp.getByRole('heading', { name: '가족 설정' }).waitFor();
  check('320px 설정 가로 넘침 없음', (await overflow(sp)) <= 0 && (await inner()) <= 0);

  // ── 11. 진짜 터치로 밀기(브라우저가 위아래 스크롤과 좌우 밀기를 구분하는지) ──
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block' });
  const tp = await touch.newPage();
  watch(tp, 'touch');
  await tp.goto(URL);
  await loginAs(tp, '아빠');
  await tp.getByRole('heading', { name: '승인 대기' }).waitFor();
  const cdp = await touch.newCDPSession(tp);
  const drag = async (x0, y0, x1, y1) => {
    const steps = 8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }] });
      await tp.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await tp.waitForTimeout(250);
  };
  await drag(300, 500, 80, 510);
  check('터치: 왼쪽으로 밀면 자녀 현황', (await selectedTab(tp)) === '딸 현황', await selectedTab(tp));
  const scrollTop = () => tp.evaluate(() => document.querySelector('.screen').scrollTop);
  await drag(200, 600, 210, 250);
  check('터치: 위로 밀면 스크롤만 되고 쪽은 그대로', (await scrollTop()) > 50 && (await selectedTab(tp)) === '딸 현황', String(await scrollTop()));
  await drag(10, 500, 250, 505);
  check('터치: 화면 가장자리에서 시작하면 넘기지 않음', (await selectedTab(tp)) === '딸 현황');
  await drag(80, 500, 300, 495);
  check('터치: 오른쪽으로 밀면 승인으로', (await selectedTab(tp)) === '승인', await selectedTab(tp));
  await touch.close();
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
