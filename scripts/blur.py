#!/usr/bin/env python3
"""Blur the address block on a scan and shrink it for the web.

    python3 scripts/blur.py raw/IMG_0042.tif covers/2026-thinice-tuk.jpg 430 330 710 470
                            in                out                        x0  y0  x1  y1

The box is in pixels of the SOURCE image: left, top, right, bottom. Open the
scan in any viewer, read the corners of the address block off the cursor
position, and pass them here.

Run this on the private side, before the file ever reaches the project folder.
The originals stay wherever you keep them; only the output belongs in covers/.
"""

import sys
from pathlib import Path

from PIL import Image, ImageFilter

RADIUS = 9        # px. Below about 6 a sharpening filter can recover the text.
LONG_EDGE = 1600  # px. Enough to read a cachet, far too little for anything else.
QUALITY = 86

if len(sys.argv) != 7:
    sys.exit(__doc__)

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
box = tuple(int(v) for v in sys.argv[3:7])

image = Image.open(src).convert("RGB")           # drop alpha: JPEG cannot store it
if box[2] <= box[0] or box[3] <= box[1]:
    sys.exit("The box must be x0 y0 x1 y1 with x1 > x0 and y1 > y0.")

# Blur BEFORE the resize, or the downscale interpolates traces of the original.
image.paste(image.crop(box).filter(ImageFilter.GaussianBlur(RADIUS)), box)
image.thumbnail((LONG_EDGE, LONG_EDGE))          # in place, never upscales
dst.parent.mkdir(parents=True, exist_ok=True)
image.save(dst, quality=QUALITY, optimize=True)

print(f"{dst}  {image.size[0]}x{image.size[1]}  {dst.stat().st_size / 1024:.0f} kB")
print("Open it and check the address is gone before you commit anything.")
