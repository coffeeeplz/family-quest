/**
 * Firebase 연결 설정.
 * Firebase 콘솔 > 프로젝트 설정 > 내 앱 > "SDK 설정 및 구성"에 나오는 값을 그대로 옮겨 적는다.
 * apiKey 가 비어 있으면 앱은 체험 모드(이 기기에만 저장)로 동작한다.
 * 이 값들은 공개되어도 되는 식별자이고, 실제 보호는 firestore.rules 가 맡는다.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyA1-TrOpmzVWKvY7o7zbZlGtD-Ly50JsuI',
  authDomain: 'family-quest-22c44.firebaseapp.com',
  projectId: 'family-quest-22c44',
  storageBucket: 'family-quest-22c44.firebasestorage.app',
  messagingSenderId: '681846835761',
  appId: '1:681846835761:web:416421c220eefd14556310',
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== '' && firebaseConfig.projectId !== '';
