// Drillr CLASSIC TikTok carousel pipeline.
//
//   node slideshow.mjs make            # make one carousel  <- the whole tool
//   node slideshow.mjs make --count 3  # or three of them
//   node slideshow.mjs list            # what has been made
//   node slideshow.mjs publish <id> --manual
//   node slideshow.mjs doctor          # is everything wired up
//   node slideshow.mjs fonts           # fetch Archivo Black (one-off)
//
// This is the OLD template - off-white slides, black Archivo Black headlines,
// app screenshots on a drop shadow. It is a separate tool from drillr-social,
// not a flag on it. See README.md.
//
// THE TEXT IS CONSTANT, AND THAT IS THE WHOLE DESIGN
//
// The original carousels all carried the same seven lines; only the photos
// changed between them. So this generator does not write copy, does not call
// an API, and has no draft-and-approve gate - there is nothing to review,
// because the words are the same words a human already signed off, sitting in
// config.json where they can be edited.
//
// What that removes is worth being explicit about, because the sibling tool
// still has all of it: no `plan`, no `brief`, no `import`, no `approve`, no
// clipboard, no copy model, no drafts.json, no do-not-repeat ledger. `make`
// picks photos, renders, and is done.
//
// What is left is the part that still has to make a decision: WHICH pictures.
// `lib/pools.mjs` rotates every pool least-recently-used first and keeps a
// ledger, which is now the only thing standing between two carousels a week
// apart and them looking like the same post.
//
// That includes the four app screenshots. They used to be one fixed file each,
// so slides 3 to 6 were byte-identical on every carousel - which is what a feed
// dedupe is built to spot. Each slot is a FOLDER of real device captures now,
// and each carousel takes the one it has not used for longest.
//
// Install (one-off):
//   pip install Pillow

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import * as queueLib from './lib/queue.mjs';
import * as pool from './lib/pools.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = DIR; // standalone repo: the tool root IS the repo root
const OUT = path.join(DIR, 'out');
const CONFIG = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));

const args = process.argv.slice(2);
const verb = args[0];
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

// Flags that consume the next argument, so `--count 3` does not leave "3"
// looking like a post id.
const VALUED = new Set(['count']);
const positional = [];
for (let i = 1; i < args.length; i += 1) {
  if (args[i].startsWith('--')) {
    if (VALUED.has(args[i].slice(2))) i += 1;
    continue;
  }
  positional.push(args[i]);
}

/** How many images each pool owes one carousel, keyed by pool path. Derived
 *  from the script so adding a slide cannot leave a checker looking at the
 *  wrong folders. */
function poolDemand() {
  const need = {};
  for (const slide of CONFIG.script) {
    for (const key of ['image', 'aside']) {
      const ref = slide[key];
      if (ref?.startsWith('pool:')) need[ref.slice(5)] = (need[ref.slice(5)] || 0) + 1;
    }
  }
  return need;
}

const poolsUsed = () => Object.keys(poolDemand());

/** Days before a repeat is worth warning about, per pool.
 *
 *  Zero for the screen slots. They hold a handful of real device captures and
 *  are MEANT to come round quickly; warning every run about a pool doing its
 *  job trains you to ignore the warnings that matter. */
function cooldownFor(name) {
  const quiet = CONFIG.pools.noCooldown ?? [];
  return quiet.some((prefix) => name.startsWith(prefix)) ? 0 : CONFIG.pools.cooldownDays;
}

/** A pool that feeds an app-screenshot slide, as opposed to a photo pool. */
const isScreenPool = (name) => name.startsWith('assets/screens/');

// ---------------------------------------------------------------- fonts

// One entry, not five. drillr-social keeps four alternates so `--font-sample`
// has something to compare against; here the face is not a decision to revisit.
// Archivo Black is what the reference carousels were set in - confirmed by
// solving for the size whose rendered ink width matches the measured ink width
// of the same string, on fifteen lines across five slide types.
const FONT_SOURCES = { 'ArchivoBlack.ttf': 'Archivo+Black' };

async function fonts() {
  const dir = path.join(DIR, 'fonts');
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, family] of Object.entries(FONT_SOURCES)) {
    const target = path.join(dir, file);
    if (fs.existsSync(target)) {
      console.log(`  have ${file}`);
      continue;
    }
    // The CSS endpoint hands back a woff2 for modern UAs; Pillow needs a ttf,
    // and the legacy UA string is what still gets one.
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64)' },
    }).then((r) => r.text());
    const url = css.match(/https:\/\/[^)]*\.ttf/)?.[0];
    if (!url) {
      console.log(`  ! no ttf for ${family}, skipped`);
      continue;
    }
    const buffer = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
    fs.writeFileSync(target, buffer);
    console.log(`  got  ${file}  (${(buffer.length / 1024).toFixed(0)} KB)`);
  }
}

// ---------------------------------------------------------------- make

/**
 * Build one carousel: pick the photos, write the spec, run the renderer.
 *
 * The post is recorded as `rendered` the moment it exists. There is no draft
 * state and no approval step, because with constant copy there is nothing left
 * for a reviewer to catch - the words were approved once, in config.json, and
 * the photos were approved when they were put in the pool by hand.
 */
function makeOne(queue) {
  // Count what each pool owes this carousel before drawing from it, so a thin
  // pool is one warning at the top of the run rather than a surprise on slide 6.
  const picked = {};
  const spent = [];
  for (const [name, count] of Object.entries(poolDemand())) {
    const chosen = pool.choose(name, count, cooldownFor(name));
    for (const warning of chosen.warnings) console.log(`  ! ${warning}`);
    picked[name] = chosen.files.slice();
    spent.push(...chosen.files);
  }

  const take = (ref) => {
    if (!ref) return null;
    if (!ref.startsWith('pool:')) {
      const resolved = path.resolve(REPO, ref);
      if (!fs.existsSync(resolved)) {
        console.log(`  ! missing ${ref} - that slide will render without its picture`);
      }
      return resolved;
    }
    return picked[ref.slice(5)].shift();
  };

  const slides = CONFIG.script.map((slide) => ({
    type: slide.type,
    text: slide.text,
    footer: slide.footer,
    image: take(slide.image),
    aside: take(slide.aside),
  }));

  const id = queueLib.nextId(queue.posts);
  const outDir = path.join(OUT, id);
  const specPath = path.join(outDir, 'spec.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    specPath,
    JSON.stringify({ outDir, width: CONFIG.width, height: CONFIG.height, font: CONFIG.font, slides }, null, 2)
  );

  console.log(`\n${id}`);
  const python = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(DIR, 'render.py'), specPath], {
    stdio: 'inherit',
  });
  if (python.status !== 0) throw new Error('render.py failed - see output above');

  // Caption file sits beside the slides so the manual upload is copy-paste.
  const caption = `${CONFIG.caption.lead} ${CONFIG.caption.hashtags.map((h) => `#${h}`).join(' ')}`;
  fs.writeFileSync(path.join(outDir, 'caption.txt'), caption + '\n');

  // Only now, once the render actually succeeded, do the photos count as
  // spent. A crashed render must not burn the pool.
  pool.record(spent);

  const post = {
    id,
    status: 'rendered',
    createdAt: new Date().toISOString(),
    outDir: path.relative(REPO, outDir),
    caption_full: caption,
    pictures: spent.map((f) => path.relative(REPO, f).split(path.sep).join('/')),
  };
  queue.posts.push(post);
  return post;
}

function make() {
  const problems = preflight();
  if (problems.length) {
    console.log('Cannot render yet:\n');
    for (const problem of problems) console.log(`  ! ${problem}`);
    console.log('\nFull check: node slideshow.mjs doctor');
    return;
  }

  const count = Math.max(1, Number(flag('count', '1')) || 1);
  const queue = queueLib.load();
  const made = [];

  for (let i = 0; i < count; i += 1) made.push(makeOne(queue));
  queueLib.save(queue);

  console.log(`\n${made.length} carousel(s) made.`);
  console.log('\nUpload each folder by hand, then close the loop:');
  for (const post of made) console.log(`  node slideshow.mjs publish ${post.id} --manual`);
}

// ---------------------------------------------------------------- list

function list() {
  const queue = queueLib.load();
  if (!queue.posts.length) return console.log('nothing made yet - run `make`');
  for (const state of ['rendered', 'posted']) {
    const posts = queue.posts.filter((p) => p.status === state);
    if (!posts.length) continue;
    console.log(`\n${state.toUpperCase()} (${posts.length})`);
    for (const post of posts) {
      console.log(`  ${post.id}`);
      console.log(`    ${(post.pictures ?? []).join('  ') || 'none recorded'}`);
    }
  }
}

// ---------------------------------------------------------------- publish

async function publish() {
  const queue = queueLib.load();
  const post = queueLib.pick(queue, 'rendered', positional[0]);
  if (!post) return console.log('nothing rendered - run `make` first');

  // --manual: you uploaded it yourself, this just closes the loop so the post
  // stops showing up as pending.
  if (has('manual')) {
    post.status = 'posted';
    post.postedAt = new Date().toISOString();
    post.postedVia = 'manual';
    queueLib.save(queue);
    return console.log(`  marked ${post.id} posted (manual)`);
  }

  const tk = CONFIG.tiktok;
  const slides = fs
    .readdirSync(path.join(REPO, post.outDir))
    .filter((f) => /^\d+\.jpg$/.test(f))
    .sort();
  const urls = slides.map((f) => `${tk.urlPrefix}${post.id}/${f}`);

  if (!tk.enabled || !has('commit')) {
    console.log(`DRY RUN - ${post.id}`);
    console.log(`  caption: ${post.caption_full}`);
    console.log(`  ${urls.length} images:`);
    urls.forEach((u) => console.log(`    ${u}`));
    console.log(
      `\n  tiktok.enabled=${tk.enabled}  --commit=${has('commit')}` +
        '\n  Both must be true to post. See README "Turning on auto-post".'
    );
    return;
  }

  const { refreshAccessToken, creatorInfo, postCarousel, publishStatus } = await import('./lib/tiktok.mjs');
  const need = ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN'];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`missing env: ${missing.join(', ')}`);

  const auth = await refreshAccessToken({
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    refreshToken: process.env.TIKTOK_REFRESH_TOKEN,
  });
  // TikTok rotates the refresh token on every refresh and invalidates the old
  // one, so a run that forgets to persist this succeeds now and locks the
  // account out on the NEXT run - the hardest kind of failure to trace back.
  const tokenFile = path.join(DIR, 'state', '.refresh-token');
  fs.writeFileSync(tokenFile, auth.refreshToken);
  console.log('\n  ROTATED REFRESH TOKEN - the old one is now dead.');
  console.log(`  Written to ${path.relative(REPO, tokenFile)}; update TIKTOK_REFRESH_TOKEN from it.\n`);

  const info = await creatorInfo(auth.accessToken);
  console.log(`  posting as @${info.creator_username} (${info.privacy_level_options?.join(', ')})`);

  const publishId = await postCarousel({
    token: auth.accessToken,
    title: post.caption_full,
    photoUrls: urls,
    config: tk,
  });
  const status = await publishStatus({ token: auth.accessToken, publishId });

  post.status = 'posted';
  post.postedAt = new Date().toISOString();
  post.postedVia = 'api';
  post.publishId = publishId;
  queueLib.save(queue);
  console.log(`  posted ${post.id}  publish_id=${publishId}  status=${status.status}`);
}

// ---------------------------------------------------------------- checks

/** Blocking problems only - the things that make a render impossible. */
function preflight() {
  const problems = [];

  if (!fs.existsSync(path.join(DIR, 'fonts', CONFIG.font))) {
    problems.push(`font ${CONFIG.font} missing - run: node slideshow.mjs fonts`);
  }
  const python = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import PIL'], {
    stdio: 'ignore',
  });
  if (python.status !== 0) problems.push('Pillow missing - run: pip install Pillow');

  // The fixed pictures are what make this template what it is, so a missing
  // screenshot is blocking rather than a warning - the alternative is a slide
  // with a headline and a blank space where the phone should be.
  for (const slide of CONFIG.script) {
    for (const key of ['image', 'aside']) {
      const ref = slide[key];
      if (!ref || ref.startsWith('pool:')) continue;
      if (!fs.existsSync(path.resolve(REPO, ref))) problems.push(`${ref} is missing (slide type "${slide.type}")`);
    }
  }

  for (const name of poolsUsed()) {
    if (!pool.listPool(name).length) {
      problems.push(
        `${name} is empty - put images in it` +
          (isScreenPool(name)
            ? ' (see assets/screens/README.md)'
            : ' (see backgrounds/README.md, the shapes are not interchangeable)')
      );
    }
  }
  return problems;
}

/**
 * Non-blocking complaints about the copy in config.json.
 *
 * Worth keeping even though the words never change: the point of putting them
 * in config is that they CAN be edited, and the failure mode of an edit is
 * silent - a headline three characters too long wraps to a third line and
 * shoves the screenshot off the bottom of the slide, which you only find out
 * by looking at the JPEG.
 */
function copyWarnings() {
  const warnings = [];
  for (const [i, slide] of CONFIG.script.entries()) {
    const text = slide.text ?? '';
    if (!text.trim()) {
      warnings.push(`slide ${i + 1} (${slide.type}) has no text`);
      continue;
    }
    if (/[–—]/.test(text)) warnings.push(`slide ${i + 1}: en/em dash - house style is a plain hyphen`);
    if (/[.]$/.test(text)) warnings.push(`slide ${i + 1}: terminal period - the template does not use them`);
    // 60 is not a style preference. Past it a headline wraps to a third line of
    // heavy type and the screenshot underneath loses its top.
    if (slide.type === 'screen' || slide.type === 'progress') {
      if (text.length > 60) warnings.push(`slide ${i + 1} is ${text.length} chars, over 60 - it will wrap to three lines`);
    } else if (slide.type === 'hook' && text.length > 70) {
      warnings.push(`slide ${i + 1} (hook) is ${text.length} chars, over 70`);
    }
  }
  return warnings;
}

function doctor() {
  let bad = 0;
  const ok = (label, good, hint) => {
    console.log(`  ${good ? 'ok  ' : 'MISS'} ${label}${good || !hint ? '' : `\n         ${hint}`}`);
    if (!good) bad += 1;
  };

  ok(`font ${CONFIG.font}`, fs.existsSync(path.join(DIR, 'fonts', CONFIG.font)), 'node slideshow.mjs fonts');

  const python = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import PIL'], {
    stdio: 'ignore',
  });
  ok('Pillow', python.status === 0, 'pip install Pillow');

  for (const slide of CONFIG.script) {
    for (const key of ['image', 'aside']) {
      const ref = slide[key];
      if (!ref || ref.startsWith('pool:')) continue;
      ok(`${slide.type}: ${ref}`, fs.existsSync(path.resolve(REPO, ref)));
    }
  }

  const demand = poolDemand();
  for (const name of poolsUsed()) {
    const used = pool.usage(name);
    ok(
      `${name}: ${used.length} image(s), ${demand[name]} per carousel`,
      used.length > 0,
      `put images in ${path.relative(REPO, pool.poolDir(name))}` +
        (isScreenPool(name) ? ' - see assets/screens/README.md' : ' - see backgrounds/README.md, the shapes matter')
    );
    if (!used.length) continue;

    // Use counts, so it is obvious whether the rotation is actually working
    // and which image is up next. `>` marks the one the next carousel takes.
    const next = used.slice().sort((a, b) => a.uses - b.uses)[0];
    console.log(`       ${used.map((u) => `${u.name === next.name ? '>' : ' '}${u.name} x${u.uses}`).join('  ')}`);

    // The whole reason the screens became folders. One capture in a slot means
    // that slide is the same image on every post, which is exactly what a feed
    // dedupe is built to spot - so fail rather than quietly passing.
    if (isScreenPool(name) && used.length < 2) {
      console.log('       ! only one capture - this slide is identical on every carousel');
      bad += 1;
    }
    // Not a failure. The pool degrades to repeats plus a warning rather than
    // refusing to run, but a pool that cannot fill one carousel without
    // reusing an image is worth saying out loud before the render, not during.
    if (used.length < demand[name]) {
      console.log(`       ! only ${used.length} for ${demand[name]} slots - one will repeat inside a single post`);
    }
  }

  console.log('\n  The copy is fixed in config.json:');
  for (const [i, slide] of CONFIG.script.entries()) {
    console.log(`    ${i + 1}. ${slide.text}${slide.footer ? `  /  ${slide.footer}` : ''}`);
  }
  const warnings = copyWarnings();
  for (const warning of warnings) console.log(`  !  ${warning}`);

  console.log(`\n  auto-post: ${CONFIG.tiktok.enabled ? 'ENABLED' : 'off (config.tiktok.enabled=false)'}`);
  const queue = queueLib.load();
  const counts = ['rendered', 'posted'].map((s) => `${queue.posts.filter((p) => p.status === s).length} ${s}`);
  console.log(`  made so far: ${counts.join(', ')}`);
  console.log(bad ? `\n${bad} thing(s) to fix before this runs.` : '\nReady.');
}

// ---------------------------------------------------------------- main

const VERBS = { make, list, publish, doctor, fonts };

if (!verb || !VERBS[verb]) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n\n')[0]);
  process.exit(verb ? 1 : 0);
}

try {
  await VERBS[verb]();
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
