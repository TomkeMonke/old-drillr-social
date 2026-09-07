"""Pillow renderer for the CLASSIC drillr carousel - the template the account
ran before the full-bleed one.

    python render.py out/<id>/spec.json
    python render.py --calibrate <folder-of-reference-slides>
    python render.py --font-sample

THE TWO FRAMES
--------------
Every slide is a 1080x1920 black frame with an off-white BAND sitting in the
middle of it, and all the artwork lives inside that band:

    +----------------------+  0
    |        black         |
    +----------------------+  458   <- band top
    |                      |
    |     the artwork      |        1080 x 1003
    |                      |
    +----------------------+  1461  <- band bottom
    |        black         |
    +----------------------+  1920

That is not decoration, it is a measurement. The reference carousels are
1179x1095 images, and TikTok shows a photo post fitted to the width of a 9:16
viewport with black filling the rest - which is exactly what the 28 reference
screenshots caught. Rendering the band at the same 1179:1095 aspect and letting
this file paint the bars means the output IS the old look at 9:16, rather than
an approximation of it re-flowed to a taller canvas.

BAND, NOT CANVAS, IS THE UNIT
-----------------------------
Every constant below is a fraction of the BAND (BAND_W x BAND_H), never of the
1080x1920 frame. Change the frame to 1080x1350 tomorrow and the layout still
lands correctly, because nothing is anchored to a bar whose height is an
accident of the aspect ratio.

WHERE THE NUMBERS CAME FROM
---------------------------
`--calibrate` measures a folder of reference JPEGs: it finds the band, segments
the dark rows into text lines and artwork boxes, and prints them as band
fractions. Every constant in LAYOUT was read off that against all 28 reference
slides, then font sizes were pinned by solving for the Archivo Black size whose
rendered ink width matches the measured ink width of the same string - which is
also what identified the face. Fifteen lines across five slide types matched
within 1.5% on width AND height, so the type here is not "similar to" the
originals, it is the same font at the same size.

The references were made by hand, so some of them disagree with each other -
the same headline carries a 523px phone in one carousel and a 716px phone in
another. Where they disagree the constant is the cluster centre, not one
slide's number.

THE TWO SHADOWS
---------------
Measured off the falloff profiles, and they are genuinely different:

  `frame`  symmetric, no offset, ~35px falloff. Wraps the hook photo, the app
           icon, the CTA photo and the progress-slide player shot.
  `phone`  offset down and slightly left, no shadow above or to the right.
           This is the one on the app screenshots, and it is what makes them
           read as a device standing on the slide rather than a pasted crop.
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

DIR = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(DIR, "fonts")

# ---- frame ----
FRAME = (1080, 1920)
BAND_ASPECT = 1179 / 1095     # the reference band, measured off all 28 slides
BAND_RGB = (249, 249, 249)    # sampled from the reference corners, not #fff
BAR_RGB = (0, 0, 0)
INK = (0, 0, 0)

# ---- type ----
FONT_FILE = "ArchivoBlack.ttf"
LINE_SPACING = 1.41           # line advance / font size, measured on 5 layouts
# Default text-box width, overridden per layout by `text_width`.
#
# The widest line in any reference slide measures 930/1179 = 0.789 of the band.
# The box has to be slightly wider than that, not equal to it: 930 is the INK,
# and wrapping is decided on the ADVANCE, which carries a side bearing at each
# end. Set to the measured figure exactly and the reference's own longest
# headline wraps to a third line.
#
# It is a per-layout number because the box is what decides WHERE a headline
# breaks, and the references break the hook much earlier than they break a
# feature line - "Top apps you need / to improve your / football skills" at 0.70
# of the band, against 0.79 on the feature slides. Run one width across both and
# the type is the right size on every slide and broken in the wrong places on
# the cover, which is the slide people actually stop on.
TEXT_WIDTH_PCT = 0.805
MIN_FONT_PCT = 0.020          # of band width; the floor autofit will not pass
# How far a headline may shrink to hold its preferred line count before the
# renderer gives up and lets it run to an extra line. 0.80 is a touch more than
# the references need - the longest of them drops 12% (59px to 52px) to stay on
# two lines - and well short of the point where one slide reads smaller than
# the next.
SOFT_FLOOR = 0.80

# ---- shadows ----
# (dx, dy, blur, opacity), the offsets and blur as fractions of band width.
SHADOW = {
    "frame": (0.000, 0.000, 0.0145, 0.90),
    "phone": (-0.006, 0.054, 0.0140, 0.90),
}
RADIUS_PCT = {"frame": 0.025, "phone": 0.020}   # of the artwork's shorter side

# ---- per-slide-type geometry, all as band fractions ----
#
# `size` is the STARTING font size. Autofit only ever shrinks from there, which
# is what the references do: the three feature slides sit at one size until a
# longer headline forces one of them down.
#
# `lines` is the line count the layout is BUILT around and `max_lines` the point
# at which it breaks. Every feature headline in the reference set is two lines;
# the hook is three, occasionally four. See fit_text for why both are needed.
LAYOUT = {
    # slide 1: headline, then a landscape photo floating under it
    "hook": {
        "text_top": 0.065,
        "size": 0.0687,
        "text_width": 0.720,
        "lines": 3,
        "max_lines": 4,
        "art": {"kind": "contain", "box": (0.645, 0.510), "centre": (0.500, 0.640),
                "shadow": "frame", "radius": "frame"},
    },
    # slide 2: "1.Drillr" over the app icon, square, dead centre
    "icon": {
        "text_top": 0.089,
        "size": 0.0908,
        "lines": 1,
        "max_lines": 1,
        "art": {"kind": "square", "width": 0.452, "centre": (0.500, 0.500),
                "shadow": "frame", "radius": "frame"},
    },
    # slides 3-5: headline, then an app screenshot running off the bottom edge
    "screen": {
        "text_top": 0.026,
        "size": 0.0500,
        "lines": 2,
        "max_lines": 3,
        "art": {"kind": "bleed", "width": 0.550, "centre_x": 0.500,
                "gap": 0.020, "shadow": "phone", "radius": "phone"},
    },
    # slide 6: same, but a player shot stands to the left of the screenshot.
    # Smaller type than slides 3-5 (49px against 59px on the references) and it
    # has to stay that way: this is the only slide carrying two pictures, and
    # the screenshot is pushed down by whatever the headline takes.
    "progress": {
        "text_top": 0.016,
        "size": 0.0416,
        "lines": 2,
        "max_lines": 3,
        "art": {"kind": "bleed", "width": 0.462, "centre_x": 0.682,
                "gap": 0.010, "shadow": "phone", "radius": "phone"},
        "aside": {"kind": "contain", "box": (0.372, 0.655), "centre": (0.235, 0.498),
                  "shadow": "frame", "radius": "frame"},
    },
    # slide 7: headline, photo, and a second line of type UNDER the photo
    "cta": {
        "text_top": 0.037,
        "size": 0.0619,
        "text_width": 0.720,
        "lines": 2,
        "max_lines": 3,
        "art": {"kind": "contain", "box": (0.660, 0.500), "centre": (0.500, 0.499),
                "shadow": "frame", "radius": "frame"},
        "footer": {"size": 0.0712, "top": 0.819},
    },
}


# ------------------------------------------------------------------ type

def load_font(size):
    path = os.path.join(FONTS, FONT_FILE)
    if not os.path.exists(path):
        raise SystemExit(
            "font not found: %s\nRun `node slideshow.mjs fonts` first." % path
        )
    return ImageFont.truetype(path, max(1, int(size)))


def wrap(text, font, max_width, draw):
    """Greedy word wrap. None if a single word overflows - caller shrinks."""
    words = text.split()
    if not words:
        return []
    lines, line = [], words[0]
    for word in words[1:]:
        probe = line + " " + word
        if draw.textlength(probe, font=font) <= max_width:
            line = probe
        else:
            lines.append(line)
            line = word
    lines.append(line)
    for candidate in lines:
        if draw.textlength(candidate, font=font) > max_width:
            return None
    return lines


def _largest_fitting(draw, text, start_size, max_width, line_cap, floor):
    # round, not truncate. The CTA size works out to 66.9px and int() takes the
    # 66, which reads as a 2% narrow headline against the reference - small
    # enough to survive an eyeball and not small enough to survive --calibrate.
    size = round(start_size)
    while size >= max(1, int(floor)):
        font = load_font(size)
        lines = wrap(text, font, max_width, draw)
        if lines is not None and len(lines) <= line_cap:
            return size, lines, font
        size -= 1
    return None


def fit_text(draw, text, start_size, max_width, lines_pref, lines_max, min_size):
    """Largest size <= start_size whose wrap fits the width and the line budget.

    Shrink-only on purpose. The references keep one size per slide type and let
    a long headline drop a step; growing short copy to fill the width instead
    would make "Drillr builds you a personalized meal plan" tower over the slide
    next to it, and the set would stop reading as one carousel.

    Two passes, because the line count matters more than the size does. Every
    feature headline in the reference set is exactly two lines, and a single
    pass with a three-line cap never produces that: it takes the three-line wrap
    at full size and returns immediately, since three lines is inside the cap.
    So pass one insists on `lines_pref` and will shrink up to SOFT_FLOOR to get
    it; only copy too long for even that falls through to pass two and runs to
    `lines_max` rather than shrinking into illegibility.
    """
    best = _largest_fitting(draw, text, start_size, max_width, lines_pref,
                            start_size * SOFT_FLOOR)
    if best:
        return best
    best = _largest_fitting(draw, text, start_size, max_width, lines_max, min_size)
    if best:
        return best
    # Unbreakable word wider than the box even at the floor. Render it rather
    # than crash: a cramped slide is reviewable, a stack trace at 3am is not.
    floor = max(1, int(min_size))
    font = load_font(floor)
    return floor, wrap(text, font, max_width, draw) or [text], font


def draw_block(draw, text, band_w, band_h, top_pct, size_pct, width_pct, lines_pref, lines_max):
    """Centred, top-anchored block of headline type. Returns its ink bottom.

    Anchored on the INK of the first line rather than on the font's ascender
    box: `text_top` was measured off reference pixels, and Archivo Black leaves
    a chunk of empty ascender above the cap. Anchoring on the box would push
    every headline down by that gap.
    """
    max_width = band_w * width_pct
    size, lines, font = fit_text(
        draw, text, band_w * size_pct, max_width, lines_pref, lines_max,
        band_w * MIN_FONT_PCT
    )
    advance = size * LINE_SPACING

    # Where the first line's ink starts, relative to a top-anchored draw.
    probe = font.getbbox(lines[0]) if lines else (0, 0, 0, 0)
    y = band_h * top_pct - probe[1]

    bottom = band_h * top_pct
    for i, line in enumerate(lines):
        draw.text((band_w / 2, y + i * advance), line, font=font, fill=INK, anchor="ma")
        box = font.getbbox(line)
        bottom = max(bottom, y + i * advance + box[3])
    return bottom


# ------------------------------------------------------------------ artwork

def rounded(img, radius):
    img = img.convert("RGBA")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, img.width - 1, img.height - 1), radius=max(0, int(radius)), fill=255
    )
    img.putalpha(mask)
    return img


def paste_clipped(canvas, layer, x, y):
    """alpha_composite that tolerates a layer hanging off the frame.

    Not optional here: the app screenshots deliberately run past the bottom of
    the band, and Pillow refuses a composite that does not fit entirely inside
    the destination.
    """
    left, top = max(0, -x), max(0, -y)
    right = min(layer.width, canvas.width - x)
    bottom = min(layer.height, canvas.height - y)
    if right <= left or bottom <= top:
        return
    if (left, top, right, bottom) != (0, 0, layer.width, layer.height):
        layer = layer.crop((left, top, right, bottom))
    canvas.alpha_composite(layer, (x + left, y + top))


def place(canvas, img, x, y, radius, shadow, band_w):
    """Drop `img` at (x, y) with its rounded corners and its shadow.

    The shadow is painted into a scratch layer the size of the whole band and
    blurred there, not blurred in a tight box and pasted: a tight box clips the
    blur at its own edge and leaves a visible seam exactly where the softest
    part of the shadow should be.
    """
    dx, dy, blur, alpha = SHADOW[shadow]
    radius = int(min(img.width, img.height) * radius)

    scratch = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(scratch).rounded_rectangle(
        (x + band_w * dx, y + band_w * dy,
         x + band_w * dx + img.width - 1, y + band_w * dy + img.height - 1),
        radius=radius,
        fill=(0, 0, 0, int(255 * alpha)),
    )
    scratch = scratch.filter(ImageFilter.GaussianBlur(band_w * blur))
    canvas.alpha_composite(scratch)

    paste_clipped(canvas, rounded(img, radius), int(x), int(y))


def contain(img, box_w, box_h):
    """Scale to fit inside the box, keeping the source aspect.

    Contain rather than cover, because the references clearly keep each photo's
    own shape - the CTA photos measure 775x517 in one carousel and 796x468 in
    another, off the same slot. Cropping to a fixed box would be tidier and
    would not be the template.
    """
    scale = min(box_w / img.width, box_h / img.height)
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))),
                      Image.LANCZOS)


def draw_art(canvas, spec, art, text_bottom, band_w, band_h):
    path = spec.get("image")
    if not path or not os.path.exists(path):
        return
    img = Image.open(path).convert("RGB")
    kind = art["kind"]

    if kind == "square":
        side = round(band_w * art["width"])
        # cover, not contain: the icon is square already, and a source that is
        # a few pixels off square should crop rather than leave a white edge.
        scale = max(side / img.width, side / img.height)
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
        img = img.crop(((img.width - side) // 2, (img.height - side) // 2,
                        (img.width - side) // 2 + side, (img.height - side) // 2 + side))
        cx, cy = art["centre"]
        place(canvas, img, band_w * cx - side / 2, band_h * cy - side / 2,
              RADIUS_PCT[art["radius"]], art["shadow"], band_w)

    elif kind == "contain":
        box_w, box_h = art["box"]
        img = contain(img, band_w * box_w, band_h * box_h)
        cx, cy = art["centre"]
        place(canvas, img, band_w * cx - img.width / 2, band_h * cy - img.height / 2,
              RADIUS_PCT[art["radius"]], art["shadow"], band_w)

    else:  # "bleed": width-driven, top under the headline, off the bottom edge
        target_w = round(band_w * art["width"])
        img = img.resize((target_w, max(1, round(img.height * target_w / img.width))),
                         Image.LANCZOS)
        top = text_bottom + band_h * art["gap"]
        place(canvas, img, band_w * art["centre_x"] - target_w / 2, top,
              RADIUS_PCT[art["radius"]], art["shadow"], band_w)


# ------------------------------------------------------------------ slides

def band_size(frame_w, frame_h):
    """The artwork band inside the frame: full width, reference aspect."""
    band_w = frame_w
    band_h = round(band_w / BAND_ASPECT)
    if band_h > frame_h:            # a frame squarer than the band itself
        band_h = frame_h
        band_w = round(band_h * BAND_ASPECT)
    return band_w, band_h


def draw_slide(slide, spec):
    frame_w, frame_h = spec.get("width", FRAME[0]), spec.get("height", FRAME[1])
    band_w, band_h = band_size(frame_w, frame_h)

    band = Image.new("RGBA", (band_w, band_h), BAND_RGB + (255,))
    draw = ImageDraw.Draw(band)
    layout = LAYOUT[slide["type"]]

    text_bottom = band_h * layout["text_top"]
    if slide.get("text"):
        text_bottom = draw_block(draw, slide["text"], band_w, band_h,
                                 layout["text_top"], layout["size"],
                                 layout.get("text_width", TEXT_WIDTH_PCT),
                                 layout["lines"], layout["max_lines"])

    # The aside goes down first so the screenshot's shadow falls over it, the
    # way it does in the references.
    if "aside" in layout and slide.get("aside"):
        draw_art(band, {"image": slide["aside"]}, layout["aside"], text_bottom, band_w, band_h)
    if "art" in layout:
        draw_art(band, slide, layout["art"], text_bottom, band_w, band_h)

    # The footer sits UNDER the artwork by design - it is the only line in the
    # template that does, and it is why the CTA photo has a fixed centre
    # instead of being centred in the space below the headline.
    footer = layout.get("footer")
    if footer and slide.get("footer"):
        draw_block(ImageDraw.Draw(band), slide["footer"], band_w, band_h,
                   footer["top"], footer["size"],
                   layout.get("text_width", TEXT_WIDTH_PCT), 1, 2)

    frame = Image.new("RGBA", (frame_w, frame_h), BAR_RGB + (255,))
    frame.alpha_composite(band, ((frame_w - band_w) // 2, (frame_h - band_h) // 2))
    return frame.convert("RGB")


def render_spec(spec_path):
    with open(spec_path, "r", encoding="utf-8") as handle:
        spec = json.load(handle)
    out_dir = spec["outDir"]
    os.makedirs(out_dir, exist_ok=True)

    for i, slide in enumerate(spec["slides"], start=1):
        image = draw_slide(slide, spec)
        target = os.path.join(out_dir, "%02d.jpg" % i)
        image.save(target, "JPEG", quality=92, optimize=True)
        label = (slide.get("text") or slide["type"]).replace("\n", " ")
        print("  %02d.jpg  %-9s %s" % (i, slide["type"], label[:52]))


# ------------------------------------------------------------------ tools

def font_sample():
    """Every headline in the script, at its layout size, on one sheet."""
    band_w, band_h = band_size(*FRAME)
    sheet = Image.new("RGB", (band_w, 1000), BAND_RGB)
    draw = ImageDraw.Draw(sheet)
    y = 40
    for name, layout in LAYOUT.items():
        size = int(band_w * layout["size"])
        draw.text((band_w / 2, y), "%s  %dpx" % (name, size),
                  font=load_font(size), fill=INK, anchor="ma")
        y += size * 2
    target = os.path.join(DIR, "out", "font-sample.png")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    sheet.save(target)
    print("wrote", target)


def _band_bounds(image):
    """Find the off-white band inside a reference screenshot."""
    grey = image.convert("L")
    w, h = grey.size
    column = [grey.getpixel((3, y)) for y in range(h)]
    rows = [y for y, v in enumerate(column) if v > 150]
    if not rows:
        return None
    return 0, rows[0], w, rows[-1] + 1


def calibrate(sample_dir):
    """Print the geometry of a folder of slides as band fractions.

    Point it at the reference folder and at fresh output; the two lists should
    read the same. This is how LAYOUT was derived and it is how drift gets
    caught - eyeballing a render against a screenshot catches a 20% error and
    nothing smaller.
    """
    names = sorted(n for n in os.listdir(sample_dir)
                   if n.lower().endswith((".jpg", ".jpeg", ".png")))
    if not names:
        return print("no images in", sample_dir)

    for name in names:
        image = Image.open(os.path.join(sample_dir, name))
        bounds = _band_bounds(image)
        if not bounds:
            print("%-14s no band found" % name[:14])
            continue
        x0, y0, x1, y1 = bounds
        band = image.convert("L").crop(bounds)
        bw, bh = band.size
        pixels = band.load()

        # Segment the rows carrying ink into bands, then classify each by how
        # solidly it is filled: type is sparse, artwork is not.
        dark_per_row = []
        for y in range(bh):
            dark_per_row.append(sum(1 for x in range(bw) if pixels[x, y] < 128))

        print("%-14s band %dx%d  aspect %.4f" % (name[:14], bw, bh, bw / bh))
        y = 0
        while y < bh:
            if dark_per_row[y] == 0:
                y += 1
                continue
            start = y
            while y < bh and dark_per_row[y] > 0:
                y += 1
            if y - start < 4:
                continue
            xs = [x for x in range(bw)
                  for yy in (start, (start + y) // 2, y - 1) if pixels[x, yy] < 128]
            if not xs:
                continue
            fill = sum(dark_per_row[start:y]) / ((y - start) * (max(xs) - min(xs) + 1))
            kind = "art " if fill > 0.5 and (y - start) > bh * 0.11 else "text"
            print("    %s  top %.4f  bottom %.4f  x %.4f-%.4f  fill %.2f"
                  % (kind, start / bh, y / bh, min(xs) / bw, max(xs) / bw, fill))


if __name__ == "__main__":
    if "--font-sample" in sys.argv:
        font_sample()
    elif "--calibrate" in sys.argv:
        calibrate(sys.argv[sys.argv.index("--calibrate") + 1])
    elif len(sys.argv) > 1:
        render_spec(sys.argv[1])
    else:
        raise SystemExit(__doc__)
