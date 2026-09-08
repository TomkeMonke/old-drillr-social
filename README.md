# old-drillr-social

Generates the **classic** Drillr TikTok carousel - the one the account ran
before the full-bleed template: an off-white slide, a heavy black headline
across the top, and an app screenshot standing on a drop shadow underneath.

    hook -> 1.Drillr -> daily session -> position -> diet -> progress -> close

Seven slides, and **the words on them never change**. The original carousels
all carried the same seven lines and only the photos moved, so that is what
this reproduces: the copy sits in `config.json`, and a new carousel is the same
slides with different pictures.

That makes this a much smaller tool than `drillr-social`, which writes fresh
copy for every post. There is no copy model here, no API key, no drafting, no
review gate, no clipboard, no `drafts.json`. One command makes a carousel.

Handing this to someone who has not seen it before? Point them at
`TUTORIAL.html` - a self-contained page, opened straight from the folder in any
browser, no server and no hosting anywhere.

## One-time setup

```bash
pip install Pillow                    # the renderer

node slideshow.mjs fonts              # fetch Archivo Black
node slideshow.mjs doctor             # check the lot
```

Then fill the photo pools - see `backgrounds/README.md`. Two folders, and they
are **not interchangeable**: `landscape/` (about 3:2) carries the hook and the
closing slide, `portrait/` (about 2:3) carries the player shot on slide 6.
Photos are never cropped to fill a slot, so a tall wallpaper in `landscape/`
renders as a narrow strip in the middle of a wide slot.

The four app screenshots live in `assets/screens/<slot>/` and ship with the
repo. They also rotate - see `assets/screens/README.md` for capturing more.

## Making carousels

```bash
node slideshow.mjs make               # one carousel
node slideshow.mjs make --count 3     # three, each with different photos
```

That is the whole loop. It writes `out/<id>/01.jpg` through `07.jpg` at
1080x1920 plus a `caption.txt` with the hashtags attached. Upload the folder by
hand, then close the loop so it stops showing as pending:

```bash
node slideshow.mjs list
node slideshow.mjs publish <id> --manual
```

## Changing the words

They live in `config.json`, under `script`, one entry per slide. Edit a line
and every carousel made afterwards carries the new wording.

```json
{ "type": "screen",
  "text": "Drillr builds you a personalized meal plan",
  "image": "pool:assets/screens/diet" }
```

The wording shipped is the original set's, with two typos fixed: `Drill` was
`Drillr` in two headlines, and "Drill gives, you tips" had a stray comma.

**Keep a feature headline under about 60 characters.** Past that it wraps to a
third line of heavy type and pushes the screenshot off the bottom of the slide.
`doctor` prints the whole script and flags a line that is too long, a terminal
period, or an em dash - none of which stop a render, all of which are wrong for
this template.

## What varies between carousels

Only the pictures, which makes `lib/pools.mjs` the one part of this that still
makes a decision. Every `pool:` in the script picks least-recently-used first
and records it in `state/pools-used.json`.

**Including the four app screenshots.** Those used to be one fixed file each,
so slides 3 to 6 were byte-identical on every carousel the tool made - and with
the copy fixed as well, a run of posts differed only in three photographs. A
feed that dedupes on image similarity has every reason to treat the later ones
as a repost and hold their reach back. Each screen slot is a folder of real
device captures now; see `assets/screens/README.md` for how to add one.

Least-recently-used rather than random on purpose: random can hand you the same
picture twice in a row, which is the exact case this exists to prevent.

`doctor` prints every pool with a use count per image and marks the one the
next carousel will take. It fails a screen slot that has only one capture.

## The template

    +----------------------+  0        1080 x 1920, black
    |        black         |
    +----------------------+  458      the band: 1080 x 1003
    |   THE HEADLINE       |
    |   [  screenshot  ]   |
    +---------| |----------+  1461
    |  black  | | <- it keeps going
    +---------|_|----------+  1920

The originals are 1179x1095 images. That is not a canvas anybody designs to -
it is what a TikTok photo post looks like screenshotted, fitted to the width of
a 9:16 viewport with black filling the rest. So the band is rendered at that
exact aspect and `render.py` paints the bars, which makes the output the old
look at 9:16 rather than the old look re-flowed to a taller canvas.

**Every constant in `render.py` is a fraction of the BAND, never of the frame.**
Change `width`/`height` in `config.json` and the layout still lands, because
nothing is anchored to a bar whose height is an accident of the aspect ratio.

### Matching the reference look

None of the geometry is eyeballed. `render.py --calibrate <folder>` finds the
band in each image, segments the dark rows into headline lines and artwork
boxes, and prints them as band fractions:

```bash
python render.py --calibrate ~/Downloads/old-slides    # the originals
python render.py --calibrate out/<id>                  # and fresh output
```

The two lists read the same, line for line. Every number in `LAYOUT` came off
the first list, against all 28 reference slides.

The font was not guessed either. Solving for the Archivo Black size whose
rendered ink width matches the measured ink width of the same string pins the
size and identifies the face at once - fifteen lines across five slide types
matched within 1.5% on width **and** height. It is Archivo Black, at 81px on
the hook, 107px on the name card, 59px on a feature slide, 49px on the progress
slide and 73/84px on the close, all in the reference's 1179px band.

### The bits that took a second pass

- **The text box is per-slide.** The box decides where a headline breaks, and
  the originals break the hook much earlier than a feature line - 0.70 of the
  band against 0.79. One shared width gives you type of the right size broken
  in the wrong places on the cover, which is the slide people stop on.
- **The line count matters more than the size.** Every feature headline in the
  reference set is exactly two lines. A single autofit pass with a three-line
  cap never reproduces that: it takes the three-line wrap at full size and
  returns, because three is inside the cap. So `fit_text` insists on the
  preferred count first and shrinks up to 20% to hold it.
- **Set the text width to the measured 0.789 and it is too narrow.** 930px is
  the *ink*; wrapping is decided on the *advance*, which carries a side bearing
  at each end. The reference's own longest headline wraps to three lines.
- **The two shadows are genuinely different.** The framed photos carry a
  symmetric one with no offset. The app screenshots carry one offset down and
  slightly left, with nothing above or to the right - that is what makes them
  read as a device standing on the slide rather than a pasted crop.

### The app screenshots

`assets/screens/<slot>/` holds the captures for each app-screen slide, and
`assets/app-icon.png` is the icon on slide 2. Drop another capture into a slot
and it joins the rotation - nothing else changes, the filenames are not read.
`config.json`'s `script` says which slot each slide draws from and what the
headline over it says.

`prep-screen.py` turns a raw device screenshot into a variant: it cuts the
status bar off the top and the scroll indicator off the sides. See
`assets/screens/README.md` for the capture recipe and what a capture worth
keeping looks like.

The screenshots are pasted at their own aspect and run **past the foot of the
band onto the black bar** - they are drawn onto the frame after the band, so
the phone breaks out of the off-white card rather than being cut off at its
edge.

The reference slides stop dead at that edge, but they had no choice: they are
screenshots of a finished post, where the black is TikTok's letterboxing and
nothing could be drawn on it. Here the bar is part of the image. Nothing about
the position changed, so the part inside the band is identical either way -
`--calibrate` reports the same numbers as before.

## Turning on auto-post

Same blocker as `drillr-social`, and the same TikTok account, so clearing the
audit once clears it for both. In order:

1. **Create the TikTok developer app** and request the `video.publish` scope.
   Photo carousels go through the same scope as video.
2. **Verify a URL prefix.** `PULL_FROM_URL` is the only way to supply photos -
   there is no upload endpoint for carousels - and TikTok fetches them from a
   domain you have proven you own. Verify `https://drillr.app/social/`.
3. **Host the slides.** `make` writes them locally; something has to put
   `out/<id>/NN.jpg` at that prefix before the post fires. Not built.
4. **Pass the audit.** Until then every post lands `SELF_ONLY` no matter what
   you ask for, which is why `config.tiktok.privacyLevel` is pinned to it.
5. **Set the secrets**: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`,
   `TIKTOK_REFRESH_TOKEN`.
6. **Flip `tiktok.enabled` to `true`** in `config.json`.

### Rotating the refresh token

Every refresh returns a **new** refresh token and kills the old one. A job that
refreshes and forgets to persist the new one works exactly once, then locks the
account out - and it fails on the *next* run, not the one that caused it.
`publish --commit` writes the rotated token to `state/.refresh-token`
(gitignored); whatever runs it has to push that back into the secret.

## Gotchas

- **Six API requests per minute** per access token. One post is three calls.
- **`init` succeeding is not `posted`.** TikTok downloads the images
  asynchronously; a bad image URL surfaces at the status poll, not at init.
- **Images are only spent on a successful render.** `record()` runs after
  `render.py` exits 0, so a crashed render does not burn the pool.
- **The ledger keys on the path, not the filename.** Every screen slot names
  its captures `01.jpg`; keyed on the basename they would all share one entry
  and the four slots would rotate in lockstep.
- **A thin pool degrades, it does not throw.** Fewer images than slots means a
  repeat plus a warning, not a failed run. With the copy fixed, that repeat is
  the only thing anyone would notice, so read the warnings.
- **A screen slot with one capture is a `doctor` failure, not a warning.** That
  slide would be the same image on every post, which is the whole thing the
  folders exist to avoid.
- **Nothing here is shared with `drillr-social` at runtime.** Two records, two
  ledgers, two photo pools. Making a carousel here does not spend a background
  there.
- **`lib/queue.mjs` is a trimmed copy** of that repo's. It has no draft or
  approved state, because nothing here needs reviewing. Do not copy the file
  back the other way.

## Files

    TUTORIAL.html         the walkthrough to hand to someone new - open in a browser
    slideshow.mjs         the CLI: make, list, publish, doctor, fonts
    render.py             Pillow renderer; the whole look lives here
    config.json           the seven slides - their words, their pictures - plus
                          the pools and the TikTok settings
    lib/queue.mjs         the record of what has been made and posted
    lib/pools.mjs         picture rotation + the used-image ledger
    prep-screen.py        crops a raw device capture into a screen variant
    lib/tiktok.mjs        Content Posting API
    assets/app-icon.png   slide 2
    assets/screens/<slot>/  the app captures that rotate - see its README
    backgrounds/          photos you supply (gitignored) - see its README
    state/                queue.json + pools-used.json - this is the memory
    out/                  rendered slides (gitignored)
