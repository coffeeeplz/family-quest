import type { FamilySettings, Member, Quest, Run, StreakUpdate } from '../backend/types';
import { addDays } from '../lib/dates';
import { runId, scheduledOn } from './quests';

/**
 * 연속 달성: 그날의 반복 퀘스트를 모두 제때 끝낸 날이 이어진 횟수.
 * 반복 퀘스트가 하나도 없는 날은 건너뛴다(주말에 퀘스트가 없어도 끊기지 않는다).
 * 한 번짜리 퀘스트와 늦게 한 퀘스트는 세지 않는다.
 */

const MAX_GAP_DAYS = 14;

function scheduledQuests(quests: Quest[], uid: string, day: string): Quest[] {
  return quests.filter((q) => q.assigneeUid === uid && scheduledOn(q, day));
}

/** from 과 to 사이(양 끝 제외)에 반복 퀘스트가 있는 날이 하나도 없는가 */
function gapIsFree(quests: Quest[], uid: string, from: string, to: string): boolean {
  let day = addDays(from, 1);
  for (let i = 0; i < MAX_GAP_DAYS && day < to; i += 1) {
    if (scheduledQuests(quests, uid, day).length > 0) return false;
    day = addDays(day, 1);
  }
  return day >= to;
}

/** 이 승인으로 그날의 반복 퀘스트가 모두 끝나면 새 연속 기록과 보너스를 돌려준다. */
export function planStreak(
  quests: Quest[],
  runs: Run[],
  member: Member,
  approving: Run,
  settings: FamilySettings,
): StreakUpdate | null {
  if (approving.oneOff || approving.late) return null;
  const day = approving.dateKey;
  const required = scheduledQuests(quests, member.uid, day);
  if (required.length === 0) return null;

  const runById = new Map(runs.map((r) => [r.id, r]));
  const allDone = required.every((quest) => {
    const id = runId(quest.id, day);
    if (id === approving.id) return true;
    const run = runById.get(id);
    return run !== undefined && run.status === 'approved' && !run.late;
  });
  if (!allDone) return null;

  const previous = member.streak;
  if (previous && previous.lastDate >= day) return null; // 이미 센 날이거나 더 예전 날
  const continuing = previous !== null && gapIsFree(quests, member.uid, previous.lastDate, day);
  const count = continuing ? previous.count + 1 : 1;
  const bonus = settings.streakOn && count % settings.streakDays === 0 ? settings.streakBonus : 0;
  return { count, lastDate: day, bonus };
}

/** 지금 이어지고 있는 연속 일수. 끊겼으면 0. */
export function currentStreak(member: Member, quests: Quest[], today: string): number {
  const streak = member.streak;
  if (!streak) return 0;
  if (streak.lastDate >= today) return streak.count;
  // 오늘 할 일이 아직 남았더라도, 어제까지 빠진 날이 없으면 이어지는 중이다.
  return gapIsFree(quests, member.uid, streak.lastDate, today) ? streak.count : 0;
}
