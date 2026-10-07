import { useMemo, useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import { buildBoard, todayProgress, type BoardItem } from '../../domain/quests';
import { currentStreak } from '../../domain/streak';
import { formatDay } from '../../lib/dates';
import type { IconName } from '../../lib/sprites';
import { AvatarFrame, Icon } from '../../ui/Sprite';
import { Button, CoinInline, CoinPill, Empty, Fold, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { TodayEvents } from '../calendar/TodayEvents';
import { CheckinButton } from '../location/CheckinButton';
import { recordAuto } from '../location/auto';
import { MyOfferCard } from '../negotiation/MyOfferCard';
import { AddTaskSheet } from './AddTaskSheet';

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

/**
 * 자녀의 첫 화면: 놓친 일과 오늘 할 일을 보여 준다.
 * 다가오는 일은 접어 두고, 목표 저금통은 상점에 있다.
 */
export function TodayPage() {
  const backend = useBackend();
  const { me, family } = useSession();
  const { quests, runs, proposals, today, loading } = useFamilyData();
  const { busy, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BoardItem | null>(null);

  const board = useMemo(() => buildBoard(quests, runs, proposals, me.uid, today), [quests, runs, proposals, me.uid, today]);
  const progress = todayProgress(board);
  const streak = family.settings.streakOn ? currentStreak(me, quests, today) : 0;
  const myOffers = proposals
    .filter((p) => p.ownerUid === me.uid && p.status === 'negotiating')
    .sort((a, b) => Number(b.lastRole === 'parent') - Number(a.lastRole === 'parent') || a.createdAt - b.createdAt);

  function submit(item: BoardItem) {
    if (!item.quest) return;
    const quest = item.quest;
    void run(
      () => backend.submitRun(family.id, quest, item.runDay, me.uid, item.late),
      '완료를 알렸어요. 확인을 기다려요!',
    ).then((ok) => {
      // 퀘스트를 끝낸 곳도 함께 남긴다(위치 권한을 허용해 둔 경우에만).
      if (ok) void recordAuto(backend, family.id, me.uid, 'quest');
    });
  }

  function cancel(item: BoardItem) {
    setCancelTarget(null);
    if (!item.run) return;
    const id = item.run.id;
    void run(() => backend.cancelRun(family.id, id), '완료 알림을 취소했어요.');
  }

  const renderItem = (item: BoardItem) => (
    <article key={item.key} className={CARD_CLASS[item.state]}>
      <div className="card-row">
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

        {item.kind === 'quest' && item.canAct && item.state === 'todo' && (
          <Button fixed disabled={busy} onClick={() => submit(item)}>
            {item.late ? '늦게 했어요!' : '다 했어요!'}
          </Button>
        )}
        {item.kind === 'quest' && item.state === 'rejected' && (
          <Button fixed disabled={busy} onClick={() => submit(item)}>
            다시 했어요!
          </Button>
        )}
        {item.kind === 'quest' && item.state === 'submitted' && (
          <button type="button" className="badge" onClick={() => setCancelTarget(item)}>
            확인 중...
          </button>
        )}
        {item.kind === 'quest' && item.state === 'approved' && <span className="badge done">완료! +{item.reward}</span>}

        {item.memo && item.state === 'todo' && (
          <Button
            tone="plain"
            fixed
            disabled={busy}
            onClick={() => void run(() => backend.setMemoDone(family.id, item.memo!.id, true, today))}
          >
            끝냈어요
          </Button>
        )}
        {item.memo && item.state === 'approved' && (
          <button
            type="button"
            className="badge done"
            aria-label="끝냄. 누르면 되돌려요"
            disabled={busy}
            onClick={() => void run(() => backend.setMemoDone(family.id, item.memo!.id, false, today))}
          >
            끝!
          </button>
        )}
      </div>

      {item.note && item.state !== 'approved' && <p className="t-cap card-foot">{item.note}</p>}
      {item.state === 'rejected' && (
        <p className="t-capb card-foot">
          {item.run?.rejectReason ? `다시 해 볼까요? "${item.run.rejectReason}"` : '한 번 더 해 볼까요?'}
        </p>
      )}
      {item.state === 'approved' && item.run?.praise && <p className="t-capb card-foot">"{item.run.praise}"</p>}
      {item.memo && item.state === 'todo' && (
        <div className="row card-foot" style={{ justifyContent: 'space-between' }}>
          <span className="t-cap">{item.memo.declined ? '코인 제안은 거절됐어요' : '코인 없는 메모'}</span>
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => void run(() => backend.deleteProposal(family.id, item.memo!.id), '지웠어요.')}
          >
            지우기
          </button>
        </div>
      )}
    </article>
  );

  return (
    <main className="screen">
      <header className="screen-head">
        <AvatarFrame avatar={me.avatar} size={64} />
        <div className="grow">
          <h1 className="t-title">{me.displayName}</h1>
          <p className="t-cap">
            {progress.total === 0 ? '오늘은 퀘스트가 없어요' : `퀘스트 ${progress.total}개 중 ${progress.done}개 완료`}
          </p>
          {streak > 0 && (
            <p className="t-capb row" style={{ gap: 4 }}>
              <Icon name="star" size={12} />
              {streak}일 연속 달성 중
            </p>
          )}
        </div>
        <CoinPill amount={me.coins} />
      </header>

      {progress.total > 0 && progress.total <= 10 && (
        <div className="progress" role="img" aria-label={`${progress.total}개 중 ${progress.done}개 완료`}>
          {Array.from({ length: progress.total }, (_, index) => (
            <span key={index} className={index < progress.done ? 'on' : undefined} />
          ))}
        </div>
      )}

      <div className="segmented">
        <CheckinButton />
        <Button tone="plain" onClick={() => setAdding(true)}>
          + 내 할 일 추가
        </Button>
      </div>

      <TodayEvents />

      {myOffers.length > 0 && (
        <section className="stack" aria-label="코인 협상">
          <h2 className="t-title">코인 협상</h2>
          {myOffers.map((proposal) => (
            <MyOfferCard key={proposal.id} proposal={proposal} />
          ))}
        </section>
      )}

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
        {!loading && board.today.length === 0 && (
          <Empty icon={<Icon name="star" size={48} />} title="오늘 할 일이 없어요" hint="새 퀘스트가 생기면 여기에 나타나요." />
        )}
        {board.today.map(renderItem)}
      </section>

      {board.upcoming.length > 0 && (
        <Fold title="다가오는 일" summary={`${board.upcoming.length}개`}>
          {board.upcoming.map(renderItem)}
        </Fold>
      )}

      {adding && <AddTaskSheet onClose={() => setAdding(false)} />}

      {cancelTarget && (
        <Sheet title="확인을 기다리는 중" onClose={() => setCancelTarget(null)}>
          <p className="t-body">"{cancelTarget.title}" 완료를 부모님께 알렸어요. 아직 다 못 했다면 취소할 수 있어요.</p>
          <Button tone="plain" big block onClick={() => cancel(cancelTarget)}>
            완료 알림 취소하기
          </Button>
          <Button big block onClick={() => setCancelTarget(null)}>
            그대로 기다릴게요
          </Button>
        </Sheet>
      )}
    </main>
  );
}
