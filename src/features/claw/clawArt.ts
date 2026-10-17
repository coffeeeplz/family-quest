/**
 * 인형뽑기 도트 그림(12×12). 글자는 sprites.json 팔레트와 같다. A 는 상자마다 다른 색.
 * 집게는 벌어짐 → 반쯤 → 오므림 세 장을 차례로 보여 줘서 "잡는" 움직임을 낸다.
 */
export const CLAW_OPEN = [
  '.....KK.....',
  '.....KK.....',
  '....KGGK....',
  '...KGWGGK...',
  '...KKGGKK...',
  '..KGKKKKGK..',
  '.KGK....KGK.',
  '.KGK....KGK.',
  'KGK......KGK',
  'KK........KK',
  '............',
  '............',
];

export const CLAW_HALF = [
  '.....KK.....',
  '.....KK.....',
  '....KGGK....',
  '...KGWGGK...',
  '...KKGGKK...',
  '...KGKKGK...',
  '..KGK..KGK..',
  '..KGK..KGK..',
  '..KGK..KGK..',
  '...KK..KK...',
  '............',
  '............',
];

export const CLAW_CLOSED = [
  '.....KK.....',
  '.....KK.....',
  '....KGGK....',
  '...KGWGGK...',
  '...KKGGKK...',
  '...KGKKGK...',
  '....KGGK....',
  '....KGGK....',
  '.....KK.....',
  '............',
  '............',
  '............',
];

/** 선물 상자. A = 상자 색, 리본은 빨강 */
export const BOX = [
  '............',
  '...KK..KK...',
  '..KRRKKRRK..',
  '...KKRRKK...',
  '.KKKKRRKKKK.',
  '.KAAAARRAAK.',
  '.KAWAARRAAK.',
  '.KAAAARRAAK.',
  '.KAAAARRAAK.',
  '.KaaaaRRaaK.',
  '.KKKKKKKKKK.',
  '............',
];

/** 뚜껑이 들썩이는 상자(열기 직전) */
export const BOX_LIFT = [
  '...KK..KK...',
  '..KRRKKRRK..',
  '...KKRRKK...',
  '.KKKKRRKKKK.',
  '............',
  '.KAAAARRAAK.',
  '.KAWAARRAAK.',
  '.KAAAARRAAK.',
  '.KAAAARRAAK.',
  '.KaaaaRRaaK.',
  '.KKKKKKKKKK.',
  '............',
];

/** 반짝이(목표 상자 위) */
export const SPARKLE = ['..Y..', '..Y..', 'YYWYY', '..Y..', '..Y..'];

/** 장식 상자 색(avatarColors 의 hex 와 비슷한 파스텔) */
export const BOX_COLORS = ['#FFB3D1', '#A9D4FF', '#A6E8D0', '#FFE38A', '#CDBBFF', '#FFC2A1'];
