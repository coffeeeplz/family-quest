import { useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import type { Invite, ProfileInput, Role } from '../../backend/types';
import { Avatar } from '../../ui/Sprite';
import { BackLink, Button, CoinInline, Sheet } from '../../ui/kit';
import { errorText, useToast } from '../../ui/toast';
import { ProfileForm } from '../avatar/ProfileForm';

/** 가족 구성원, 내 캐릭터 바꾸기, 초대코드 */
export function FamilyPage() {
  const backend = useBackend();
  const { family, members, me, isParent } = useSession();
  const notify = useToast();
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);

  return (
    <main className="screen">
      <BackLink />
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">{family.name}</h1>
          <p className="t-cap">가족 {members.length}명</p>
        </div>
      </header>

      <div className="stack">
        {members.map((member) => (
          <article key={member.uid} className="card card-row">
            <Avatar avatar={member.avatar} size={48} />
            <div className="card-main">
              <h2 className="t-body" style={{ fontWeight: 400 }}>
                {member.displayName}
                {member.uid === me.uid ? ' (나)' : ''}
              </h2>
              <p className="t-cap">{member.role === 'parent' ? '부모' : '자녀'}</p>
            </div>
            {member.role === 'child' && <CoinInline amount={member.coins} />}
          </article>
        ))}
      </div>

      <Button big block onClick={() => setEditing(true)}>
        내 캐릭터와 이름 바꾸기
      </Button>
      {isParent && (
        <Button tone="mint" big block onClick={() => setInviting(true)}>
          가족 초대하기
        </Button>
      )}

      {editing && (
        <EditProfileSheet
          initial={{ displayName: me.displayName, avatar: me.avatar }}
          onClose={() => setEditing(false)}
          onSave={async (profile) => {
            await backend.updateMyProfile(family.id, me.uid, profile);
            notify('바꿨어요!');
          }}
        />
      )}
      {inviting && (
        <InviteSheet
          familyName={family.name}
          onClose={() => setInviting(false)}
          create={(role) => backend.createInvite(family.id, role, me.uid)}
        />
      )}
    </main>
  );
}

interface EditProfileProps {
  initial: ProfileInput;
  onClose: () => void;
  onSave: (profile: ProfileInput) => Promise<void>;
}

function EditProfileSheet({ initial, onClose, onSave }: EditProfileProps) {
  const [profile, setProfile] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await onSave(profile);
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title="내 캐릭터 바꾸기" onClose={onClose}>
      <ProfileForm value={profile} onChange={setProfile} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button big block disabled={busy} onClick={() => void save()}>
        이걸로 할래요!
      </Button>
      <Button tone="plain" big block onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}

interface InviteProps {
  familyName: string;
  onClose: () => void;
  create: (role: Role) => Promise<Invite>;
}

function InviteSheet({ familyName, onClose, create }: InviteProps) {
  const notify = useToast();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function make(role: Role) {
    setBusy(true);
    setError('');
    try {
      setInvite(await create(role));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function share(current: Invite) {
    const text = `[가족 퀘스트] "${familyName}" 초대코드: ${current.code} (7일 동안 쓸 수 있어요)`;
    // 휴대폰에서는 공유 창(메신저 등)을, 안 되면 복사를 쓴다.
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // 공유 창을 그냥 닫음
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      notify('초대코드를 복사했어요.');
    } catch {
      notify('복사가 막혀 있어요. 코드를 직접 알려 주세요.');
    }
  }

  return (
    <Sheet title="가족 초대하기" onClose={onClose}>
      {invite ? (
        <>
          <p className="t-body">
            {invite.role === 'child' ? '자녀' : '부모'}용 초대코드예요. 상대가 앱에 가입한 뒤 "초대코드로 가족에 들어가기"에 적으면 돼요.
          </p>
          <div className="px code-box" aria-label={`초대코드 ${invite.code.split('').join(' ')}`}>
            {invite.code}
          </div>
          <p className="t-cap">7일 동안 쓸 수 있어요. 필요한 사람에게만 알려 주세요.</p>
          <Button big block onClick={() => void share(invite)}>
            초대코드 보내기
          </Button>
          <Button tone="plain" big block onClick={onClose}>
            닫기
          </Button>
        </>
      ) : (
        <>
          <p className="t-body">누구를 초대할까요? 역할에 따라 할 수 있는 일이 달라요.</p>
          <Button big block disabled={busy} onClick={() => void make('child')}>
            자녀 초대 (퀘스트를 하고 코인을 모아요)
          </Button>
          <Button tone="mint" big block disabled={busy} onClick={() => void make('parent')}>
            부모 초대 (퀘스트를 만들고 승인해요)
          </Button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button tone="plain" big block onClick={onClose}>
            닫기
          </Button>
        </>
      )}
    </Sheet>
  );
}
