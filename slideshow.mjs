// Drillr CLASSIC TikTok carousel pipeline.
//
//   node slideshow.mjs doctor              # is everything wired up
//   node slideshow.mjs fonts               # fetch Archivo Black (one-off)
//   node slideshow.mjs plan --count 3      # Claude drafts 3 carousels (API key)
//   node slideshow.mjs brief --count 3     # print that same ask, to paste anywhere (free)
//   node slideshow.mjs import --from x.json  # queue drafts written by hand (free)
//   node slideshow.mjs list                # what is in the queue
//   node slideshow.mjs edit <id>           # print one draft for editing
//   node slideshow.mjs approve <id|all>    # the review gate
//   node slideshow.mjs render [id]         # approved -> JPGs in out/
//   node slideshow.mjs publish [id]        # rendered -> TikTok (dry run)
//   node slideshow.mjs publish [id] --commit
//
// This is the OLD template - off-white slides, black Archivo Black headlines,
// app screenshots on a drop shadow - rebuilt as a generator. It is a separate
// tool from drillr-social, not a flag on it: the two share a font file and the
// queue machinery and nothing else. See README.md.
//
// A post walks draft -> approved -> rendered -> posted and cannot skip a step.
// The gate that matters is `approve`: nothing renders, and therefore nothing
// can be posted, until a human has read the copy.
//
// `plan` is the only verb that calls the API and the only one that costs
// anything. `brief` + `import` are the same step done by hand.
//
// Install (one-off, not saved to package.json):
//   npm i --no-save @anthropic-ai/sdk   # `plan` only - `import` needs nothing
//   pip install Pillow

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import * as queueLib from './lib/queue.mjs';
import * as pool from './lib/backgrounds.mjs';
// Safe at the top level: houserules.mjs has no dependencies, unlike copy.mjs,
// which is loaded lazily inside `plan` so the SDK stays optional.
import { systemFor, normalise, lint } from './lib/houserules.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = DIR; // standalone repo: the tool root IS the repo root
const OUT = path.join(DIR, 'out');
const CONFIG = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));

// The slides the model writes: everything in the script whose copy key is not
// one of the fixed lines. Derived, never listed - adding a screenshot slide to
// config.json has to change the drafting prompt too, and this is what makes it.
const FEATURE_SLIDES = CONFIG.script.filter((s) => s.copy?.startsWith('features.'));
const FEATURE_COUNT = FEATURE_SLIDES.length;

const args = process.argv.slice(2);
const verb = args[0];
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

// Flags that consume the next argument, so `--topic recovery` does not leave
// "recovery" looking like a post id.
const VALUED = new Set(['count', 'topic', 'from']);
const positional = [];
for (let i = 1; i < args.length; i += 1) {
  if (args[i].startsWith('--')) {
    if (VALUED.has(args[i].slice(2))) i += 1;
    continue;
  }
  positional.push(args[i]);
}

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

// ---------------------------------------------------------------- plan

/** The slide briefs, in order, as the copy model is given them. */
function briefs() {
  return FEATURE_SLIDES.map((slide) => slide.brief);
}

function newPost(draft, queue) {
  return {
    id: queueLib.makeId(draft.hook, queue.posts),
    status: 'draft',
    createdAt: new Date().toISOString(),
    hook: draft.hook,
    features: draft.features,
    // Copied onto the post rather than read from config at render time, so a
    // post that was approved in August still renders the words that were
    // approved if the fixed lines change in September.
    ...CONFIG.fixed,
    caption: draft.caption || CONFIG.caption.lead,
  };
}

function printPost(post) {
  console.log(`\n  ${post.id}`);
  console.log(`    hook  ${post.hook}`);
  post.features.forEach((f, i) => console.log(`    ${i + 1}.    ${f}`));
  for (const warning of lint(post, FEATURE_COUNT)) console.log(`    ! ${warning}`);
}

async function plan() {
  const count = Number(flag('count', '3'));
  const topic = flag('topic');
  const queue = queueLib.load();

  // Feed back everything we have ever written, not just what is pending - a
  // hook that went out in June is exactly the one the model wants to write
  // again in August.
  const recentHooks = queue.posts.slice(-40).map((p) => p.hook);

  const { draftPosts } = await import('./lib/copy.mjs');
  console.log(`Drafting ${count} carousel(s) with ${CONFIG.copy.model}...`);
  const drafts = await draftPosts({
    count,
    briefs: briefs(),
    topic,
    recentHooks,
    model: CONFIG.copy.model,
    effort: CONFIG.copy.effort,
  });

  for (const draft of drafts) {
    const post = newPost(draft, queue);
    queue.posts.push(post);
    printPost(post);
  }

  queueLib.save(queue);
  console.log(`\n${drafts.length} draft(s) queued. Review them, then:`);
  console.log('  node slideshow.mjs approve all');
}

// ---------------------------------------------------------------- list / edit / approve

function list() {
  const queue = queueLib.load();
  if (!queue.posts.length) return console.log('queue is empty - run `plan` or `brief`');
  for (const state of queueLib.STATES) {
    const posts = queueLib.byState(queue, state);
    if (!posts.length) continue;
    console.log(`\n${state.toUpperCase()} (${posts.length})`);
    for (const post of posts) console.log(`  ${post.id}\n    ${post.hook}`);
  }
}

function edit() {
  const queue = queueLib.load();
  const post = queueLib.find(queue, positional[0]);
  if (!post) throw new Error(`no post with id ${positional[0]}`);
  console.log(JSON.stringify(post, null, 2));
  console.log(
    `\nEdit it in ${path.relative(REPO, path.join(DIR, 'state', 'queue.json'))} - hook, features and caption are all free text.`
  );
}

function approve() {
  const queue = queueLib.load();
  const target = positional[0];
  const posts =
    target === 'all' ? queueLib.byState(queue, 'draft') : [queueLib.pick(queue, 'draft', target)].filter(Boolean);

  if (!posts.length) return console.log('nothing in draft');
  for (const post of posts) {
    post.status = 'approved';
    post.approvedAt = new Date().toISOString();
    console.log(`  approved ${post.id}`);
  }
  queueLib.save(queue);
  console.log('\n  node slideshow.mjs render');
}

// ---------------------------------------------------------------- brief / import

/**
 * The free path, half one: print exactly what `plan` would have asked Claude,
 * for pasting into a Claude session you are already paying for.
 *
 * A straight lift of the `plan` request - same system prompt, same slide
 * briefs, same do-not-repeat list - because the moment the two drift, copy
 * written by hand stops matching copy written by the API and the feed reads
 * like two different accounts.
 */
function brief() {
  const count = Number(flag('count', '3'));
  const topic = flag('topic');
  const queue = queueLib.load();
  const recentHooks = queue.posts.slice(-40).map((p) => p.hook);

  console.log(systemFor(briefs()));
  console.log(`\n---\n`);
  console.log(
    `Draft ${count} distinct carousel${count === 1 ? '' : 's'}. ` +
      (topic ? `Theme: ${topic}. ` : '') +
      `Vary the hook between them: a list framing, a problem framing and a ` +
      `direct recommendation all read differently in the feed.`
  );

  if (recentHooks.length) {
    console.log(`\nAlready posted or queued - do not repeat these angles, and do not write a near-synonym of one:`);
    for (const hook of recentHooks) console.log(`- ${hook}`);
  }

  console.log(
    `\nReply with nothing but a JSON array of ${count} object(s), each exactly:\n` +
      `  { "hook": "...", "features": [${Array.from({ length: FEATURE_COUNT }, () => '"..."').join(', ')}], "caption": "..." }\n` +
      `features are in the briefed slide order. caption is two to four casual words for the post text, before the hashtags.`
  );

  console.log(`\n---\n`);
  console.log('Paste everything above into any assistant you already use - Claude,');
  console.log('ChatGPT, Gemini, whichever. The brief carries all of its own context,');
  console.log('so nothing depends on which one, and a free tier is fine.');
  console.log('');
  console.log('It replies with a JSON array. Nothing here ships a drafts.json and');
  console.log('import will not invent one - CREATE that file yourself, here:');
  console.log('');
  console.log(`  ${path.join(REPO, 'drafts.json')}`);
  console.log('');
  console.log('Paste the array into it, save, then:');
  console.log('  node slideshow.mjs import --from drafts.json');
  console.log('');
  console.log('The name is only a convention - --from takes any path, resolved');
  console.log('against the repo root. To skip the file, pipe the reply in instead:');
  console.log('  node slideshow.mjs import        (reads stdin)');
}

/**
 * The free path, half two: queue drafts that came from anywhere.
 *
 * Everything lands as `draft`, never `approved`. The point of the gate is that
 * a human has read the copy in the queue, and pasting a model's reply into a
 * file is not that.
 */
function importDrafts() {
  const from = flag('from');
  const raw = from ? fs.readFileSync(path.resolve(REPO, from), 'utf8') : fs.readFileSync(0, 'utf8');
  if (!raw.trim()) throw new Error('nothing to import - pass --from <file> or pipe JSON in');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A pasted reply often arrives wrapped in prose or a ```json fence. Pull
    // the outermost array out rather than making someone hand-trim the file.
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('could not find JSON in that input');
    parsed = JSON.parse(match[0]);
  }

  const incoming = Array.isArray(parsed) ? parsed : parsed.posts || [parsed];
  const queue = queueLib.load();
  const seen = new Set(queue.posts.map((p) => p.hook.toLowerCase()));
  let queued = 0;

  for (const entry of incoming) {
    const draft = normalise(entry);
    if (!draft.hook) {
      console.log('  ! skipped an entry with no hook');
      continue;
    }
    if (seen.has(draft.hook.toLowerCase())) {
      console.log(`  ! skipped "${draft.hook}" - that hook is already in the queue`);
      continue;
    }
    const post = newPost(draft, queue);
    queue.posts.push(post);
    seen.add(draft.hook.toLowerCase());
    queued += 1;
    printPost(post);
  }

  if (!queued) return console.log('\nnothing queued');
  queueLib.save(queue);
  console.log(`\n${queued} draft(s) queued. Review them, then:`);
  console.log('  node slideshow.mjs approve all');
}

// ---------------------------------------------------------------- render

/** Resolve a script slide's `copy`/`footer` key against the post. */
function copyFor(post, key) {
  if (!key) return null;
  const [head, index] = key.split('.');
  return index === undefined ? post[head] : (post[head] || [])[Number(index)];
}

function render() {
  const queue = queueLib.load();
  const post = queueLib.pick(queue, 'approved', positional[0]);
  if (!post) return console.log('nothing approved - run `approve` first');

  // Count what each pool owes this post before drawing from it, so a thin pool
  // is one warning at the top of the run rather than a surprise on slide 6.
  const need = {};
  for (const slide of CONFIG.script) {
    for (const key of ['image', 'aside']) {
      const ref = slide[key];
      if (ref?.startsWith('pool:')) need[ref.slice(5)] = (need[ref.slice(5)] || 0) + 1;
    }
  }

  const picked = {};
  const spent = [];
  for (const [category, count] of Object.entries(need)) {
    const chosen = pool.choose(category, count, CONFIG.backgrounds.cooldownDays);
    for (const warning of chosen.warnings) console.log(`  ! ${warning}`);
    picked[category] = chosen.files.slice();
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
    text: copyFor(post, slide.copy),
    footer: copyFor(post, slide.footer),
    image: take(slide.image),
    aside: take(slide.aside),
  }));

  const missing = slides.filter((s) => s.text === undefined || s.text === null);
  if (missing.length) {
    throw new Error(
      `post ${post.id} has no copy for ${missing.length} slide(s) - it was probably queued ` +
        `before config.json's script changed. Fix it in state/queue.json.`
    );
  }

  const outDir = path.join(OUT, post.id);
  const specPath = path.join(outDir, 'spec.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    specPath,
    JSON.stringify({ outDir, width: CONFIG.width, height: CONFIG.height, font: CONFIG.font, slides }, null, 2)
  );

  console.log(`Rendering ${post.id}`);
  const python = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(DIR, 'render.py'), specPath], {
    stdio: 'inherit',
  });
  if (python.status !== 0) throw new Error('render.py failed - see output above');

  // Caption file sits beside the slides so the manual upload is copy-paste.
  const caption = `${post.caption} ${CONFIG.caption.hashtags.map((h) => `#${h}`).join(' ')}`;
  fs.writeFileSync(path.join(outDir, 'caption.txt'), caption + '\n');

  // Only now, once the render actually succeeded, do the photos count as
  // spent. A crashed render must not burn the pool.
  pool.record(spent);

  post.status = 'rendered';
  post.renderedAt = new Date().toISOString();
  post.outDir = path.relative(REPO, outDir);
  post.caption_full = caption;
  post.backgrounds = spent.map((f) => path.basename(f));
  queueLib.save(queue);

  console.log(`\n  ${slides.length} slides -> ${post.outDir}`);
  console.log(`  caption: ${caption}`);
  console.log('\nUpload those by hand, then mark it done:');
  console.log(`  node slideshow.mjs publish ${post.id} --manual`);
}

// ---------------------------------------------------------------- publish

async function publish() {
  const queue = queueLib.load();
  const post = queueLib.pick(queue, 'rendered', positional[0]);
  if (!post) return console.log('nothing rendered - run `render` first');

  // --manual: you uploaded it yourself, this just closes the loop so the post
  // stops showing up as pending and its hook joins the do-not-repeat list.
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

// ---------------------------------------------------------------- doctor

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

  // Not counted as a failure: `plan` is the only verb that needs a key, and
  // `brief` + `import` do the same job without one.
  console.log(
    process.env.ANTHROPIC_API_KEY
      ? '  ok   ANTHROPIC_API_KEY - `plan` will work'
      : '  --   ANTHROPIC_API_KEY unset - use `brief` + `import` (free), or setx ANTHROPIC_API_KEY ...'
  );

  // Every fixed picture the script names. These are the slides that make this
  // template what it is, so a missing screenshot is a hard MISS, not a warning.
  for (const slide of CONFIG.script) {
    for (const key of ['image', 'aside']) {
      const ref = slide[key];
      if (!ref || ref.startsWith('pool:')) continue;
      ok(`${slide.type}: ${ref}`, fs.existsSync(path.resolve(REPO, ref)));
    }
  }

  for (const category of Object.values(CONFIG.backgrounds).filter((v) => typeof v === 'string')) {
    const files = pool.listPool(category);
    ok(
      `backgrounds/${category}: ${files.length} image(s)`,
      files.length > 0,
      `drop photos into ${path.relative(REPO, pool.poolDir(category))}`
    );
  }

  console.log(`\n  script: ${CONFIG.script.length} slides, ${FEATURE_COUNT} of them written by the model`);
  console.log(`  auto-post: ${CONFIG.tiktok.enabled ? 'ENABLED' : 'off (config.tiktok.enabled=false)'}`);
  const queue = queueLib.load();
  console.log(`  queue: ${queueLib.STATES.map((s) => `${queueLib.byState(queue, s).length} ${s}`).join(', ')}`);
  console.log(bad ? `\n${bad} thing(s) to fix before this runs.` : '\nReady.');
}

// ---------------------------------------------------------------- main

const VERBS = { fonts, plan, brief, import: importDrafts, list, edit, approve, render, publish, doctor };

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
