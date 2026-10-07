import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useSession } from '../../app/session';
import type { Member } from '../../backend/types';
import { buildBoard, todayProgress, type BoardItem } from '../../domain/quests';
import { availableCoins, reservedCoins } from '../../domain/shop';
import { currentStreak } from '../../domain/streak';
import { formatDay, formatWhen } from '../../lib/dates';
import type { IconName } from '../../lib/sprites';
import { AvatarFrame, Icon } from '../../ui/Sprite';
import { Button, CoinInline, CoinPill, Fold } from '../../ui/kit';
import { KidLocation } from '../location/KidLocation';
import { GoalCard } from '../shop/GoalCard';

const STATE_TEXT: Record<BoardItem['state'], string> = {
  todo: '',
  submitted: '확인 중',
  approved: '완료',
  rejected: '다시 하는 중',
};

const CARD_CLASS: Record<BoardItem['state'], string> = {
  todo: 'card',
  submitted: 'card is-wait',
  approved: 'card is-done',
  rejected: 'card is-redo',
};

function iconOf(item: BoardItem): IconName {
  if (item.state === 'approved') return 'check';
  if (item.state === 'submitted') return 'clock';
  return item.kind === 'memo' ? 'log' : 'quest';
}

/** 최근 코인 기록을 몇 줄까지 보여 줄지 */
const RECENT = 5;

interface Props {
  kid: Member;
  onGift: () => void;
}

/**
 * 부모가 보는 자녀 현황: 자녀의 홈과 같은 목록을 읽기 전용으로 보여 준다.
 * 화면에는 요약, 마지막 위치 한 줄, 놓친 일과 오늘 할 일만 두고 나머지는 접어 둔다.
 */
export function KidStatus({ kid, onGift }: Props) {
  const { family } = useSession();
  const { quests, runs, proposals, orders, ledger, rewards, today } = useFamilyData();

  const board = useMemo(() => buildBoard(quests, runs, proposals, kid.uid, today), [quests, runs, proposals, kid.uid, today]);
  const progress = todayProgress(board);
  const streak = family.settings.streakOn ? currentStreak(kid, quests, today) : 0;
  const reserved = reservedCoins(orders, kid.uid);
  const recent = ledger.filter((entry) => entry.uid === kid.uid).slice(0, RECENT);
  const goal = rewards.find((reward) => reward.id === kid.goalRewardId);

  const renderItem = (item: BoardItem) => (
    <article key={item.key} className={`${CARD_CLASS[item.state]} card-row`}>
      <Icon name={iconOf(item)} size={36} />
      <div className="card-main">
        <h3 className="t-body item-title">
          {item.important && (
            <span className="must" aria-label="꼭 해야 하는 일">
              <Icon name="star" size={12} />꼭
            </span>
          )}
          {item.title}
        </h3>
        <div className="meta t-cap">
          <span>{item.label}</span>
          {item.kind === 'quest' && <CoinInline amount={item.reward} sign />}
        </div>
      </div>
      {STATE_TEXT[item.state] && <span className={item.state === 'approved' ? 'badge done small' : 'badge small'}>{STATE_TEXT[item.state]}</span>}
    </article>
  );

  return (
    <div className="stack" style={{ gap: 22 }}>
      <section className="px kid-head" aria-label={`${kid.displayName} 요약`}>
        <AvatarFrame avatar={kid.avatar} size={48} />
        <div className="grow stack" style={{ gap: 6 }}>
          <h2 className="t-title">{kid.displayName}</h2>
          <p className="t-cap">{progress.total === 0 ? '오늘은 퀘스트가 없어요' : `오늘 퀘스트 ${progress.total}개 중 ${progress.done}개 완료`}</p>
          {streak > 0 && (
            <p className="t-capb row" style={{ gap: 4 }}>
              <Icon name="star" size={12} />
              {streak}일 연속 달성 중
            </p>
          )}
        </div>
        <CoinPill amount={kid.coins} />
      </section>

      {reserved > 0 && (
        <p className="t-cap" style={{ lineHeight: '18px' }}>
          신청한 보상에 {reserved}코인이 묶여 있어요. 지금 쓸 수 있는 코인은 {availableCoins(kid, orders)}개예요.
        </p>
      )}

      {progress.total > 0 && progress.total <= 10 && (
        <div className="progress" role="img" aria-label={`${progress.total}개 중 ${progress.done}개 완료`}>
          {Array.from({ length: progress.total }, (_, index) => (
            <span key={index} className={index < progress.done ? 'on' : undefined} />
          ))}
        </div>
      )}

      <div className="segmented">
        <Button tone="mint" onClick={onGift}>
          칭찬 코인 주기
        </Button>
        <Link className="btn" to={`/quests/new?for=${encodeURIComponent(kid.uid)}`}>
          + 퀘스트 추가
        </Link>
      </div>

      <KidLocation kid={kid} />

      {board.missed.length > 0 && (
        <section className="stack" aria-label="놓친 일">
          <div className="section-head">
            <h2 className="t-title">놓친 일</h2>
            <span className="t-cap">{board.missed.length}개</span>
          </div>
          {board.missed.map(renderItem)}
        </section>
      )}

      <section className="stack" aria-label="오늘 할 일">
        <div className="section-head">
          <h2 className="t-title">오늘 할 일</h2>
          <span className="t-cap">{formatDay(today)}</span>
        </div>
        {board.today.length === 0 && <p className="t-cap">오늘 할 일이 없어요.</p>}
        {board.today.map(renderItem)}
      </section>

      {board.upcoming.length > 0 && (
        <Fold title="다가오는 일" summary={`${board.upcoming.length}개`}>
          {board.upcoming.map(renderItem)}
        </Fold>
      )}

      {goal && (
        <Fold title="목표 저금통" summary={goal.title}>
          <GoalCard member={kid} />
        </Fold>
      )}

      <Fold title="최근 코인 기록" summary={recent.length > 0 ? `${recent.length}건` : '없음'}>
        {recent.length === 0 && <p className="t-cap">아직 기록이 없어요.</p>}
        {recent.map((entry) => (
          <div key={entry.id} className="px history-row">
            <div className="grow stack" style={{ gap: 4 }}>
              <span className="t-body item-title">{entry.memo}</span>
              <span className="t-cap">{formatWhen(entry.at, today)}</span>
            </div>
            <CoinInline amount={entry.amount} sign />
          </div>
        ))}
        <Link className="link" to="/log">
          코인 기록 전체 보기
        </Link>
      </Fold>
    </div>
  );
}
