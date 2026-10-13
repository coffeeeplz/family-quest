import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/session';
import { AvatarFrame } from '../../ui/Sprite';

/** 홈과 승인 화면 위쪽의 내 캐릭터. 누르면 내 캐릭터 화면(이름, 캐릭터, 꾸미기)으로 간다. */
export function AvatarMenu({ size, background }: { size: number; background?: string }) {
  const { me } = useSession();
  const navigate = useNavigate();
  return (
    <button type="button" className="avatar-menu-btn" aria-label="내 캐릭터 바꾸기" onClick={() => navigate('/wardrobe')}>
      <AvatarFrame avatar={me.avatar} size={size} background={background} />
    </button>
  );
}
