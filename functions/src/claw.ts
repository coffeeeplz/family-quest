// 인형뽑기 서버 판정. 폰은 "판 시작"과 "버튼 누른 시각 두 개"만 보내고,
// 코인 차감, 하루 횟수, 잡았는지, 떨어뜨렸는지, 상자 내용물과 지급은 모두 여기서 정한다.
// 계산은 체험 모드와 같은 src/domain/claw.ts 를 그대로 쓴다.

import { REGION } from './options';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { ClawRound } from '../../src/backend/types';
import { cannotPractice, cannotStart, clawRewardOrder, makeRound, normalizeClaw, playsToday, practiceLeft, settleRound } from '../../src/domain/claw';
import { dateKey } from '../../src/lib/dates';

const db = () => getFirestore();
/** 아이 화면에 그대로 보여 줄 수 있는 안내(한국어 문장) */
const fail = (message: string) => new HttpsError('failed-precondition', message);

function args(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

function familyIdOf(data: Record<string, unknown>): string {
  const fid = data.familyId;
  if (typeof fid !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(fid)) throw fail('가족을 찾을 수 없어요.');
  return fid;
}

/** 새 판: 하루 횟수와 코인을 확인하고, 판값을 장부에 남긴 뒤 판 정보를 돌려준다. */
export const clawStart = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요해요.');
  const data = args(request.data);
  const fid = familyIdOf(data);
  const practice = data.practice === true;
  const layout = typeof data.layout === 'number' ? data.layout : undefined;
  const day = dateKey();
  const store = db();

  return store.runTransaction(async (tx) => {
    const familyRef = store.doc(`families/${fid}`);
    const memberRef = store.doc(`families/${fid}/members/${uid}`);
    const [family, member] = await Promise.all([tx.get(familyRef), tx.get(memberRef)]);
    if (!family.exists || !member.exists) throw fail('이 가족의 구성원이 아니에요.');
    const settings = normalizeClaw(family.get('settings')?.claw);
    const isParent = member.get('role') === 'parent';
    const [roundSnap, waitingSnap] = await Promise.all([
      tx.get(store.collection(`families/${fid}/clawRounds`).where('uid', '==', uid).where('day', '==', day)),
      tx.get(store.collection(`families/${fid}/orders`).where('uid', '==', uid).where('status', '==', 'requested')),
    ]);
    const rounds = roundSnap.docs.map((d) => d.data() as ClawRound);
    // 승인을 기다리는 보상 신청에 묶인 코인은 쓸 수 없다.
    const reserved = waitingSnap.docs.reduce((sum, d) => sum + (Number(d.get('price')) || 0), 0);
    const free = (Number(member.get('coins')) || 0) - reserved;
    const kidPractice = practice && !isParent;
    const blocked = kidPractice ? cannotPractice(settings, practiceLeft(settings, rounds, uid, day)) : cannotStart(settings, isParent, free, playsToday(rounds, uid, day));
    if (blocked) throw fail(blocked);

    const ref = store.collection(`families/${fid}/clawRounds`).doc();
    const now = Date.now();
    const round: ClawRound = { id: ref.id, uid, day, startedAt: now, ...makeRound(settings.tune, Math.random, layout), practice: isParent || kidPractice, status: 'playing' };
    tx.set(ref, round);
    if (!round.practice && settings.price > 0) {
      tx.set(store.doc(`families/${fid}/ledger/claw-${ref.id}`), { uid, amount: -settings.price, type: 'claw', refId: ref.id, memo: '인형뽑기', note: '', by: uid, at: now });
      tx.update(memberRef, { coins: FieldValue.increment(-settings.price) });
    }
    return round;
  });
});

/** 판 끝내기: 버튼 누른 시각으로 잡았는지 다시 계산하고, 상품을 정해 지급한다. 같은 판은 한 번만 끝난다. */
export const clawFinish = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', '로그인이 필요해요.');
  const data = args(request.data);
  const fid = familyIdOf(data);
  const roundId = data.roundId;
  if (typeof roundId !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(roundId)) throw fail('판을 찾을 수 없어요.');
  const store = db();

  return store.runTransaction(async (tx) => {
    const roundRef = store.doc(`families/${fid}/clawRounds/${roundId}`);
    const memberRef = store.doc(`families/${fid}/members/${uid}`);
    const [roundSnap, member, family, hiddenWardrobe, hiddenStickers] = await Promise.all([
      tx.get(roundRef),
      tx.get(memberRef),
      tx.get(store.doc(`families/${fid}`)),
      tx.get(store.collection(`families/${fid}/wardrobePrices`).where('hidden', '==', true)),
      tx.get(store.collection(`families/${fid}/stickerPrices`).where('hidden', '==', true)),
    ]);
    if (!roundSnap.exists || roundSnap.get('uid') !== uid || !member.exists || !family.exists) throw fail('판을 찾을 수 없어요.');
    const round = roundSnap.data() as ClawRound;
    if (round.status === 'done') return round;

    const settings = normalizeClaw(family.get('settings')?.claw);
    const owned = { wardrobe: (member.get('wardrobe') as string[] | undefined) ?? [], stickerPacks: (member.get('stickerPacks') as string[] | undefined) ?? [] };
    const hidden = { wardrobe: hiddenWardrobe.docs.map((d) => d.id), stickerPacks: hiddenStickers.docs.map((d) => d.id) };
    const done = settleRound(round, data.presses, Date.now(), settings, { isParent: member.get('role') === 'parent', owned, hidden }, Math.random);
    tx.set(roundRef, done);

    // 연습 판은 결과만 보여 주고 아무것도 주지 않는다.
    const win = done.prize;
    if (!round.practice && win) {
      const now = Date.now();
      if (win.kind === 'coin') {
        tx.set(store.doc(`families/${fid}/ledger/clawwin-${round.id}`), {
          uid,
          amount: win.amount,
          type: 'clawPrize',
          refId: round.id,
          memo: '인형뽑기 상품',
          note: '',
          by: uid,
          at: now,
        });
        tx.update(memberRef, { coins: FieldValue.increment(win.amount) });
      } else if (win.kind === 'wardrobe') {
        tx.update(memberRef, { wardrobe: FieldValue.arrayUnion(win.itemId) });
      } else if (win.kind === 'sticker') {
        tx.update(memberRef, { stickerPacks: FieldValue.arrayUnion(win.packId) });
      } else {
        const { id, ...order } = clawRewardOrder(win.orderId, win.title, uid, now, dateKey());
        tx.set(store.doc(`families/${fid}/orders/${id}`), order);
      }
    }
    return done;
  });
});
