import { useState, type FormEvent } from 'react';
import { useBackend } from '../../app/session';
import { Avatar } from '../../ui/Sprite';
import { Button, Field } from '../../ui/kit';
import { errorText } from '../../ui/toast';

function Logo() {
  return (
    <div className="stack center" style={{ alignItems: 'center', gap: 16, paddingTop: 24 }}>
      <div className="row" style={{ gap: 4 }}>
        <Avatar avatar={{ id: 'bear', color: 'brown' }} size={56} />
        <Avatar avatar={{ id: 'rabbit', color: 'pink' }} size={72} />
        <Avatar avatar={{ id: 'cat', color: 'yellow' }} size={56} />
      </div>
      <h1 className="t-title" style={{ fontSize: 36, lineHeight: '40px' }}>
        가족 퀘스트
      </h1>
      <p className="t-cap">할 일을 끝내고 코인을 모아요</p>
    </div>
  );
}

function DemoLogin() {
  const backend = useBackend();
  const demo = backend.demo!;
  return (
    <>
      <div className="px note t-cap" style={{ color: 'var(--ink)', lineHeight: '18px' }}>
        체험 모드예요. 여기서 바꾼 내용은 이 기기에만 저장돼요. 누구로 들어갈지 골라 보세요.
      </div>
      <div className="stack" style={{ gap: 14 }}>
        {demo.personas().map((persona) => (
          <button
            key={persona.uid}
            type="button"
            className="px card-row list-button"
            style={{ padding: 12, minHeight: 68 }}
            onClick={() => demo.loginAs(persona.uid)}
          >
            {persona.avatar ? (
              <Avatar avatar={persona.avatar} size={44} />
            ) : (
              <Avatar avatar={{ id: 'ghost', color: 'lavender' }} size={44} />
            )}
            <span className="card-main" style={{ gap: 6 }}>
              <span className="t-body">{persona.label}</span>
              <span className="t-cap">{persona.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function AccountLogin() {
  const backend = useBackend();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(() =>
      mode === 'login' ? backend.signInWithEmail(email, password) : backend.signUpWithEmail(email, password),
    );
  }

  return (
    <>
      <Button big block disabled={busy} onClick={() => void run(() => backend.signInWithGoogle())}>
        Google 계정으로 시작하기
      </Button>
      <div className="hr" />
      <form className="stack" onSubmit={onSubmit}>
        <Field label="이메일">
          {(id) => (
            <input
              id={id}
              className="input"
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <Field label="비밀번호" hint={mode === 'signup' ? '6자 이상으로 정해 주세요.' : undefined}>
          {(id) => (
            <input
              id={id}
              className="input"
              type="password"
              value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" tone="mint" big block disabled={busy}>
          {mode === 'login' ? '이메일로 로그인' : '이메일로 가입하기'}
        </Button>
      </form>
      <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? '처음이에요. 이메일로 가입할래요' : '이미 가입했어요. 로그인할래요'}
      </button>
    </>
  );
}

export function LoginPage() {
  const backend = useBackend();
  return (
    <main className="screen">
      <Logo />
      {backend.mode === 'demo' ? <DemoLogin /> : <AccountLogin />}
    </main>
  );
}
