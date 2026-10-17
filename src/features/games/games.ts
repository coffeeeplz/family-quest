import type { FamilySettings } from '../../backend/types';

/** 게임 목록. 새 게임은 여기에 한 줄 더하고 Shell 에 경로를 붙인다. */
export interface GameEntry {
  id: string;
  name: string;
  to: string;
  on: (settings: FamilySettings) => boolean;
}

export const GAMES: GameEntry[] = [{ id: 'claw', name: '인형뽑기', to: '/claw', on: (s) => s.claw.on }];

export const anyGameOn = (settings: FamilySettings) => GAMES.some((g) => g.on(settings));
