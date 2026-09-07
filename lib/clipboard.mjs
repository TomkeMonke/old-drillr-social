// Clipboard in and out, so the free path stops going through a file.
//
// The manual loop is: get a brief -> paste it into an assistant -> copy the
// reply -> get it back into the queue. Two of those four steps used to be
// manual drudgery: selecting 80 lines out of a terminal without catching the
// prompt, and hand-creating a drafts.json that nothing ships (the first run of
// the free path used to end in ENOENT, which reads like a broken tool).
// Clipboard I/O removes both, and `go` chains what is left.
//
// Everything here degrades to null/false rather than throwing. A machine with
// no clipboard helper - a bare Linux box, a container, CI - must still be able
// to use `--from` and stdin, so callers treat null as "fall back to the file
// path", never as an error.
//
// This is a copy of drillr-social's module, not an import: the two tools are
// separate on purpose. It differs in one place, marked below, where the
// Windows read path is done through a temp file instead of stdout.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** First command whose binary actually exists, or null. */
function firstAvailable(candidates) {
  for (const candidate of candidates) {
    const probe = spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      [candidate.bin],
      { stdio: 'ignore' }
    );
    if (probe.status === 0) return candidate;
  }
  return null;
}

const READERS = {
  win32: [{ bin: 'powershell', args: [] }], // args unused; see read()
  darwin: [{ bin: 'pbpaste', args: [] }],
  linux: [
    { bin: 'wl-paste', args: ['--no-newline'] },
    { bin: 'xclip', args: ['-selection', 'clipboard', '-o'] },
    { bin: 'xsel', args: ['--clipboard', '--output'] },
  ],
};

/** Strip a byte-order mark. Text copied out of a BOM-prefixed file carries one,
 *  and a leading U+FEFF is enough to make JSON.parse throw on a valid reply. */
function stripBom(text) {
  return text.replace(/^\uFEFF/, '');
}

/**
 * Read the clipboard as text, or null if there is no way to.
 *
 * WINDOWS GOES THROUGH A TEMP FILE, like write() does, and for the same
 * reason in the opposite direction. `powershell Get-Clipboard` writes its
 * result to stdout encoded with the console code page - 852 or 1250 on a
 * Polish machine, not UTF-8 - so reading that stream as UTF-8 turns any
 * non-ASCII character into replacement junk. Having PowerShell write the text
 * to a file with an explicit encoding takes the console out of the loop.
 *
 * It matters here even though the house rules forbid smart quotes: `normalise`
 * repairs a curly apostrophe only if it arrives intact, and a reply that has
 * been through a lossy decode arrives as `?` with nothing left to repair.
 *
 * UTF8Encoding($false), not [Text.Encoding]::UTF8 - the latter writes a BOM.
 */
export function read() {
  if (process.platform === 'win32') {
    const tmp = path.join(os.tmpdir(), `drillr-clip-out-${process.pid}.txt`);
    try {
      const result = spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          // Get-Clipboard yields $null when the clipboard is empty or holds
          // something that is not text, and WriteAllText throws on null rather
          // than writing an empty file, so that case is handled in PowerShell.
          `$t = Get-Clipboard -Raw; if ($null -eq $t) { $t = '' }; ` +
            `[IO.File]::WriteAllText('${tmp.replace(/'/g, "''")}', $t, [Text.UTF8Encoding]::new($false))`,
        ],
        { stdio: 'ignore' }
      );
      if (result.status !== 0 || !fs.existsSync(tmp)) return null;
      return stripBom(fs.readFileSync(tmp, 'utf8')).replace(/\r\n/g, '\n').trimEnd();
    } catch {
      return null;
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* best effort */
      }
    }
  }

  const reader = firstAvailable(READERS[process.platform] ?? []);
  if (!reader) return null;

  // maxBuffer is raised well past the default 1 MB: a pasted reply is a few KB,
  // but someone who copied a whole page by accident should get a useful error
  // from the JSON parser rather than a truncated buffer that half-parses.
  const result = spawnSync(reader.bin, reader.args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  return stripBom(result.stdout).replace(/\r\n/g, '\n').trimEnd();
}

/**
 * Put text on the clipboard. Returns true on success.
 *
 * Windows goes through a temp file rather than piping to clip.exe: clip reads
 * stdin in the console codepage, so anything outside ASCII arrives mangled.
 * The brief is ASCII today - the house rules forbid smart quotes and em dashes
 * - but that is a property of the copy, not of this function, and a silently
 * corrupted paste is a miserable thing to debug.
 */
export function write(text) {
  if (process.platform === 'win32') {
    const tmp = path.join(os.tmpdir(), `drillr-clip-${process.pid}.txt`);
    try {
      fs.writeFileSync(tmp, text, 'utf8');
      const result = spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath '${tmp.replace(/'/g, "''")}')`,
        ],
        { stdio: 'ignore' }
      );
      return result.status === 0;
    } catch {
      return false;
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* best effort */
      }
    }
  }

  const writer = firstAvailable(
    process.platform === 'darwin'
      ? [{ bin: 'pbcopy', args: [] }]
      : [
          { bin: 'wl-copy', args: [] },
          { bin: 'xclip', args: ['-selection', 'clipboard'] },
          { bin: 'xsel', args: ['--clipboard', '--input'] },
        ]
  );
  if (!writer) return false;

  const result = spawnSync(writer.bin, writer.args, { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
  return result.status === 0;
}

/** Whether anything on this machine can talk to a clipboard at all. */
export function available() {
  if (process.platform === 'win32') return true;
  return Boolean(firstAvailable(READERS[process.platform] ?? []));
}
