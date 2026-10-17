import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFamilyData } from '../../app/familyData';
import { useBackend, useSession } from '../../app/session';
import type { ClawRound } from '../../backend/types';
import { playsToday } from '../../domain/claw';
import { Icon } from '../../ui/Sprite';
import { CoinPill } from '../../ui/kit';
import { GAMES } from './games';

/** 게임 목록(홈의 게임 버튼). 지금은 인형뽑기 하나, 앞으로 게임이 늘면 한 줄씩 더해진다. */
export function GamesPage() {
  const navigate = useNavigate();
  const backend = useBackend();
  const { family, me, isParent } = useSession();
  const { today } = useFamilyData();
  const [rounds, setRounds] = useState<ClawRound[]>([]);
  useEffect(() => backend.watchMyClawRounds(family.id, me.uid, today, setRounds), [backend, family.id, me.uid, today]);
  const claw = family.settings.claw;

  // 게임마다 한 줄 설명
  const detail = (id: string): string => {
    if (id === 'claw') {
      if (isParent) return '부모는 공짜로 연습해요';
      const left = claw.perDay > 0 ? ` · 오늘 ${Math.max(0, claw.perDay - playsToday(rounds, me.uid, today))}번 남음` : '';
      return `한 판 ${claw.price}코인${left}`;
    }
    return '';
  };

  return (
    <main className="screen">
      <button type="button" className="link back-link" onClick={() => navigate(-1)}>
        ‹ 뒤로
      </button>
      <header className="screen-head">
        <h1 className="t-title grow">게임</h1>
        <CoinPill amount={me.coins} />
      </header>
      <nav className="stack" aria-label="게임 목록">
        {GAMES.map((game) => {
          const on = game.on(family.settings);
          return on || isParent ? (
            <Link key={game.id} className="px list-button menu-row" to={game.to}>
              <Icon name="game" size={36} />
              <span className="card-main">
                <span className="t-body item-title">{game.name}</span>
                <span className="t-cap">{on ? detail(game.id) : '꺼져 있어요(부모 연습만)'}</span>
              </span>
              <span className="t-title" aria-hidden="true">
                ›
              </span>
            </Link>
          ) : (
            <div key={game.id} className="px list-button menu-row" aria-disabled="true" style={{ opacity: 0.6 }}>
              <Icon name="game" size={36} />
              <span className="card-main">
                <span className="t-body item-title">{game.name}</span>
                <span className="t-cap">지금은 쉬는 중</span>
              </span>
            </div>
          );
        })}
      </nav>
    </main>
  );
}
