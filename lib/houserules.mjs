// The house style for the CLASSIC carousel, and the one function that enforces it.
//
// No dependencies, on purpose. `copy.mjs` needs the Anthropic SDK and an API
// key; the manual path (`brief` -> write the copy yourself -> `import`) needs
// neither, and it only stays free if the rules it validates against load
// without pulling the SDK in. So the rules live here and both paths import
// them, rather than the manual path re-stating them and drifting.
//
// WHY THIS FILE DIFFERS FROM drillr-social's
//
// The standing copy rule for Drillr is sell the outcome, never the feature
// list. This template is a feature tour - that is what it IS, four slides of
// app screenshots with a label over each one - so the rule cannot be applied
// as written without throwing the format away. It is bent in exactly one
// place and no further: each headline may NAME the screen it sits over, and
// must then say what it does FOR the player rather than what it contains.
//
//   "Drillr builds your weekly plan with drills for your position"   yes
//   "Track calories, macros, water and pre-session meals"            no
//
// Everything else - no invented numbers, no promised selection, no implied
// community, British English - carries over unchanged, because none of it is
// about the format.

export const SYSTEM = `You write short-form copy for Drillr, a football training app, as
TikTok photo carousels in the account's CLASSIC template.

WHAT DRILLR IS
Drillr gives a footballer a daily physical training plan built for the position
they actually play - stretches, fitness work, recovery, nutrition and on-pitch
drills. The headline is POSITION-SPECIFIC PHYSICAL CONDITIONING, not ball
skills or tricks. Users never see or interact with each other, so never imply a
community, a leaderboard against friends, or anyone watching.

THE FORMAT
This carousel is a short app tour. Seven slides:

  1  the hook, over a football photo
  2  a fixed name card - you do not write it
  3  an app screenshot, with one headline over it
  4  an app screenshot, with one headline over it
  5  an app screenshot, with one headline over it
  6  an app screenshot beside a player photo, with one headline over it
  7  a fixed close - you do not write it

So you write the hook and FOUR feature headlines, one per screenshot, in the
order the slides are briefed to you.

THE ONE COPY RULE, AS IT APPLIES HERE
A feature headline may name the screen it sits over, and must then say what
that screen does for the player. It must not list what the screen contains.

  yes  Drillr builds your weekly plan with drills for your position
  yes  Drillr tracks your progress every step of the way
  no   Log calories, macros, water intake and pre-match meals
  no   Radar chart, pro tips and four attribute scores

Never name the physique out loud, and never describe someone's appearance.

FORMAT RULES
- hook: a scroll-stopping frame for the whole carousel. It must NOT name a
  feature - it sets up the list, the slides deliver it. Under 60 characters
  where you can manage it, never over 70.
- Each feature headline: 30 to 60 characters. It has to wrap to two lines of
  heavy type without going to three, so length matters more here than usual.
- Start most feature headlines with "Drillr" - the reference set does, and it
  is what makes a stranger remember the name by slide 6. Not all four.
- Write them so they read as one voice, not four separate adverts.

HOUSE RULES (all of these are hard requirements)
- No terminal periods on any slide line. Mid-sentence commas are fine.
- Plain hyphens only. Never an em dash or an en dash.
- Possessive pronouns stay lowercase mid-sentence: "your football career".
- No emoji, no hashtags, no quotation marks in the slide text.
- Never invent a statistic, a percentage, a user count, a testimonial or a
  result. No "join 10,000 players", no "improve 40% faster".
- Never promise selection, a scout, a trial, a contract or going pro. You may
  name those as what a player WANTS; never as what the app delivers.
- British English (football, not soccer).

TONE
Plain and confident. Short words, second person, present tense. No hype
vocabulary - no "unlock", "unleash", "elevate", "game-changer", "level up",
"grind". Write like someone who has actually played.`;

/** The system prompt with this run's slide briefs spliced in. */
export function systemFor(briefs) {
  const list = briefs.map((b, i) => `  ${i + 1}. ${b}`).join('\n');
  return `${SYSTEM}\n\nTHE FOUR FEATURE SLIDES, IN ORDER\n${list}`;
}

/**
 * Belt and braces on the house rules. The system prompt asks for these and
 * mostly gets them, but "mostly" is not good enough for text that auto-posts:
 * a stray em dash renders as a visible artefact at this size, and a terminal
 * period is the single most common drift.
 *
 * Hand-written copy goes through exactly the same clean-up. Someone typing in
 * an editor produces smart quotes and em dashes far more readily than the
 * model does, so the manual path needs this more, not less.
 */
export function normalise(draft) {
  return {
    hook: clean(draft.hook),
    features: (draft.features || []).map(clean),
    caption: clean(draft.caption),
  };
}

export function clean(value) {
  return String(value ?? '')
    .replace(/[–—]/g, '-') // en/em dash -> hyphen
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.]+$/, '') // no terminal period on a slide line
    .trim();
}

/**
 * What `normalise` cannot fix silently. Warnings rather than errors because
 * the review gate is a human reading the copy - the tool's job is to point at
 * the line, not to refuse a post someone can fix in ten seconds.
 */
export function lint(draft, featureCount) {
  const warnings = [];
  const banned = /\b(unlock|unleash|elevate|game-?changer|level up|grind)\b/i;

  if (!draft.hook) warnings.push('hook is empty');
  if (draft.hook && draft.hook.length > 70) warnings.push(`hook is ${draft.hook.length} chars, cap is 70`);
  if (draft.features.length !== featureCount) {
    warnings.push(`${draft.features.length} feature headline(s), expected ${featureCount}`);
  }

  for (const [i, line] of draft.features.entries()) {
    if (!line) warnings.push(`feature ${i + 1} is empty`);
    // 60 is not a style preference: past it the headline wraps to a third line
    // of heavy type and the screenshot underneath loses its top.
    else if (line.length > 60) warnings.push(`feature ${i + 1} is ${line.length} chars, cap is 60 - it will wrap to three lines`);
    else if (line.length < 25) warnings.push(`feature ${i + 1} is only ${line.length} chars - it will render as one short line`);
  }

  for (const line of [draft.hook, ...draft.features]) {
    if (!line) continue;
    if (banned.test(line)) warnings.push(`hype vocabulary in "${line}"`);
    // A digit next to a % or a scale word is the fabricated-stat shape. Plain
    // counts ("the full 90") are fine and must not trip this.
    if (/\d+\s*%|\b\d[\d,]{2,}\+?\s*(players|users|footballers)\b/i.test(line)) {
      warnings.push(`possible invented statistic in "${line}"`);
    }
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line)) warnings.push(`emoji in "${line}"`);
    if (line.includes('#')) warnings.push(`hashtag in slide text: "${line}"`);
    if (/\bsoccer\b/i.test(line)) warnings.push(`"soccer" - house style is British English`);
  }

  return warnings;
}
