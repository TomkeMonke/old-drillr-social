// The record of what has been made: one JSON file that every verb reads.
//
// A post here goes straight to `rendered` and later to `posted`. There is no
// draft or approved state, because there is nothing to review - this generator
// does not write copy, so a carousel is just the fixed script plus whichever
// photos came out of the pool. (drillr-social's copy of this file carries the
// full draft -> approved -> rendered -> posted machine; that is the difference
// between a tool that writes words and one that does not.)
//
// What the file is still for: `publish` needs to know what exists and what has
// already gone out, and the per-post `backgrounds` list is the audit trail for
// which photos a given carousel spent.
//
// Flat file rather than Firestore because every write happens on this machine,
// one process at a time.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const QUEUE = path.join(DIR, 'state', 'queue.json');

export function load() {
  if (!fs.existsSync(QUEUE)) return { posts: [] };
  return JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
}

export function save(queue) {
  fs.mkdirSync(path.dirname(QUEUE), { recursive: true });
  fs.writeFileSync(QUEUE, JSON.stringify(queue, null, 2) + '\n');
}

/**
 * Date plus a counter: 2026-09-08-1, 2026-09-08-2.
 *
 * It used to be the date plus a slug of the hook, which was worth having when
 * every carousel said something different. With the copy fixed, that slug is
 * the same forty characters on every folder and carries no information at all -
 * `2026-09-08-top-apps-you-need-to-improve-3` tells you strictly less than
 * `2026-09-08-3` while being harder to read in an upload dialog.
 *
 * The date prefix stays, because it is what makes `ls out/` chronological.
 */
export function nextId(existing) {
  const date = new Date().toISOString().slice(0, 10);
  const taken = new Set(existing.map((p) => p.id));
  let n = 1;
  while (taken.has(`${date}-${n}`)) n += 1;
  return `${date}-${n}`;
}

export function find(queue, id) {
  return queue.posts.find((p) => p.id === id);
}

/**
 * Resolve the post a verb should act on: an explicit id, or the oldest one in
 * `state`. Oldest-first is what makes publishing behave like a queue rather
 * than a stack - a carousel made today should not jump ahead of one that has
 * been waiting a week.
 */
export function pick(queue, state, id) {
  if (id) {
    const post = find(queue, id);
    if (!post) throw new Error(`no post with id ${id}`);
    if (post.status !== state) {
      throw new Error(`post ${id} is ${post.status}, expected ${state}`);
    }
    return post;
  }
  const candidates = queue.posts.filter((p) => p.status === state);
  return candidates.length ? candidates[0] : null;
}
