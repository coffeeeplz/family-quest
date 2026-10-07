import { useState } from 'react';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { Proposal } from '../../backend/types';
import { canCounter, turnOf } from '../../domain/proposals';
import { relativeDay } from '../../domain/quests';
import { Icon } from '../../ui/Sprite';
import { Button, CoinInline } from '../../ui/kit';
import { useAction } from '../../ui/toast';
import { OfferSheet } from './OfferSheet';

/** 자녀 화면의 협상 카드: 내 제안의 진행 상황을 보고, 부모의 제안에 답한다. */
export function MyOfferCard({ proposal }: { proposal: Proposal }) {
  const backend = useBackend();
  const { family, me } = useSession();
  const { today } = useFamilyData();
  const { busy, run } = useAction();
  const [countering, setCountering] = useState(false);

  const settings = family.settings;
  const myTurn = turnOf(proposal) === 'child';
  const amount = proposal.lastAmount ?? 0;
  const lastNote = proposal.offers[proposal.offers.length - 1]?.note ?? '';

  return (
    <article className={myTurn ? 'card is-wait' : 'card'}>
      <div className="card-row">
        <Icon name="coin" size={36} />
        <div className="card-main">
          <h3 className="t-body" style={{ fontWeight: 400 }}>
            {proposal.title}
          </h3>
          <div className="meta t-cap">
            <span>{relativeDay(proposal.date, today)} 할 일</span>
            <span>
              제안 {proposal.offerCount}/{settings.maxRounds}번째
            </span>
          </div>
        </div>
        <CoinInline amount={amount} />
      </div>

      {myTurn ? (
        <>
          <p className="t-capb" style={{ marginTop: 12, lineHeight: '18px' }}>
            부모님이 {amount}코인을 제안했어요.{lastNote ? ` "${lastNote}"` : ''}
          </p>
          <div className="stack" style={{ gap: 10, marginTop: 12 }}>
            <Button
              tone="mint"
              block
              disabled={busy}
              onClick={() => void run(() => backend.acceptProposal(family.id, proposal.id, me.uid), '좋아요! 퀘스트가 됐어요.')}
            >
              좋아요, {amount}코인에 할게요
            </Button>
            <div className="segmented">
              <Button
                tone="plain"
                disabled={busy}
                onClick={() => void run(() => backend.declineProposal(family.id, proposal.id, me.uid), '코인 없이 메모로 남겼어요.')}
              >
                그만두기
              </Button>
              {canCounter(proposal, settings) && (
                <Button disabled={busy} onClick={() => setCountering(true)}>
                  다시 제안하기
                </Button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
          <p className="t-cap">부모님의 답을 기다리는 중이에요</p>
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => void run(() => backend.declineProposal(family.id, proposal.id, me.uid), '코인 없이 메모로 남겼어요.')}
          >
            제안 그만두기
          </button>
        </div>
      )}

      {countering && (
        <OfferSheet
          title="다시 제안하기"
          hint={`"${proposal.title}"에 받고 싶은 코인을 다시 적어요.`}
          initial={Math.min(amount + 5, settings.maxProposalCoins)}
          presets={[5, 10, 15, 20, 30]}
          max={settings.maxProposalCoins}
          submitLabel="이 금액으로 제안하기"
          busy={busy}
          onClose={() => setCountering(false)}
          onSubmit={(value, note) =>
            void run(() => backend.counterProposal(family.id, proposal.id, value, note, me.uid), '다시 제안했어요.').then(
              (ok) => ok && setCountering(false),
            )
          }
        />
      )}
    </article>
  );
}
