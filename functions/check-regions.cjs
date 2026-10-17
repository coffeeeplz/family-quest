// 빌드한 함수가 모두 서울 지역(asia-northeast3)에 만들어지는지 검사한다. 하나라도 다르면 배포 전에 멈춘다.
// (지역이 비어 있으면 미국 지역에 만들어져 앱이 함수를 찾지 못한다.)
const fns = require('./lib/index.js');
const wrong = Object.entries(fns)
  .filter(([, fn]) => fn && fn.__endpoint)
  .filter(([, fn]) => JSON.stringify(fn.__endpoint.region) !== JSON.stringify(['asia-northeast3']))
  .map(([name, fn]) => `${name}: ${JSON.stringify(fn.__endpoint.region ?? '기본(us-central1)')}`);
if (wrong.length > 0) {
  console.error('서울 지역이 아닌 함수가 있어요:\n' + wrong.join('\n'));
  process.exit(1);
}
console.log(`함수 ${Object.keys(fns).length}개 모두 asia-northeast3`);
