import { AppError, type PresetInput, type Proposal, type Quest, type QuestInput, type Repeat, type Run } from '../backend/types';
import { WEEKDAYS, addDays, dateKey, formatDay, isDateKey, parseDateKey, weekdayOf } from '../lib/dates';
import { MAX_REWARD, MISSED_DAYS, halfReward } from './settings';

export const MAX_TITLE = 40;
export const MAX_NOTE = 120;
export { MAX_REWARD };

export function isRepeating(quest: Quest): boolean {
  return quest.repeat.type !== 'none';
}

/** 퀘스트가 만들어진 날 */
export function createdDay(quest: Quest): string {
  return dateKey(new Date(quest.createdAt));
}

/** 반복 퀘스트가 그날 하기로 되어 있었는가(만들어지기 전 날짜는 제외) */
export function scheduledOn(quest: Quest, day: string): boolean {
  if (!quest.active || createdDay(quest) > day) return false;
  switch (quest.repeat.type) {
    case 'daily':
      return true;
    case 'weekly':
      return quest.repeat.days.includes(weekdayOf(day));
    case 'none':
      return false;
  }
}

/** 수행 기록 id. 반복 퀘스트는 날짜마다, 한 번짜리는 기한 날짜로 하나만 생긴다. */
export function runId(questId: string, day: string): string {
  return `${questId}_${day}`;
}

export function repeatLabel(repeat: Repeat, today: string): string {
  switch (repeat.type) {
    case 'daily':
      return '매일';
    case 'weekly': {
      if (repeat.days.length === 7) return '매일';
      const days = [...repeat.days].sort((a, b) => a - b).map((d) => WEEKDAYS[d]);
      return `매주 ${days.join('·')}`;
    }
    case 'none':
      return dueLabel(repeat.date, today);
  }
}

/** 오늘을 기준으로 한 날짜 이름: 그저께, 어제, 오늘, 내일, 모레, 그 밖에는 날짜 */
export function relativeDay(day: string, today: string): string {
  const names: Record<string, string> = {
    [addDays(today, -2)]: '그저께',
    [addDays(today, -1)]: '어제',
    [today]: '오늘',
    [addDays(today, 1)]: '내일',
    [addDays(today, 2)]: '모레',
  };
  return names[day] ?? formatDay(day);
}

function dueLabel(date: string, today: string): string {
  if (date === today) return '오늘까지';
  if (date < today) return `기한 지남 (${relativeDay(date, today)}까지)`;
  return `${relativeDay(date, today)}까지`;
}

/** 입력값을 다듬고 검사한다. 문제가 있으면 AppError. */
export function cleanQuestInput(input: QuestInput): QuestInput {
  const title = input.title.trim();
  const note = input.note.trim();
  if (!title) throw new AppError('퀘스트 이름을 적어 주세요.');
  if (title.length > MAX_TITLE) throw new AppError(`퀘스트 이름은 ${MAX_TITLE}자까지 쓸 수 있어요.`);
  if (note.length > MAX_NOTE) throw new AppError(`설명은 ${MAX_NOTE}자까지 쓸 수 있어요.`);
  if (!input.assigneeUid) throw new AppError('퀘스트를 받을 사람을 골라 주세요.');
  if (!Number.isInteger(input.reward) || input.reward < 0 || input.reward > MAX_REWARD) {
    throw new AppError(`코인은 0부터 ${MAX_REWARD} 사이의 숫자로 적어 주세요.`);
  }
  let repeat: Repeat;
  switch (input.repeat.type) {
    case 'daily':
      repeat = { type: 'daily' };
      break;
    case 'weekly': {
      const days = [...new Set(input.repeat.days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
      if (days.length === 0) throw new AppError('반복할 요일을 하나 이상 골라 주세요.');
      repeat = { type: 'weekly', days };
      break;
    }
    case 'none':
      if (!isDateKey(input.repeat.date)) throw new AppError('기한 날짜를 골라 주세요.');
      repeat = { type: 'none', date: input.repeat.date };
      break;
  }
  return { title, note, assigneeUid: input.assigneeUid, reward: input.reward, repeat, important: input.important === true };
}

export function cleanPresetInput(input: PresetInput): PresetInput {
  const title = input.title.trim();
  if (!title) throw new AppError('버튼에 넣을 퀘스트 이름을 적어 주세요.');
  if (title.length > MAX_TITLE) throw new AppError(`퀘스트 이름은 ${MAX_TITLE}자까지 쓸 수 있어요.`);
  if (!Number.isInteger(input.reward) || input.reward < 0 || input.reward > MAX_REWARD) {
    throw new AppError(`코인은 0부터 ${MAX_REWARD} 사이의 숫자로 적어 주세요.`);
  }
  return { title, reward: input.reward, childCanAdd: input.childCanAdd === true };
}

export type ItemState = 'todo' | 'submitted' | 'approved' | 'rejected';

/** 자녀 홈의 한 줄. 퀘스트이거나, 자녀가 직접 적은 메모다. */
export interface BoardItem {
  key: string;
  kind: 'quest' | 'memo';
  title: string;
  note: string;
  important: boolean;
  /** 반복 주기나 기한 */
  label: string;
  /** 정렬에 쓰는 날짜 */
  day: string;
  state: ItemState;
  // 퀘스트일 때
  quest: Quest | null;
  run: Run | null;
  /** 완료를 알릴 때 쓸 날짜 */
  runDay: string;
  reward: number;
  /** 놓친 날의 반복 퀘스트(절반 지급) */
  late: boolean;
  /** 다가오는 반복 퀘스트처럼 아직 할 수 없는 일은 false */
  canAct: boolean;
  // 메모일 때
  memo: Proposal | null;
}

export interface Board {
  missed: BoardItem[];
  today: BoardItem[];
  upcoming: BoardItem[];
}

const STATE_ORDER: Record<ItemState, number> = { rejected: 0, todo: 1, submitted: 2, approved: 3 };

function sortItems(items: BoardItem[]): BoardItem[] {
  return items.sort(
    (a, b) =>
      Number(b.important) - Number(a.important) ||
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      a.day.localeCompare(b.day) ||
      a.title.localeCompare(b.title, 'ko'),
  );
}

/** 한 사람의 홈 화면을 '놓친 일 / 오늘 할 일 / 다가오는 일'로 나눈다. */
export function buildBoard(quests: Quest[], runs: Run[], proposals: Proposal[], uid: string, today: string): Board {
  const runById = new Map(runs.map((r) => [r.id, r]));
  const board: Board = { missed: [], today: [], upcoming: [] };
  const usedRunIds = new Set<string>();

  const questItem = (quest: Quest, day: string, extra: Partial<BoardItem>): BoardItem => {
    const run = runById.get(runId(quest.id, day)) ?? null;
    if (run) usedRunIds.add(run.id);
    return {
      key: runId(quest.id, day),
      kind: 'quest',
      title: quest.title,
      note: quest.note,
      important: quest.important,
      label: repeatLabel(quest.repeat, today),
      day,
      state: run ? run.status : 'todo',
      quest,
      run,
      runDay: day,
      reward: quest.reward,
      late: false,
      canAct: true,
      memo: null,
      ...extra,
    };
  };

  for (const quest of quests) {
    if (quest.assigneeUid !== uid || !quest.active) continue;

    if (quest.repeat.type === 'none') {
      const due = quest.repeat.date;
      const item = questItem(quest, due, {});
      if (due < today) board.missed.push(item);
      else if (due === today) board.today.push(item);
      else board.upcoming.push(item);
      continue;
    }

    if (scheduledOn(quest, today)) board.today.push(questItem(quest, today, {}));

    // 최근 며칠 안에 못 한 날: 늦게라도 하면 절반을 받는다.
    for (let back = 1; back <= MISSED_DAYS; back += 1) {
      const day = addDays(today, -back);
      if (!scheduledOn(quest, day)) continue;
      const run = runById.get(runId(quest.id, day));
      const stillOpen = !run || run.status === 'rejected' || (run.status === 'submitted' && run.late);
      if (!stillOpen) continue;
      board.missed.push(
        questItem(quest, day, {
          late: true,
          reward: halfReward(quest.reward),
          label: `${relativeDay(day, today)} 못 한 일 · 늦어서 절반`,
        }),
      );
    }

    // 매일 하는 일이 아니라면 다음에 돌아오는 날을 미리 알려 준다.
    const everyDay = quest.repeat.type === 'daily' || quest.repeat.days.length === 7;
    if (!everyDay) {
      for (let ahead = 1; ahead <= 7; ahead += 1) {
        const day = addDays(today, ahead);
        if (!scheduledOn(quest, day)) continue;
        board.upcoming.push(questItem(quest, day, { canAct: false, label: `${relativeDay(day, today)} · ${repeatLabel(quest.repeat, today)}` }));
        break;
      }
    }
  }

  // 오늘 승인되어 목록에서 빠진 한 번짜리 퀘스트도 '완료'로 보여 준다.
  const startOfToday = parseDateKey(today).getTime();
  for (const run of runs) {
    if (usedRunIds.has(run.id) || run.assigneeUid !== uid) continue;
    if (run.status !== 'approved' || !run.oneOff || (run.decidedAt ?? 0) < startOfToday) continue;
    board.today.push({
      key: run.id,
      kind: 'quest',
      title: run.questTitle,
      note: '',
      important: false,
      label: '한 번',
      day: today,
      state: 'approved',
      quest: null,
      run,
      runDay: run.dateKey,
      reward: run.reward,
      late: false,
      canAct: false,
      memo: null,
    });
  }

  // 직접 적은 메모(코인 없음)
  for (const memo of proposals) {
    if (memo.ownerUid !== uid || (memo.status !== 'memo' && memo.status !== 'done')) continue;
    const done = memo.status === 'done';
    const item: BoardItem = {
      key: `memo-${memo.id}`,
      kind: 'memo',
      title: memo.title,
      note: memo.note,
      important: memo.important,
      label: done ? '내가 적은 일' : `내가 적은 일 · ${dueLabel(memo.date, today)}`,
      day: memo.date,
      state: done ? 'approved' : 'todo',
      quest: null,
      run: null,
      runDay: memo.date,
      reward: 0,
      late: false,
      canAct: true,
      memo,
    };
    if (done || memo.date === today) board.today.push(item);
    else if (memo.date < today) board.missed.push(item);
    else board.upcoming.push(item);
  }

  sortItems(board.missed);
  sortItems(board.today);
  sortItems(board.upcoming);
  return board;
}

/** 오늘의 퀘스트 진행 상황(메모는 세지 않는다) */
export function todayProgress(board: Board): { done: number; total: number } {
  const quests = board.today.filter((item) => item.kind === 'quest');
  return { done: quests.filter((item) => item.state === 'approved').length, total: quests.length };
}
