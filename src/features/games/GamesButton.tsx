import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { Icon } from '../../ui/Sprite';
import { anyGameOn } from './games';

/** 홈의 게임 버튼(게임 목록으로). 켜진 게임이 하나도 없으면 자녀에게는 숨긴다(부모는 늘 보인다). */
export function GamesButton() {
  const { family, isParent } = useSession();
  if (!isParent && !anyGameOn(family.settings)) return null;
  return (
    <Link className="btn plain block games-btn" to="/games">
      <Icon name="game" size={24} />
      게임
    </Link>
  );
}
