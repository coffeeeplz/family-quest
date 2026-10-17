// 모든 함수에 공통으로 붙는 설정. 다른 파일보다 먼저 읽혀야 하므로, 함수를 만드는 파일은 맨 위에서 이 파일을 불러온다.
// (불러오는 순서 때문에 index.ts 의 setGlobalOptions 가 claw.ts 보다 늦게 돌아 인형뽑기 함수가 미국 지역에 만들어진 적이 있다.)
import { setGlobalOptions } from 'firebase-functions/v2';

/** Firestore 가 서울(asia-northeast3)에 있으므로 함수도 같은 곳에서 돈다. 앱(firebase.ts)도 이 지역으로 부른다. */
export const REGION = 'asia-northeast3';

setGlobalOptions({ region: REGION, maxInstances: 2, memory: '256MiB' });
