#!/usr/bin/env python3
"""
The picture of the statue of Daniel 2 for #/explore/daniel-statue, from
tools/art/daniel-statue.jpg (needs Python 3 with Pillow):

    python3 tools/build-statue.py        (npm run build-statue)

Writes img/daniel-statue/statue.webp: the whole picture, large enough for
full screen. The page shows it cropped round the statue and the stone, with
numbered points on the parts. The crop and the points are in the page's
content (data/study/explore/daniel-statue.json: stage.image, stage.crop and
each part's "at"), in the picture's own pixels (1493 × 2000), so a new
picture of the same size keeps them; another size needs them moved.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'tools' / 'art' / 'daniel-statue.jpg'
OUTPUT = ROOT / 'img' / 'daniel-statue' / 'statue.webp'
WIDTH = 1120  # about 1500 pixels high: sharp in full screen on most screens


def main():
    picture = Image.open(SOURCE).convert('RGB')
    size = (WIDTH, round(picture.height * WIDTH / picture.width))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    picture.resize(size, Image.LANCZOS).save(OUTPUT, quality=80, method=6)
    print(f'img/daniel-statue/statue.webp: {size[0]} × {size[1]}, {OUTPUT.stat().st_size // 1024} KB (from {picture.width} × {picture.height})')


if __name__ == '__main__':
    main()
