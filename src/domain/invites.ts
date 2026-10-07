/** 초대코드: 헷갈리는 글자(0/O, 1/I)를 뺀 6자리 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_LENGTH = 6;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newInviteCode(): string {
  const bytes = new Uint8Array(INVITE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** 사용자가 입력한 코드를 저장 형식으로 맞춘다(공백 제거, 대문자). */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function isInviteCodeShape(code: string): boolean {
  return code.length === INVITE_LENGTH && [...code].every((ch) => ALPHABET.includes(ch));
}
