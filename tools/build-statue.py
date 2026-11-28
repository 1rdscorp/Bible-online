#!/usr/bin/env python3
"""
Builds the statue of Daniel 2 for #/explore/daniel-statue from the picture
tools/art/daniel-statue.jpg (needs Python 3 with Pillow and NumPy):

    python3 tools/build-statue.py        (npm run build-statue)

Writes, into img/daniel-statue/:
  statue.webp  the picture, cropped round the statue and the stone
  plate.webp   the same scene without them (filled in from around them),
               what is left when the stone has struck and the statue is gone
  stone.webp   the stone alone, with a transparent background, which grows
               into the mountain
and js/views/explore/statue-photo.js: the picture's size, the outline of
each part (what can be clicked, and what is lit when chosen), the shards the
statue breaks into, and where each part's label goes.

The outlines below are traced on the picture, in its pixels. Change them
(or the picture) and run this again; tests/explore.test.js checks the module
matches.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'tools' / 'art' / 'daniel-statue.jpg'
OUT_DIR = ROOT / 'img' / 'daniel-statue'
MODULE = ROOT / 'js' / 'views' / 'explore' / 'statue-photo.js'

# The part of the picture shown: the statue, the stone, and a little of the hall.
CROP = (330, 0, 1380, 2000)  # left, top, right, bottom, in the picture's pixels
SCALE = 0.56                 # the size the page needs: about 1100 pixels high

# Each part's outline, traced on the picture. A part can have several pieces.
PARTS = {
    'head': [[(746, 84), (790, 110), (814, 124), (820, 188), (832, 228), (844, 262), (848, 330), (852, 398), (842, 421), (800, 424),
              (750, 428), (705, 420), (682, 384), (650, 381), (615, 381), (598, 373), (624, 340), (634, 300), (641, 250), (650, 212),
              (660, 168), (668, 126), (708, 110)]],
    'chest': [[(598, 373), (615, 381), (650, 381), (682, 384), (705, 420), (750, 428), (800, 424), (842, 421), (852, 398), (874, 386),
               (904, 396), (942, 440), (966, 500), (986, 560), (999, 640), (1005, 750), (1005, 850), (1000, 920), (986, 966), (960, 975),
               (926, 955), (920, 900), (915, 820), (910, 760), (905, 700), (900, 640), (850, 626), (760, 623), (640, 626), (590, 632),
               (586, 730), (580, 800), (572, 860), (563, 902), (530, 940), (498, 938), (480, 912), (470, 870), (464, 820), (457, 740),
               (455, 650), (460, 560), (470, 480), (490, 422), (520, 386), (563, 364)]],
    'belly': [[(590, 632), (640, 626), (760, 623), (850, 626), (900, 640), (905, 700), (910, 760), (915, 820), (920, 900), (921, 990),
               (926, 1030), (914, 1060), (890, 1075), (885, 1120), (882, 1186), (735, 1186), (733, 1092), (716, 1080), (698, 1090),
               (697, 1186), (571, 1186), (565, 1110), (548, 1075), (542, 1030), (556, 960), (566, 900), (572, 860), (580, 800), (586, 730)]],
    'legs': [[(571, 1186), (697, 1186), (722, 1192), (718, 1300), (712, 1420), (708, 1520), (706, 1645), (592, 1645), (590, 1540),
              (582, 1420), (575, 1300), (568, 1220)],
             [(735, 1186), (882, 1186), (898, 1194), (896, 1300), (892, 1420), (888, 1520), (886, 1645), (778, 1645), (776, 1520),
              (772, 1420), (770, 1300), (764, 1220)]],
    'feet': [[(592, 1645), (706, 1645), (712, 1680), (730, 1710), (745, 1740), (748, 1772), (700, 1782), (620, 1783), (570, 1777),
              (567, 1740), (575, 1700), (588, 1670)],
             [(778, 1645), (886, 1645), (905, 1680), (940, 1710), (975, 1740), (996, 1768), (940, 1779), (860, 1783), (790, 1781),
              (763, 1771), (761, 1735), (771, 1690)]],
    'stone': [[(1200, 352), (1243, 361), (1276, 386), (1298, 410), (1322, 437), (1310, 487), (1305, 537), (1293, 595), (1268, 628),
               (1243, 653), (1200, 675), (1158, 662), (1108, 628), (1075, 595), (1050, 545), (1042, 487), (1062, 453), (1092, 403),
               (1125, 370), (1167, 356)]],
}
STATUE = ['head', 'chest', 'belly', 'legs', 'feet']
# Where each part's label sits beside the picture: the height of the part's middle.
LEVELS = {'head': 255, 'chest': 520, 'belly': 880, 'legs': 1410, 'feet': 1712}


def mask_of(pieces, size, offset=(0, 0), scale=1.0, grow=0):
    """A black-and-white mask of outlines (white inside)."""
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    for piece in pieces:
        draw.polygon([((x - offset[0]) * scale, (y - offset[1]) * scale) for x, y in piece], fill=255)
    if grow:
        mask = mask.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    return mask


def fill_in(image, hole):
    """
    Fill the hole (True where unknown) from what's around it, coarse to fine:
    average the known pixels into ever smaller images, then paint each hole
    from the smaller image above it, so it takes on the colours round it.
    """
    levels = []
    color = np.asarray(image, dtype=np.float64)
    known = (~hole).astype(np.float64)
    while min(color.shape[:2]) > 4:
        levels.append((color, known))
        h, w = color.shape[0] // 2 * 2, color.shape[1] // 2 * 2
        weighted = (color[:h, :w] * known[:h, :w, None]).reshape(h // 2, 2, w // 2, 2, 3).sum(axis=(1, 3))
        weight = known[:h, :w].reshape(h // 2, 2, w // 2, 2).sum(axis=(1, 3))
        color = np.where(weight[..., None] > 0, weighted / np.maximum(weight, 1e-9)[..., None], 0)
        known = (weight > 0).astype(np.float64)
    filled = color
    for color, known in reversed(levels):
        up = np.repeat(np.repeat(filled, 2, axis=0), 2, axis=1)
        up = np.pad(up, ((0, color.shape[0] - up.shape[0]), (0, color.shape[1] - up.shape[1]), (0, 0)), mode='edge')
        up = np.asarray(Image.fromarray(up.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float64)
        filled = np.where(known[..., None] > 0, color, up)
    return Image.fromarray(filled.clip(0, 255).astype(np.uint8))


def clip_to(subject, quad):
    """The part of a polygon inside a convex quadrilateral (Sutherland–Hodgman)."""
    def side(a, b, p):
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    # The quadrilateral runs clockwise on screen (y down): inside is side >= 0.
    output = list(subject)
    for i in range(len(quad)):
        a, b = quad[i], quad[(i + 1) % len(quad)]
        points, output = output, []
        for j in range(len(points)):
            p, q = points[j], points[(j + 1) % len(points)]
            p_in, q_in = side(a, b, p) >= 0, side(a, b, q) >= 0
            if p_in:
                output.append(p)
            if p_in != q_in:
                t = side(a, b, p) / (side(a, b, p) - side(a, b, q))
                output.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
        if not output:
            return []
    return output


def shards(pieces, columns=7, rows=19, seed=7):
    """
    The statue in shards: a grid of quadrilaterals over it, their inner
    corners moved a little, each cut to the statue's outline. Returns
    [(pieces, middle y)], only shards with some of the statue in them.
    """
    rng = np.random.default_rng(seed)
    xs = [x for piece in pieces for x, _ in piece]
    ys = [y for piece in pieces for _, y in piece]
    left, right, top, bottom = min(xs) - 4, max(xs) + 4, min(ys) - 4, max(ys) + 4
    grid = np.zeros((rows + 1, columns + 1, 2))
    for r in range(rows + 1):
        for c in range(columns + 1):
            x = left + (right - left) * c / columns
            y = top + (bottom - top) * r / rows
            # Inner corners move a little, so the pieces aren't a grid.
            if 0 < r < rows and 0 < c < columns:
                x += rng.uniform(-0.35, 0.35) * (right - left) / columns
                y += rng.uniform(-0.35, 0.35) * (bottom - top) / rows
            grid[r, c] = (x, y)
    out = []
    for r in range(rows):
        for c in range(columns):
            quad = [tuple(grid[r, c]), tuple(grid[r, c + 1]), tuple(grid[r + 1, c + 1]), tuple(grid[r + 1, c])]
            cut = [clip_to(piece, quad) for piece in pieces]
            cut = [[(round(x, 1), round(y, 1)) for x, y in piece] for piece in cut if len(piece) >= 3]
            if cut:
                out.append((cut, round(sum(y for _, y in quad) / 4)))
    return out


def path(pieces):
    return ''.join('M' + 'L'.join(f'{x:g} {y:g}' for x, y in piece) + 'Z' for piece in pieces)


def main():
    source = Image.open(SOURCE).convert('RGB')
    crop = source.crop(CROP)
    size = (round(crop.width * SCALE), round(crop.height * SCALE))
    picture = crop.resize(size, Image.LANCZOS)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    picture.save(OUT_DIR / 'statue.webp', quality=80, method=6)

    # The scene without the statue and the stone.
    everything = [piece for part in STATUE + ['stone'] for piece in PARTS[part]]
    hole = np.asarray(mask_of(everything, size, offset=CROP[:2], scale=SCALE, grow=6), dtype=bool)
    plate = fill_in(picture, hole)
    # Soften the filled-in part a little more: it stands in for dust and haze.
    soft = plate.filter(ImageFilter.GaussianBlur(6))
    plate = Image.composite(soft, plate, mask_of(everything, size, offset=CROP[:2], scale=SCALE, grow=10).filter(ImageFilter.GaussianBlur(4)))
    plate.save(OUT_DIR / 'plate.webp', quality=74, method=6)

    # The stone alone, at the picture's full size: it is shown much larger as the mountain.
    stone = PARTS['stone'][0]
    box = (min(x for x, _ in stone) - 6, min(y for _, y in stone) - 6, max(x for x, _ in stone) + 6, max(y for _, y in stone) + 6)
    alpha = mask_of([stone], (box[2] - box[0], box[3] - box[1]), offset=box[:2]).filter(ImageFilter.GaussianBlur(1.5))
    cut = source.crop(box).convert('RGBA')
    cut.putalpha(alpha)
    cut.save(OUT_DIR / 'stone.webp', quality=82, method=6)

    module = {
        'viewBox': ' '.join(str(v) for v in (CROP[0], CROP[1], CROP[2] - CROP[0], CROP[3] - CROP[1])),
        'picture': {'width': size[0], 'height': size[1]},
        'stone': {'x': box[0], 'y': box[1], 'width': box[2] - box[0], 'height': box[3] - box[1]},
        'parts': {part: path(pieces) for part, pieces in PARTS.items()},
        'statue': path([piece for part in STATUE for piece in PARTS[part]]),
        'shards': [{'d': path(cut), 'y': y} for cut, y in shards([piece for part in STATUE for piece in PARTS[part]])],
        'levels': {part: round((y - CROP[1]) / (CROP[3] - CROP[1]) * 100, 1) for part, y in LEVELS.items()},
    }
    MODULE.write_text(
        '// Generated by tools/build-statue.py from tools/art/daniel-statue.jpg: don\'t edit by hand.\n'
        '// The picture of the statue of Daniel 2, in its own pixels: the outline of each part,\n'
        '// the shards it breaks into, and where each part\'s label goes (percent of the height).\n\n'
        f'export const STATUE_PHOTO = Object.freeze({json.dumps(module, indent=2, ensure_ascii=False)});\n',
        encoding='utf8',
    )
    sizes = ', '.join(f"{p.name} {p.stat().st_size // 1024} KB" for p in sorted(OUT_DIR.glob('*.webp')))
    print(f'img/daniel-statue: {sizes}; {len(module["shards"])} shards')


if __name__ == '__main__':
    main()
