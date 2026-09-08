# The app screenshots

Four slots, one per app-screen slide. Each is a **folder of captures**, and a
carousel takes the least-recently-used one from each.

    home/       slide 3 - the daily session
    tips/       slide 4 - the position screen, radar + Pro Tips
    diet/       slide 5 - the Diet tab
    progress/   slide 6 - the Progress tab, next to the player photo

## Why folders and not one file each

These were one fixed file per slot, which meant slides 3 to 6 were the same
four images on every carousel the tool has ever made. The copy is fixed too, so
a run of posts was identical except for three photographs - and a feed that
dedupes on image similarity has every reason to treat the later ones as a
repost and hold their reach back.

Variants are the fix, and they have to be **genuinely different captures**, not
the same screenshot nudged. A different day, a different position, a different
scroll offset all change what is actually on the screen. Re-saving one file at
a different JPEG quality does not - perceptual hashing is built to see straight
through that.

Aim for **3 or 4 per slot**. `doctor` fails a slot with only one, prints the
use count for every capture, and marks the one the next carousel will take.

## What makes a capture worth keeping

The screens have to look **lived in**. The first set here did not: 14%
completion, one training day, zero exercises and an empty heatmap. That is an
advert for an app nobody uses, and it went out on every post.

Capture on the seeded demo account instead - `tomekswiecki1alt@gmail.com`, uid
`0c8TBZdcF6ZcRNw8Pgqr4rxhYty1`, which carries 19 weeks of dense history. The
same account the store screenshots use. What good looks like:

    home        a day part-done - some exercises ticked, Progress 2/5 not 0/5
    tips        a real Pro Tips count and a radar that is not near the middle
    diet        calories actually logged, not 0 or a token number
    progress    a high completion percentage and a FULL heatmap

Re-seeding, the quota rules, and the account details are all in
`FootballApp/screenshots/README.md`. Read the Firestore section before you start
- a capture session has taken the whole daily read quota down before, for real
users, and `pm clear` is what does it.

## Capturing

Device: A52s, serial `R5CT33PV2JN`.

```bash
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"; ADB="$ANDROID_HOME/platform-tools/adb.exe"
"$ADB" -s R5CT33PV2JN exec-out screencap -p > raw.png
```

Do the whole set in **one launch**. Relaunching between shots re-reads history
and is what runs the quota down.

`adb shell input tap` lands on neighbouring controls on this UI. Screenshot,
measure the target, tap, then screenshot again to check - do not chain blind
taps.

## Cropping

```bash
python prep-screen.py raw.png --probe                        # where to cut
python prep-screen.py raw.png assets/screens/home/03.jpg     # do it
python prep-screen.py raw.png out.jpg --top 185              # cut deeper
```

It takes the status bar off the top and the scroll indicator off the sides, and
leaves the bottom alone because the template runs the screenshot off the foot
of the slide anyway. `--probe` prints where the first row of real content is,
which is what you need when the capture was taken mid-scroll and a slice of the
previous screen is still up there.

Name them `01.jpg`, `02.jpg`, `03.jpg`. Nothing reads the numbers - they only
have to be unique inside the folder.

## Cheap ways to get a genuinely different capture

- **A different day.** Home shows the date, the session name and a different
  set of exercises. Free if you capture across a week.
- **A different scroll offset.** Half a screen down is different content, not a
  filter on the same content. The renderer shows the shot from its top edge, so
  a scrolled capture reads as its own screen.
- **A different position.** Re-seed with `--position CB` and the plan, the
  radar and the Pro Tips all change together. The most different, the most
  work, and it costs reads.
