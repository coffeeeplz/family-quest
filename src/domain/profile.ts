import { AppError, type ProfileInput } from '../backend/types';
import { AVATARS, AVATAR_COLORS } from '../lib/sprites';

export const MAX_NAME = 10;
export const MAX_FAMILY_NAME = 16;

export function cleanProfile(profile: ProfileInput): ProfileInput {
  const displayName = profile.displayName.trim();
  if (!displayName) throw new AppError('이름을 적어 주세요.');
  if (displayName.length > MAX_NAME) throw new AppError(`이름은 ${MAX_NAME}자까지 쓸 수 있어요.`);
  const avatarOk = AVATARS.some((a) => a.id === profile.avatar.id);
  const colorOk = AVATAR_COLORS.some((c) => c.id === profile.avatar.color);
  if (!avatarOk || !colorOk) throw new AppError('캐릭터를 골라 주세요.');
  return { displayName, avatar: { id: profile.avatar.id, color: profile.avatar.color } };
}

export function cleanFamilyName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new AppError('가족 이름을 적어 주세요.');
  if (trimmed.length > MAX_FAMILY_NAME) throw new AppError(`가족 이름은 ${MAX_FAMILY_NAME}자까지 쓸 수 있어요.`);
  return trimmed;
}
