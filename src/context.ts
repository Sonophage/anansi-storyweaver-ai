// buildContext — pure. Plain objects in, a manifest out. No database, no network.
// Token counting is injected, which is what keeps it pure and testable with no model.

import { ORDER, CAPS, CANON_KINDS, CANON_CAP_FRAC, EARLIER_CEILING_FRAC, PROSE_CEILING_FRAC } from './blocks.ts';
import type { Block, Kind } from './blocks.ts';

export interface EntryState {
  fromChapter: number;             // the chapter this state opens at
  body: string;
  beforeMode?: 'hide' | 'hint';    // what happens ahead of it opening
  label?: string;
}
export interface Entry {
  id: string; title: string; body: string;
  entryType: 'character' | 'lore' | 'item' | 'rule';
  activation: 'always_on' | 'triggered';
  keys: string[];
  lastEditor: 'human' | 'model';   // decides arbitration (COUNCIL-03 S1)
  states?: EntryState[];           // canon over time — see resolveBody
  stickyFor?: number;              // stays active this many passages after it last fired
  properNouns?: boolean;           // names do not get folded — see fold()
}
export interface Chapter {
  id: string; index: number; title: string; summary?: string; authorsNote?: string;
  summaryStale?: boolean;   // covered prose changed since it was written — excluded, not trusted
  keepWhole?: boolean;      // pulled back in full: send this chapter's prose, not its summary
}
export interface Passage {
  id: string; ordinal: number; body: string; isBreak?: boolean;
  chapterId?: string;              // which chapter it belongs to — decides what stays whole
}
export interface Story {
  title: string; genre: string; premise: string; setting: string;
  pov: string; writingStyle: string; spice: 1 | 2 | 3 | 4 | 5;
  direction?: string;      // the destination. Rides SPINE — see PROMPTS rev 2 §3.
}
export interface Arc {
  fromChapter: number; toChapter: number; title?: string; summary: string;
}
export interface Input {
  story: Story; chapters: Chapter[]; passages: Passage[]; entries: Entry[];
  arcs?: Arc[];                    // act-level summaries, replacing the chapters they cover
  mode: 'cowrite' | 'direct' | 'fullauto' | 'newscene';
  directive?: string;
  pins?: Record<string, 'force_in' | 'force_out'>;   // per-chapter overrides, SPEC §7.4 step 7
  currentChapter: Chapter;
  budget: number;          // per-slot context, minus output reserve and margin
  tailTokens?: number;     // DIRECTIVE sits this many tokens above the end. P0 finds it.
  repeatCanon?: boolean;   // F14 arm B: restate always-on canon near the generation point.
}

export interface Manifest {
  blocks: Block[];
  totals: { budget: number; used: number; unallocated: number };
  byKind: Record<string, number>;
  overflowed: boolean;
  overflowReason?: string;
}

const SPICE: Record<number, string> = {
  1: 'Register: no sexual content. Romance may be emotional only. Fade at a kiss.',
  2: 'Register: romantic and sensual. Desire is on the page; sex is not. Cut away at the bedroom door.',
  3: 'Register: sex happens on the page, written with restraint. Suggestion and aftermath over anatomy. Adult fiction between adult characters.',
  4: 'Register: sex is written directly and fully. Explicit, but the scene still serves the story. Vocabulary follows the writing sample. Adult fiction between adult characters.',
  5: 'Register: fully explicit. Write sex in unrestricted detail. Do not fade, summarize, or cut away. Vocabulary follows the writing sample. Adult fiction between adult characters.',
};

const MODE: Record<string, (d?: string) => string> = {
  cowrite: () => 'Continue the passage above. Write 2-4 paragraphs.\nPick up mid-thought if the last line is unfinished.\nStop at a natural beat. Do not end the scene.',
  direct: (d) => `Write what happens next: ${d}\n\nWrite 2-4 paragraphs covering that and nothing beyond it.\nDo not narrate past the instruction. Do not resolve it faster than the scene wants.`,
  fullauto: (d) => `Write the next 1-2 paragraphs.\nAdvance the scene by one small beat. Do not skip time. Do not introduce a new\ncharacter, location, or revelation unless the prose above set it up.${d ? `\nSteer: ${d}` : ''}`,
  newscene: (d) => `Begin a new scene. Time has passed. Open somewhere else, or on someone else.\nDo not recap what just happened.${d ? `\nThe new scene: ${d}` : ''}`,
};

/** The body as it stands at a given chapter.
 *
 *  Canon that cannot change is the wrong model for a novel: a static body either leaks a
 *  later fact when you are writing early, or describes a dead character as alive when you
 *  are writing late. States are anchored to a chapter and the last one at or before where
 *  you are writing is the one in force.
 *
 *  A state that has not opened yet is hidden — that is the whole point. `hint` is the
 *  exception: it tells the model something exists without saying what, so foreshadowing
 *  has somewhere to come from.
 */
export function resolveBody(e: Entry, chapter: number): string {
  if (!e.states?.length) return e.body;
  const ordered = [...e.states].sort((a, b) => a.fromChapter - b.fromChapter);
  const inForce = ordered.filter((s) => s.fromChapter <= chapter).at(-1);
  const hints = ordered
    .filter((s) => s.fromChapter > chapter && s.beforeMode === 'hint')
    .map((s) => s.label?.trim() || 'something here is not yet known');
  return [inForce?.body ?? e.body, ...hints.map((h) => `[not yet known: ${h}]`)].join(' ');
}

// ponytail: no secondary keys, key_logic, proximity bound, exclusion keys or regex keys
// (SPEC §7.4). Those all address ONE failure — a multi-word key false-firing on words that
// happen to co-occur — which a small ledger cannot demonstrate. Build them when a real
// ledger actually false-fires, and use the fire preview to show it.

/** Fold an English word to a crude stem so "runs" and "running" meet.
 *
 *  Deliberately not Snowball. A real stemmer is a dependency and it collapses exactly the
 *  words a novel cannot afford to lose — Winter/wintered, Grace/graceful, Aldis/Aldi — which
 *  is why SPEC §7.4 exempts proper nouns from it at all. This handles the regular suffixes
 *  and nothing else. Irregular forms ("went" for "go") need their own key, and the UI says so.
 */
function fold(w: string): string {
  // A fixed sequence, not a loop. English stacks plural-onto-gerund ("bindings") but does
  // not stack further, and a general loop over-strips: "clos" looks like a plural, so
  // "closed" folded to "clo" while "close" folded to "clos" and they never met.
  let t = w.toLowerCase();
  if (t.length < 4) return t;

  if (t.endsWith("'s")) t = t.slice(0, -2);

  // Plural, once.
  if (t.endsWith('ies') && t.length > 4) t = t.slice(0, -3) + 'y';
  else if (t.endsWith('es') && /(s|x|z|ch|sh)$/.test(t.slice(0, -2))) t = t.slice(0, -2);
  // A bare -s is not a plural on words that simply end in one: press, glass, crisis, focus.
  else if (t.endsWith('s') && !/(ss|us|is)$/.test(t) && t.length > 3) t = t.slice(0, -1);

  // Verb suffix, once, on whatever is left.
  for (const suf of ['ing', 'ed']) {
    if (!t.endsWith(suf) || t.length - suf.length < 3) continue;
    t = t.slice(0, -suf.length);
    // Porter: a doubled final consonant loses one, except ll / ss / zz where it is real.
    if (t.length > 3 && t.at(-1) === t.at(-2) && !'lsz'.includes(t.at(-1)!)) t = t.slice(0, -1);
    if (t.length > 2 && t.endsWith('i')) t = t.slice(0, -1) + 'y';
    break;
  }

  // Trailing e last, on both sides: "closed" gives "clos" and "close" gives "clos".
  return t.length > 3 && t.endsWith('e') ? t.slice(0, -1) : t;
}

/** Whole-word match over one window. Proper nouns match exactly, plus plural and possessive;
 *  everything else is folded on both sides so word forms meet.
 *
 *  ponytail: still no secondary keys, key_logic, proximity bound, exclusion keys or regex keys
 *  (SPEC §7.4). Those address false-firing on multi-word keys; add them when a real ledger
 *  actually false-fires, which a four-entry fixture cannot show.
 */
function fires(entry: Entry, window: string): string[] {
  const raw = new Set(window.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);
  const folded = new Set([...raw].map(fold));
  const proper = entry.properNouns ?? entry.entryType === 'character';
  return entry.keys.filter((k) => {
    const parts = k.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    if (!parts.length) return false;
    return parts.every((p) => proper
      ? raw.has(p) || raw.has(p + 's') || raw.has(p + "'s")
      : folded.has(fold(p)));
  });
}

export function buildContext(input: Input, count: (s: string) => number): Manifest {
  const { story, chapters, passages, entries, currentChapter, budget } = input;
  const tailTokens = input.tailTokens ?? 200;
  const blocks: Block[] = [];
  /** Anchors never disappear. The parts marked `keep` are always sent; the rest is shortened
   *  from the end until the whole block fits, and the manifest says it was shortened. Losing
   *  point of view and register silently is far worse than losing the tail of a style sample. */
  const addAnchor = (kind: Kind, id: string, parts: { text: string; keep: boolean }[], cap: number) => {
    const live = parts.filter((p) => p.text.trim());
    let text = live.map((p) => p.text).join('\n');
    if (count(text) <= cap) { add(kind, id, text, 'anchor'); return; }
    const fixed = live.filter((p) => p.keep).map((p) => p.text).join('\n');
    const room = cap - count(fixed) - 1;
    const flex = live.filter((p) => !p.keep).map((p) => p.text).join('\n');
    let cut = flex;
    while (cut.length > 40 && count(cut) > room) cut = cut.slice(0, Math.floor(cut.length * 0.9));
    const out = live.map((p) => (p.keep ? p.text : (count(flex) > room ? cut.trimEnd() + '…' : p.text)))
      .filter((t) => t.trim()).join('\n');
    add(kind, id, out, `anchor shortened to ${cap} tokens`);
  };

  const add = (kind: Kind, id: string, text: string, reason: string, firedBy?: string[]) => {
    if (!text.trim()) return;
    blocks.push({ kind, id, text, tokens: count(text), state: 'included', reason, firedBy });
  };

  // SPINE — reference material at the top. Carries `direction` because a destination
  // is not a claim about *now*, so SPEC 7.1's argument against permanent bodies holding
  // temporal facts does not reach it (COUNCIL-03 S5 — the novelist won this).
  // Anchors are built from parts so that going over the cap shortens the LONG part rather
  // than deleting the block. Deleting SPINE loses the premise and the destination; deleting
  // DIRECTIVE loses point of view, register and the chapter's ending — and the app's own
  // hint ("paste a few hundred words of your own prose") guarantees the cap is exceeded.
  addAnchor('SPINE', 'spine', [
    // The title stays. F12: dropping it was measured at n=30 per arm and made no difference
    // (96% vs 93% on the passages that named the key, CI [-15, +8]) — and neither arm
    // reproduced F9's actual failure once in sixty generations.
    { text: `${story.title} — ${story.genre}`, keep: true },
    { text: story.premise, keep: false },
    { text: `Setting: ${story.setting}`, keep: true },
    { text: story.direction ? `Where this is going: ${story.direction}` : '', keep: true },
  ], CAPS.SPINE!);

  // Scan window for triggered entries. Sticky is derived by looking at the recent passages
  // one at a time rather than kept in a table: COUNCIL-03 showed a stored state row cannot
  // answer "what was true at ordinal 19" once the branch is at 45, and keying it by chapter
  // reset every window at each boundary — flicker at the most conspicuous paragraph in the book.
  //
  // The directive is IN the window. Found live on the first end-to-end run: the writer
  // steered "Aldis reaches into his coat", the key entry keyed on 'coat' did not fire
  // because prior prose never said the word, and the model then invented the key as
  // warm iron against canon that says cold brass. The instruction is the strongest
  // signal of what is about to be on the page; scanning only backwards misses it.
  const recent = [...passages.slice(-8).map((p) => p.body), input.directive ?? ''].join('\n');
  const windowFor = (n: number) => [...passages.slice(-(8 + n), passages.length - n)
    .map((p) => p.body), n === 0 ? (input.directive ?? '') : ''].join('\n');

  // Novelcrafter includes the point-of-view character unconditionally, and it is one line.
  const persona = (story as any).persona?.trim().toLowerCase();
  const isPov = (e: Entry) => !!persona && e.title.trim().toLowerCase() === persona;

  const pins = input.pins ?? {};
  for (const e of entries) {
    // force_out is a hard filter and is applied first here so nothing downstream can
    // resurrect it — SPEC §7.4 has it last in the sequence, which is the same outcome and
    // means it also beats force_in if a chapter somehow carries both.
    if (pins[e.id] === 'force_out') {
      blocks.push({ kind: e.activation === 'always_on' ? 'CANON-ALWAYS' : 'CANON-TRIGGERED',
        id: e.id, text: '', tokens: 0, state: 'omitted', reason: 'pinned out of this chapter' });
      continue;
    }
    const body = resolveBody(e, currentChapter.index);
    if (e.activation === 'always_on') {
      add('CANON-ALWAYS', e.id, body, 'always_on', ['always_on']);
    } else if (pins[e.id] === 'force_in') {
      // The fact matters in this scene even though nobody says its keyword.
      add('CANON-TRIGGERED', e.id, body, 'pinned in', ['pinned']);
    } else if (isPov(e)) {
      add('CANON-TRIGGERED', e.id, body, 'point of view', ['pov']);
    } else {
      const hit = fires(e, recent);
      if (hit.length) { add('CANON-TRIGGERED', e.id, body, 'keyword', hit); continue; }
      // Sticky is, in practice, "extend the scan window for this entry": the keyword has to
      // fall OUT of the 8-passage window before it does anything, and then it buys stickyFor
      // more. Characters default to 3, so a person mentioned eleven passages ago is still in
      // context and stops going quietly wrong the moment they are off the page.
      const sticky = e.stickyFor ?? (e.entryType === 'character' ? 3 : 0);
      for (let back = 1; back <= sticky; back++) {
        const then = fires(e, windowFor(back));
        if (then.length) { add('CANON-TRIGGERED', e.id, body, `sticky ${back} back`, ['sticky', ...then]); break; }
      }
    }
  }

  // EARLIER — every summary except the chapters still whole in PROSE, or the recent
  // chapter appears twice: a lossy summary beside the lossless prose it summarizes.
  const wholeFrom = currentChapter.index - 2;

  // Arcs first: an act-level summary replaces the chapters it covers rather than joining
  // them. Without this tier EARLIER grows linearly with the book and eventually crowds out
  // the prose it exists to make room for.
  const arcs = [...(input.arcs ?? [])].sort((a, b) => a.fromChapter - b.fromChapter);
  const covered = (idx: number) => arcs.some((a) => idx >= a.fromChapter && idx <= a.toChapter
    && a.toChapter < wholeFrom);
  for (const a of arcs) {
    // An arc reaching into the whole-prose window is held back: the chapters it covers are
    // still being sent in full, so summarising them as well is the duplication §7.3 deleted.
    if (a.toChapter >= wholeFrom) continue;
    add('EARLIER', `arc-${a.fromChapter}-${a.toChapter}`,
      `Ch${a.fromChapter}-${a.toChapter}${a.title ? ` ${a.title}` : ''}: ${a.summary}`, 'arc');
  }

  for (const c of chapters) {
    if (c.index >= wholeFrom || !c.summary) continue;
    if (c.keepWhole) continue;   // its prose is being sent; a summary too would duplicate it
    if (covered(c.index)) continue;
    // SPEC §5: on hash mismatch a summary is flagged stale, excluded, and re-run. Left in,
    // it contradicts the prose it no longer describes in every later call, forever.
    if (c.summaryStale) {
      blocks.push({ kind: 'EARLIER', id: c.id, text: '', tokens: 0,
        state: 'omitted', reason: 'summary stale — covered prose changed' });
      continue;
    }
    add('EARLIER', c.id, `Ch${c.index} ${c.title}: ${c.summary}`, 'summary');
  }

  // PROSE / TAIL — only the chapters still whole. Everything older is represented by its
  // summary in EARLIER, and sending BOTH is what made the prompt grow without bound: at
  // 12,000 words the assembled context exceeded the budget and the guard refused every
  // generation, permanently. A summary that does not replace the prose it summarises is
  // not compression, it is duplication.
  const byId = new Map(chapters.map((c) => [c.id, c.index]));
  const pulled = new Set(chapters.filter((c) => c.keepWhole).map((c) => c.id));
  const whole = passages.filter((p) => {
    if (p.chapterId && pulled.has(p.chapterId)) return true;   // pulled back in full
    const idx = p.chapterId ? byId.get(p.chapterId) : undefined;
    return idx == null || idx >= wholeFrom;      // unknown chapter: keep it rather than lose it
  });


  let tail: Passage[] = [], acc = 0;
  for (let i = whole.length - 1; i >= 0; i--) {
    const t = count(whole[i].body);
    if (acc + t > tailTokens && tail.length) break;
    tail.unshift(whole[i]); acc += t;
  }
  const head = whole.slice(0, whole.length - tail.length);
  for (const p of head)
    add('PROSE', p.id, p.body, p.chapterId && pulled.has(p.chapterId) ? 'pulled back' : 'recent prose');

  addAnchor('DIRECTIVE', 'directive', [
    { text: `[Writing: ${story.pov}]`, keep: true },
    { text: story.writingStyle ? `[Voice: ${story.writingStyle}]` : '', keep: false },
    { text: currentChapter.authorsNote ? `[This chapter must end with: ${currentChapter.authorsNote}]` : '', keep: true },
    { text: `[${SPICE[story.spice]}]`, keep: true },
  ], CAPS.DIRECTIVE!);

  // F14 arm B. Repeats every canon entry that FIRED, always-on and triggered alike — not just
  // the always-on ones PLAN-03's wording named. The fact F9 loses (the key is brass) lives in a
  // TRIGGERED entry, so repeating only always-on canon would restate three irrelevant facts and
  // measure nothing. The text is IDENTICAL to the first copy on purpose: the variable under test
  // is distance to the generation point, and rewording it would confound position with phrasing.
  // Reads block state before eviction runs, so an entry trimmed later still gets repeated — true
  // only under a budget tight enough to evict canon, which the bench fixture is nowhere near.
  // Delete this and the Kind with it when the experiment closes.
  if (input.repeatCanon)
    for (const b of blocks.filter((x) => CANON_KINDS.includes(x.kind) && x.state === 'included'))
      add('CANON-REPEAT', `${b.id}-repeat`, b.text, 'restated near the tail');

  for (const p of tail) add('TAIL', p.id, p.body, 'tail prose');

  // MODE. Omitted only for Co-Write on an unfinished line — scoping this to one mode
  // is deliberate: Direct's directive, Full Auto's steer and Adventure's options live
  // ONLY in MODE, and omitting it also drops the length instruction, which truncates,
  // which looks unfinished, which omits it again. It latches (COUNCIL-03 S7).
  const last = passages.at(-1)?.body ?? '';
  const unfinished = last.length > 0 && !/[.!?"'”’]\s*$/.test(last.trimEnd());
  if (!(input.mode === 'cowrite' && unfinished)) {
    add('MODE', 'mode', MODE[input.mode](input.directive), `mode:${input.mode}`);
  }

  // ponytail: ceilings and a hard refusal, no budget engine. No reservation, no trim ladder, no
  // eviction order, and no 'partial' block state — every block is included or omitted whole.
  // Deferred on measurement: prefill is fast (F1), the server refuses overflow rather than
  // truncating (F3), and summaries bound the context. PLAN-02 §7.2 holds the trigger condition.
  // ---- ceilings, then the guard ----
  const byKind: Record<string, number> = {};
  for (const b of blocks) byKind[b.kind] = (byKind[b.kind] ?? 0) + b.tokens;

  // addAnchor already fits each anchor to its cap, so this is a floor rather than a policy.
  // It used to delete the whole block, which is how a long writing sample silently removed
  // the point of view and the spice register from every call.
  const evict = (kinds: Kind[], ceiling: number, label: string) => {
    let used = blocks.filter((b) => kinds.includes(b.kind) && b.state === 'included')
                     .reduce((n, b) => n + b.tokens, 0);
    if (used <= ceiling) return;
    // Lowest value goes first. For canon that is RECALL, then LORE, then triggered, then
    // always-on. For EARLIER it is chapter summaries before arcs, oldest first within each —
    // an arc covering thirty chapters is the densest thing in the block and the last that
    // should go. `CANON_KINDS.indexOf` returned -1 for EARLIER, so the sort was a no-op and
    // eviction followed insertion order, which dropped the arcs first.
    const cands = blocks
      // A chapter you asked for back is not a candidate. Evicting it first made the pull
      // silently do nothing, which is worse than refusing.
      .filter((b) => kinds.includes(b.kind) && b.state === 'included' && b.reason !== 'pulled back')
      .sort((a, b) => {
        if (a.kind !== b.kind) return CANON_KINDS.indexOf(b.kind) - CANON_KINDS.indexOf(a.kind);
        if (a.kind === 'PROSE') return 0;   // insertion order is already oldest-first
        if (a.kind !== 'EARLIER') return 0;
        const arc = (x: typeof a) => (x.reason === 'arc' ? 1 : 0);   // arcs last
        return arc(a) - arc(b) || a.id.localeCompare(b.id);
      });
    for (const b of cands) {
      if (used <= ceiling) break;
      b.state = 'omitted'; b.reason = `${label} ceiling`; used -= b.tokens;
    }
  };
  evict(CANON_KINDS, Math.floor(budget * CANON_CAP_FRAC), 'canon 45%');
  evict(['EARLIER'], Math.floor(budget * EARLIER_CEILING_FRAC), 'EARLIER 25%');
  // Prose oldest-first. This is what lets a pulled-back chapter cost something rather than
  // overflow: the oldest passage in the recent window drops to make room, and the writer
  // gets the scene they asked for instead of a refusal. TAIL is excluded — the model has to
  // continue from something.
  evict(['PROSE'], Math.floor(budget * PROSE_CEILING_FRAC), 'prose 60%');

  const used = blocks.filter((b) => b.state === 'included').reduce((n, b) => n + b.tokens, 0);
  const over = used > budget;
  let overflowReason: string | undefined;
  if (over) {
    // Refuse, and name the block that would be dropped. Under context shift
    // llama-server drops from the HEAD, which is SPINE and canon — the one promise,
    // broken silently while the app reports success.
    const first = ORDER.map((k) => blocks.find((b) => b.kind === k && b.state === 'included'))
                       .find(Boolean);
    overflowReason = `over budget by ${used - budget} tokens; the server would drop ` +
                     `${first?.kind}/${first?.id} from the head first`;
  }

  blocks.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return {
    blocks,
    totals: { budget, used, unallocated: Math.max(0, budget - used) },
    byKind, overflowed: over, overflowReason,
  };
}
