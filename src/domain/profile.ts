import { AppError, type ProfileInput } from '../backend/types';
import { AVATARS, AVATAR_COLORS } from '../lib/sprites';
import { cleanAvatarChoice, type Owned } from './wardrobe';

export const MAX_NAME = 10;
export const MAX_FAMILY_NAME = 16;

/** 이름과 캐릭터를 검사한다. owned: 쓸 수 있는 꾸미기 상품(부모는 'all', 새로 들어오는 자녀는 없음) */
export function cleanProfile(profile: ProfileInput, owned: Owned = []): ProfileInput {
  const displayName = profile.displayName.trim();
  if (!displayName) throw new AppError('이름을 적어 주세요.');
  if (displayName.length > MAX_NAME) throw new AppError(`이름은 ${MAX_NAME}자까지 쓸 수 있어요.`);
  const avatarOk = AVATARS.some((a) => a.id === profile.avatar.id);
  const colorOk = AVATAR_COLORS.some((c) => c.id === profile.avatar.color);
  if (!avatarOk || !colorOk) throw new AppError('캐릭터를 골라 주세요.');
  return { displayName, avatar: cleanAvatarChoice(profile.avatar, owned) };
}

export function cleanFamilyName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new AppError('가족 이름을 적어 주세요.');
  if (trimmed.length > MAX_FAMILY_NAME) throw new AppError(`가족 이름은 ${MAX_FAMILY_NAME}자까지 쓸 수 있어요.`);
  return trimmed;
}
