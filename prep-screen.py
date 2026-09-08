"""Turn a raw device screenshot into an app-screen variant for the carousel.

    python prep-screen.py <raw.png> assets/screens/<slot>/<nn>.jpg
    python prep-screen.py <raw.png> <out.jpg> --top 170        # cut deeper
    python prep-screen.py <raw.png> --probe                    # just look at it

WHY THIS EXISTS
---------------
The four app screenshots are the only slides whose picture used to be the same
file on every carousel, which is exactly the shape a feed dedupe notices. The
fix is more than one genuinely different capture per slot, and more captures
means this crop has to be repeatable rather than eyeballed once in an editor.

WHAT IT CUTS, AND WHY EACH ONE
------------------------------
top     The status bar. It is somebody's clock, battery and signal strength -
        it says "screen recording" rather than "app", and on a 594px-wide
        render it is an illegible smear of glyphs either way. Default 96,
        which clears the A52s bar (its glyphs measure rows 44-76).

        Override it when the capture was taken mid-scroll and a slice of the
        previous screen is still at the top: `--probe` prints where the first
        content row is so the cut can land under it.

sides   14px carries the scroll indicator on this device - a bright 1px rail
        against a 22-grey page. Left in, it reads as a rendering seam down the
        edge of the phone. 16 takes it plus a pixel of rounding.

bottom  Nothing, by default. The template runs the screenshot off the foot of
        the slide anyway, so whatever is down there is a bleed, not a border.

The output keeps the source's own aspect - the renderer scales to width and
lets the height fall where it falls, so cropping to a fixed shape here would
just fight it.
"""

import os
import sys

from PIL import Image

TOP = 96      # clears the A52s status bar
SIDE = 16     # clears the scroll indicator
QUALITY = 92


def probe(path):
    """Print where the status bar ends and where the content starts."""
    img = Image.open(path).convert("RGB")
    w, h = img.size
    pixels = img.load()
    print(f"{os.path.basename(path)}  {w}x{h}")

    # Status-bar glyphs are the bright pixels in the top strip.
    bright_rows = []
    for y in range(0, min(200, h)):
        n = sum(1 for x in range(0, w, 4) if sum(pixels[x, y]) / 3 > 150)
        if n > 1:
            bright_rows.append(y)
    if bright_rows:
        print(f"  bright rows in the top 200: {bright_rows[0]}-{bright_rows[-1]}")
        print(f"  a cut at {TOP} clears a bar ending by {TOP - 1}")
    else:
        print("  no bright rows up top - nothing obviously in the way")

    # A row that is not flat page-grey is a row with something on it.
    for y in range(TOP, min(h, TOP + 600)):
        row = [sum(pixels[x, y]) / 3 for x in range(SIDE, w - SIDE, 8)]
        if max(row) - min(row) > 12:
            print(f"  first row carrying content below the cut: {y}")
            break


def prep(src, dst, top=TOP, side=SIDE, bottom=0):
    img = Image.open(src).convert("RGB")
    w, h = img.size
    box = (side, top, w - side, h - bottom)
    if box[2] <= box[0] or box[3] <= box[1]:
        raise SystemExit(f"nothing left after cropping {src} by {box}")
    out = img.crop(box)
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    out.save(dst, "JPEG", quality=QUALITY, optimize=True)
    print(f"{os.path.basename(src)} {w}x{h}  ->  {dst}  {out.width}x{out.height}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    def opt(name, fallback):
        flag = f"--{name}"
        return int(sys.argv[sys.argv.index(flag) + 1]) if flag in sys.argv else fallback

    if not args:
        raise SystemExit(__doc__)
    if "--probe" in sys.argv:
        probe(args[0])
    elif len(args) < 2:
        raise SystemExit("usage: prep-screen.py <raw.png> <out.jpg> [--top N] [--side N] [--bottom N]")
    else:
        prep(args[0], args[1], opt("top", TOP), opt("side", SIDE), opt("bottom", 0))
