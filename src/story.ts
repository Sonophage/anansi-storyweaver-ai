// Story service. Maps database rows to the engine's plain-object Input and back.
// The engine never sees a row; the routes never see SQL.
import { buildContext } from './context.ts';
import type { Input, Entry } from './context.ts';
import { render, entryText, SYSTEM } from './render.ts';
import { SLOTS } from './slots.ts';
import { DEFAULT_VOICE, TALK_VOICE } from './prompts.ts';
import * as db from './db.ts';

export interface Slot { global: number; slots: number; perSlot: number }

const toEntry = (r: any, states: any[] = []): Entry => ({
  id: r.id, title: r.title, body: r.body, entryType: r.entry_type,
  activation: r.activation, keys: JSON.parse(r.keys || '[]'), lastEditor: r.last_editor,
  // `id` is here so a surface can remove one. Without it data-delstate was empty and a
  // progression could be added and never taken away.
  states: states.map((s) => ({ id: s.id, fromChapter: s.from_chapter, body: s.body,
    beforeMode: s.before_mode, label: s.label })),
  notes: r.notes ?? '',            // writer-only. Deliberately absent from the Entry the engine sees.
  stickyFor: r.sticky_for ?? undefined,
  properNouns: r.proper_nouns == null ? undefined : !!r.proper_nouns,
  retiredAtChapter: r.retired_at_chapter ?? undefined,
});
const toStory = (r: any) => ({
  title: r.title, genre: r.genre, premise: r.premise, setting: r.setting, pov: r.pov,
  persona: r.persona, writingStyle: r.writing_style, spice: r.spice,
  // RETAINED DATA, NOT A FIELD. The "Where this is going" box came out of every surface and every
  // prompt on 2026-08-30 — Seth: "no ones going to use it. ive asked." The column was kept because
  // two books in the live library had written in it, so it still travels to the client where an
  // export or a curious reader can find it. NOTHING RENDERS IT, and nothing may: `test/web.ts`
  // asserts no surface offers the field and `test/engine.ts` asserts it never reaches a prompt.
  direction: r.direction,
  // #18. The instruction is `writingStyle` and always was; these two are the sample and the
  // book's own genre flavour, and the engine reads all three separately now.
  styleNote: r.style_note ?? '',
  maxContext: r.max_context, status: r.status,
  spiceNote: r.spice_note, model: r.model, lockedCharacter: r.locked_character,
  lockoutOn: r.lockout_on !== 0,
  // Whether the surface should ask for the opening passage itself. Absent on a row written before
  // the column existed, so it reads as ON, which is the default the column carries too.
  autoOpen: r.auto_open == null ? true : !!r.auto_open,
  // The cover, used again as the plate at the head of every chapter. Off on a row written before
  // the column existed, which is the default the column carries too.
  chapterHero: !!r.chapter_hero,
  chapterSticky: !!r.chapter_sticky,
  coverOpacity: r.cover_opacity == null ? 30 : Number(r.cover_opacity),
});
const toChapter = (c: any) => ({
  id: c.id, index: c.idx, title: c.title, summary: c.summary,
  authorsNote: c.authors_note, status: c.status, coversThrough: c.summary_covers_through,
  summaryStale: db.summaryStale(c),
  keepWhole: !!c.keep_whole,
});

/** Everything a surface needs to render one story. */
/** THE VOICE A BOOK IS ACTUALLY WRITTEN IN: its own, then the writer's saved default, then the
 *  shipped one. Moved here from `routes.ts` on 2026-08-30, COUNCIL-06 ship 3, because it had only
 *  ever run at story CREATION and `assemble()` is where it has to run to be true on every call.
 *
 *  `db.createStory` has three callers and only `POST /api/stories` backfilled: `ledgerInto` and
 *  the importer did not. Both books in the live library with an empty voice came in through the
 *  importer, and `context.ts` gates the whole VOICE block on non-empty — so they were sending NO
 *  VOICE AT ALL, carried entirely by SYSTEM. A migration would have plugged those two rows and
 *  left all three paths open, and `db.updateStory` writes a blank straight through, so the hole
 *  could reopen the next time somebody cleared the field. */
export const voiceOf = (owner: string) => db.promptsOf(owner).voice?.trim() || DEFAULT_VOICE;

/** HOW ANANSI TALKS, and it is the writer's. Two rungs where the book's voice has three: there is
 *  no per-story Anansi, because she is one character across the shelf and a book that wanted a
 *  different one would be a different character rather than a different register.
 *
 *  THE KEY IS `anansi` AND NOT `talk`, and that is the whole reason this can exist at all.
 *  `assemble` looks overrides up BY MODE NAME (`context.ts`, `input.modePrompts?.[input.mode]`),
 *  so a key called `talk` would be picked up by the MODE block and a reworded chat prompt could
 *  continue the book — which is exactly what `EDITABLE_MODES` in `routes.ts` refuses. A key that
 *  is not a mode name is invisible to that lookup, which is the same argument that already lets
 *  the bare `voice` key ride in this table.
 *
 *  Only the CHAT reads this. `INVENT` keeps its own plain prompt: what it returns is stored and
 *  re-sent to the writing model, and a register in there reaches the book through the ledger. */
export const anansiOf = (owner: string) => db.promptsOf(owner).anansi?.trim() || TALK_VOICE;

export function view(storyId: string, focusChapterId?: string) {
  const s = db.getStory(storyId);
  if (!s) return null;
  const chapters = db.chapters(storyId).map(toChapter);
  const branches = db.branchesOf(storyId);
  const variants = db.variantsBySlot(storyId);
  const states = db.statesForStory(storyId);
  const outfits = db.outfitsOf(storyId);
  const addons = db.addonsOf(storyId);
  const pins = db.pinsOf(storyId);
  const arcs = db.arcsOf(storyId);
  return {
    // PLAN-08. The slot list travels with the view rather than being copied into the browser: the
    // database enforces exclusivity off `src/slots.ts` and the screen has to agree with it, and a
    // second copy in web/ is exactly the drift that module exists to stop. The browser cannot
    // import the .ts, so the server hands it over as data.
    slots: SLOTS,
    // COUNCIL-06 ship 3. `assemble()` needs it to look up the writer's own default voice — it is
    // not sent to the browser as anything the surface reads, it is here so the ladder can run.
    owner: (s as any).owner_id,
    id: storyId, story: toStory(s), chapters,
    // Whether there is a cover, never the cover itself. Top level rather than inside `story` so a
    // surface that posts the story object straight back cannot try to save it as a field.
    cover: db.coverAt(storyId),
    // The book's own look, or null for "follow the writer's default". Top level and not inside
    // `story` for the same reason `cover` is: a surface that posts the story object straight back
    // must not be able to save it as a field of the book's text.
    look: (() => { try { return s.look ? JSON.parse(s.look) : null; } catch { return null; } })(),
    // What this book is waiting on, in one place. Every part of it was already on the surface
    // somewhere — proposals under the chapter, strings under Strings, flags beside a passage, the
    // horizon on a bar — which is the problem: a writer had to visit four panels to find out
    // whether anything wanted them. Computed here so the panel and the shelf agree by construction.
    waiting: (() => {
      const off = db.dismissed(storyId);
      const stale = chapters.filter((c: any) => c.summary && c.summaryStale
        && !off.has(`stale:${db.summaryHashOf(c.id) ?? c.id}`));
      return {
        proposals: db.proposalsOf(storyId).length,
        strings: db.stringsOf(storyId).filter((x: any) => x.status === 'open' && !x.summoned).length,
        flags: db.violationsOf(storyId).filter((f: any) => f.status !== 'dismissed').length,
        stale: stale.map((c: any) => ({ id: c.id, index: c.index, title: c.title,
                                        ref: db.summaryHashOf(c.id) ?? c.id })),
      };
    })(),
    // The chapter you are working in, not simply the last one. Every chapter-scoped feature —
    // the author's note, pins, what canon looks like from here — was addressable only at the
    // tip, so a closed chapter could never be revisited.
    currentChapter: chapters.find((c) => c.id === focusChapterId) ?? chapters.at(-1)!,
    branchId: db.activeBranchOf(storyId),
    branches: branches.map((b: any) => ({ id: b.id, name: b.name, parentId: b.parent_id,
      forkOrdinal: b.fork_ordinal, isPrimary: !!b.is_primary,
      active: b.id === db.activeBranchOf(storyId) })),
    passages: db.passagesOf(storyId).map((p: any) => ({
      id: p.id, ordinal: p.ordinal, body: p.body, author: p.author, speaker: p.speaker,
      isBreak: !!p.is_break, chapterId: p.chapter_id, variantIndex: p.variant_index,
      // Stored since the schema was written and never shown. It is what distinguishes a passage the
      // model wrote to order from one it wrote on its own, which is the difference Seth wants to
      // see down the margin.
      directed: !!(p.directive && String(p.directive).trim()),
      /* ISSUE #38. THE INSTRUCTION ITSELF, not just whether there was one. Seth, 2026-09-01: "I
       * should be able to edit the regenerate command."
       *
       * A re-roll of a directed passage re-runs its stored instruction — `inherit()` in routes.ts —
       * and until now the writer could neither see that instruction nor change it, so a passage
       * written from a bad steer could only be re-rolled into the same bad steer for ever.
       *
       * SENT ONLY WHERE THERE IS ONE, which is what keeps this off the weight ledger. A directive is
       * capped at 400 characters by EXTRACT's schema and most passages have none — `directed` above
       * has always been the common case being false. The alternative was a per-passage fetch on the
       * Regenerate press, which is a new route and a round trip to read the writer's own sentence
       * back to them. */
      directive: p.directive && String(p.directive).trim() ? String(p.directive) : undefined,
      // #14. Which of the four presses wrote it, so the page can colour the margin by the action.
      // Undefined on everything from before 2026-08-29 and the page draws those without an accent.
      mode: p.mode ?? undefined,
      variants: variants.get(`${p.chapter_id}:${p.slot_key}`) ?? [{ id: p.id, selected: true }],
    })),
    // `entriesFor`, not `entriesOf`: what reaches the model and the screen includes the threads
    // this book FOLLOWS. Delete, copy and export deliberately still read `entriesOf` — see the note
    // there for why widening that one would have let a follower delete its world's cards.
    loreFrom: (s as any).lore_from ?? null,
    follows: (() => { const w = (s as any).lore_from && db.getStory((s as any).lore_from) as any;
      return w ? { id: w.id, title: w.title } : null; })(),
    entries: db.entriesFor(storyId).map((e: any) => ({
      ...toEntry(e, states.get(e.id) ?? []),
      // Reads through `db.outfitsOf`, which is the `outfit` slot of `addons` — see the note there.
      outfits: outfits.filter((o: any) => o.entry_id === e.id)
        .map((o: any) => ({ id: o.id, name: o.name, body: o.body, active: !!o.active })),
      // (`wearing` was computed here for every entry on every view. Removed 2026-08-29 with
      //  #18 §4 — nothing read it. The comment that stood here said the engine skipped the outfit
      //  slot BECAUSE this carried the coat; that stopped being true on 2026-08-28 when the
      //  wardrobe became an addon, and `rooms()` has rendered the outfit like any other room since.)
      // Where a followed card actually lives, so the screen can say so and refuse to edit it here.
      sharedFrom: e.shared_from ?? null,
      sharedFromId: e.shared_from_id ?? null,
      addons: (e.shared_from ? db.addonsOf(e.shared_from_id) : addons)
        .filter((a: any) => a.entry_id === e.id).map((a: any) => ({
        id: a.id, slot: a.slot, name: a.name, body: a.body,
        keys: JSON.parse(a.keys || '[]'), active: !!a.active,
        fromChapter: a.from_chapter ?? undefined,
        retiredAtChapter: a.retired_at_chapter ?? undefined,
      })),
    })),
    pins: pins.map((p: any) => ({ chapterId: p.chapter_id, entryId: p.entry_id, mode: p.mode })),
    // PLAN-08 Phase 3. Directed connections, parent to child. They travel with the view because
    // the engine reads them and the Threads screen draws them, and both have to agree about which
    // way round an edge points — the one thing about this table that cannot be recovered later.
    edges: db.edgesOf(storyId).map((e: any) => ({ id: e.id, parentId: e.parent_id,
      childId: e.child_id, confidence: e.confidence, keys: JSON.parse(e.keys || '[]') })),
    arcs: arcs.map((a: any) => ({ id: a.id, fromChapter: a.from_chapter, toChapter: a.to_chapter,
      title: a.title, summary: a.summary })),
    violations: db.violationsOf(storyId).map((v: any) => ({
      id: v.id, passageId: v.passage_id, entryId: v.entry_id, quote: v.quote,
      reason: v.reason, confidence: v.confidence, reached: v.reached !== 0,
    })),
    // What the writer has quieted in the chapter they are in. It ships with the view so the panel
    // can offer the way back — a mute you cannot see is one you cannot lift.
    muted: [...db.mutedIn(storyId, (chapters.find((c) => c.id === focusChapterId) ?? chapters.at(-1)!).id)],
    strings: db.stringsOf(storyId).map((x: any) => ({
      id: x.id, title: x.title, body: x.body ?? '', fromChapter: x.from_chapter,
      owedBy: x.owed_by, status: x.status, summoned: !!x.summoned,
    })),
    proposals: db.proposalsOf(storyId).map((p: any) => ({
      id: p.id, entryId: p.entry_id, title: p.title, body: p.body, entryType: p.entry_type,
      keys: JSON.parse(p.keys || '[]'), kind: p.kind, delta: p.delta, chapterId: p.chapter_id,
      // PLAN-08 Phase 4. Which ROOM this lands in, or null for the card's own body. Written since
      // Phase 2 and shipped to nobody until the accept path learned to read it, so the surface
      // could not say where an accepted fact was about to go.
      field: p.field ?? null,
      // The room this would stand in for, if the writer chooses replace over add. The surface needs
      // the id to send it back and the NAME to say what it is offering to overwrite.
      target: p.target ?? null,
    })),
  };
}

/** Cheap synchronous estimate. It draws no meter any more — the surface uses the exact count
 *  `/api/manifest` already returns — so its only job now is the ceilings and the refusal inside
 *  `buildContext`, which are pure and cannot make a round trip.
 *
 *  PLAN-06 2a. 3.6 was a guess; 2.8 replaced it and was ALSO a guess, and the comment that stood
 *  here claimed it was measured. `bench/drift.ts` measured it against 147 logged calls, comparing
 *  rebuilt prompts to what the server actually charged:
 *
 *      4.45 chars/token   n=91   Qwen3.6-WNTH-35B-A3B-NN (+ its pre-rename name)
 *      4.28 chars/token   n=45   rp-t-glm47flash-h
 *      5.69 chars/token   n=10   rp-nt-ornith-h
 *
 *  So 2.8 ran the estimate 59% HIGH, and every ceiling evicted that much earlier than the slot
 *  required. Characters per token is a property of the TOKENIZER, so no single constant is right
 *  for a library that lets two writers pick two models — which is why this is 4.2 and not 4.45:
 *  4.2 is under the lowest rate measured, so the estimate stays slightly HIGH for every model in
 *  the log rather than exactly right for one and low for another. High is the safe direction; the
 *  engine refuses early, where low means `fits()` refuses late with an error on screen.
 *
 *  THE KNOB. To re-choose it: run `bench/drift.ts`, take the LOWEST chars/token across the models
 *  with ten or more calls, and round down. Do not take the median, and do not take the model you
 *  happen to be using. If a model ever measures below ~4.2 this constant stops being conservative
 *  and the estimator needs to become a function of the model — that is the trigger, and nothing in
 *  the log has crossed it. */
export const estimate = (t: string) => Math.ceil(t.length / 4.2);

/** Safety margin scales with the budget in use, not with the slot.
 *  Off the slot, a story capped at 4,000 tokens lost 1,501 to a margin sized for 25,024. */
export const budgetFor = (story: any, slot: Slot, maxTokens = 900) => {
  const cap = Math.min(story.maxContext || slot.perSlot, slot.perSlot);
  // The reserve tracks the reply length in force rather than a constant 600. The guard only
  // counts the PROMPT, so a longer reply used to push prompt+output past the slot with the
  // guard still green — and llama.cpp returns that as a passage truncated mid-sentence.
  // Clamped at zero. A story capped below the reply reserve produced a NEGATIVE budget, which
  // the surface rendered as "Context -168%" and "406 / -242". The guard still refuses; it just
  // no longer refuses with nonsense on screen.
  // PLAN-06 2d. SYSTEM is prepended by `render` and is not a block, so `buildContext` never sees
  // it and its standing instruction — 551 tokens as of COUNCIL-06 ship 5, 2026-08-30 — was room
  // the engine believed it still had.
  // Taken off the budget rather than added to the blocks: a SYSTEM block would need a place in
  // ORDER, a colour, a name in BLOCK_ORIGIN and a row in the panel, which is the same argument
  // `context.ts:548` already used to keep the lockout on DIRECTIVE instead of giving it a block.
  // The number the writer is shown is then true — this is the room you have, SYSTEM is spent.
  return Math.max(0, cap - Math.max(600, maxTokens) - Math.floor(cap * 0.06) - estimate(SYSTEM));
};

/** The writer sets a TARGET; the transport gets a CEILING. They stopped being the same number on
 *  2026-08-30, and conflating them is what cut 41 of 181 prose runs off mid-word.
 *
 *  MEASURED off the generations log that day, denominator being every run that could have hit its
 *  cap: at 450 the model landed exactly on it 41 times in 181; at 900 it hit it 0 times in 212,
 *  averaging 335 tokens against an 845 maximum. Lowering the ceiling never shortened a passage —
 *  the average was 290 at 450 against 335 at 900 — because the model is never told the number and
 *  so cannot aim under it. It only chopped a quarter of them. Twice-the-target sits above the
 *  observed spread, and 900 is the floor because nothing has ever run into it.
 *
 *  (The two eras are sequential and not simultaneous arms, so the cross-cap comparison is
 *  uncontrolled — the 41-in-181 is not, and it is the one this function exists for.)
 *
 *  1.4 tokens per word is `estimate`'s 4.2 chars/token at ~5.7 chars per word-and-space, rounded
 *  UP on purpose: over-estimating tokens buys headroom, and headroom is the whole job here.
 *
 *  ponytail: a flat 2x over a flat 1.4 tokens/word, not a fit against the log. Both constants are
 *  read off one model's history and neither is per-model — a wordier model, or one with a coarser
 *  tokenizer, gets a ceiling closer to its own output than this assumes. The upgrade path is the
 *  generations table, which already carries `completion_tokens` and the prompt's word count per
 *  model: fit the multiplier per model when a second one is in real use. The trigger is a model
 *  whose runs start landing ON the ceiling — `finish_reason: 'length'`, which the writer is now
 *  told about, so it will be noticed rather than inferred. */
export const capFor = (targetWords: number) =>
  targetWords > 0 ? Math.min(Math.max(Math.round(targetWords * 1.4 * 2), 900), 2000) : 900;

/** The shipped wording of every editable mode, rendered with its placeholders left in.
 *
 *  Built by asking the engine itself rather than by keeping a second copy: a copy is a thing that
 *  goes stale, and the editor's whole job is to show the writer what they are replacing. */
export function defaultModePrompts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const mode of ['continue', 'speak', 'act', 'direct', 'narrate']) {
    const m = buildContext({
      story: { title: '', genre: '', premise: '', setting: '', pov: '', writingStyle: '', spice: 2 },
      chapters: [], passages: [{ id: 'p', ordinal: 1, body: 'x.' }], entries: [],
      mode: mode as any, directive: '{{directive}}', speaker: '{{speaker}}',
      currentChapter: { id: 'c', index: 1 }, budget: 4000,
    } as any, estimate).blocks.find((b) => b.kind === 'MODE');
    if (m) out[mode] = m.text;
  }
  return out;
}

/** Assemble the prompt. Pure from here down — no I/O below this line. */
export function assemble(v: NonNullable<ReturnType<typeof view>>, slot: Slot,
                         mode: string, directive?: string, upToOrdinal?: number, maxTokens = 900,
                         speaker?: string, modePrompts?: Record<string, string>,
                         targetWords = 0) {
  // Regenerating passage 3 of 50 must build the context that existed at passage 3. Sending
  // the whole document meant the "new take" was written with knowledge of the 47 passages
  // that come after it — which is not a regeneration, it is a summary of the future.
  const passages = upToOrdinal == null ? v.passages
    : v.passages.filter((p) => p.ordinal < upToOrdinal);
  // COUNCIL-06 ship 3 · A BOOK IS NEVER WRITTEN WITH NO VOICE. `context.ts` gates the whole VOICE
  // block on this being non-empty, and two books in the live library had it blank — both created by
  // the importer, which never ran the backfill that `POST /api/stories` does. They were sending no
  // voice at all.
  //
  // Here rather than in `context.ts` because the ladder is story -> the writer's saved default ->
  // the shipped one, and only this side of the purity line can read the writer's. `buildContext`
  // stays pure: it receives a story whose voice is already resolved.
  const withVoice = { ...v.story,
    writingStyle: (v.story as any).writingStyle?.trim() || voiceOf((v as any).owner) };
  const inp: Input = {
    story: withVoice as any, chapters: v.chapters, passages, arcs: v.arcs,
    entries: v.entries.map((e) => ({ ...e, body: entryText(e) })),
    mode: mode as any, directive, speaker, currentChapter: v.currentChapter,
    // F52, under measurement. Read HERE, on the impure side, and handed to buildContext through
    // Input — the same rule the voice ladder above follows. Two servers against one router is how
    // this project runs an A/B, so the arm has to be a process-level thing.
    lockoutClause: process.env.ANANSI_LOCKOUT_CLAUSE === '1',
    proseAuthor: process.env.ANANSI_PROSE_AUTHOR === '1',
    // F54, under measurement. Seth's question, 2026-09-01: the name where the line says "their".
    lockoutNamed: process.env.ANANSI_LOCKOUT_NAMED === '1',
    // F55. The same naming with the second clause in noun form, so no mental verb touches the name.
    lockoutNoun: process.env.ANANSI_LOCKOUT_NOUN === '1',
    // Only the summoned ones, and the filter is here rather than in the engine so buildContext
    // never has to know what a string's status means.
    strings: (v as any).strings?.filter((x: any) => x.summoned && x.status === 'open') ?? [],
    // Pins are per chapter, so only this chapter's apply.
    pins: Object.fromEntries((v.pins ?? [])
      .filter((p: any) => p.chapterId === v.currentChapter.id)
      .map((p: any) => [p.entryId, p.mode])),
    // Not filtered by chapter: an edge is a fact about the book, not about where you are writing.
    // What it can pull is already bounded by the entries that reached the prompt at this position.
    edges: v.edges ?? [],
    budget: budgetFor(v.story, slot, maxTokens), tailTokens: 220,
    modePrompts,
    // A number, resolved before the line: `buildContext` stays pure and reads no setting of its
    // own. Zero means the writer left it on "let her decide", and nothing about length reaches
    // the model at all — which is the shipped behaviour F29 measured and is still the default.
    targetWords,
  };
  const manifest = buildContext(inp, estimate);
  return { manifest, prompt: render(manifest) };
}

/** Strip reasoning scaffolding.
 *
 *  This used to also run per-story regexes the writer typed into "Strip from output" — ripped in
 *  #26, feature and column both. Nobody had ever set one, and it was a user-supplied regex run on
 *  a process two people share, so a runaway pattern would have stalled the other writer's
 *  generation as well as its author's.
 *
 *  THE `<think>` STRIP STAYS AND IS NOT DEFENSIVE. This is a reasoning model, and
 *  `enable_thinking: false` is mandatory for prose precisely because the tags come back otherwise.
 *  Deleting this with the rest of the function would put them in the prose the first time that
 *  flag is missed. */
export function clean(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** Cut a passage the ceiling truncated back to its last finished sentence.
 *
 *  RUNS ONLY ON `finish_reason: 'length'`, and the caller is what enforces that. A passage the
 *  model ended itself is finished wherever it chose to stop; trimming that would delete prose on
 *  purpose, and the modes explicitly permit three sentences.
 *
 *  The boundary class is `context.ts`'s unfinished-line test PLUS the em dash and the ellipsis.
 *  Those two are in because the shipped voice asks for them by name — "Let speakers go unfinished.
 *  Thoughts trail; sentences stop mid-breath." A line ending on a dash is intended prose, and a
 *  trim that ate it would be the same defect as the guillotine, one clause smaller.
 *
 *  RETURNS THE TEXT UNCHANGED WHEN IT FINDS NO BOUNDARY. A passage with no terminal punctuation
 *  anywhere is not a reason to hand the writer an empty one — that would turn a truncated take
 *  into a lost take, which is strictly worse than the bug being fixed. */
export function trimToSentence(text: string) {
  // Greedy, so it backtracks to the LAST boundary rather than the first, and keeps any closing
  // quote or bracket sitting after it.
  const kept = text.match(/^[\s\S]*[.!?…—][)\]"'”’]*/)?.[0].trimEnd();
  return kept || text;
}
