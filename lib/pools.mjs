// Picture pools: picks the images for a carousel and remembers what it used.
//
// A pool is any folder of images, named by its path from the repo root, so the
// script can say `pool:backgrounds/landscape` or `pool:assets/screens/diet` and
// both work the same way. Two rules do all the work:
//
//   1. Never repeat an image inside one carousel.
//   2. Prefer the least-recently-used image in the pool.
//
// Rule 2 is the whole point now that the words are fixed. It is not a nicety:
// it is what makes consecutive carousels look different, and it is deliberately
// least-recently-used rather than random, because random can hand you the same
// picture twice in a row - the exact case this exists to prevent.
//
// TWO KINDS OF POOL, ONE MECHANISM
//
// `backgrounds/*` are photographs, supplied by hand, and there should be lots.
// A photo coming round again inside `cooldownDays` means the pool is too thin
// and you get a warning.
//
// `assets/screens/*` are app screenshots, and there are only ever a handful per
// slot because each one is a real capture off a real device. They are MEANT to
// come round quickly, so the cooldown warning is switched off for them (see
// `noCooldown` in config.json) - otherwise every single run would complain
// about a pool doing exactly what it is supposed to do.
//
// Rule 2 degrades instead of failing: a pool smaller than the carousel needs
// still returns its oldest images rather than throwing. A thin pool should
// produce a slightly repetitive post and a warning, not a dead run.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LEDGER = path.join(DIR, 'state', 'pools-used.json');

const IMAGE = /\.(jpe?g|png|webp)$/i;

function readLedger() {
  if (!fs.existsSync(LEDGER)) return {};
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}

function writeLedger(ledger) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
}

/** Ledger key: the path from the repo root, NOT the basename.
 *
 *  Every screen slot names its variants 01.jpg, 02.jpg. Keyed by basename,
 *  `assets/screens/diet/01.jpg` and `assets/screens/home/01.jpg` would be the
 *  same ledger entry, so using one would mark the other as freshly spent and
 *  the two slots would rotate in lockstep for ever. */
function key(file) {
  return path.relative(DIR, file).split(path.sep).join('/');
}

export function poolDir(pool) {
  return path.join(DIR, pool);
}

export function listPool(pool) {
  const dir = poolDir(pool);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => IMAGE.test(name))
    .sort()
    .map((name) => path.join(dir, name));
}

/**
 * Choose `count` images from `pool`, least-recently-used first.
 *
 * Returns absolute paths. Does NOT record the use - call `record()` only once
 * the render actually succeeded, so a crashed render does not burn the pool.
 */
export function choose(pool, count, cooldownDays = 0) {
  const files = listPool(pool);
  if (files.length === 0) {
    throw new Error(
      `pool "${pool}" is empty.\n` +
        `  Drop images into ${poolDir(pool)}\n` +
        (pool.startsWith('backgrounds/')
          ? `  jpg/png/webp, and the SHAPE matters - see backgrounds/README.md:\n` +
            `    landscape/  about 3:2, the hook and closing slides\n` +
            `    portrait/   about 2:3, the player shot on the progress slide`
          : `  These are app screenshots. See assets/screens/README.md for how to\n` +
            `  capture and crop a new one.`)
    );
  }

  const ledger = readLedger();
  const cutoff = Date.now() - cooldownDays * 86400_000;

  const ranked = files
    .map((file) => {
      const entry = ledger[key(file)];
      const lastUsed = entry ? Date.parse(entry.lastUsed) : 0;
      return { file, lastUsed, uses: entry ? entry.uses : 0 };
    })
    // Oldest first; ties broken by total uses so a fresh image always wins.
    .sort((a, b) => a.lastUsed - b.lastUsed || a.uses - b.uses);

  const picked = ranked.slice(0, count);
  const warnings = [];

  if (picked.length < count) {
    warnings.push(
      `pool "${pool}" has ${files.length} image(s) but one carousel needs ${count} - ` +
        `an image will repeat inside the post. Add more to ${poolDir(pool)}`
    );
  }
  if (cooldownDays > 0) {
    const tooRecent = picked.filter((p) => p.lastUsed > cutoff);
    if (tooRecent.length) {
      warnings.push(
        `${tooRecent.length} image(s) in "${pool}" were used inside the ` +
          `${cooldownDays}-day cooldown - the pool is too thin to rotate properly`
      );
    }
  }

  // Cycle rather than throw when the pool is short (rule 2's degrade path).
  const chosen = [];
  for (let i = 0; i < count; i += 1) chosen.push(picked[i % picked.length].file);

  return { files: chosen, warnings };
}

/** Mark these files as used now. Called after a successful render. */
export function record(files) {
  const ledger = readLedger();
  const now = new Date().toISOString();
  for (const file of new Set(files)) {
    const k = key(file);
    const prev = ledger[k];
    ledger[k] = { lastUsed: now, uses: (prev ? prev.uses : 0) + 1 };
  }
  writeLedger(ledger);
}

/** How many times each image in a pool has been used. For `doctor`. */
export function usage(pool) {
  const ledger = readLedger();
  return listPool(pool).map((file) => ({
    file,
    name: path.basename(file),
    uses: ledger[key(file)]?.uses ?? 0,
  }));
}
