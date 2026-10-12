"""16×16 도트 캐릭터와 꾸미기 아이템을 JSON 에 넣는다.

쓰는 법: python3 tools/avatar_art.py
  - src/assets/sprites.json 의 avatars: 처음부터 쓰는 12종은 그림을 그대로 두고 가격과 위치 보정값만 넣는다.
    상점에서 파는 캐릭터(NEW_AVATARS)는 여기 그림으로 넣는다.
  - src/assets/wardrobe.json(꾸미기 아이템 목록)을 다시 쓴다.
  - firestore.rules 의 꾸미기 목록(wardrobeDefaultPrices, freeAvatarIds)을 맞춘다.

아이템의 기준 위치(토끼·곰과 같은 표준 캐릭터):
  머리 위 끝 y 4~5 / 눈 y 7~8, x 4 와 11 / 볼 y 9, x 3 과 12 / 몸통 y 11~15, x 3~12
머리나 눈 위치가 다른 캐릭터는 hatY(모자), faceY(얼굴 아이템)로 위아래를 옮긴다.
글자: . 투명, A a L 캐릭터 색(보통·어둡게·밝게), 나머지는 sprites.json 의 팔레트.
"""
import json, os, re

N = 16
ROOT = os.path.join(os.path.dirname(__file__), "..")
SPRITES = os.path.join(ROOT, "src", "assets", "sprites.json")
WARDROBE = os.path.join(ROOT, "src", "assets", "wardrobe.json")
RULES = os.path.join(ROOT, "firestore.rules")

NEW_COLORS = {"D": "#3B4A7A", "E": "#D6ECFF"}


def grid(text):
    rows = [r for r in text.strip("\n").split("\n")]
    assert len(rows) == N, f"줄 수 {len(rows)}"
    for r in rows:
        assert len(r) == N, f"글자 수 {len(r)}: {r}"
    return rows


def layer(*parts):
    """(시작 줄, 여러 줄 글자) 조각들을 빈 16×16 위에 놓는다."""
    g = [["."] * N for _ in range(N)]
    for y0, text in parts:
        for dy, row in enumerate(text.strip("\n").split("\n")):
            for x, ch in enumerate(row):
                if ch != ".":
                    g[y0 + dy][x] = ch
    return ["".join(r) for r in g]


# ---------------------------------------------------------------- 보정값
# 모자: 머리 위 끝이 표준(y 4~5)보다 위면 음수 / 얼굴: 눈이 표준(y 7)보다 위면 음수
HAT_Y = {"dog": -2, "penguin": -3, "ghost": -3, "robot": -2, "chick": -1, "frog": -2, "whale": -1, "dino": -1, "astronaut": -2, "panda": -1}
FACE_Y = {"dog": -1, "penguin": -1, "chick": -1, "dragon": -1, "ghost": -2, "robot": -2, "frog": -3}

# ---------------------------------------------------------------- 상점에서 파는 캐릭터
NEW_AVATARS = [
    ("whale", "고래", "sky", 300, """
......B..B......
.......BB.......
.......B........
....KKKKKKKK....
..KKAAAAAAAAKK..
.KAAAAAAAAAAAAK.
.KAAAAAAAAAAAAK.
.KAAKAAAAAAKAAK.
.KAAKAAAAAAKAAK.
.KAPAAAKKAAAPAK.
.KAAAAAAAAAAAAK.
.KWWWWWWWWWWWWK.
.KWWWWWWWWWWWWKK
..KWWWWWWWWWWKAK
...KKWWWWWWKKAK.
.....KKKKKK..KK.
"""),
    ("dino", "공룡", "mint", 300, """
................
......K..K......
.....KaKKaK.....
....KKKKKKKK....
..KKAAAAAAAAKK..
.KAAAAAAAAAAAAK.
.KAAAAAAAAAAAAK.
.KAAKAAAAAAKAAK.
.KAAKAAAAAAKAAK.
.KAPAAKAAKAAPAK.
.KAAAAAKKAAAAAK.
..KKAAAAAAAAKK..
...KAACCCCAAK.KK
...KAACCCCAAKKaK
...KAAAKKAAAaaK.
...KKKK..KKKKK..
"""),
    ("panda", "판다", "lavender", 300, """
................
..KKK......KKK..
.KAAAK....KAAAK.
.KAAAKKKKKKAAAK.
.KKWWWWWWWWWWKK.
.KWWWWWWWWWWWWK.
.KWAAWWWWWWAAWK.
.KAAKAWWWWAKAAK.
.KAAKAWWWWAKAAK.
.KWPWWWKKWWWPWK.
.KWWWWWWWWWWWWK.
..KKAAAAAAAAKK..
...KAAWWWWAAK...
...KAAWWWWAAK...
...KAAAKKAAAK...
...KKKK..KKKK...
"""),
    ("astronaut", "우주인", "peach", 300, """
.......R........
.......K........
....KKKKKKKK....
..KKWWWWWWWWKK..
.KWWAAAAAAAAWWK.
.KWAWAAAAAAAAWK.
.KWAAAAAAAAAAWK.
.KWAKAAAAAAKAWK.
.KWAKAAAAAAKAWK.
.KWAPAAKKAAPAWK.
.KWWAAAAAAAAWWK.
..KKWWWWWWWWKK..
..KWWWGGGGWWWK..
..KWWWGRBGWWWK..
...KWWWKKWWWK...
...KKKK..KKKK...
"""),
]

# ---------------------------------------------------------------- 꾸미기 아이템
ITEMS = [
    ("crown", "hat", "왕관", 200, layer((1, """
...K...KK...K...
..KYK.KYYK.KYK..
..KYYKYRRYKYYK..
..KYBYYYYYYMYK..
..KKKKKKKKKKKK..
"""))),
    ("ribbon", "hat", "리본", 80, layer((1, """
....KK....KK....
...KPPKKKKPPK...
...KPPKRRKPPK...
...KPPKKKKPPK...
....KK....KK....
"""))),
    ("beanie", "hat", "털모자", 120, layer((0, """
.......KK.......
......KWWK......
....KKKKKKKK....
...KBBBBBBBBK...
..KBEBEBEBEBBK..
..KWWWWWWWWWWK..
..KKKKKKKKKKKK..
"""))),
    ("round-glasses", "face", "동그란 안경", 80, layer((6, """
...NNN....NNN...
..N...NNNN...N..
..N...N..N...N..
...NNN....NNN...
"""))),
    ("sunglasses", "face", "선글라스", 120, layer((7, """
..KKKKKKKKKKKK..
..KWKKK..KWKKK..
...KKK....KKK...
"""))),
    ("blush", "face", "하트 볼터치", 50, layer((9, """
..R.R......R.R..
..RRR......RRR..
...R........R...
"""))),
    ("tee", "outfit", "줄무늬 티", 80, layer((11, """
...KRRRRRRRRK...
...KWWWWWWWWK...
...KRRRRRRRRK...
"""))),
    ("cape", "outfit", "망토", 150, layer((10, """
...KKKKKKKKKK...
..KRRK.YY.KRRK..
.KRRK......KRRK.
.KRRK......KRRK.
KRRRK......KRRRK
KKKKK......KKKKK
"""))),
    ("uniform", "outfit", "교복", 120, layer((11, """
...KDDWRRWDDK...
...KDDDRRDDDK...
...KDDDDDDDDK...
"""))),
    ("balloon", "hand", "풍선", 60, layer((1, """
............KKK.
...........KRRRK
...........KRWRK
...........KRRRK
............KRK.
.............K..
.............K..
............K...
............K...
.............K..
"""))),
    ("wand", "hand", "요술봉", 150, layer((4, """
.............K..
............KYK.
...........KYWYK
............KYK.
.............N..
............N...
............N...
"""))),
    ("soccer", "hand", "축구공", 80, layer((11, """
............KKK.
...........KWKWK
...........KKWKK
...........KWKWK
............KKK.
"""))),
]


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


def main():
    data = json.load(open(SPRITES, encoding="utf-8"))
    data["palette"].update(NEW_COLORS)
    data["palette"].pop("F", None)  # 배경을 없애면서 쓰지 않게 된 색
    new_ids = {a[0] for a in NEW_AVATARS}
    avatars = []
    for a in data["avatars"]:
        if a["id"] in new_ids or a.get("price", 0) > 0:
            continue  # 파는 캐릭터는 아래에서 새로 넣는다
        assert len(a["rows"]) == N, f"{a['id']} 는 16×16 이어야 해요"
        avatars.append({"id": a["id"], "name": a["name"], "color": a["color"], "price": 0,
                        "hatY": HAT_Y.get(a["id"], 0), "faceY": FACE_Y.get(a["id"], 0), "rows": a["rows"]})
    for aid, name, color, price, text in NEW_AVATARS:
        avatars.append({"id": aid, "name": name, "color": color, "price": price,
                        "hatY": HAT_Y.get(aid, 0), "faceY": FACE_Y.get(aid, 0), "rows": grid(text)})
    data["avatars"] = avatars
    with open(SPRITES, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    items = []
    for iid, slot, name, price, rows in ITEMS:
        assert len(rows) == N and all(len(r) == N for r in rows), iid
        items.append({"id": iid, "slot": slot, "name": name, "price": price, "rows": rows})
    with open(WARDROBE, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
        f.write("\n")
    sync_rules(avatars, items)
    print("avatars", len(avatars), "items", len(items))


if __name__ == "__main__":
    main()
