"""Cover frame for the podcast video track: night background, warm amber lamp accent, Chinese title (Noto Serif SC).

    python3 cover.py <book.json> <out.png> [size]      size: 720x720 (default) or 1280x720
"""
import json, sys, zlib, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from lib import locate, FONT_BOLD, FONT_REG

AMBER = (232, 168, 82)
INK = (236, 228, 214)
DIM = (150, 156, 172)


def font(bold, size):
    p = locate(FONT_BOLD if bold else FONT_REG, required=False)
    if not p:   # fall back to any installed CJK font
        try:
            p = subprocess.run(['fc-match', '-f', '%{file}', ':lang=zh'], capture_output=True, text=True).stdout.strip()
        except OSError:
            p = None
    return ImageFont.truetype(p, size) if p else ImageFont.load_default()


def wrap(draw, text, f, max_w):
    """greedy wrap for CJK (character level), keeps lines balanced"""
    if draw.textlength(text, font=f) <= max_w:
        return [text]
    n = 2
    while True:
        per = -(-len(text) // n)
        lines = [text[i:i + per] for i in range(0, len(text), per)]
        if all(draw.textlength(l, font=f) <= max_w for l in lines) or n > 4:
            return lines
        n += 1


def render(book, out, size='720x720'):
    W, H = map(int, size.split('x'))
    pod = book.get('podcast', {})
    title = pod.get('title') or book.get('title', '')
    sub = book.get('subtitle', '')
    seed = zlib.crc32(book.get('id', title).encode())
    rng = np.random.default_rng(seed)

    # night gradient + soft amber glow (the "lamp") low on the frame
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    top, bot = np.array([10, 13, 26], np.float32), np.array([24, 22, 38], np.float32)
    img = top + (bot - top) * (y / H)[..., None]
    cx, cy = W * 0.5, H * 0.80
    r = np.sqrt(((x - cx) / (W * 0.55)) ** 2 + ((y - cy) / (H * 0.42)) ** 2)
    glow = np.exp(-r ** 2 * 3.2)[..., None]
    img = img + glow * (np.array(AMBER, np.float32) * 0.30)
    # faint stars
    for _ in range(int(W * H / 5200)):
        sx, sy = rng.uniform(0, W), rng.uniform(0, H * 0.62)
        b = rng.uniform(0.15, 0.6) * (1 - sy / (H * 0.7))
        ix, iy = int(sx), int(sy)
        img[iy, ix] = img[iy, ix] * (1 - b) + 235 * b
    grain = rng.normal(0, 2.0, (H, W, 1)).astype(np.float32)
    im = Image.fromarray(np.clip(img + grain, 0, 255).astype(np.uint8))

    d = ImageDraw.Draw(im)
    s = min(W, H) / 720
    # lamp: a small amber disc with a halo, sitting on a thin horizon line
    halo = Image.new('L', (W, H), 0)
    hd = ImageDraw.Draw(halo)
    lx, ly = W * 0.5, H * 0.72
    hd.ellipse([lx - 46 * s, ly - 46 * s, lx + 46 * s, ly + 46 * s], fill=120)
    halo = halo.filter(ImageFilter.GaussianBlur(28 * s))
    im.paste(Image.new('RGB', (W, H), AMBER), (0, 0), halo)
    d = ImageDraw.Draw(im)
    d.ellipse([lx - 9 * s, ly - 9 * s, lx + 9 * s, ly + 9 * s], fill=(255, 214, 150))
    d.line([W * 0.5 - 150 * s, ly + 34 * s, W * 0.5 + 150 * s, ly + 34 * s], fill=(*AMBER,), width=max(1, int(2 * s)))

    # label, title, subtitle
    fl = font(False, int(24 * s))
    label = '播客 · 双人对谈'
    d.text((W / 2, H * 0.17), label, font=fl, fill=AMBER, anchor='mm')
    ft = font(True, int(68 * s))
    lines = wrap(d, title, ft, W * 0.82)
    if len(lines) > 2:
        ft = font(True, int(54 * s)); lines = wrap(d, title, ft, W * 0.84)
    lh = ft.size * 1.32
    y0 = H * 0.38 - (len(lines) - 1) * lh / 2
    for i, l in enumerate(lines):
        d.text((W / 2, y0 + i * lh), l, font=ft, fill=INK, anchor='mm')
    if sub:
        fs = font(False, int(26 * s))
        sl = wrap(d, sub, fs, W * 0.8)
        for i, l in enumerate(sl[:2]):
            d.text((W / 2, y0 + (len(lines) - 1) * lh + 86 * s + i * 38 * s), l, font=fs, fill=DIM, anchor='mm')
    im.save(out)
    return out


if __name__ == '__main__':
    b = json.load(open(sys.argv[1], encoding='utf-8'))
    render(b, sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else '720x720')
