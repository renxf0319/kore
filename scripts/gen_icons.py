#!/usr/bin/env python3
"""生成 Inkwell 应用图标全套（无第三方依赖，纯标准库写 PNG/ICO/ICNS）。
输出到 src-tauri/icons/：32x32.png, 128x128.png, 128x128@2x.png(256),
icon.png(512), icon.ico, icon.icns。
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)

SIZE = 512
R = 112  # 圆角半径


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


TOP = (99, 102, 241)     # #6366F1
BOTTOM = (67, 56, 202)   # #4338CA


def render(size):
    """返回 RGBA bytes（length size*size*4），圆角品牌方块。"""
    buf = bytearray(size * size * 4)
    scale = size / SIZE
    r = R * scale
    center = (size - 1) / 2.0
    for y in range(size):
        t = y / max(1, size - 1)
        base = lerp(TOP, BOTTOM, t)
        for x in range(size):
            # 圆角遮罩
            cx = min(x, size - 1 - x)
            cy = min(y, size - 1 - y)
            alpha = 255
            if cx < r and cy < r:
                d = math.hypot(r - cx, r - cy)
                if d > r:
                    alpha = 0
            idx = (y * size + x) * 4
            buf[idx] = base[0]
            buf[idx + 1] = base[1]
            buf[idx + 2] = base[2]
            buf[idx + 3] = alpha
    return bytes(buf)


def write_png(path, w, h, rgba):
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)
        raw.extend(rgba[y * stride:(y + 1) * stride])
    comp = zlib.compress(bytes(raw), 9)

    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))


def downscale(src, src_size, dst_size):
    """最近邻缩放（图标用足够）。"""
    out = bytearray(dst_size * dst_size * 4)
    for y in range(dst_size):
        sy = min(src_size - 1, int(y * src_size / dst_size))
        for x in range(dst_size):
            sx = min(src_size - 1, int(x * src_size / dst_size))
            si = (sy * src_size + sx) * 4
            di = (y * dst_size + x) * 4
            out[di:di + 4] = src[si:si + 4]
    return bytes(out)


def write_ico(path, sizes_png):
    # sizes_png: list of (w, rgba_bytes)
    entries = []
    data_parts = []
    offset = 6 + 16 * len(sizes_png)
    for w, rgba in sizes_png:
        png = _png_bytes(w, w, rgba)
        entries.append((w, png))
        data_parts.append(png)
    with open(path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(entries)))
        off = 6 + 16 * len(entries)
        for w, png in entries:
            bpp = 32
            f.write(struct.pack("<BBBBHHII", w if w < 256 else 0,
                                w if w < 256 else 0, 0, 0, 1, bpp,
                                len(png), off))
            off += len(png)
        for _, png in entries:
            f.write(png)


def _png_bytes(w, h, rgba):
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)
        raw.extend(rgba[y * stride:(y + 1) * stride])
    comp = zlib.compress(bytes(raw), 9)

    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) +
            chunk(b"IDAT", comp) + chunk(b"IEND", b""))


def write_icns(path, sizes_png):
    # sizes_png: list of (type4, w, rgba_bytes)
    body = bytearray()
    for typ, w, rgba in sizes_png:
        png = _png_bytes(w, w, rgba)
        body += typ + struct.pack(">I", len(png) + 8) + png
    with open(path, "wb") as f:
        f.write(b"icns")
        f.write(struct.pack(">I", len(body) + 8))
        f.write(body)


base = render(SIZE)
write_png(os.path.join(OUT, "icon.png"), SIZE, SIZE, base)
write_png(os.path.join(OUT, "32x32.png"), 32, 32, downscale(base, SIZE, 32))
write_png(os.path.join(OUT, "128x128.png"), 128, 128, downscale(base, SIZE, 128))
write_png(os.path.join(OUT, "128x128@2x.png"), 256, 256, downscale(base, SIZE, 256))

ico_sizes = [
    (32, downscale(base, SIZE, 32)),
    (128, downscale(base, SIZE, 128)),
    (256, downscale(base, SIZE, 256)),
]
write_ico(os.path.join(OUT, "icon.ico"), ico_sizes)

icns_sizes = [
    (b"ic07", 128, downscale(base, SIZE, 128)),
    (b"ic08", 256, downscale(base, SIZE, 256)),
    (b"ic09", 512, base),
]
write_icns(os.path.join(OUT, "icon.icns"), icns_sizes)

print("icons written to", OUT)
for n in sorted(os.listdir(OUT)):
    print(" -", n)
