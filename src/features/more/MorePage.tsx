import { Link } from 'react-router-dom';
import { useBackend, useSession } from '../../app/session';
import type { IconName } from '../../lib/sprites';
import { AvatarFrame, Icon } from '../../ui/Sprite';
import { Button } from '../../ui/kit';

interface MenuItem {
  to: string;
  icon: IconName;
  title: string;
  hint: string;
}

/**
 * 더보기: 자주 쓰지 않는 화면으로 가는 길을 모아 둔다.
 * 새 서비스가 생겨 아래 탭 자리가 모자라면 여기에 한 줄씩 추가한다.
 */
export function MorePage() {
  const backend = useBackend();
  const { family, me, isParent } = useSession();

  const items: MenuItem[] = [
    { to: '/family', icon: 'home', title: '가족', hint: isParent ? '구성원, 가족 초대, 내 캐릭터 바꾸기' : '구성원, 내 캐릭터 바꾸기' },
    { to: '/log', icon: 'log', title: '코인 기록', hint: isParent ? '누가 언제 코인을 받고 썼는지' : '내가 모으고 쓴 코인' },
    ...(isParent
      ? [{ to: '/settings', icon: 'star' as IconName, title: '가족 설정', hint: '코인 협상, 연속 달성 보너스, 칭찬 한마디, 자주 쓰는 퀘스트' }]
      : []),
  ];

  function leaveSession() {
    window.location.hash = '/';
    void backend.signOut();
  }

  return (
    <main className="screen">
      <header className="screen-head">
        <AvatarFrame avatar={me.avatar} size={64} />
        <div className="grow">
          <h1 className="t-title">{me.displayName}</h1>
          <p className="t-cap">
            {family.name} · {isParent ? '부모' : '자녀'}
          </p>
        </div>
      </header>

      <nav className="stack" aria-label="더보기 메뉴">
        {items.map((item) => (
          <Link key={item.to} className="px list-button menu-row" to={item.to}>
            <Icon name={item.icon} size={36} />
            <span className="card-main">
              <span className="t-body item-title">{item.title}</span>
              <span className="t-cap">{item.hint}</span>
            </span>
            <span className="t-title" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </nav>

      <div className="hr" />

      {backend.demo ? (
        <>
          <Button tone="plain" big block onClick={leaveSession}>
            다른 사람으로 들어가 보기
          </Button>
          <button
            type="button"
            className="link"
            onClick={() => {
              window.location.hash = '/';
              backend.demo?.reset();
            }}
          >
            체험 내용을 처음 상태로 되돌리기
          </button>
        </>
      ) : (
        <Button tone="plain" big block onClick={leaveSession}>
          로그아웃
        </Button>
      )}
    </main>
  );
}
