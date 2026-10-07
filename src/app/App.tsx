import type { Backend } from '../backend/types';
import { LoginPage } from '../features/auth/LoginPage';
import { OnboardingPage } from '../features/onboarding/OnboardingPage';
import { Icon } from '../ui/Sprite';
import { Button } from '../ui/kit';
import { ToastProvider } from '../ui/toast';
import { FamilyDataProvider } from './familyData';
import { Shell } from './Shell';
import { BackendContext, SessionContext, useSessionState } from './session';

export function App({ backend }: { backend: Backend }) {
  return (
    <BackendContext.Provider value={backend}>
      <div className="app">
        {backend.mode === 'demo' && <div className="demo-flag">체험 모드 · 이 기기에만 저장돼요</div>}
        <ToastProvider>
          <Gate backend={backend} />
        </ToastProvider>
      </div>
    </BackendContext.Provider>
  );
}

/** 로그인과 가족 상태에 따라 보여 줄 화면을 고른다. */
function Gate({ backend }: { backend: Backend }) {
  const state = useSessionState(backend);

  switch (state.status) {
    case 'loading':
      return (
        <main className="screen" style={{ alignItems: 'center', justifyContent: 'center' }} aria-busy="true">
          <Icon name="coin" size={72} />
          <p className="t-cap">불러오는 중...</p>
        </main>
      );
    case 'signedOut':
      return <LoginPage />;
    case 'needsFamily':
      return <OnboardingPage key={state.user.uid} user={state.user} />;
    case 'broken':
      return (
        <main className="screen">
          <h1 className="t-title">가족 정보를 찾지 못했어요</h1>
          <p className="t-body">가족에서 빠졌거나 연결이 불안정할 수 있어요. 다시 로그인해 주세요.</p>
          <Button big block onClick={() => void backend.signOut()}>
            로그아웃
          </Button>
        </main>
      );
    case 'ready':
      return (
        <SessionContext.Provider value={state.session}>
          <FamilyDataProvider key={state.session.family.id + state.session.me.uid}>
            <Shell />
          </FamilyDataProvider>
        </SessionContext.Provider>
      );
  }
}
