// What changed, read from a file this repo keeps rather than written by a model. #24.
//
// It used to be release notes generated on demand: `GET /api/whatsnew` read the git log, built a
// corpus of up to 26,000 characters, and made one model call per new commit, caching the answer per
// HEAD. That bought two complaints — *"what changed currently shows nothing, or its slow to load"* —
// and both were structural rather than incidental:
//
//   SLOW is the design. The first view after ANY commit is a cold model call over the whole log
//   since the last batch. Nothing can make that fast except not doing it.
//
//   NOTHING was three different failures wearing one face — not a git checkout, no commits since
//   the last batch, and a bad answer from the model — each returning the stale batch with an error
//   the panel could not tell apart.
//
// A file has neither problem, costs no tokens, and is the only version of this that can be *read*
// before it ships. Seth, 2026-08-29: "lets just have it show case from one file we serve that we
// update after each commit and we remove the need for a local model to do it."
//
// The parse is deliberately smaller than Markdown. `##` opens a release, `###` opens one thing in
// it, everything else is body — and a file that does not match simply yields fewer releases rather
// than throwing, because the panel showing less is better than the panel showing an error about a
// file the writer cannot see.

import { readFileSync } from 'node:fs';

export interface Entry { title: string; body: string }
export interface Release { headline: string; at: number | null; entries: Entry[] }

/** `## <ISO date> · <headline>` — the date is optional and the separator may be a middot or a dash,
 *  because this file is written by hand and a heading that loses its notes to punctuation is a trap
 *  set for the person maintaining it. A heading with no date still parses; it just cannot say how
 *  long ago it was. */
const HEAD = /^##\s+(?:(\d{4}-\d{2}-\d{2})\s*[·\-–—]\s*)?(.+?)\s*$/;

export function parseNews(text: string): Release[] {
  const out: Release[] = [];
  let cur: Release | null = null;
  let entry: Entry | null = null;
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trimEnd();
    const h = HEAD.exec(line);
    if (h) {
      // `Date.parse` on a bare ISO day is UTC midnight, which is the day before in this timezone
      // and reads as "yesterday" the moment a release is written. Noon is inside the same day
      // everywhere on earth, and nothing here is precise to the hour anyway.
      const at = h[1] ? Date.parse(`${h[1]}T12:00:00Z`) : null;
      cur = { headline: h[2]!, at: Number.isFinite(at as number) ? (at as number) : null, entries: [] };
      out.push(cur);
      entry = null;
      continue;
    }
    if (!cur) continue;                       // the preamble above the first release
    const e = /^###\s+(.+?)\s*$/.exec(line);
    if (e) { entry = { title: e[1]!, body: '' }; cur.entries.push(entry); continue; }
    if (!entry || !line.trim()) continue;
    entry.body = entry.body ? `${entry.body} ${line.trim()}` : line.trim();
  }
  // A release whose every entry is a bare heading says nothing; one with no entries at all is a
  // headline, which is a legitimate thing to ship.
  return out;
}

/** Absent or unreadable is not an error, the same rule `presets()` follows: this repo is checked
 *  out on machines that may not carry docs, and the panel simply has less to say. */
export function news(file = new URL('../docs/WHATS-NEW.md', import.meta.url)): Release[] {
  try { return parseNews(readFileSync(file, 'utf8')); } catch { return []; }
}
