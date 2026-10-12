"""32×32 도트 아바타와 꾸미기 아이템을 그려서 JSON 에 넣는다.

쓰는 법: python3 tools/avatar_art.py
  - src/assets/sprites.json 의 avatars 를 다시 쓴다(기존 id·색은 그대로).
  - src/assets/wardrobe.json(꾸미기 아이템 목록)을 다시 쓴다.

모든 아바타는 같은 뼈대 위에 그린다. 그래야 꾸미기 아이템이 어느 캐릭터에도 맞는다.
  머리: 가운데 x 15.5, 위 끝 y 6, 아래 끝 y 22 / 눈: y 13~14, x 10~11 과 20~21
  몸통: y 21~29, x 9~22 / 발: y 29~31 / 왼팔 x 6~9, 오른팔 x 22~25 (y 22~26)
글자: . 투명, A 캐릭터 색, a 어두운 캐릭터 색, L 밝은 캐릭터 색, 나머지는 sprites.json 의 팔레트.
"""
import json, os, re

N = 32
ROOT = os.path.join(os.path.dirname(__file__), "..")
SPRITES = os.path.join(ROOT, "src", "assets", "sprites.json")
WARDROBE = os.path.join(ROOT, "src", "assets", "wardrobe.json")
RULES = os.path.join(ROOT, "firestore.rules")


def sync_rules(avatars, items):
    """firestore.rules 의 꾸미기 상품 목록(wardrobeDefaultPrices, freeAvatarIds)을 그림 데이터와 맞춘다."""
    paid = [(a["id"], a["price"]) for a in avatars if a["price"] > 0] + [(i["id"], i["price"]) for i in items]
    prices = "{" + ", ".join(f"'{k}': {v}" for k, v in paid) + "}"
    free = "[" + ", ".join(f"'{a['id']}'" for a in avatars if a["price"] == 0) + "]"
    text = open(RULES, encoding="utf-8").read()
    text, n1 = re.subn(r"(function wardrobeDefaultPrices\(\) \{\s*return )\{[^}]*\}", lambda m: m.group(1) + prices, text)
    text, n2 = re.subn(r"(function freeAvatarIds\(\) \{\s*return )\[[^\]]*\]", lambda m: m.group(1) + free, text)
    assert n1 == 1 and n2 == 1, "firestore.rules 에서 꾸미기 목록을 찾지 못했어요"
    open(RULES, "w", encoding="utf-8").write(text)


class Canvas:
    def __init__(self):
        self.g = [["."] * N for _ in range(N)]
        self.mask = [[False] * N for _ in range(N)]

    def put(self, x, y, ch, solid=True):
        if 0 <= x < N and 0 <= y < N:
            self.g[y][x] = ch
            if solid:
                self.mask[y][x] = True

    def get(self, x, y):
        return self.g[y][x] if 0 <= x < N and 0 <= y < N else "."

    def ellipse(self, cx, cy, rx, ry, ch, solid=True):
        for y in range(N):
            for x in range(N):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    self.put(x, y, ch, solid)

    def rect(self, x0, y0, x1, y1, ch, solid=True):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, ch, solid)

    def poly(self, pts, ch, solid=True):
        """볼록하지 않아도 되는 다각형 채우기(가운데 점 기준)."""
        for y in range(N):
            for x in range(N):
                px, py = x + 0.5, y + 0.5
                inside = False
                j = len(pts) - 1
                for i in range(len(pts)):
                    xi, yi = pts[i]
                    xj, yj = pts[j]
                    if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                        inside = not inside
                    j = i
                if inside:
                    self.put(x, y, ch, solid)

    def pixels(self, text, ox, oy, solid=False):
        """여러 줄 글자 그림을 (ox, oy)에 찍는다. 점(.)은 건너뛴다."""
        for dy, row in enumerate(text.strip("\n").split("\n")):
            for dx, ch in enumerate(row):
                if ch != ".":
                    self.put(ox + dx, oy + dy, ch, solid)

    def outline(self):
        """모양의 가장자리를 검은 선(K)으로 바꾼다."""
        edge = []
        for y in range(N):
            for x in range(N):
                if not self.mask[y][x]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < N and 0 <= ny < N) or not self.mask[ny][nx]:
                        edge.append((x, y))
                        break
        for x, y in edge:
            self.g[y][x] = "K"

    def mirror(self, text, ox, oy, solid=False):
        """왼쪽에 찍고 가운데(x 15.5)를 기준으로 오른쪽에도 뒤집어 찍는다."""
        lines = text.strip("\n").split("\n")
        self.pixels(text, ox, oy, solid)
        w = max(len(l) for l in lines)
        flipped = "\n".join(l.ljust(w, ".")[::-1] for l in lines)
        self.pixels(flipped, N - ox - w, oy, solid)

    def rows(self):
        return ["".join(r) for r in self.g]


# ---------------------------------------------------------------- 공통 뼈대

def base(c, head=True, body=True, belly="L"):
    if head:
        c.ellipse(16, 14.5, 11.5, 8.5, "A")
    if body:
        c.rect(10, 20, 21, 28, "A")
        c.ellipse(16, 25, 7, 5, "A")
        c.ellipse(8, 24.5, 2.6, 2.6, "A")   # 왼팔
        c.ellipse(24, 24.5, 2.6, 2.6, "A")  # 오른팔
        c.rect(10, 29, 14, 30, "A")         # 왼발
        c.rect(17, 29, 21, 30, "A")         # 오른발


def finish_body(c, belly="L"):
    if belly:
        c.ellipse(16, 25.5, 4, 3.3, belly, solid=False)
    # 다리 사이 틈
    c.put(15, 30, "."); c.put(16, 30, ".")
    c.mask[30][15] = c.mask[30][16] = False


def eyes(c, y=13, style="dot"):
    for x in (10, 20):
        if style == "dot":
            c.rect(x, y, x + 1, y + 1, "K", solid=False)
            c.put(x, y, "W", solid=False)
        elif style == "screen":
            c.rect(x - 1, y, x + 2, y + 1, "B", solid=False)
            c.put(x - 1, y, "W", solid=False)
        elif style == "sleepy":
            c.rect(x, y + 1, x + 1, y + 1, "K", solid=False)


def cheeks(c, y=16):
    for x in (7, 23):
        c.rect(x, y, x + 1, y, "P", solid=False)


def mouth(c, y=17, kind="w"):
    if kind == "w":
        c.pixels("K..K\n.KK.", 14, y)
    elif kind == "smile":
        c.pixels("K....K\n.KKKK.", 13, y)
    elif kind == "o":
        c.pixels(".KK.\nKRRK\n.KK.", 14, y)


def avatar(fn):
    c = Canvas()
    fn(c)
    return c.rows()


# ---------------------------------------------------------------- 기본 아바타 12종

def rabbit(c):
    c.ellipse(11, 4.5, 2.6, 6, "A"); c.ellipse(21, 4.5, 2.6, 6, "A")
    base(c); c.outline()
    c.rect(11, 1, 11, 6, "P", solid=False); c.rect(21, 1, 21, 6, "P", solid=False)
    finish_body(c); eyes(c); cheeks(c); mouth(c)


def cat(c):
    c.poly([(5, 10), (7, 1), (13, 7)], "A"); c.poly([(27, 10), (25, 1), (19, 7)], "A")
    base(c); c.outline()
    c.poly([(7.5, 8), (8, 4), (11, 7)], "P", solid=False); c.poly([(24.5, 8), (24, 4), (21, 7)], "P", solid=False)
    finish_body(c); eyes(c); cheeks(c); mouth(c)
    c.pixels("KKK", 3, 15); c.pixels("KKK", 26, 15)
    c.pixels("KK", 3, 17); c.pixels("KK", 27, 17)


def bear(c):
    c.ellipse(8, 7, 3.3, 3.3, "A"); c.ellipse(24, 7, 3.3, 3.3, "A")
    base(c); c.outline()
    c.ellipse(8, 7, 1.6, 1.6, "a", solid=False); c.ellipse(24, 7, 1.6, 1.6, "a", solid=False)
    finish_body(c); eyes(c); cheeks(c)
    c.ellipse(16, 17.5, 3.4, 2.3, "C", solid=False)
    c.pixels("KK", 15, 16); mouth(c, 18)


def fox(c):
    c.poly([(4, 12), (5, 0), (14, 7)], "A"); c.poly([(28, 12), (27, 0), (18, 7)], "A")
    base(c); c.outline()
    c.poly([(6.5, 9), (6.5, 3), (11, 7)], "K", solid=False); c.poly([(25.5, 9), (25.5, 3), (21, 7)], "K", solid=False)
    finish_body(c, belly="W")
    c.poly([(5, 15), (16, 22), (27, 15), (27, 21), (16, 23), (5, 21)], "W", solid=False)
    eyes(c); c.pixels("KK", 15, 17); mouth(c, 18)


def dog(c):
    base(c)
    c.ellipse(5.5, 13, 2.6, 5.5, "a"); c.ellipse(26.5, 13, 2.6, 5.5, "a")
    c.outline()
    finish_body(c); eyes(c); cheeks(c)
    c.ellipse(16, 17.5, 3.4, 2.3, "W", solid=False)
    c.pixels("KK", 15, 16); mouth(c, 18)


def penguin(c):
    base(c); c.outline()
    finish_body(c, belly="W")
    c.ellipse(16, 15.5, 8.3, 6.2, "W", solid=False)
    eyes(c); cheeks(c, 17)
    c.pixels(".OO.\nOOOO\n.OO.", 14, 16)
    c.rect(10, 29, 14, 30, "O", solid=False); c.rect(17, 29, 21, 30, "O", solid=False)
    c.pixels("KKKKK", 10, 31); c.pixels("KKKKK", 17, 31)


def frog(c):
    c.ellipse(10.5, 7, 4, 4, "A"); c.ellipse(21.5, 7, 4, 4, "A")
    base(c); c.outline()
    finish_body(c)
    for x in (9, 20):
        c.rect(x, 5, x + 2, 8, "W", solid=False)
        c.rect(x + 1, 6, x + 2, 8, "K", solid=False)
    cheeks(c, 15)
    c.pixels("K..........K\n.KKKKKKKKKK.", 10, 16)


def chick(c):
    base(c); c.outline()
    c.pixels("..KK\n.KAK\nKAAK\n.KK.", 15, 2)
    c.pixels("KK", 15, 5)
    finish_body(c); eyes(c); cheeks(c)
    c.pixels("KKKK\nKOOOK\n.KOK", 14, 16)
    c.rect(10, 29, 14, 30, "O", solid=False); c.rect(17, 29, 21, 30, "O", solid=False)
    c.pixels("KKKKK", 10, 31); c.pixels("KKKKK", 17, 31)


def dragon(c):
    c.poly([(8, 9), (9, 2), (12, 7)], "Y"); c.poly([(24, 9), (23, 2), (20, 7)], "Y")
    base(c)
    c.poly([(26, 21), (31, 17), (30, 24), (26, 26)], "a")  # 날개
    c.poly([(6, 21), (1, 17), (2, 24), (6, 26)], "a")
    c.outline()
    finish_body(c, belly="C")
    c.rect(16, 6, 16, 6, "K", solid=False)
    eyes(c); cheeks(c)
    c.pixels("K.K", 14, 17); mouth(c, 18, "smile")


def unicorn(c):
    c.poly([(13.5, 8), (16, 0), (18.5, 8)], "Y")
    c.poly([(19, 7), (26, 6), (29, 12), (28, 19), (25, 13)], "P")  # 갈기
    base(c); c.outline()
    c.pixels("O", 15, 6); c.pixels("O", 16, 4); c.pixels("O", 15, 2)
    c.pixels("BB", 24, 8); c.pixels("BB", 26, 11); c.pixels("B", 27, 14)
    finish_body(c); eyes(c); cheeks(c); mouth(c)


def robot(c):
    c.rect(15, 2, 16, 5, "G"); c.rect(14, 0, 17, 2, "R")
    c.rect(5, 7, 26, 21, "A")
    c.rect(3, 11, 4, 16, "G"); c.rect(27, 11, 28, 16, "G")
    base(c, head=False); c.outline()
    finish_body(c, belly=None)
    c.rect(12, 23, 19, 27, "G", solid=False)
    c.pixels("RYB", 13, 24); c.pixels("KKKKKK", 13, 26)
    eyes(c, style="screen")
    c.pixels("KKKKKKKK", 12, 17)
    c.pixels("W", 7, 9); c.pixels("W", 8, 9); c.pixels("W", 7, 10)


def ghost(c):
    c.ellipse(16, 14.5, 11.5, 9.5, "A")
    c.rect(5, 15, 26, 27, "A")
    c.ellipse(4.5, 20, 2.3, 2.3, "A"); c.ellipse(27.5, 20, 2.3, 2.3, "A")
    for x0 in (5, 13, 21):
        c.ellipse(x0 + 3, 28, 3, 2.5, "A")
    c.outline()
    c.ellipse(16, 22, 7, 4, "L", solid=False)
    eyes(c); cheeks(c); mouth(c, 17, "o")


# ---------------------------------------------------------------- 새 유료 아바타

def whale(c):
    c.ellipse(16, 4, 1.5, 3, "B"); c.ellipse(13, 2.5, 1.5, 1.6, "B"); c.ellipse(19, 2.5, 1.5, 1.6, "B")
    base(c)
    c.poly([(26, 26), (31, 21), (31, 28), (27, 29)], "A")  # 꼬리
    c.outline()
    c.ellipse(16, 4, 0.7, 2, "W", solid=False)
    finish_body(c, belly="W")
    c.ellipse(16, 19.5, 10, 3, "W", solid=False)
    eyes(c); cheeks(c, 16); mouth(c, 17, "smile")


def dino(c):
    for i, (x, y) in enumerate([(9, 6), (13, 4), (18, 4), (22, 6)]):
        c.poly([(x - 2, y + 3), (x, y - 3), (x + 2, y + 3)], "M")
    base(c)
    c.poly([(5, 23), (0, 28), (2, 30), (8, 28)], "A")  # 꼬리
    c.outline()
    finish_body(c, belly="C")
    eyes(c); cheeks(c)
    c.pixels("K.K", 14, 17); mouth(c, 18, "smile")
    c.pixels("WW", 12, 19); c.pixels("WW", 18, 19)


def panda(c):
    c.ellipse(8, 7, 3.3, 3.3, "K"); c.ellipse(24, 7, 3.3, 3.3, "K")
    c.ellipse(16, 14.5, 11.5, 8.5, "W")
    base(c, head=False)
    c.outline()
    finish_body(c, belly="W")
    c.ellipse(10.5, 13.5, 2.6, 2.2, "A", solid=False); c.ellipse(20.5, 13.5, 2.6, 2.2, "A", solid=False)
    eyes(c); cheeks(c, 17)
    c.pixels("KK", 15, 17); mouth(c, 18)


def astronaut(c):
    c.ellipse(16, 13.5, 13, 11, "W")              # 헬멧
    c.rect(15, 0, 16, 2, "G"); c.rect(14, 0, 17, 0, "R")
    base(c, head=False)
    c.outline()
    c.ellipse(16, 14.5, 9.5, 7.5, "A", solid=False)  # 얼굴
    c.pixels("WW\nW.", 9, 8)
    finish_body(c, belly=None)
    c.rect(13, 23, 18, 26, "G", solid=False); c.pixels("RB", 14, 24); c.pixels("YM", 16, 24)
    eyes(c); cheeks(c); mouth(c)
    c.rect(10, 29, 14, 30, "W", solid=False); c.rect(17, 29, 21, 30, "W", solid=False)


AVATARS = [
    ("rabbit", "토끼", "pink", 0, rabbit),
    ("cat", "고양이", "peach", 0, cat),
    ("bear", "곰", "peach", 0, bear),
    ("fox", "여우", "peach", 0, fox),
    ("dog", "강아지", "yellow", 0, dog),
    ("penguin", "펭귄", "sky", 0, penguin),
    ("frog", "개구리", "mint", 0, frog),
    ("chick", "병아리", "yellow", 0, chick),
    ("dragon", "아기 용", "mint", 0, dragon),
    ("unicorn", "유니콘", "white", 0, unicorn),
    ("robot", "로봇", "sky", 0, robot),
    ("ghost", "꼬마 유령", "white", 0, ghost),
    ("whale", "고래", "sky", 300, whale),
    ("dino", "공룡", "mint", 300, dino),
    ("panda", "판다", "lavender", 300, panda),
    ("astronaut", "우주인", "peach", 300, astronaut),
]


# 모자를 위아래로 옮길 칸 수(머리 위 끝이 뼈대와 다른 캐릭터)
HAT_Y = {"astronaut": -3, "ghost": -1, "robot": 1}


# ---------------------------------------------------------------- 꾸미기 아이템
# 모자: 머리 위 끝(y 6)에 걸치게 / 얼굴: 눈(y 13~14) / 옷: 몸통(y 20~30) / 소품: 오른손(x 24, y 24) 근처 / 배경: 전체

def item(fn, outline=True):
    c = Canvas()
    fn(c)
    if outline:
        c.outline()
    return c.rows()


def crown(c):
    c.poly([(9, 8), (9, 1), (12.5, 4.5), (16, 0), (19.5, 4.5), (23, 1), (23, 8)], "Y")


def crown_after(rows):
    c = Canvas(); c.g = [list(r) for r in rows]
    c.pixels("R", 16, 4); c.pixels("B", 12, 6); c.pixels("M", 20, 6); c.pixels("W", 11, 4)
    c.rect(10, 7, 22, 7, "O", solid=False)
    return c.rows()


def ribbon(c):
    c.poly([(20, 2), (25, 0), (27, 4), (25, 8), (20, 6)], "P")
    c.poly([(20, 2), (15, 0), (13, 4), (15, 8), (20, 6)], "P")
    c.rect(19, 2, 21, 6, "R")


def beanie(c):
    c.ellipse(16, 10.5, 10.5, 8, "B")
    c.ellipse(16, 2.5, 2.4, 2.4, "W")
    for y in range(11, N):  # 이마 위까지만
        for x in range(N):
            c.g[y][x] = "."
            c.mask[y][x] = False


def beanie_after(rows):
    c = Canvas(); c.g = [list(r) for r in rows]
    for y in (5, 7):
        for x in range(N):
            if c.get(x, y) == "B":
                c.put(x, y, "E", solid=False)
    for x in range(N):
        if c.get(x, 9) not in ".K":
            c.put(x, 9, "W", solid=False)
    return c.rows()


def round_glasses(c):
    for x in (8, 18):
        c.rect(x, 11, x + 5, 11, "K", solid=False); c.rect(x, 16, x + 5, 16, "K", solid=False)
        c.rect(x - 1, 12, x - 1, 15, "K", solid=False); c.rect(x + 6, 12, x + 6, 15, "K", solid=False)
        c.put(x + 4, 12, "W", solid=False)
    c.rect(14, 13, 17, 13, "K", solid=False)


def sunglasses(c):
    c.rect(6, 11, 25, 11, "K", solid=False)
    for x in (7, 18):
        c.rect(x, 12, x + 6, 15, "K", solid=False)
        c.rect(x + 1, 12, x + 2, 12, "W", solid=False); c.put(x + 1, 13, "W", solid=False)
    c.rect(14, 12, 17, 12, "K", solid=False)


def blush(c):
    heart = ".R.R.\nRRRRR\n.RRR.\n..R.."
    c.pixels(heart, 5, 15); c.pixels(heart, 22, 15)
    c.pixels("W", 6, 15); c.pixels("W", 23, 15)


def body_mask(c, ch):
    """옷 모양: 몸통과 팔 윗부분"""
    c.rect(10, 20, 21, 27, ch)
    c.ellipse(16, 24.5, 7, 4.5, ch)
    c.ellipse(8, 23.5, 2.4, 2, ch); c.ellipse(24, 23.5, 2.4, 2, ch)


def tee(c):
    body_mask(c, "R")


def tee_after(rows):
    c = Canvas(); c.g = [list(r) for r in rows]
    for y in (22, 25):
        for x in range(N):
            if c.get(x, y) == "R":
                c.put(x, y, "W", solid=False)
    c.pixels("KKKK", 14, 20)
    return c.rows()


def cape(c):
    c.poly([(9, 20), (23, 20), (28, 30), (4, 30)], "R")
    c.rect(10, 20, 21, 29, ".", solid=False)  # 몸통 앞은 비운다
    for y in range(20, 30):
        for x in range(10, 22):
            c.mask[y][x] = False


def cape_after(rows):
    c = Canvas(); c.g = [list(r) for r in rows]
    c.rect(10, 20, 21, 20, "R", solid=False)
    c.rect(9, 19, 22, 19, "K", solid=False)
    c.pixels("KYYK\n.KK.", 14, 20)
    return c.rows()


def uniform(c):
    body_mask(c, "D")


def uniform_after(rows):
    c = Canvas(); c.g = [list(r) for r in rows]
    c.poly([(13, 20), (19, 20), (16, 25)], "W", solid=False)
    c.pixels("RR\nRR\n.R", 15, 21)
    c.pixels("Y", 12, 25); c.pixels("Y", 12, 27)
    c.rect(10, 20, 13, 20, "K", solid=False); c.rect(18, 20, 21, 20, "K", solid=False)
    return c.rows()


def balloon(c):
    c.ellipse(27, 7, 4, 5, "R")


def balloon_after(rows):
    c = Canvas(); c.g = [list(r) for r in rows]
    c.pixels("WW\nW.", 25, 4)
    c.pixels("KOK", 26, 12)
    for i, y in enumerate(range(13, 23)):
        c.put(27 if i % 4 < 2 else 26, y, "K", solid=False)
    return c.rows()


def wand(c):
    c.poly([(26, 1), (27.5, 4), (31, 4.5), (28.5, 7), (29.5, 11), (26, 9), (22.5, 11), (23.5, 7), (21, 4.5), (24.5, 4)], "Y")


def wand_after(rows):
    c = Canvas(); c.g = [list(r) for r in rows]
    for i in range(12):
        c.put(25 - (i // 6), 11 + i, "N", solid=False)
        c.put(24 - (i // 6), 11 + i, "K", solid=False)
        c.put(26 - (i // 6), 11 + i, "K", solid=False)
    c.pixels("W", 25, 5); c.pixels("P", 20, 2); c.pixels("B", 30, 12)
    return c.rows()


def soccer(c):
    c.pixels("""
...KKK...
.KKWWWKK.
.KWWKWWK.
KWWKKKWWK
KKWWKWWKK
KWWWWWWWK
KWKWWWKWK
.KKWKWKK.
...KKK...""", 23, 23)


def bg_sky(c):
    c.rect(0, 0, 31, 31, "E", solid=False)
    cloud = "..WWW...\n.WWWWW..\nWWWWWWWW"
    c.pixels(cloud, 1, 3); c.pixels(cloud, 23, 8)
    c.rect(0, 30, 31, 31, "F", solid=False)


def bg_night(c):
    c.rect(0, 0, 31, 31, "D", solid=False)
    for x, y in [(2, 3), (27, 2), (5, 18), (29, 15), (24, 26), (3, 28), (13, 1)]:
        c.put(x, y, "Y", solid=False)
    c.pixels(".Y.\nYWY\n.Y.", 26, 7)
    c.pixels("..YY\n.Y..\n.Y..\n..YY", 2, 7)


def bg_sea(c):
    c.rect(0, 0, 31, 31, "E", solid=False)
    c.rect(0, 16, 31, 31, "B", solid=False)
    for x in range(0, 32, 4):
        c.pixels("WW..", x, 16)
    c.pixels(".W\nW.\n.W", 3, 22); c.pixels("W", 28, 25); c.pixels(".W.\nW.W\n.W.", 27, 19)
    c.rect(0, 29, 31, 31, "C", solid=False)


def make(fn, after=None, outline=True):
    rows = item(fn, outline)
    return after(rows) if after else rows


ITEMS = [
    ("crown", "hat", "왕관", 200, lambda: make(crown, crown_after)),
    ("ribbon", "hat", "리본", 80, lambda: make(ribbon)),
    ("beanie", "hat", "털모자", 120, lambda: make(beanie, beanie_after)),
    ("round-glasses", "face", "동그란 안경", 80, lambda: make(round_glasses, outline=False)),
    ("sunglasses", "face", "선글라스", 120, lambda: make(sunglasses, outline=False)),
    ("blush", "face", "하트 볼터치", 50, lambda: make(blush, outline=False)),
    ("tee", "outfit", "줄무늬 티", 80, lambda: make(tee, tee_after)),
    ("cape", "outfit", "망토", 150, lambda: make(cape, cape_after)),
    ("uniform", "outfit", "교복", 120, lambda: make(uniform, uniform_after)),
    ("balloon", "hand", "풍선", 60, lambda: make(balloon, balloon_after)),
    ("wand", "hand", "요술봉", 150, lambda: make(wand, wand_after)),
    ("soccer", "hand", "축구공", 80, lambda: make(soccer, outline=False)),
    ("sky", "bg", "맑은 하늘", 100, lambda: make(bg_sky, outline=False)),
    ("night", "bg", "별밤", 150, lambda: make(bg_night, outline=False)),
    ("sea", "bg", "바다", 150, lambda: make(bg_sea, outline=False)),
]

NEW_COLORS = {"D": "#3B4A7A", "E": "#D6ECFF", "F": "#8BD67E"}


def main():
    data = json.load(open(SPRITES, encoding="utf-8"))
    data["palette"].update(NEW_COLORS)
    old = {a["id"]: a for a in data["avatars"]}
    avatars = []
    for aid, name, color, price, fn in AVATARS:
        prev = old.get(aid)
        avatars.append({
            "id": aid,
            "name": prev["name"] if prev else name,
            "color": prev["color"] if prev else color,
            "price": price,
            "hatY": HAT_Y.get(aid, 0),
            "rows": avatar(fn),
        })
    data["avatars"] = avatars
    with open(SPRITES, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    items = [{"id": iid, "slot": slot, "name": name, "price": price, "rows": draw()} for iid, slot, name, price, draw in ITEMS]
    with open(WARDROBE, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
        f.write("\n")
    sync_rules(avatars, items)
    print("avatars", len(avatars), "items", len(items))


if __name__ == "__main__":
    main()
