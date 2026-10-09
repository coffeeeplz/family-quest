import { useMemo, useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import { buildBoard, todayProgress, type Board, type BoardItem } from '../../domain/quests';
import { currentStreak } from '../../domain/streak';
import type { IconName } from '../../lib/sprites';
import { Icon } from '../../ui/Sprite';
import { Button, CoinInline, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { Said } from '../stickers/StickerAttach';
import { recordAuto } from '../location/auto';

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

/** 내 퀘스트를 놓친 일 / 오늘 할 일 / 다가오는 일로 나눈 것과 오늘의 진행, 연속 달성 */
export function useMyBoard(): { board: Board; progress: { total: number; done: number }; streak: number; remaining: number } {
  const { me, family } = useSession();
  const { quests, runs, proposals, today } = useFamilyData();
  const board = useMemo(() => buildBoard(quests, runs, proposals, me.uid, today), [quests, runs, proposals, me.uid, today]);
  const progress = todayProgress(board);
  const streak = family.settings.streakOn ? currentStreak(me, quests, today) : 0;
  // 아직 내가 해야 하는 퀘스트의 수(놓친 일 포함, 확인을 기다리는 것은 제외)
  const remaining = [...board.missed, ...board.today].filter((item) => item.kind === 'quest' && (item.state === 'todo' || item.state === 'rejected')).length;
  return { board, progress, streak, remaining };
}

/** 자녀가 보는 퀘스트와 메모 카드 묶음: 완료 알림, 취소, 메모 끝내기를 여기서 한다. 홈과 퀘스트 화면이 함께 쓴다. */
export function QuestCards({ items }: { items: BoardItem[] }) {
  const backend = useBackend();
  const { me, family } = useSession();
  const { today } = useFamilyData();
  const { busy, run } = useAction();
  const [cancelTarget, setCancelTarget] = useState<BoardItem | null>(null);

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

  return (
    <>
      {items.map((item) => (
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
              <Button tone="plain" fixed disabled={busy} onClick={() => void run(() => backend.setMemoDone(family.id, item.memo!.id, true, today))}>
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
              {item.run?.rejectReason ? (
                <>
                  다시 해 볼까요? <Said said={item.run.rejectReason} />
                </>
              ) : (
                '한 번 더 해 볼까요?'
              )}
            </p>
          )}
          {item.state === 'approved' && item.run?.praise && (
            <p className="t-capb card-foot">
              <Said said={item.run.praise} />
            </p>
          )}
          {item.memo && item.state === 'todo' && (
            <div className="row card-foot" style={{ justifyContent: 'space-between' }}>
              <span className="t-cap">{item.memo.declined ? '코인 제안은 거절됐어요' : '코인 없는 메모'}</span>
              <button type="button" className="link" disabled={busy} onClick={() => void run(() => backend.deleteProposal(family.id, item.memo!.id), '지웠어요.')}>
                지우기
              </button>
            </div>
          )}
        </article>
      ))}

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
    </>
  );
}
