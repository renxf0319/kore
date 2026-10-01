#!/usr/bin/env python3
"""从品牌源图生成 Kore 的 logo 资源与应用图标。

源图是一张浅灰底的 "Kore" 横向字标：K 的竖笔为深藏青 #394958，
K 的折角与底部横尾为青色 #209EBB。

脚本流程：
  1. 抠底 —— 用「与背景色的最大通道差」反推 alpha，边缘保留抗锯齿；
  2. 分色 —— 用 HSV 的 value 把「亮而艳」的青色与「暗」的藏青分开
     （不能用色相：两者都在蓝区，色相几乎一样）；
  3. 切 K 标记 —— 连通域分析丢掉右侧的 "o"；折角内部那行极小的 "Kore"
     字样（左右都被青色包夹）一并刷成青色，避免 20~30px 下一团糊；
  4. 出图 —— 明/暗两套配色的字标与标记，外加一套应用图标。

依赖：Pillow、numpy

用法：
    python scripts/gen_logo.py <源图路径>
也可用环境变量 KORE_LOGO_SRC 指定默认源图。
"""
import io
import os
import struct
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_WEB = os.path.join(REPO, "src", "assets")
OUT_ICONS = os.path.join(REPO, "src-tauri", "icons")

# --- 源图量测值（2048x2048 原图坐标，左闭右开） -------------------------------
BOX_WORDMARK = (471, 778, 1613, 1246)   # 整条 "Kore"
BOX_MARK = (471, 778, 966, 1245)        # 含 K 竖笔 + 折角 + 横尾；右侧紧邻 "o"

BG = np.array([244.0, 244.0, 246.0])    # 源图浅灰底
CYAN = np.array([32.0, 158.0, 187.0])   # #209EBB
NAVY = np.array([57.0, 73.0, 88.0])     # #394958
NEAR_WHITE = np.array([246.0, 248.0, 250.0])

ALPHA_FLOOR = 10.0   # 差值低于此值 = 纯背景
ALPHA_SPAN = 165.0   # 差值达到此值 = 完全不透明
INK_DIFF = 40        # 判定「有墨水」的差值阈值
CYAN_MIN_SAT = 80    # 青色：饱和度下限（PIL HSV 0..255）
CYAN_MIN_VAL = 130   # 青色：明度下限 —— 藏青 val≈88，青色 val≈187

PLATE_TOP = np.array([46.0, 60.0, 74.0])
PLATE_BOTTOM = np.array([28.0, 38.0, 49.0])


def cutout(img):
    """返回 (rgb_float, alpha 0..1)。"""
    rgb = np.asarray(img.convert("RGB")).astype(np.float64)
    diff = np.abs(rgb - BG).max(axis=2)
    alpha = np.clip((diff - ALPHA_FLOOR) / ALPHA_SPAN, 0.0, 1.0)
    return rgb, alpha


def masks(img):
    """返回 (ink, is_cyan)：墨水像素 & 其中判定为青色的像素。"""
    rgb = np.asarray(img.convert("RGB")).astype(np.float64)
    hsv = np.asarray(img.convert("HSV")).astype(np.float64)
    ink = np.abs(rgb - BG).max(axis=2) > INK_DIFF
    is_cyan = ink & (hsv[:, :, 1] > CYAN_MIN_SAT) & (hsv[:, :, 2] > CYAN_MIN_VAL)
    return ink, is_cyan


def keep_main_component(ink, is_cyan):
    """8 连通域分析：只保留 K 标记那一块，丢掉右侧独立的 "o"。"""
    h, w = ink.shape
    seen = np.zeros((h, w), dtype=bool)
    best = None
    for y0 in range(h):
        row = np.flatnonzero(ink[y0] & ~seen[y0])
        for x0 in row:
            if seen[y0, x0]:
                continue
            queue = deque([(y0, x0)])
            seen[y0, x0] = True
            pts = []
            while queue:
                y, x = queue.popleft()
                pts.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and ink[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            queue.append((ny, nx))
            if best is None or len(pts) > len(best):
                best = pts
    keep = np.zeros((h, w), dtype=bool)
    if best:
        ys = np.fromiter((p[0] for p in best), dtype=int, count=len(best))
        xs = np.fromiter((p[1] for p in best), dtype=int, count=len(best))
        keep[ys, xs] = True
    return keep


def fill_enclosed(is_cyan):
    """把被青色完全包围的「洞」也算作青色。

    折角里那行极小的 "Kore" 是深色字压在青色上，抠出来是半透明的杂色像素，
    逐个判色判不干净；当成洞整体填掉最利落。做法：从图像四边向内做一次
    flood fill，走不到的区域就是被包围的洞。
    """
    h, w = is_cyan.shape
    free = ~is_cyan
    reachable = np.zeros((h, w), dtype=bool)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if free[y, x] and not reachable[y, x]:
                reachable[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if free[y, x] and not reachable[y, x]:
                reachable[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and free[ny, nx] and not reachable[ny, nx]:
                reachable[ny, nx] = True
                queue.append((ny, nx))
    holes = free & ~reachable
    return is_cyan | holes, holes


def compose(alpha, color_mask, base, keep=None, solid=None):
    """按目标底色重建图像：color_mask 内的像素取品牌青，其余统一为目标色。"""
    color = np.broadcast_to(base, alpha.shape + (3,)).copy()
    color[color_mask] = CYAN
    a = alpha.copy()
    if solid is not None:
        a[solid] = 1.0
    if keep is not None:
        a = np.where(keep, a, 0.0)
    rgba = np.dstack([color, a * 255.0]).round().clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def trim(img, pad=0):
    box = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if box is None:
        return img
    l, t, r, b = box
    return img.crop((max(0, l - pad), max(0, t - pad), r + pad, b + pad))


def scale_h(img, height):
    w, h = img.size
    return img.resize((max(1, round(w * height / h)), height), Image.LANCZOS)


def build_plate(size, radius):
    ys = np.linspace(0.0, 1.0, size)[:, None, None]
    grad = PLATE_TOP * (1 - ys) + PLATE_BOTTOM * ys
    grad = np.repeat(grad, size, axis=1)
    rgba = np.dstack([grad, np.full((size, size, 1), 255.0)])
    img = Image.fromarray(rgba.round().astype(np.uint8), "RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    img.putalpha(mask)
    return img


def png_bytes(img):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def write_ico(path, entries):
    """手写 ICO（内嵌 PNG），避免依赖平台特定的 .ico 写出实现。"""
    payload = [(size, png_bytes(img)) for size, img in entries]
    with open(path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(payload)))
        off = 6 + 16 * len(payload)
        for size, data in payload:
            dim = 0 if size >= 256 else size
            f.write(struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), off))
            off += len(data)
        for _, data in payload:
            f.write(data)


def write_icns(path, entries):
    """手写 icns（PNG 载荷）。"""
    body = bytearray()
    for typ, img in entries:
        data = png_bytes(img)
        body += typ + struct.pack(">I", len(data) + 8) + data
    with open(path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", len(body) + 8) + bytes(body))


def report(path, img, note=""):
    rel = os.path.relpath(path, REPO).replace("\\", "/")
    print(f"  {rel:<40} {img.size[0]}x{img.size[1]}  {note}")


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("KORE_LOGO_SRC", "")
    if not src or not os.path.exists(src):
        print("找不到源图。用法：python scripts/gen_logo.py <源图路径>", file=sys.stderr)
        return 1

    os.makedirs(OUT_WEB, exist_ok=True)
    os.makedirs(OUT_ICONS, exist_ok=True)
    full = Image.open(src)

    # ---------- 字标：保留全部字形细节 ----------
    print("[1/3] 字标 wordmark")
    crop = full.crop(BOX_WORDMARK)
    alpha = cutout(crop)[1]
    _, is_cyan = masks(crop)
    for theme, base, note in (("light", NAVY, "明色主题"), ("dark", NEAR_WHITE, "暗色主题")):
        img = scale_h(trim(compose(alpha, is_cyan, base)), 220)
        path = os.path.join(OUT_WEB, f"logo-wordmark-{theme}.png")
        img.save(path, optimize=True)
        report(path, img, note)

    # ---------- K 标记：丢掉右侧 "o"，填掉折角内那行小字 ----------
    print("[2/3] K 标记 mark")
    crop = full.crop(BOX_MARK)
    alpha = cutout(crop)[1]
    ink, is_cyan = masks(crop)
    keep = keep_main_component(ink, is_cyan)
    is_cyan = is_cyan & keep
    is_cyan, holes = fill_enclosed(is_cyan)
    marks = {}
    for theme, base, note in (("light", NAVY, "明色主题"), ("dark", NEAR_WHITE, "暗色主题")):
        img = trim(compose(alpha, is_cyan, base, keep, solid=holes))
        marks[theme] = img
        out = img.resize((256, round(256 * img.size[1] / img.size[0])), Image.LANCZOS)
        path = os.path.join(OUT_WEB, f"logo-mark-{theme}.png")
        out.save(path, optimize=True)
        report(path, out, note)

    # ---------- 应用图标：藏青圆角底板 + 反白 K ----------
    print("[3/3] 应用图标 icons")
    mark = scale_h(marks["dark"], 320)
    tiles = {}
    for size in (512, 256, 128, 64, 32):
        tile = build_plate(size, radius=round(size * 0.222))
        m = mark.copy()
        m.thumbnail((round(size * 0.62), round(size * 0.62)), Image.LANCZOS)
        tile.alpha_composite(m, ((size - m.size[0]) // 2, (size - m.size[1]) // 2))
        tiles[size] = tile
    for size, name in ((512, "icon.png"), (256, "128x128@2x.png"),
                       (128, "128x128.png"), (32, "32x32.png")):
        path = os.path.join(OUT_ICONS, name)
        tiles[size].save(path)
        report(path, tiles[size])
    write_ico(os.path.join(OUT_ICONS, "icon.ico"), [(s, tiles[s]) for s in (32, 64, 128, 256)])
    print(f"  {'src-tauri/icons/icon.ico':<40} 32/64/128/256")
    write_icns(os.path.join(OUT_ICONS, "icon.icns"),
               [(b"ic07", tiles[128]), (b"ic08", tiles[256]), (b"ic09", tiles[512])])
    print(f"  {'src-tauri/icons/icon.icns':<40} 128/256/512")

    print("完成。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
