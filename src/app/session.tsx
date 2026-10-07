import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthUser, Backend, Family, Member } from '../backend/types';

/** 저장소(Firebase 또는 체험용)를 화면 어디서나 꺼내 쓰기 위한 통로 */
export const BackendContext = createContext<Backend | null>(null);

export function useBackend(): Backend {
  const backend = useContext(BackendContext);
  if (!backend) throw new Error('BackendContext 가 없습니다.');
  return backend;
}

export interface Session {
  user: AuthUser;
  family: Family;
  members: Member[];
  me: Member;
  isParent: boolean;
  /** 자녀 역할 구성원 */
  kids: Member[];
}

export const SessionContext = createContext<Session | null>(null);

/** 로그인하고 가족에 들어간 상태에서만 쓸 수 있다. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionContext 가 없습니다.');
  return session;
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'needsFamily'; user: AuthUser }
  | { status: 'broken'; user: AuthUser }
  | { status: 'ready'; session: Session };

/** 로그인 → 가족 확인 → 구성원 불러오기 순서로 현재 상태를 계산한다. */
export function useSessionState(backend: Backend): SessionState {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [familyId, setFamilyId] = useState<string | null | undefined>(undefined);
  const [family, setFamily] = useState<Family | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[] | undefined>(undefined);
  const uid = user?.uid;

  useEffect(() => backend.onAuthChange(setUser), [backend]);

  useEffect(() => {
    setFamilyId(undefined);
    if (!uid) return;
    return backend.watchUserProfile(uid, (profile) => setFamilyId(profile?.familyId ?? null));
  }, [backend, uid]);

  useEffect(() => {
    setFamily(undefined);
    setMembers(undefined);
    if (!familyId) return;
    const stopFamily = backend.watchFamily(familyId, setFamily);
    const stopMembers = backend.watchMembers(familyId, setMembers);
    return () => {
      stopFamily();
      stopMembers();
    };
  }, [backend, familyId]);

  return useMemo<SessionState>(() => {
    if (user === undefined) return { status: 'loading' };
    if (user === null) return { status: 'signedOut' };
    if (familyId === undefined) return { status: 'loading' };
    if (familyId === null) return { status: 'needsFamily', user };
    if (family === undefined || members === undefined) return { status: 'loading' };
    const me = members.find((m) => m.uid === user.uid);
    if (!family || !me) return { status: 'broken', user };
    const sorted = [...members].sort((a, b) => a.joinedAt - b.joinedAt);
    return {
      status: 'ready',
      session: {
        user,
        family,
        members: sorted,
        me,
        isParent: me.role === 'parent',
        kids: sorted.filter((m) => m.role === 'child'),
      },
    };
  }, [user, familyId, family, members]);
}
