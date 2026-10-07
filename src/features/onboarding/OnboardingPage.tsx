import { useState, type FormEvent } from 'react';
import { useBackend } from '../../app/session';
import type { AuthUser, ProfileInput } from '../../backend/types';
import { INVITE_LENGTH, normalizeInviteCode } from '../../domain/invites';
import { MAX_FAMILY_NAME, cleanProfile } from '../../domain/profile';
import { Button, Field } from '../../ui/kit';
import { errorText } from '../../ui/toast';
import { ProfileForm } from '../avatar/ProfileForm';

type Step = 'profile' | 'choose' | 'create' | 'join';

/** 처음 로그인한 사람: 캐릭터를 정하고, 가족을 만들거나 초대코드로 들어간다. */
export function OnboardingPage({ user }: { user: AuthUser }) {
  const backend = useBackend();
  const [step, setStep] = useState<Step>('profile');
  const [profile, setProfile] = useState<ProfileInput>({ displayName: '', avatar: { id: 'rabbit', color: 'pink' } });
  const [familyName, setFamilyName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function go(next: Step) {
    setError('');
    setStep(next);
  }

  function onProfileDone(event: FormEvent) {
    event.preventDefault();
    try {
      setProfile(cleanProfile(profile));
      go('choose');
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function submit(event: FormEvent, work: () => Promise<unknown>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await work();
      // 성공하면 가족 정보가 들어오면서 이 화면은 자동으로 닫힌다.
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const errorLine = error && (
    <p className="error" role="alert">
      {error}
    </p>
  );

  if (step === 'profile') {
    return (
      <main className="screen">
        <form className="stack" style={{ gap: 22 }} onSubmit={onProfileDone}>
          <h1 className="t-title">내 캐릭터 고르기</h1>
          <ProfileForm value={profile} onChange={setProfile} />
          {errorLine}
          <Button type="submit" big block>
            이걸로 할래요!
          </Button>
        </form>
        <button type="button" className="link" onClick={() => void backend.signOut()}>
          다른 계정으로 들어가기
        </button>
      </main>
    );
  }

  if (step === 'choose') {
    return (
      <main className="screen">
        <h1 className="t-title">가족과 연결하기</h1>
        <p className="t-body">{profile.displayName}님, 어떻게 시작할까요?</p>
        <Button big block onClick={() => go('join')}>
          초대코드로 가족에 들어가기
        </Button>
        <Button tone="mint" big block onClick={() => go('create')}>
          우리 가족 새로 만들기 (부모용)
        </Button>
        <button type="button" className="link" onClick={() => go('profile')}>
          캐릭터 다시 고르기
        </button>
      </main>
    );
  }

  if (step === 'create') {
    return (
      <main className="screen">
        <form
          className="stack"
          style={{ gap: 22 }}
          onSubmit={(event) => void submit(event, () => backend.createFamily(user.uid, familyName, profile))}
        >
          <h1 className="t-title">우리 가족 만들기</h1>
          <p className="t-cap" style={{ lineHeight: '18px' }}>
            가족을 만든 사람은 부모 역할이 돼요. 만든 뒤에 초대코드로 다른 가족을 부를 수 있어요.
          </p>
          <Field label="가족 이름">
            {(id) => (
              <input
                id={id}
                className="input"
                type="text"
                value={familyName}
                maxLength={MAX_FAMILY_NAME}
                placeholder="예: 우리 가족"
                onChange={(event) => setFamilyName(event.target.value)}
              />
            )}
          </Field>
          {errorLine}
          <Button type="submit" big block disabled={busy}>
            가족 만들기
          </Button>
        </form>
        <button type="button" className="link" onClick={() => go('choose')}>
          뒤로
        </button>
      </main>
    );
  }

  return (
    <main className="screen">
      <form
        className="stack"
        style={{ gap: 22 }}
        onSubmit={(event) => void submit(event, () => backend.joinFamily(user.uid, code, profile))}
      >
        <h1 className="t-title">초대코드 넣기</h1>
        <p className="t-cap" style={{ lineHeight: '18px' }}>
          부모님이 알려 준 6자리 코드를 적어 주세요.
        </p>
        <Field label="초대코드">
          {(id) => (
            <input
              id={id}
              className="input"
              type="text"
              value={code}
              maxLength={INVITE_LENGTH + 2}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              style={{ fontFamily: 'var(--font-title)', fontSize: 24, letterSpacing: 4, textAlign: 'center' }}
              onChange={(event) => setCode(normalizeInviteCode(event.target.value))}
            />
          )}
        </Field>
        {errorLine}
        <Button type="submit" big block disabled={busy}>
          가족에 들어가기
        </Button>
      </form>
      <button type="button" className="link" onClick={() => go('choose')}>
        뒤로
      </button>
    </main>
  );
}
