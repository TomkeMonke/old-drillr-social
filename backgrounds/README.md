# The photo pools

Two folders, and they are not interchangeable. This template shows every photo
at its own aspect ratio - it never crops one to fill a slot - so a 9:16
wallpaper dropped into `landscape/` does not fill the wide slot, it renders as a
tall sliver in the middle of it.

    landscape/    slide 1 (the hook) and slide 7 (the close)
    portrait/     the player shot beside the screenshot on slide 6

**landscape/** - roughly 3:2, anything from about 4:3 to 16:9 works. A single
player, action or celebration, framed so the subject survives being shown 700px
wide. Aim for 15+.

**portrait/** - roughly 2:3 to 3:4, one player, full body or waist up. This is
the only slot where a tall photo is right. Aim for 8+.

Nothing here downloads images. You choose them; the pipeline rotates them
least-recently-used first and remembers what it spent in
`state/backgrounds-used.json`.

## Sizes

Anything from about 1200px on the long edge up. Bigger is fine - the renderer
downsamples with Lanczos. Below that the photo is being enlarged to fill a
700px slot and it shows.

## A thin pool degrades, it does not throw

Fewer images than a post needs means repeats plus a warning, not a failed run.
The cooldown (`backgrounds.cooldownDays`, 45 by default) is a preference, not a
rule: if the pool is too small to honour it you get the oldest images anyway and
a line telling you the pool is too thin.

## Copyright

The pipeline never sources images, deliberately. Press photography of named
players is somebody's copyright, and a bot republishing it on a schedule on a
commercial account is a different risk from picking one by hand - TikTok's own
audit reviews the content too. What goes in here is a decision, not a default.

The originals this template was reverse-engineered from used exactly that kind
of press photo. That is a description of what they did, not a recommendation.
