// The router's own preset file, read rather than guessed at. #25.
//
// The app had NO per-model metadata: `GET /api/models` returned `{id, status}` and everything else
// on screen was string surgery on the id. Context in particular was global — `slotContext()` reports
// the running server's numbers — so a story pinned to a model with a different `ctx-size` was shown
// the wrong budget. This file is where those numbers actually live.
//
// READ-ONLY, and never written. It belongs to the llama-router systemd unit, and a writer's app
// having a hand on it is how a router stops booting at three in the morning.

import { readFileSync } from 'node:fs';

interface Preset { id: string; ctxSize?: number; parallel?: number; perSlot?: number }

/** `[*]` IS DEFAULTS, NOT A MODEL. It carries `parallel = 4` and `ctx-size = 32768` for every
 *  stanza that does not override them, which is most of them — so a parser that skipped it would
 *  report `parallel: undefined` for nine of the eleven presets and compute no per-slot context at
 *  all. It is merged under each stanza and never returned as a model of its own.
 *
 *  COMMENTED-OUT STANZAS ARE COMMENTS, and TWO INDEPENDENT GUARDS make that true — which is worth
 *  stating, because falsifying either one alone leaves the check green and that reads as a test
 *  that cannot fail. The file keeps dropped models in place behind `;` with the A/B that dropped
 *  them written above: `; [qwen36-heretic-q8]` and six lines of why. The `;` skip drops that line
 *  before the stanza pattern sees it, AND the stanza pattern is anchored at both ends so it would
 *  not match anyway. Remove both and the writer is offered four models the router does not serve,
 *  each of which 400s when chosen. test/db.ts falsifies the pair.
 *
 *  The `;` skip earns its place twice over regardless: it also keeps commented prose out of the
 *  key/value parse, so `; Re-add with: hf = llmfan46/…` does not become a key. */
export function parsePresets(text: string): Preset[] {
  const stanzas = new Map<string, Record<string, string>>();
  let cur: string | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const head = /^\[(.+?)\]$/.exec(line);
    if (head) { cur = head[1]!; if (!stanzas.has(cur)) stanzas.set(cur, {}); continue; }
    if (!cur) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    stanzas.get(cur)![line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  const defaults = stanzas.get('*') ?? {};
  const num = (v?: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };
  return [...stanzas.entries()].filter(([id]) => id !== '*').map(([id, kv]) => {
    const ctxSize = num(kv['ctx-size'] ?? defaults['ctx-size']);
    const parallel = num(kv['parallel'] ?? defaults['parallel']);
    // "context window divided by half" — checks.md. `ctx-size` is divided ACROSS slots, which is
    // the constraint the whole build is sized against: -np 4 gave every request a quarter.
    const perSlot = ctxSize && parallel ? Math.floor(ctxSize / parallel) : ctxSize;
    return { id, ctxSize, parallel, perSlot };
  });
}

/** Absent, unreadable or empty is not an error. The app runs on machines that have no router file
 *  at all — every test in this repo, for one — and the panel simply has less to say. */
export function presets(file = process.env.ANANSI_PRESETS ?? '/data/models/presets.ini'): Preset[] {
  try { return parsePresets(readFileSync(file, 'utf8')); } catch { return []; }
}
