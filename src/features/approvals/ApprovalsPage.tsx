import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Member, Order, Proposal, Run } from '../../backend/types';
import { canCounter } from '../../domain/proposals';
import { buildBoard, relativeDay, todayProgress } from '../../domain/quests';
import { MAX_PRAISE_LENGTH, MAX_REWARD } from '../../domain/settings';
import { planStreak } from '../../domain/streak';
import { formatWhen } from '../../lib/dates';
import type { IconName } from '../../lib/sprites';
import { CoinInput, parseCoins } from '../../ui/CoinInput';
import { Avatar, AvatarFrame, Icon } from '../../ui/Sprite';
import { SwipePages, type SwipePage } from '../../ui/SwipePages';
import { Button, CoinInline, Empty, Field, FieldGroup, Sheet } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { OfferSheet } from '../negotiation/OfferSheet';
import { KidStatus } from './KidStatus';

const QUICK_REASONS = ['조금만 더 해 보자', '다시 확인해 줘', '끝까지 해 보자'];

/**
 * 부모의 첫 화면: 완료 요청과 코인 제안에 답한다. 부모 중 한 명만 답하면 된다.
 * 왼쪽으로 밀면(또는 위의 버튼을 누르면) 자녀별 현황이 나온다.
 */
export function ApprovalsPage() {
  const backend = useBackend();
  const { me, family, members, kids } = useSession();
  const { pending, offersForParent, ordersForParent, orders, proposals, quests, runs, today, loading } = useFamilyData();
  const { busy, run } = useAction();
  const [approveTarget, setApproveTarget] = useState<Run | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Run | null>(null);
  const [reason, setReason] = useState('');
  const [counterTarget, setCounterTarget] = useState<Proposal | null>(null);
  /** 칭찬 코인을 받을 자녀. null 이면 창이 닫혀 있다. */
  const [giftKidUid, setGiftKidUid] = useState<string | null>(null);
  /** 0 = 승인, 1부터는 자녀 현황 */
  const [page, setPage] = useState(0);
  const [orderRejectTarget, setOrderRejectTarget] = useState<Order | null>(null);

  const settings = family.settings;
  const memberById = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);
  const nameOf = (uid: string) => memberById.get(uid)?.displayName ?? '알 수 없음';
  const waitingOnKid = proposals.filter((p) => p.status === 'negotiating' && p.lastRole === 'parent');
  const waitingCount = pending.length + offersForParent.length + ordersForParent.length;
  // 승인했지만 아직 주지 않은 보상
  const toGive = orders.filter((o) => o.status === 'approved').sort((a, b) => (a.decidedAt ?? 0) - (b.decidedAt ?? 0));

  /** 이 승인으로 연속 달성이 이어지는지 미리 계산한다. */
  const streakFor = (target: Run) => {
    const member = memberById.get(target.assigneeUid);
    return member ? planStreak(quests, runs, member, target, settings) : null;
  };

  function approve(target: Run, praise: string) {
    setApproveTarget(null);
    void run(
      () => backend.approveRun(family.id, target.id, me.uid, { praise, streak: streakFor(target) }),
      `승인했어요. ${nameOf(target.assigneeUid)} +${target.reward} 코인`,
    );
  }

  function reject() {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setRejectTarget(null);
    void run(() => backend.rejectRun(family.id, target.id, me.uid, reason), '다시 해 보라고 알렸어요.');
  }

  const upcomingBonus = approveTarget ? streakFor(approveTarget) : null;

  const approvals = (
    <div className="stack" style={{ gap: 22 }}>
      <section className="px member-strip" aria-label="가족">
        {members.map((member) => (
          <MemberChip
            key={member.uid}
            member={member}
            summary={member.role === 'child' ? summaryOf(buildBoard(quests, runs, proposals, member.uid, today)) : null}
            onOpen={member.role === 'child' ? () => setPage(kids.findIndex((kid) => kid.uid === member.uid) + 1) : undefined}
          />
        ))}
      </section>

      {kids.length > 0 && (
        <Button tone="mint" big block onClick={() => setGiftKidUid(kids[0].uid)}>
          칭찬 코인 주기
        </Button>
      )}

      {(offersForParent.length > 0 || waitingOnKid.length > 0) && (
        <section className="stack" aria-label="코인 제안">
          <h2 className="t-title">코인 제안</h2>
          {offersForParent.map((proposal) => {
            const owner = memberById.get(proposal.ownerUid);
            const amount = proposal.lastAmount ?? 0;
            const lastNote = proposal.offers[proposal.offers.length - 1]?.note ?? '';
            return (
              <article key={proposal.id} className="card">
                <div className="card-row">
                  {owner ? <Avatar avatar={owner.avatar} size={36} /> : <Icon name="coin" size={36} />}
                  <div className="card-main">
                    <h3 className="t-body item-title">{proposal.title}</h3>
                    <p className="t-cap">
                      {nameOf(proposal.ownerUid)} · {relativeDay(proposal.date, today)} 할 일 · 제안 {proposal.offerCount}/
                      {settings.maxRounds}번째
                    </p>
                  </div>
                  <CoinInline amount={amount} />
                </div>
                {lastNote && <p className="t-capb card-foot">"{lastNote}"</p>}
                <div className="stack" style={{ gap: 10, marginTop: 14 }}>
                  <Button
                    tone="mint"
                    block
                    disabled={busy}
                    onClick={() =>
                      void run(() => backend.acceptProposal(family.id, proposal.id, me.uid), '수락했어요. 퀘스트로 등록됐어요.')
                    }
                  >
                    {amount}코인으로 수락
                  </Button>
                  <div className="segmented">
                    <Button
                      tone="plain"
                      disabled={busy}
                      onClick={() =>
                        void run(() => backend.declineProposal(family.id, proposal.id, me.uid), '거절했어요. 코인 없는 메모로 남아요.')
                      }
                    >
                      거절
                    </Button>
                    {canCounter(proposal, settings) && (
                      <Button disabled={busy} onClick={() => setCounterTarget(proposal)}>
                        다른 금액 제안
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {waitingOnKid.map((proposal) => (
            <article key={proposal.id} className="card card-row">
              <Icon name="clock" size={36} />
              <div className="card-main">
                <h3 className="t-body item-title">{proposal.title}</h3>
                <p className="t-cap">{nameOf(proposal.ownerUid)}의 답을 기다리는 중</p>
              </div>
              <CoinInline amount={proposal.lastAmount ?? 0} />
            </article>
          ))}
        </section>
      )}

      {ordersForParent.length > 0 && (
        <section className="stack" aria-label="보상 신청">
          <h2 className="t-title">보상 신청</h2>
          {ordersForParent.map((order) => {
            const buyer = memberById.get(order.uid);
            const short = (buyer?.coins ?? 0) < order.price;
            return (
              <article key={order.id} className="card">
                <div className="card-row">
                  <Icon name={order.icon as IconName} size={36} />
                  <div className="card-main">
                    <h3 className="t-body item-title">{order.rewardTitle}</h3>
                    <p className="t-cap">
                      {nameOf(order.uid)} · {formatWhen(order.requestedAt, today)} 신청
                    </p>
                    {short && <p className="t-capb">코인이 모자라요 (지금 {buyer?.coins ?? 0}코인)</p>}
                  </div>
                  <CoinInline amount={order.price} />
                </div>
                <div className="segmented" style={{ marginTop: 14 }}>
                  <Button
                    tone="plain"
                    disabled={busy}
                    onClick={() => {
                      setReason('');
                      setOrderRejectTarget(order);
                    }}
                  >
                    거절
                  </Button>
                  <Button
                    tone="mint"
                    disabled={busy || short}
                    onClick={() =>
                      void run(
                        () => backend.approveOrder(family.id, order.id, me.uid),
                        `승인했어요. ${nameOf(order.uid)} -${order.price} 코인`,
                      )
                    }
                  >
                    승인하고 코인 빼기
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {toGive.length > 0 && (
        <section className="stack" aria-label="줄 보상">
          <h2 className="t-title">줄 보상</h2>
          {toGive.map((order) => (
            <article key={order.id} className="card is-done card-row">
              <Icon name={order.icon as IconName} size={36} />
              <div className="card-main">
                <h3 className="t-body item-title">{order.rewardTitle}</h3>
                <p className="t-cap">{nameOf(order.uid)} · 승인함, 아직 안 줌</p>
              </div>
              <Button
                tone="plain"
                disabled={busy}
                aria-label={`${order.rewardTitle} 줬어요`}
                onClick={() => void run(() => backend.deliverOrder(family.id, order.id, me.uid), '보상을 준 것으로 표시했어요.')}
              >
                줬어요
              </Button>
            </article>
          ))}
        </section>
      )}

      <section className="stack" aria-label="승인 대기">
        <h2 className="t-title">승인 대기</h2>
        {!loading && pending.length === 0 && (
          <Empty icon={<Icon name="check_inbox" size={48} />} title="기다리는 퀘스트가 없어요" hint="완료 요청이 오면 여기에 나타나요." />
        )}
        {pending.map((item) => {
          const member = memberById.get(item.assigneeUid);
          return (
            <article key={item.id} className="card">
              <div className="card-row">
                {member ? <Avatar avatar={member.avatar} size={36} /> : <Icon name="quest" size={36} />}
                <div className="card-main">
                  <h3 className="t-body item-title">{item.questTitle}</h3>
                  <p className="t-cap">
                    {nameOf(item.assigneeUid)} · {formatWhen(item.submittedAt, today)} 완료 요청
                  </p>
                  {item.late && <p className="t-capb">{relativeDay(item.dateKey, today)} 못 한 일 · 늦어서 절반</p>}
                </div>
                <CoinInline amount={item.reward} sign />
              </div>
              <div className="segmented" style={{ marginTop: 14 }}>
                <Button
                  tone="plain"
                  disabled={busy}
                  onClick={() => {
                    setReason('');
                    setRejectTarget(item);
                  }}
                >
                  다시 하기
                </Button>
                <Button tone="mint" disabled={busy} onClick={() => setApproveTarget(item)}>
                  승인하고 코인 주기
                </Button>
              </div>
            </article>
          );
        })}
      </section>

      <Link className="btn big block" to="/quests/new">
        + 새 퀘스트 만들기
      </Link>
    </div>
  );

  const pages: SwipePage[] = [
    {
      id: 'approve',
      label: '승인',
      tab: waitingCount > 0 ? `승인 ${waitingCount}` : '승인',
      content: approvals,
    },
    ...kids.map((kid) => ({
      id: kid.uid,
      label: `${kid.displayName} 현황`,
      tab: (
        <>
          <Avatar avatar={kid.avatar} size={24} />
          <span className="pager-name">{kid.displayName}</span>
        </>
      ),
      content: <KidStatus kid={kid} onGift={() => setGiftKidUid(kid.uid)} />,
    })),
  ];

  return (
    <main className="screen">
      <header className="screen-head">
        <AvatarFrame avatar={me.avatar} size={64} background="var(--coin-bg)" />
        <div className="grow">
          <h1 className="t-title">{me.displayName}</h1>
          <p className="t-cap">{waitingCount > 0 ? `답을 기다리는 일 ${waitingCount}개` : '답할 일이 없어요'}</p>
        </div>
      </header>

      {kids.length > 0 ? (
        <SwipePages
          label="승인과 자녀 현황"
          pages={pages}
          index={page}
          onChange={setPage}
          hint="옆으로 밀거나 위의 버튼을 누르면 자녀 현황을 볼 수 있어요."
        />
      ) : (
        approvals
      )}

      {approveTarget && (
        <Sheet title="승인하고 한마디" onClose={() => setApproveTarget(null)}>
          <p className="t-body">
            "{approveTarget.questTitle}" · {nameOf(approveTarget.assigneeUid)}에게 {approveTarget.reward}코인을 줘요.
          </p>
          {upcomingBonus && upcomingBonus.bonus > 0 && (
            <p className="px note t-capb" style={{ lineHeight: '18px' }}>
              이번 승인으로 {upcomingBonus.count}일 연속 달성! 보너스 {upcomingBonus.bonus}코인도 함께 줘요.
            </p>
          )}
          <div className="stack" style={{ gap: 10 }}>
            {settings.praises.map((praise) => (
              <Button key={praise} tone="mint" block onClick={() => approve(approveTarget, praise)}>
                {praise}
              </Button>
            ))}
          </div>
          <Button tone="plain" big block onClick={() => approve(approveTarget, '')}>
            한마디 없이 승인
          </Button>
          <p className="t-cap center">한마디는 더보기의 가족 설정에서 바꿀 수 있어요.</p>
        </Sheet>
      )}

      {rejectTarget && (
        <Sheet title="다시 하기로 돌려보내기" onClose={() => setRejectTarget(null)}>
          <p className="t-body">"{rejectTarget.questTitle}" 퀘스트를 다시 하도록 알려요. 코인은 주지 않아요.</p>
          <div className="chips">
            {QUICK_REASONS.map((text) => (
              <button key={text} type="button" className="chip" aria-pressed={reason === text} onClick={() => setReason(text)}>
                {text}
              </button>
            ))}
          </div>
          <Field label="한마디 (안 적어도 돼요)">
            {(id) => (
              <input id={id} className="input" type="text" value={reason} maxLength={60} onChange={(event) => setReason(event.target.value)} />
            )}
          </Field>
          <Button big block onClick={reject}>
            다시 하기로 알리기
          </Button>
          <Button tone="plain" big block onClick={() => setRejectTarget(null)}>
            닫기
          </Button>
        </Sheet>
      )}

      {orderRejectTarget && (
        <Sheet title="보상 신청 거절" onClose={() => setOrderRejectTarget(null)}>
          <p className="t-body">"{orderRejectTarget.rewardTitle}" 신청을 거절해요. 코인은 빠지지 않아요.</p>
          <Field label="한마디 (안 적어도 돼요)">
            {(id) => (
              <input id={id} className="input" type="text" value={reason} maxLength={60} placeholder="예: 숙제 먼저 하고 하자" onChange={(event) => setReason(event.target.value)} />
            )}
          </Field>
          <Button
            big
            block
            onClick={() => {
              const target = orderRejectTarget;
              setOrderRejectTarget(null);
              void run(() => backend.rejectOrder(family.id, target.id, me.uid, reason), '거절했어요. 코인은 그대로예요.');
            }}
          >
            거절하기
          </Button>
          <Button tone="plain" big block onClick={() => setOrderRejectTarget(null)}>
            닫기
          </Button>
        </Sheet>
      )}

      {counterTarget && (
        <OfferSheet
          title="다른 금액 제안"
          hint={`"${counterTarget.title}"에 대한 ${nameOf(counterTarget.ownerUid)}의 제안은 ${counterTarget.lastAmount}코인이에요. 줄 수 있는 금액을 적어 주세요.`}
          initial={Math.max(1, Math.floor((counterTarget.lastAmount ?? 10) / 2))}
          presets={[5, 10, 15, 20, 30]}
          max={MAX_REWARD}
          submitLabel="이 금액으로 제안하기"
          busy={busy}
          onClose={() => setCounterTarget(null)}
          onSubmit={(value, note) =>
            void run(
              () => backend.counterProposal(family.id, counterTarget.id, value, note, me.uid),
              '다른 금액을 제안했어요.',
            ).then((ok) => ok && setCounterTarget(null))
          }
        />
      )}

      {giftKidUid !== null && (
        <GiftSheet
          kids={kids}
          initialKidUid={giftKidUid}
          praises={settings.praises}
          busy={busy}
          onClose={() => setGiftKidUid(null)}
          onGive={(kid, amount, note) =>
            void run(
              () => backend.giveCoins(family.id, kid.uid, amount, note, me.uid),
              `${kid.displayName}에게 칭찬 코인 ${amount}개를 줬어요.`,
            ).then((ok) => ok && setGiftKidUid(null))
          }
        />
      )}
    </main>
  );
}

function summaryOf(board: ReturnType<typeof buildBoard>): string[] {
  const progress = todayProgress(board);
  const lines = [progress.total === 0 ? '오늘 없음' : `오늘 ${progress.done}/${progress.total}`];
  // 이미 완료를 알리고 확인을 기다리는 것은 빼고 센다.
  const open = board.missed.filter((item) => item.state === 'todo' || item.state === 'rejected').length;
  if (open > 0) lines.push(`놓친 일 ${open}`);
  return lines;
}

function MemberChip({ member, summary, onOpen }: { member: Member; summary: string[] | null; onOpen?: () => void }) {
  // 자녀는 누르면 그 자녀의 현황으로 넘어간다.
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag
      className="member-chip"
      {...(onOpen ? { type: 'button' as const, onClick: onOpen, 'aria-label': `${member.displayName} 현황 보기` } : {})}
    >
      <Avatar avatar={member.avatar} size={48} />
      <span className="t-cap name">{member.displayName}</span>
      {summary ? (
        <>
          <CoinInline amount={member.coins} />
          {summary.map((line) => (
            <span key={line} className="t-cap">
              {line}
            </span>
          ))}
        </>
      ) : (
        <span className="t-cap">부모</span>
      )}
    </Tag>
  );
}

interface GiftProps {
  kids: Member[];
  /** 처음에 골라 둘 자녀 */
  initialKidUid: string;
  praises: string[];
  busy: boolean;
  onGive: (kid: Member, amount: number, note: string) => void;
  onClose: () => void;
}

/** 칭찬 코인: 퀘스트와 상관없이 한마디와 함께 코인을 바로 준다. */
function GiftSheet({ kids, initialKidUid, praises, busy, onGive, onClose }: GiftProps) {
  const [kidUid, setKidUid] = useState(kids.some((k) => k.uid === initialKidUid) ? initialKidUid : (kids[0]?.uid ?? ''));
  const [amount, setAmount] = useState('5');
  const [note, setNote] = useState(praises[0] ?? '');
  const kid = kids.find((k) => k.uid === kidUid);

  return (
    <Sheet title="칭찬 코인 주기" onClose={onClose}>
      {kids.length > 1 && (
        <FieldGroup label="누구에게 줄까요?">
          <div className="chips">
            {kids.map((k) => (
              <button key={k.uid} type="button" role="radio" className="chip" aria-checked={kidUid === k.uid} onClick={() => setKidUid(k.uid)}>
                <Avatar avatar={k.avatar} size={24} />
                {k.displayName}
              </button>
            ))}
          </div>
        </FieldGroup>
      )}
      <Field label="코인">
        {(id) => <CoinInput id={id} value={amount} onChange={setAmount} presets={[5, 10, 20, 30]} min={1} max={MAX_REWARD} />}
      </Field>
      <Field label="한마디">
        {(id) => (
          <>
            <div className="chips">
              {praises.map((praise) => (
                <button key={praise} type="button" className="chip" aria-pressed={note === praise} onClick={() => setNote(praise)}>
                  {praise}
                </button>
              ))}
            </div>
            <input
              id={id}
              className="input"
              type="text"
              value={note}
              maxLength={MAX_PRAISE_LENGTH}
              onChange={(event) => setNote(event.target.value)}
            />
          </>
        )}
      </Field>
      <Button big block disabled={busy || !kid} onClick={() => kid && onGive(kid, parseCoins(amount), note)}>
        {kid ? `${kid.displayName}에게 코인 주기` : '코인 주기'}
      </Button>
      <Button tone="plain" big block onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  );
}
