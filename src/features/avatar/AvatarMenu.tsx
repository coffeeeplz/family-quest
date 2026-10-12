import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { AvatarFrame } from '../../ui/Sprite';
import { Button, Sheet } from '../../ui/kit';
import { MyProfileSheet } from './MyProfileSheet';

/** 홈 위쪽의 내 캐릭터. 누르면 "캐릭터·이름 바꾸기"와 "꾸미기"를 고르는 창이 뜬다. */
export function AvatarMenu({ size, background }: { size: number; background?: string }) {
  const { me } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState<'menu' | 'profile' | null>(null);

  return (
    <>
      <button type="button" className="avatar-menu-btn" aria-label="내 캐릭터: 바꾸기와 꾸미기" onClick={() => setOpen('menu')}>
        <AvatarFrame avatar={me.avatar} size={size} background={background} />
      </button>
      {open === 'menu' && (
        <Sheet title="내 캐릭터" onClose={() => setOpen(null)}>
          <div className="wardrobe-preview">
            <AvatarFrame avatar={me.avatar} size={96} background="var(--pink-soft)" />
          </div>
          <Button big block onClick={() => setOpen('profile')}>
            캐릭터·이름 바꾸기
          </Button>
          <Button tone="mint" big block onClick={() => navigate('/wardrobe')}>
            꾸미기
          </Button>
          <Button tone="plain" big block onClick={() => setOpen(null)}>
            닫기
          </Button>
        </Sheet>
      )}
      {open === 'profile' && <MyProfileSheet onClose={() => setOpen(null)} />}
    </>
  );
}
