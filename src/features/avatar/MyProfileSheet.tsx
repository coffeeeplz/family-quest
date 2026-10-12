import { useState } from 'react';
import { useBackend, useSession } from '../../app/session';
import { ownedOf } from '../../domain/wardrobe';
import { Button, Sheet } from '../../ui/kit';
import { errorText, useToast } from '../../ui/toast';
import { ProfileForm } from './ProfileForm';

/** 내 캐릭터, 색, 이름을 바꾸는 창. 가족 화면과 홈의 캐릭터 메뉴에서 연다. */
export function MyProfileSheet({ onClose }: { onClose: () => void }) {
  const backend = useBackend();
  const { family, me } = useSession();
  const notify = useToast();
  const [profile, setProfile] = useState({ displayName: me.displayName, avatar: me.avatar });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await backend.updateMyProfile(family.id, me.uid, profile);
      notify('바꿨어요!');
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title="내 캐릭터 바꾸기" onClose={onClose}>
      <ProfileForm value={profile} onChange={setProfile} owned={ownedOf(me)} />
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
