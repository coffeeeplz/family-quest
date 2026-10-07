import { AppError, type FamilySettings } from '../backend/types';

/** 놓친 반복 퀘스트를 며칠 전 것까지 보여 줄지 */
export const MISSED_DAYS = 3;
export const MAX_REWARD = 1000;
export const MAX_PRAISES = 8;
export const MAX_PRAISE_LENGTH = 20;
export const MAX_PRESETS = 12;

export const ROUND_CHOICES = [1, 2, 3, 4, 5];
export const STREAK_DAY_CHOICES = [3, 5, 7];

export const DEFAULT_SETTINGS: FamilySettings = {
  maxRounds: 3,
  maxProposalCoins: 50,
  streakOn: true,
  streakDays: 3,
  streakBonus: 10,
  praises: ['참 잘했어요!', '최고야!', '고마워!', '끝까지 해냈구나!'],
};

/** 늦게 한 반복 퀘스트는 절반만 받는다(홀수는 올림). */
export function halfReward(reward: number): number {
  return Math.ceil(reward / 2);
}

const clampInt = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** 저장된 값이 없거나 일부만 있어도 항상 완전한 설정을 돌려준다. */
export function normalizeSettings(raw: unknown): FamilySettings {
  const r = (raw ?? {}) as Partial<FamilySettings>;
  const praises = Array.isArray(r.praises)
    ? r.praises.filter((p): p is string => typeof p === 'string' && p.trim() !== '').slice(0, MAX_PRAISES)
    : DEFAULT_SETTINGS.praises;
  return {
    maxRounds: clampInt(r.maxRounds, 1, 5, DEFAULT_SETTINGS.maxRounds),
    maxProposalCoins: clampInt(r.maxProposalCoins, 1, MAX_REWARD, DEFAULT_SETTINGS.maxProposalCoins),
    streakOn: typeof r.streakOn === 'boolean' ? r.streakOn : DEFAULT_SETTINGS.streakOn,
    streakDays: clampInt(r.streakDays, 2, 30, DEFAULT_SETTINGS.streakDays),
    streakBonus: clampInt(r.streakBonus, 0, MAX_REWARD, DEFAULT_SETTINGS.streakBonus),
    praises,
  };
}

/** 설정 화면에서 저장하기 전에 검사한다. */
export function cleanSettings(input: FamilySettings): FamilySettings {
  const inRange = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!inRange(input.maxRounds, 1, 5)) throw new AppError('협상 횟수는 1번에서 5번 사이로 정해 주세요.');
  if (!inRange(input.maxProposalCoins, 1, MAX_REWARD)) {
    throw new AppError(`제안할 수 있는 코인은 1부터 ${MAX_REWARD} 사이로 정해 주세요.`);
  }
  if (!inRange(input.streakDays, 2, 30)) throw new AppError('연속 달성 일수는 2일에서 30일 사이로 정해 주세요.');
  if (!inRange(input.streakBonus, 0, MAX_REWARD)) {
    throw new AppError(`보너스 코인은 0부터 ${MAX_REWARD} 사이로 정해 주세요.`);
  }
  const praises = [...new Set(input.praises.map((p) => p.trim()).filter(Boolean))];
  if (praises.length > MAX_PRAISES) throw new AppError(`칭찬 한마디는 ${MAX_PRAISES}개까지 등록할 수 있어요.`);
  if (praises.some((p) => p.length > MAX_PRAISE_LENGTH)) {
    throw new AppError(`칭찬 한마디는 ${MAX_PRAISE_LENGTH}자까지 쓸 수 있어요.`);
  }
  return { ...input, praises };
}
