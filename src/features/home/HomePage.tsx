import { Link } from 'react-router-dom';
import { useSession } from '../../app/session';
import { AvatarFrame, Icon } from '../../ui/Sprite';
import { CoinPill } from '../../ui/kit';
import { HomeEvents } from '../calendar/TodayEvents';
import { CheckinButton } from '../location/CheckinButton';
import { NotesBlock } from '../notes/NotesBlock';
import { QuestCards, useMyBoard } from '../quests/QuestCards';

/**
 * 자녀의 홈: 오늘 퀘스트가 얼마나 진행됐는지, 가족 메모, 오늘과 내일의 일정, 놓친 일을 보여 준다.
 * 퀘스트를 하는 곳은 퀘스트 탭이고, 여기서는 놓친 일만 바로 끝낼 수 있다.
 */
export function HomePage() {
  const { me } = useSession();
  const { board, progress, streak } = useMyBoard();
  const progressText = progress.total === 0 ? '오늘은 퀘스트가 없어요' : `오늘 퀘스트 ${progress.total}개 중 ${progress.done}개 완료`;

  return (
    <main className="screen">
      <header className="screen-head">
        <AvatarFrame avatar={me.avatar} size={64} />
        <div className="grow">
          <h1 className="t-title">{me.displayName}</h1>
          <p className="t-cap">{progressText}</p>
          {streak > 0 && (
            <p className="t-capb row" style={{ gap: 4 }}>
              <Icon name="star" size={12} />
              {streak}일 연속 달성 중
            </p>
          )}
        </div>
        <div className="head-side">
          <CoinPill amount={me.coins} />
          <CheckinButton compact />
        </div>
      </header>

      {progress.total > 0 && progress.total <= 10 && (
        <Link className="progress-link" to="/quests" aria-label={`오늘 진행: ${progress.total}개 중 ${progress.done}개 완료. 할 일 보러 가기`}>
          <div className="progress" aria-hidden="true">
            {Array.from({ length: progress.total }, (_, index) => (
              <span key={index} className={index < progress.done ? 'on' : undefined} />
            ))}
          </div>
        </Link>
      )}

      <NotesBlock />

      <HomeEvents />

      {board.missed.length > 0 && (
        <section className="stack" aria-label="놓친 일">
          <div className="section-head">
            <h2 className="t-title">놓친 일</h2>
            <span className="t-cap">{board.missed.length}개</span>
          </div>
          <QuestCards items={board.missed} />
        </section>
      )}
    </main>
  );
}
