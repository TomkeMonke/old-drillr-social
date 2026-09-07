# old-drillr-social

Generates the **classic** Drillr TikTok carousel - the one the account ran
before the full-bleed template: an off-white slide, a heavy black headline
across the top, and an app screenshot standing on a drop shadow underneath.

This is a separate tool from `drillr-social`, not a mode of it. The two share a
font file and the queue machinery and nothing else - different canvas,
different type treatment, different slide script, different copy rules. Running
one does not touch the other's queue or photo pools.

Handing this to someone who has not seen it before? Point them at
`TUTORIAL.html` - a self-contained page, opened straight from the folder in any
browser, no server and no hosting anywhere. It walks the whole loop, covers the
two things that stop every Windows machine before the first command runs, and
spells out the three ways this template behaves differently from the other one.

    hook -> 1.Drillr -> daily session -> position -> diet -> progress -> close

Seven slides, fixed. Four of them are app screenshots that never change; the
model writes one headline for each, plus the hook.

## The shape

    plan  ->  approve  ->  render  ->  publish
    Claude    you        Pillow      TikTok API

Four steps rather than one command, because of the middle one. `approve` is a
human reading the copy before anything is drawn, and the state machine in
`lib/queue.mjs` makes it unskippable: `render` only looks at `approved` posts
and `publish` only looks at `rendered` ones.

## One-time setup

```bash
npm i --no-save @anthropic-ai/sdk     # only `plan` needs it
pip install Pillow                    # only `render` needs it

node slideshow.mjs fonts              # fetch Archivo Black
node slideshow.mjs doctor             # check the lot
```

Then fill the photo pools - see `backgrounds/README.md`. Two folders, and they
are not interchangeable: `landscape/` carries the hook and the closing slide,
`portrait/` carries the player shot on slide 6.

`ANTHROPIC_API_KEY` in the environment, for `plan` only - and `plan` is
optional. See [Writing the copy without an API key](#writing-the-copy-without-an-api-key).

## The loop

```bash
node slideshow.mjs plan --count 3    # Claude drafts 3 carousels
node slideshow.mjs list              # see the queue
node slideshow.mjs approve all       # the gate
node slideshow.mjs render            # -> out/<id>/01.jpg .. 07.jpg + caption.txt
```

Edit any draft directly in `state/queue.json` before approving - `hook`,
`features`, `caption` and the fixed lines are all free text. `slideshow.mjs
edit <id>` prints one post if you just want to read it.

Until auto-post is on, upload `out/<id>/` by hand and close the loop so the
hook joins the do-not-repeat list:

```bash
node slideshow.mjs publish <id> --manual
```

`--topic` steers a batch: `plan --count 2 --topic recovery`.

### Reproducing the originals

`reference-copy.json` holds the exact wording the original carousels used, with
the two typos in it fixed (`Drill` -> `Drillr`, and the stray comma in "Drill
gives, you tips"). Import it and you get the old set back, with fresh photos:

```bash
node slideshow.mjs import --from reference-copy.json
node slideshow.mjs approve all
node slideshow.mjs render
```

`out/_sample/` is that render, done here with placeholder photos so there is
something to look at before the pools are filled. Delete it whenever.

## The template

    +----------------------+  0        1080 x 1920, black
    |        black         |
    +----------------------+  458      the band: 1080 x 1003
    |   THE HEADLINE       |
    |   [   artwork    ]   |
    +----------------------+  1461
    |        black         |
    +----------------------+  1920

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
python render.py --calibrate out/_sample               # and fresh output
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

`assets/screens/*.jpg` are the four fixed captures, and `assets/app-icon.png`
is the icon on slide 2. Re-shoot them and drop the new files in under the same
names; nothing else changes. `config.json`'s `script` says which screen each
slide shows and what the copy model is told that slide has to say.

The screenshots are pasted at their own aspect and run off the bottom of the
band on purpose - that bleed is the template, not a crop bug.

## Writing the copy without an API key

`plan` is the only verb that calls the Anthropic API, and the only thing here
that costs money. An API key bills from a **console.anthropic.com** balance,
which is a separate pool from a Claude.ai subscription - a Pro or Max plan
grants no API credit.

So there is a second path that costs nothing. `brief` prints the exact request
`plan` would have sent - same system prompt, same slide briefs, same
do-not-repeat list, same output shape - and `import` queues whatever comes back:

```bash
node slideshow.mjs brief --count 3            # paste this into any assistant
#                                             # -> save the JSON reply as drafts.json
node slideshow.mjs import --from drafts.json  # queue the reply
node slideshow.mjs approve all                # same gate as always
```

**`drafts.json` is a file you create.** The repo does not ship one and `import`
will not invent it. `import` also reads stdin, so `... | node slideshow.mjs
import` skips the file entirely. It does not mind a reply wrapped in prose or a
```` ```json ```` fence - it pulls the array out.

Two deliberate limits:

- Everything lands as `draft`, never `approved`. Pasting a model's reply into a
  file is not a human reading the copy.
- The house rules live in `lib/houserules.mjs`, imported by both paths. That
  file has no dependencies on purpose: the free path must not need the SDK
  installed.

### Why the copy rules differ from drillr-social's

The standing rule for Drillr copy is *sell the outcome, never the feature
list*. This template **is** a feature tour - four slides of app screenshots
with a label over each - so the rule cannot be applied as written without
throwing the format away.

It is bent in exactly one place and no further: a headline may name the screen
it sits over, and must then say what that screen does for the player rather
than what it contains.

    yes  Drillr builds your weekly plan with drills for your position
    no   Log calories, macros, water intake and pre-match meals

Everything else carries over unchanged - no invented numbers, no promised
selection, no implied community, British English, no terminal periods.

## Turning on auto-post

Same blocker as `drillr-social`, and the same TikTok account, so clearing the
audit once clears it for both. In order:

1. **Create the TikTok developer app** and request the `video.publish` scope.
   Photo carousels go through the same scope as video.
2. **Verify a URL prefix.** `PULL_FROM_URL` is the only way to supply photos -
   there is no upload endpoint for carousels - and TikTok fetches them from a
   domain you have proven you own. Verify `https://drillr.app/social/`.
3. **Host the slides.** `render` writes them locally; something has to put
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
- **Photos are only spent on a successful render.** `record()` runs after
  `render.py` exits 0, so a crashed render does not burn the pool.
- **A post queued before `config.json`'s script changed will refuse to
  render** rather than draw a slide with no copy on it. Fix it in
  `state/queue.json`.
- **Nothing here is shared with `drillr-social` at runtime.** Two queues, two
  ledgers, two photo pools. Rendering here does not spend a background there.

## Files

    TUTORIAL.html         the walkthrough to hand to someone new - open in a browser
    slideshow.mjs         the CLI - every verb
    render.py             Pillow renderer; the whole look lives here
    config.json           the 7-slide script, fixed copy, pools, TikTok settings
    reference-copy.json   the original carousels' wording, for `import`
    lib/houserules.mjs    the brand prompt + the lint, shared by both copy paths
    lib/copy.mjs          Claude drafting
    lib/queue.mjs         the draft->approved->rendered->posted state machine
    lib/backgrounds.mjs   pool rotation + the used-image ledger
    lib/tiktok.mjs        Content Posting API
    assets/               the app icon and the four fixed app screenshots
    backgrounds/          photos you supply (gitignored) - see its README
    state/                queue.json + backgrounds-used.json - this is the memory
    out/                  rendered slides (gitignored)
