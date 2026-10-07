import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useSession } from '../../app/session';
import { repeatLabel } from '../../domain/quests';
import { Avatar, Icon } from '../../ui/Sprite';
import { CoinInline, Empty } from '../../ui/kit';

/** 부모용: 만들어 둔 퀘스트 목록. 누르면 고칠 수 있다. */
export function QuestListPage() {
  const { kids } = useSession();
  const { quests, today, loading } = useFamilyData();

  const groups = kids
    .map((kid) => ({
      kid,
      quests: quests
        .filter((q) => q.assigneeUid === kid.uid)
        .sort((a, b) => a.title.localeCompare(b.title, 'ko')),
    }))
    .filter((group) => group.quests.length > 0);

  return (
    <main className="screen">
      <header className="screen-head">
        <div className="grow">
          <h1 className="t-title">퀘스트 관리</h1>
          <p className="t-cap">누르면 내용을 고칠 수 있어요</p>
        </div>
      </header>

      <Link className="btn big block" to="/quests/new">
        + 새 퀘스트 만들기
      </Link>

      {kids.length === 0 && (
        <Empty
          icon={<Icon name="home" size={48} />}
          title="아직 자녀가 들어오지 않았어요"
          hint="가족 탭에서 초대코드를 만들어 자녀를 불러 주세요."
        />
      )}

      {!loading && kids.length > 0 && groups.length === 0 && (
        <Empty icon={<Icon name="quest" size={48} />} title="아직 퀘스트가 없어요" hint="첫 퀘스트를 만들어 보세요." />
      )}

      {groups.map(({ kid, quests: list }) => (
        <section key={kid.uid} className="stack" aria-label={`${kid.displayName}의 퀘스트`}>
          <div className="row">
            <Avatar avatar={kid.avatar} size={36} />
            <h2 className="t-capb">{kid.displayName}</h2>
            <span className="t-cap">{list.length}개</span>
          </div>
          {list.map((quest) => (
            <Link key={quest.id} to={`/quests/${quest.id}`} className="card card-row" style={{ color: 'inherit', textDecoration: 'none' }}>
              <Icon name="quest" size={36} />
              <span className="card-main">
                <span className="t-body item-title">
                  {quest.important && (
                    <span className="must" aria-label="꼭 해야 하는 일">
                      <Icon name="star" size={12} />꼭
                    </span>
                  )}
                  {quest.title}
                </span>
                <span className="t-cap">{repeatLabel(quest.repeat, today)}</span>
              </span>
              <CoinInline amount={quest.reward} sign />
            </Link>
          ))}
        </section>
      ))}
    </main>
  );
}
