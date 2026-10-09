// 알림 서버가 보낼 알림을 정하는 규칙. 저장소의 문서가 바뀌기 전과 후를 보고 누구에게 무엇을 보낼지 돌려준다.
// 서버(functions)와 자동 검사가 함께 쓰므로 Firebase 와 상관없는 순수한 계산만 둔다.
import { saidPlain } from './stickers';
import { clip, type PushMessage, type PushType } from './push';

/** Firestore 문서의 내용(서버에서 그대로 받은 값) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = Record<string, any>;

export interface Notice {
  /** 받을 사람: 'parents' 는 가족의 부모 모두 */
  to: 'parents' | string[];
  type: PushType;
  msg: PushMessage;
}

const coins = (n: unknown) => `${Number(n) || 0}코인`;

/** 퀘스트 완료 요청, 승인, 반려 */
export function runNotices(rid: string, before: Doc | undefined, after: Doc | undefined, kidName: string): Notice[] {
  if (!after) return [];
  const title = String(after.questTitle ?? '퀘스트');
  const tag = `run-${rid}`;
  if (after.status === 'submitted' && before?.status !== 'submitted') {
    return [{ to: 'parents', type: 'approval', msg: { title: '완료 요청', body: clip(`${kidName}: ${title} (+${coins(after.reward)})`), url: '#/home', tag } }];
  }
  if (after.status === 'approved' && before?.status !== 'approved') {
    const praise = after.praise ? ` "${saidPlain(String(after.praise))}"` : '';
    return [{ to: [after.assigneeUid], type: 'result', msg: { title: `+${coins(after.reward)}!`, body: clip(`${title} 승인됐어요.${praise}`), url: '#/home', tag } }];
  }
  if (after.status === 'rejected' && before?.status !== 'rejected') {
    const reason = after.rejectReason ? ` · ${saidPlain(String(after.rejectReason))}` : '';
    return [{ to: [after.assigneeUid], type: 'result', msg: { title: '다시 해 볼까요?', body: clip(`${title}${reason}`), url: '#/quests', tag } }];
  }
  return [];
}

/** 부모가 새 퀘스트를 주었을 때(자녀가 스스로 만든 퀘스트는 알리지 않는다) */
export function questNotices(qid: string, quest: Doc | undefined): Notice[] {
  if (!quest || !quest.assigneeUid || quest.createdBy === quest.assigneeUid) return [];
  return [{ to: [quest.assigneeUid], type: 'quest', msg: { title: '새 퀘스트', body: clip(`${quest.title} (+${coins(quest.reward)})`), url: '#/quests', tag: `quest-${qid}` } }];
}

/** 코인 협상: 새 제안이 오면 받을 차례인 쪽에 알린다. */
export function proposalNotices(pid: string, before: Doc | undefined, after: Doc | undefined, ownerName: string): Notice[] {
  if (!after || after.status !== 'negotiating') return [];
  if (before && before.status === 'negotiating' && before.offerCount === after.offerCount) return [];
  const tag = `offer-${pid}`;
  if (after.lastRole === 'child') {
    return [{ to: 'parents', type: 'offer', msg: { title: '코인 제안', body: clip(`${ownerName}: ${after.title} ${coins(after.lastAmount)}`), url: '#/home', tag } }];
  }
  return [{ to: [after.ownerUid], type: 'offer', msg: { title: '부모님의 제안', body: clip(`${after.title}: ${coins(after.lastAmount)} 어때요?`), url: '#/quests', tag } }];
}

/** 보상 신청, 승인, 거절 */
export function orderNotices(oid: string, before: Doc | undefined, after: Doc | undefined, buyerName: string): Notice[] {
  if (!after) return [];
  const tag = `order-${oid}`;
  if (!before && after.status === 'requested') {
    return [{ to: 'parents', type: 'shop', msg: { title: '보상 신청', body: clip(`${buyerName}: ${after.rewardTitle} (${coins(after.price)})`), url: '#/home', tag } }];
  }
  if (before?.status === 'requested' && after.status === 'approved') {
    return [{ to: [after.uid], type: 'shop', msg: { title: '보상 획득!', body: clip(`${after.rewardTitle} · 인벤토리에 들어갔어요`), url: '#/inventory', tag } }];
  }
  if (before?.status === 'requested' && after.status === 'rejected') {
    const reason = after.rejectReason ? ` "${saidPlain(String(after.rejectReason))}"` : '';
    return [{ to: [after.uid], type: 'shop', msg: { title: '보상 신청', body: clip(`${after.rewardTitle}: 이번에는 안 된대요.${reason}`), url: '#/shop', tag } }];
  }
  // 앱 안 상품(이모티콘, 꾸미기)은 허락 없이 바로 쓰고, 썼다는 것만 부모에게 알린다.
  // 부모 앞에서 쓰는 현실 보상은 알리지 않는다.
  if (before?.status === 'approved' && after.status === 'delivered' && after.useMode === 'instant') {
    return [{ to: 'parents', type: 'shop', msg: { title: '보상 사용', body: clip(`${buyerName}이(가) ${after.rewardTitle}을(를) 썼어요`), url: '#/home', tag } }];
  }
  return [];
}

/** 자녀의 보상 제안과 가격 협상 */
export function wishNotices(wid: string, before: Doc | undefined, after: Doc | undefined, ownerName: string): Notice[] {
  if (!after) return [];
  const tag = `wish-${wid}`;
  if (after.status === 'negotiating' && (!before || before.offerCount !== after.offerCount)) {
    if (after.lastRole === 'child') {
      return [{ to: 'parents', type: 'shop', msg: { title: '보상 제안', body: clip(`${ownerName}: ${after.title} ${coins(after.lastPrice)}`), url: '#/home', tag } }];
    }
    return [{ to: [after.ownerUid], type: 'offer', msg: { title: '가격 협상', body: clip(`${after.title}: ${coins(after.lastPrice)} 어때요?`), url: '#/shop', tag } }];
  }
  if (before?.status === 'negotiating' && after.status === 'agreed') {
    // 부모가 수락했으면 자녀에게, 자녀가 수락했으면 부모에게 알린다.
    if (before.lastRole === 'child') {
      return [{ to: [after.ownerUid], type: 'shop', msg: { title: '상점에 올라갔어요', body: clip(`${after.title} ${coins(after.lastPrice)}`), url: '#/shop', tag } }];
    }
    return [{ to: 'parents', type: 'shop', msg: { title: '보상 제안 합의', body: clip(`${ownerName}: ${after.title}을(를) ${coins(after.lastPrice)}에 올렸어요`), url: '#/home', tag } }];
  }
  if (before?.status === 'negotiating' && after.status === 'declined') {
    const note = after.declineNote ? ` "${after.declineNote}"` : '';
    return [{ to: [after.ownerUid], type: 'shop', msg: { title: '보상 제안', body: clip(`${after.title}: 이번에는 안 된대요.${note}`), url: '#/shop', tag } }];
  }
  return [];
}

/** 가족 메모: 받는 사람(쓴 사람 제외)에게 */
export function noteNotices(nid: string, note: Doc | undefined, authorName: string, memberUids: string[]): Notice[] {
  if (!note) return [];
  const targets: string[] = Array.isArray(note.toUids) && note.toUids.length > 0 ? note.toUids : memberUids;
  const to = targets.filter((uid) => uid !== note.createdBy && memberUids.includes(uid));
  if (to.length === 0) return [];
  return [{ to, type: 'note', msg: { title: `${authorName}의 메모`, body: clip(String(note.text ?? ''), 80), url: '#/home', tag: `note-${nid}` } }];
}

/** 칭찬 코인(퀘스트와 상관없이 부모가 바로 준 코인) */
export function ledgerNotices(lid: string, entry: Doc | undefined, buyerName = '자녀'): Notice[] {
  // 앱 안 상품(스티커)은 승인 없이 사므로, 샀다는 것을 부모에게 알린다.
  if (entry?.type === 'sticker') {
    const what = String(entry.memo ?? '스티커').replace(/^스티커: /, '');
    return [{ to: 'parents', type: 'shop', msg: { title: '스티커 구매', body: clip(`${buyerName}이(가) ${what}을(를) 샀어요 (${-Number(entry.amount)}코인)`), url: '#/home', tag: `sticker-${lid}` } }];
  }
  if (!entry || entry.type !== 'gift' || !(Number(entry.amount) > 0)) return [];
  return [{ to: [entry.uid], type: 'result', msg: { title: `칭찬 코인 +${entry.amount}`, body: clip(entry.note ? `"${saidPlain(String(entry.note))}"` : String(entry.memo ?? '칭찬 코인')), url: '#/home', tag: `gift-${lid}` } }];
}

/** 저녁 알림: 아직 안 한 "꼭" 할 일의 이름들 */
export function remindMessage(titles: string[]): PushMessage | null {
  if (titles.length === 0) return null;
  const body = titles.length === 1 ? titles[0] : `${titles[0]} 외 ${titles.length - 1}개`;
  return { title: '아직 안 한 꼭 할 일', body: clip(body), url: '#/quests', tag: 'remind' };
}

/** 아침 알림: 오늘 일정 한 줄 */
export function morningMessage(line: string | null): PushMessage | null {
  if (!line) return null;
  return { title: '오늘 일정', body: clip(line), url: '#/calendar', tag: 'morning' };
}
