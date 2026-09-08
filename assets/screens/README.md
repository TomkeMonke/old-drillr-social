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

### a slot is one composition, with different values

Every capture in a slot shows the SAME screen, framed the same way. What varies
between them is what is ON that screen - the numbers, the date, the session, how
far round each ring has gone.

That rules out mid-scroll captures of a screen whose other captures start at the
top. They look fine on their own and they are genuinely different images, but
the slot then rotates between two different screen SHAPES rather than one screen
with different content, and the carousel stops looking like the same app twice.
Two have been cut for exactly this: a diet capture with Today's Log expanded,
and a home capture scrolled past the date header.

    home        starts at the date, session name, coach card, then the
                Exercises list
    diet        calorie card, three macro tiles, Add food, Today's Log
                COLLAPSED, Nutrition Tips in view

### what varies inside the diet slot

Every diet capture is the SAME screen: the calorie card, the three macro tiles,
Add food, Today's Log **collapsed**, and the Nutrition Tips card in view. What
varies between them is the numbers - calories, macros, how far round each ring
has gone.

So no expanded Today's Log. It is a good-looking screen and it was in the set
for a while, but it pushes Nutrition Tips off the bottom, and the slot is meant
to read as one screen with different values rather than as two different
screens.

The quickest way to get a new value: log food through the app, capturing as you
go up, then delete entries from the top of Today's Log to walk back down. The
log is newest-first, so deleting the top row repeatedly steps the total down
through every intermediate value.

One thing that does NOT vary this way: the Nutrition Tips card itself. It is
driven by the day type, so a session day gives the same Training Day card with
the same water target every time. A capture taken on a REST day is the only way
to get the other card - different colour, different lines, different target -
so it is worth grabbing one next time a rest day comes round.

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
leaves the bottom alone by default, because the template runs the screenshot off
the foot of the slide anyway.

**No back arrows.** A detail screen puts one top-left, and it is navigation
furniture - it says "this person is tapping around an app" rather than showing
the app. Cut above it with `--top`: on the A52s the arrow sits at rows 154-191
of a raw capture, with flat header under it, so 318 works for a session screen
and 275 for a Progress detail. The whole set is cropped this way.

`--bottom N` is for when something at the foot of the screen has to go rather
than be bled off - a Share button, or a section that belongs to a different part
of the app. Find a flat row of page background to cut on the same way you would
at the top: a cut through a card or a heading reads as a rendering bug. `--probe` prints where the first row of real content is,
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
