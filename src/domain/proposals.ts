import { AppError, type FamilySettings, type Proposal, type ProposalInput, type Role } from '../backend/types';
import { isDateKey } from '../lib/dates';
import { MAX_NOTE, MAX_TITLE } from './quests';
import { MAX_REWARD } from './settings';

export const MAX_OFFER_NOTE = 40;

/** 자녀가 직접 추가하는 할 일의 입력값을 검사한다. */
export function cleanProposalInput(input: ProposalInput, settings: FamilySettings, today: string): ProposalInput {
  const title = input.title.trim();
  const note = input.note.trim();
  if (!title) throw new AppError('할 일을 적어 주세요.');
  if (title.length > MAX_TITLE) throw new AppError(`할 일은 ${MAX_TITLE}자까지 쓸 수 있어요.`);
  if (note.length > MAX_NOTE) throw new AppError(`설명은 ${MAX_NOTE}자까지 쓸 수 있어요.`);
  if (!isDateKey(input.date)) throw new AppError('날짜를 골라 주세요.');
  if (input.date < today) throw new AppError('지난 날짜로는 추가할 수 없어요.');
  let amount: number | null = null;
  if (input.amount !== null) {
    amount = cleanOfferAmount(input.amount, 'child', settings);
  }
  return { title, note, date: input.date, important: input.important === true, amount };
}

/** 제안 금액 검사. 자녀는 설정의 상한까지만 제안할 수 있다. */
export function cleanOfferAmount(amount: number, role: Role, settings: FamilySettings): number {
  const cap = role === 'child' ? settings.maxProposalCoins : MAX_REWARD;
  if (!Number.isInteger(amount) || amount < 1) throw new AppError('코인은 1 이상의 숫자로 적어 주세요.');
  if (amount > cap) throw new AppError(`코인은 ${cap}까지 제안할 수 있어요.`);
  return amount;
}

/** 지금 답할 차례인 역할. 협상 중이 아니면 null. */
export function turnOf(proposal: Proposal): Role | null {
  if (proposal.status !== 'negotiating') return null;
  return proposal.lastRole === 'child' ? 'parent' : 'child';
}

/** 정해 둔 횟수 안에서만 다른 금액을 다시 제안할 수 있다. 다 쓰면 수락이나 거절만 남는다. */
export function canCounter(proposal: Proposal, settings: FamilySettings): boolean {
  return proposal.status === 'negotiating' && proposal.offerCount < settings.maxRounds;
}
