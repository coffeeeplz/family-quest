import { describe, expect, it } from 'vitest';
import { DEFAULT_PUSH_PREFS, clip, dueNow, inQuietHours, normalizePushPrefs, seoulClock } from '../src/domain/push';
import {
  ledgerNotices,
  morningMessage,
  noteNotices,
  orderNotices,
  proposalNotices,
  questNotices,
  remindMessage,
  runNotices,
  wishNotices,
} from '../src/domain/pushMessages';

describe('알림 설정', () => {
  it('비었거나 틀린 값은 기본값으로 채운다', () => {
    expect(normalizePushPrefs(undefined)).toEqual(DEFAULT_PUSH_PREFS);
    const prefs = normalizePushPrefs({ types: { note: false, quest: 'yes' }, quietStart: '23:30', quietEnd: '25:00', remindAt: '19:00' });
    expect(prefs.types.note).toBe(false);
    expect(prefs.types.quest).toBe(true);
    expect(prefs.quietStart).toBe('23:30');
    expect(prefs.quietEnd).toBe('07:00');
    expect(prefs.remindAt).toBe('19:00');
    expect(prefs.morningAt).toBe('07:30');
  });

  it('조용한 시간: 밤을 넘기는 구간과 같은 시각', () => {
    expect(inQuietHours('23:00', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('06:59', '22:00', '07:00')).toBe(true);
    expect(inQuietHours('07:00', '22:00', '07:00')).toBe(false);
    expect(inQuietHours('12:00', '22:00', '07:00')).toBe(false);
    expect(inQuietHours('13:00', '12:00', '14:00')).toBe(true);
    expect(inQuietHours('03:00', '00:00', '00:00')).toBe(false); // 조용한 시간 없음
  });

  it('정해 둔 시각 알림은 하루 한 번, 늦어도 두 시간 안에만', () => {
    expect(dueNow('20:00', '20:00', undefined, '2026-10-09')).toBe(true);
    expect(dueNow('20:14', '20:00', '2026-10-08', '2026-10-09')).toBe(true);
    expect(dueNow('20:14', '20:00', '2026-10-09', '2026-10-09')).toBe(false); // 오늘 이미 보냄
    expect(dueNow('19:59', '20:00', undefined, '2026-10-09')).toBe(false);
    expect(dueNow('22:30', '20:00', undefined, '2026-10-09')).toBe(false);
  });

  it('서울 시각과 글자 줄이기', () => {
    expect(seoulClock(Date.UTC(2026, 9, 8, 15, 5))).toEqual({ day: '2026-10-09', time: '00:05' });
    expect(clip('가'.repeat(70), 10)).toBe(`${'가'.repeat(9)}…`);
  });
});

describe('보낼 알림 정하기', () => {
  it('완료 요청은 부모에게, 승인과 다시 하기는 자녀에게', () => {
    const base = { questTitle: '수학 문제집', reward: 10, assigneeUid: 'kid' };
    expect(runNotices('r1', undefined, { ...base, status: 'submitted' }, '딸')).toEqual([
      { to: 'parents', type: 'approval', msg: { title: '완료 요청', body: '딸: 수학 문제집 (+10코인)', url: '#/home', tag: 'run-r1' } },
    ]);
    const approved = runNotices('r1', { ...base, status: 'submitted' }, { ...base, status: 'approved', praise: '최고야!' }, '딸');
    expect(approved[0]).toMatchObject({ to: ['kid'], type: 'result', msg: { title: '+10코인!', body: '수학 문제집 승인됐어요. "최고야!"' } });
    expect(runNotices('r1', { ...base, status: 'submitted' }, { ...base, status: 'rejected', rejectReason: '다시 확인해 줘' }, '딸')[0].msg.body).toBe('수학 문제집 · 다시 확인해 줘');
    expect(runNotices('r1', { ...base, status: 'approved' }, { ...base, status: 'approved' }, '딸')).toEqual([]);
  });

  it('새 퀘스트는 부모가 줄 때만', () => {
    expect(questNotices('q1', { title: '산책', reward: 30, assigneeUid: 'kid', createdBy: 'dad' })[0]).toMatchObject({ to: ['kid'], type: 'quest' });
    expect(questNotices('q1', { title: '버튼으로 추가', reward: 5, assigneeUid: 'kid', createdBy: 'kid' })).toEqual([]);
  });

  it('협상은 답할 차례인 쪽에', () => {
    const p = { title: '창문 닦기', ownerUid: 'kid', status: 'negotiating' };
    expect(proposalNotices('p1', undefined, { ...p, lastRole: 'child', lastAmount: 30, offerCount: 1 }, '딸')[0]).toMatchObject({ to: 'parents', type: 'offer' });
    expect(proposalNotices('p1', { ...p, offerCount: 1 }, { ...p, lastRole: 'parent', lastAmount: 20, offerCount: 2 }, '딸')[0]).toMatchObject({ to: ['kid'], msg: { body: '창문 닦기: 20코인 어때요?' } });
    expect(proposalNotices('p1', { ...p, offerCount: 2 }, { ...p, lastRole: 'parent', offerCount: 2 }, '딸')).toEqual([]);
    expect(proposalNotices('p1', { ...p, offerCount: 2 }, { ...p, status: 'agreed', offerCount: 2 }, '딸')).toEqual([]);
  });

  it('보상 신청과 결과, 보상 제안', () => {
    const o = { rewardTitle: '게임 30분', price: 50, uid: 'kid' };
    expect(orderNotices('o1', undefined, { ...o, status: 'requested' }, '딸')[0]).toMatchObject({ to: 'parents', type: 'shop' });
    expect(orderNotices('o1', { ...o, status: 'requested' }, { ...o, status: 'approved' }, '딸')[0]).toMatchObject({ to: ['kid'], msg: { title: '보상 획득!' } });
    expect(orderNotices('o1', { ...o, status: 'approved' }, { ...o, status: 'delivered' }, '딸')).toEqual([]); // 현실 보상은 알리지 않음
    const used = orderNotices('o1', { ...o, status: 'approved', useMode: 'instant' }, { ...o, status: 'delivered', useMode: 'instant' }, '딸');
    expect(used).toHaveLength(1);
    expect(used[0]).toMatchObject({ to: 'parents', type: 'shop' });
    expect(used[0].msg.body).toContain('썼어요');
    const w = { title: '놀이공원', ownerUid: 'kid' };
    expect(wishNotices('w1', undefined, { ...w, status: 'negotiating', lastRole: 'child', lastPrice: 150, offerCount: 1 }, '딸')[0]).toMatchObject({ to: 'parents', type: 'shop' });
    expect(wishNotices('w1', { ...w, status: 'negotiating', offerCount: 1 }, { ...w, status: 'negotiating', lastRole: 'parent', lastPrice: 300, offerCount: 2 }, '딸')[0]).toMatchObject({ to: ['kid'], type: 'offer' });
    expect(wishNotices('w1', { ...w, status: 'negotiating', lastRole: 'child' }, { ...w, status: 'agreed', lastPrice: 150 }, '딸')[0]).toMatchObject({ to: ['kid'], msg: { title: '상점에 올라갔어요' } });
    expect(wishNotices('w1', { ...w, status: 'negotiating', lastRole: 'parent' }, { ...w, status: 'agreed', lastPrice: 300 }, '딸')[0]).toMatchObject({ to: 'parents' });
    expect(wishNotices('w1', { ...w, status: 'negotiating' }, { ...w, status: 'declined', declineNote: '나중에' }, '딸')[0].msg.body).toBe('놀이공원: 이번에는 안 된대요. "나중에"');
  });

  it('메모는 받는 사람에게(쓴 사람 제외), 칭찬 코인은 받은 자녀에게', () => {
    const all = ['dad', 'mom', 'kid'];
    expect(noteNotices('n1', { text: '전화해 줘', toUids: ['kid'], createdBy: 'mom' }, '엄마', all)[0]).toMatchObject({ to: ['kid'], type: 'note', msg: { title: '엄마의 메모' } });
    expect(noteNotices('n1', { text: '대청소', toUids: [], createdBy: 'dad' }, '아빠', all)[0].to).toEqual(['mom', 'kid']);
    expect(noteNotices('n1', { text: '혼잣말', toUids: ['dad'], createdBy: 'dad' }, '아빠', all)).toEqual([]);
    expect(ledgerNotices('l1', { type: 'gift', amount: 5, uid: 'kid', note: '고마워!' })[0]).toMatchObject({ to: ['kid'], msg: { title: '칭찬 코인 +5', body: '"고마워!"' } });
    expect(ledgerNotices('l1', { type: 'quest', amount: 10, uid: 'kid' })).toEqual([]);
    expect(ledgerNotices('l2', { type: 'sticker', amount: -100, uid: 'kid', memo: '스티커: 동물 팩' }, '딸')[0]).toMatchObject({ to: 'parents', type: 'shop', msg: { body: '딸이(가) 동물 팩을(를) 샀어요 (100코인)' } });
  });

  it('저녁과 아침 알림 문구', () => {
    expect(remindMessage([])).toBeNull();
    expect(remindMessage(['피아노 연습', '수학'])?.body).toBe('피아노 연습 외 1개');
    expect(morningMessage(null)).toBeNull();
    expect(morningMessage('오후 3:30 치과')).toMatchObject({ title: '오늘 일정', url: '#/calendar' });
  });
});
