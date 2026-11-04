// Story service. Maps database rows to the engine's plain-object Input and back.
// The engine never sees a row; the routes never see SQL.
import { buildContext, stateInForce, wornAt, retiredAt, resolveBody, REWEAVE, pocketReach } from './context.ts';
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
  // The world or intellectual property this book belongs to, and what is true in it. Reaches the
  // model inside SPINE — see the note there — and scopes a web pull's search.
  world: r.world ?? '', worldNote: r.world_note ?? '',
  // #18. The instruction is `writingStyle` and always was; these two are the sample and the
  // book's own genre flavour, and the engine reads all three separately now.
  styleNote: r.style_note ?? '',
  maxContext: r.max_context, status: r.status,
  spiceNote: r.spice_note, model: r.model, lockedCharacter: r.locked_character,
  lockoutOn: r.lockout_on !== 0,
  // #55. Whether this book weaves. Off on a row written before the column existed, as the column's
  // own default is. Whether a CALL weaves is decided in routes.ts, from this and the call's role.
  weaving: !!r.weaving,
  // Whether the surface should ask for the opening passage itself. Absent on a row written before
  // the column existed, so it reads as ON, which is the default the column carries too.
  autoOpen: r.auto_open == null ? true : !!r.auto_open,
  // The cover, used again as the plate at the head of every chapter. Off on a row written before
  // the column existed, which is the default the column carries too.
  chapterHero: !!r.chapter_hero,
  chapterSticky: !!r.chapter_sticky,
  coverOpacity: r.cover_opacity == null ? 30 : Number(r.cover_opacity),
  coverBlur: Number(r.cover_blur ?? 0),
  coverFlip: !!r.cover_flip,
  coverFade: r.cover_fade == null ? true : !!r.cover_fade,
  // Whether the tale's words print in the old script and translate (the decode). On for a row
  // written before the column existed, as the column's own default is.
  loen: r.loen == null ? true : !!r.loen,
});
const toChapter = (c: any) => ({
  id: c.id, index: c.idx, title: c.title, summary: c.summary,
  authorsNote: c.authors_note, opensWith: c.opens_with, brief: c.brief ?? null,
  status: c.status, coversThrough: c.summary_covers_through,
  summaryStale: db.summaryStale(c),
  summaryAuthor: c.summary_author ?? null,
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
 *  no per-story Anansi, because he is one character across the shelf and a book that wanted a
 *  different one would be a different character rather than a different register.
 *
 *  THE KEY IS `anansi` AND NOT `talk`, and that is the whole reason this can exist at all.
 *  `assemble` looks overrides up BY MODE NAME (`context.ts`, `input.modePrompts?.[input.mode]`),
 *  so a key called `talk` would be picked up by the MODE block and a reworded chat prompt could
 *  continue the book — which is exactly what `EDITABLE_PROMPTS` refuses. A key that is not a mode
 *  name is invisible to that lookup (`context.ts` reads an override only for a real mode's name),
 *  which is the same argument that already lets the bare `voice` key ride in this table.
 *
 *  Only the CHAT reads this. `INVENT` keeps its own plain prompt: what it returns is stored and
 *  re-sent to the writing model, and a register in there reaches the book through the ledger. */
export const anansiOf = (owner: string) => db.promptsOf(owner).anansi?.trim() || TALK_VOICE;

export function view(storyId: string, focusChapterId?: string) {
  const s = db.getStory(storyId);
  if (!s) return null;
  // #89. Each hemmed scene carries its hem: running or done, the pass report, the suggestion, and
  // whether the scene changed since. Null on a scene never hemmed through the background hem.
  const hems = db.hemsOf(storyId);
  // DISMISSED (Seth, 2026-10-27): the writer set this hem's card aside for good. Keyed to the hem's
  // start, so Hem again (a new start) brings the card back.
  const setAside = db.dismissed(storyId);
  const chapters = db.chapters(storyId).map((c: any) => {
    const h = hems.get(c.id);
    return { ...toChapter(c), hem: h ? { ...h, dismissed: setAside.has(`hem:${c.id}:${h.startedAt}`) } : null };
  });
  const branches = db.branchesOf(storyId);
  const variants = db.variantsBySlot(storyId);
  const states = db.statesForStory(storyId);
  const events = db.eventsForStory(storyId);
  const outfits = db.outfitsOf(storyId);
  const addons = db.addonsOf(storyId);
  const pins = db.pinsOf(storyId);
  const arcs = db.arcsOf(storyId);
  // The chapters under an act, one definition for both reads below.
  const under = (a: any) => chapters.filter((c) => c.index >= a.from_chapter && c.index <= a.to_chapter);
  // #47. Which chapter under an act has changed since it was written, or null. Computed on read
  // from the chapters above, as stale is. It never takes the act out of the prompt.
  const outOfDate = (a: any) => {
    const r = db.actOutOfDate(a.summaries_hash, under(a));
    if (!r) return null;
    const ch = chapters.find((c) => c.index === r.chapter);
    return { ...r, title: ch?.title ?? null };
  };
  return {
    // #76. What an update moved in this tale. In the view, so it is behind the book's own gate.
    updates: db.updatesOf(storyId),
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
    /* WHICH THREADS HAVE A PICTURE, as id -> set_at. Never the bytes: entry_images is a side table
     * precisely so a BLOB does not ride in every view, and the set_at keys an immutable URL.
     *
     * One query for the book rather than one per card — a book with sixty threads would pay sixty. */
    entryImages: db.entryImagesOf(storyId),
    // The book's own look, or null for "follow the writer's default". Top level and not inside
    // `story` for the same reason `cover` is: a surface that posts the story object straight back
    // must not be able to save it as a field of the book's text.
    look: (() => { try { return s.look ? JSON.parse(s.look) : null; } catch { return null; } })(),
    // WHO WRITES THIS BOOK, and whose move it is. Top level for the same reason `look` is: a
    // surface that posts the story object back must not be able to save either as a field of it.
    // `writers` is one row for a book written alone, which is what the composer reads to decide
    // whether Co-op is on the dial at all.
    writers: db.writersOf(storyId),
    turn: s.turn ?? null,
    // What the Waiting panel lists that is not already on the view: stale summaries and
    // out-of-date acts, less the ones the writer waved away. Proposals and strings are read
    // straight off `proposals` and `strings` (the tale's string pockets since #127). Counts of those sat here until 2026-10-24, read by
    // nothing, and the strings one counted differently from the panel.
    waiting: (() => {
      const off = db.dismissed(storyId);
      const stale = chapters.filter((c: any) => c.summary && c.summaryStale
        && !off.has(`stale:${db.summaryHashOf(c.id) ?? c.id}`));
      return {
        stale: stale.map((c: any) => ({ id: c.id, index: c.index, title: c.title,
                                        ref: db.summaryHashOf(c.id) ?? c.id })),
        // #47. Out-of-date acts. The ref is the act and what its chapters' summaries say NOW, so
        // waving one away is "not for this": the next change to a chapter under it brings it back.
        acts: arcs.flatMap((a: any) => {
          const o = outOfDate(a);
          if (!o) return [];
          const ref = `${a.id}:${db.proseHash([db.actPrint(under(a))])}`;
          return off.has(`act:${ref}`) ? [] : [{ id: a.id, ref, title: a.title,
            fromChapter: a.from_chapter, toChapter: a.to_chapter,
            chapter: o.chapter, why: o.why, chapterTitle: o.title }];
        }),
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
      // Whether the writer has written PAST this one yet. See db.ts's `claimed` column: a passage
      // the server persisted while nobody was listening is real but not yet stood behind, and the
      // surface marks it until the next thing written claims it.
      claimed: p.claimed !== 0,
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
      // #79. The dated wardrobe and retirements, for the engine and for Over time.
      events: (events.get(e.id) ?? []).map((x: any) => ({ id: x.id, kind: x.kind, addonId: x.addon_id,
        fromChapter: x.from_chapter })),
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
      // #36. The card this row was taken from, and whether it still tracks it. `sharedFrom` above
      // means "read through from another book"; `originId` means "this book's own copy of one".
      // They are never both set, which is what the screen keys its two faces off.
      originId: e.origin_id ?? null,
      addons: (e.shared_from ? db.addonsOf(e.shared_from_id) : addons)
        .filter((a: any) => a.entry_id === e.id).map((a: any) => ({
        id: a.id, slot: a.slot, name: a.name, body: a.body,
        keys: JSON.parse(a.keys || '[]'), active: !!a.active, activation: a.activation ?? undefined,
        fromChapter: a.from_chapter ?? undefined,
        retiredAtChapter: a.retired_at_chapter ?? undefined,
      })),
    }))
      // #78, #79. WHAT IS TRUE AT THE SCENE THIS VIEW IS OPEN AT, by the engine's own rules, so the
      // screen cannot show a different version, outfit or retirement from the one the model is sent:
      // the Over time entry in force, the outfit worn, and the scene it was retired at if it still is.
      .map((e: any) => { const at = (chapters.find((c) => c.id === focusChapterId) ?? chapters.at(-1))?.index ?? 1;
        const worn = wornAt(e, at);
        return { ...e, nowStateId: stateInForce(e, at)?.id ?? null, retiredAtChapter: retiredAt(e, at) ?? undefined,
          outfits: e.outfits.map((o: any) => ({ ...o, active: o.id === worn })) }; }),
    // #125 · ADR 0010. THE TALE'S THREAD, or null until a hem first needs it: Always true (the
    // setting), its own text (the premise, where the tale stood as it opened) and its Over time, in
    // the shape every thread has. Not in `entries`: it reaches the model in SPINE, not as a thread.
    taleThread: (() => { const t = db.taleThreadOf(storyId);
      if (!t) return null;
      // `nowStateId` as every thread has it: the entry in force at the scene this view is open at.
      const at = (chapters.find((c) => c.id === focusChapterId) ?? chapters.at(-1))?.index ?? 1;
      const e = toEntry(t, states.get(t.id) ?? []);
      return { ...e, nowStateId: stateInForce(e, at)?.id ?? null, addons: addons.filter((a: any) => a.entry_id === t.id)
        .map((a: any) => ({ id: a.id, slot: a.slot, name: a.name, body: a.body, keys: JSON.parse(a.keys || '[]'), active: !!a.active,
          activation: a.activation ?? undefined })) }; })(),
    // #75. The tale's own pockets: instructions for the whole tale, on its thread at the top of Threads.
    talePockets: addons.filter((a: any) => !a.entry_id && a.slot === 'instruction').map((a: any) => ({
      id: a.id, name: a.name, body: a.body, active: !!a.active, activation: a.activation ?? undefined })),
    // ADR 0005 · The tale's rules, pockets of its own thread since 2026-10-29, on the Thread tab.
    taleRules: addons.filter((a: any) => !a.entry_id && a.slot === 'rule').map((a: any) => ({
      id: a.id, name: a.name, body: a.body, keys: JSON.parse(a.keys || '[]'), active: !!a.active,
      activation: a.activation ?? undefined })),
    pins: pins.map((p: any) => ({ chapterId: p.chapter_id, entryId: p.entry_id, mode: p.mode })),
    // PLAN-08 Phase 3. Directed connections, parent to child. They travel with the view because
    // the engine reads them and the Threads screen draws them, and both have to agree about which
    // way round an edge points — the one thing about this table that cannot be recovered later.
    edges: db.edgesOf(storyId).map((e: any) => ({ id: e.id, parentId: e.parent_id,
      childId: e.child_id, confidence: e.confidence, keys: JSON.parse(e.keys || '[]') })),
    arcs: arcs.map((a: any) => ({ id: a.id, fromChapter: a.from_chapter, toChapter: a.to_chapter,
      title: a.title, summary: a.summary, outOfDate: outOfDate(a) })),
    strings: db.stringsOf(storyId).map((x: any) => ({
      id: x.id, title: x.title, body: x.body ?? '', fromChapter: x.from_chapter,
      owedBy: x.owed_by, status: x.status, summoned: !!x.summoned, kind: x.kind ?? 'promise',
    })),
    // #36. What this book has REMOVED from what it follows. Tombstones are not cards — `entriesOf`
    // keeps them out of `entries` above — so without this line a removed card is invisible and
    // unrecoverable from the screen, which is a one-way door.
    dropped: db.droppedFollowed(storyId).map((d: any) => ({ id: d.id, title: d.title,
      originId: d.origin_id })),
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
      // #73. One Workbench card per group, the narration line it came from, and a pocket's name.
      grp: p.grp ?? null, line: p.line ?? null, pocket: p.pocket ?? null,
      // #152 · A Talk change held whole: its card has nowhere else to send it, so no Goes in.
      held: !!p.change,
      // #114. The other pockets a tidy's merge replaces, so its card can say they go too.
      merges: (() => { try { return p.merges ? JSON.parse(p.merges) : null; } catch { return null; } })(),
      // The pockets a new thread arrives with, so its card can show them before it is sewn in.
      rooms: (() => { try { return p.rooms ? JSON.parse(p.rooms) : null; } catch { return null; } })(),
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
  targetWords > 0 ? Math.min(Math.max(Math.round(targetWords * 1.4 * 2), 900), MAX_TARGET_WORDS * 1.4 * 2) : 900;

/** The longest passage the length slider asks for. 2,000 since 2026-10-24 (Seth, for Kimi K2.5; it
 *  was 1,000), so the ceiling `capFor` derives tops out at 5,600 tokens. That comes out of the
 *  book's own budget, not on top of the slot. */
export const MAX_TARGET_WORDS = 2000;

/** THE ONE LIST of the writer's instruction boxes, in the order Account → Writing draws them: the
 *  five modes, then `reweave`. The route's allow-list is this list, and the editor draws the keys
 *  of `defaultModePrompts`, which is built from it, so there is one list and not three to agree.
 *
 *  `reweave` IS NOT A MODE and does not replace one. A reweave re-runs the instruction the passage
 *  was written with (`inherit` in routes.ts), and this box is the frame that FOLLOWS it, on a
 *  reweave with a What didn't work note only: the wording around the note (`REWEAVE` in context.ts,
 *  docs/adr/0012). A re-roll had a wording of its own from 2026-09-01 to 2026-09-18, `regenerate`,
 *  and it REPLACED the mode with "write this passage again": it named the passage being re-rolled,
 *  the one passage a re-roll's prompt then left out, so the model rewrote the passage before it.
 *  This one keeps the passage's own instruction and names no passage it does not send. */
export const EDITABLE_PROMPTS = ['continue', 'speak', 'act', 'direct', 'narrate', 'reweave'];

/** The shipped wording of every editable box, rendered with its placeholders left in.
 *
 *  Built by asking the engine itself rather than by keeping a second copy: a copy is a thing that
 *  goes stale, and the editor's whole job is to show the writer what they are replacing. */
export function defaultModePrompts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const mode of EDITABLE_PROMPTS) {
    // The note frame, placeholder in: the same string the engine fills (`REWEAVE` in context.ts),
    // so the box shows exactly what an unedited reweave sends around the note.
    if (mode === 'reweave') { out.reweave = REWEAVE; continue; }
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
                         targetWords = 0, whatFailed?: string) {
  // Regenerating passage 3 of 50 must build the context that existed at passage 3. Sending
  // the whole document meant the "new take" was written with knowledge of the 47 passages
  // that come after it — which is not a regeneration, it is a summary of the future.
  //
  // STRICTLY BEFORE, so the passage being re-rolled is not PROSE either. From 2026-09-01 the
  // re-roll's wording said "write this passage again" about a passage cut out right here, and the
  // model rewrote the one before it instead. It does not come back in any form (docs/adr/0012).
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
    writingStyle: (v.story as any).writingStyle?.trim() || voiceOf((v as any).owner),
    // #75. The tale's own pockets that are On (#134, by their eye: they have no wake words).
    pockets: ((v as any).talePockets ?? []).filter((a: any) => pocketReach(a) === 'always_on').map((a: any) => a.body),
    // ADR 0005 · Its rules that are not Off (#134, by their eye). A tale following a World does not
    // read the World's rules.
    // ponytail: no World holds a rule today; read them through `followPair` if one ever does.
    rules: ((v as any).taleRules ?? []).map((a: any) => ({ ...a, activation: pocketReach({ ...a, slot: 'rule' }) }))
      .filter((a: any) => a.activation !== 'off'),
    // #125 · WHERE THE TALE STANDS at the scene being written: the tale's thread's Over time entry in
    // force there, by the rule every thread's is read by. Its scene-1 text is the premise, so a tale
    // with nothing sewn in, or no thread yet, sends the premise as before.
    stands: (v as any).taleThread ? resolveBody((v as any).taleThread, v.currentChapter.index) : undefined };
  const inp: Input = {
    story: withVoice as any, chapters: v.chapters, passages, arcs: v.arcs,
    entries: v.entries.map((e) => ({ ...e, body: entryText(e) })),
    mode: mode as any, directive, speaker, currentChapter: v.currentChapter,
    // Talk's question and conversation, which decide the always-on threads it is sent (context.ts `reach`).
    reach: (v as any).talkReach,
    /* SHIPPED ON, 2026-09-01, at Seth's word. F53 measured it: marking the writer's own passages
     * HALVES the model's action for the locked character (2.47 -> 1.16 per 1,000 words of narration,
     * p = 0.00001, 650 generations an arm against a simultaneous control). The mechanism is that he
     * leaves the subject slot — the only slot an action can live in — while staying just as present
     * as an object and a possessive. Action per subject-slot mention does not move at all, so this
     * does not teach the model different verbs; it stops him being the one doing things, which is
     * what the lockout line asks for in words.
     *
     * READ BEFORE SHIPPING, not just measured: a random sample of the marked arm's prose is coherent
     * and focused on the world answering. Median passage 67 -> 61 words, 9% shorter, and the sample
     * does not read thin. Violations are HALVED, NOT GONE — one of six sampled passages still had him
     * act — so this is a rate improvement and the flag is not a fix.
     *
     * `!== '0'` RATHER THAN DELETED, because the off switch is what the next measurement needs:
     * F53 and F54 have never been run together, and F28's interiority conclusion is owed a re-score
     * against a lockout-off arm. A shipped default with a way to turn it off on one server is what
     * makes those runnable. */
    proseAuthor: process.env.ANANSI_PROSE_AUTHOR !== '0',
    // Only the ones switched on and open (#127: on is in play), and the filter is here rather than in the engine so buildContext
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
    // WHEN YOU REWEAVE: the writer's frame for the note, on a reweave only. A reweave is the one call that stops
    // short of a passage (`upToOrdinal`), so that is what decides it, here above the line.
    reweave: upToOrdinal == null ? undefined : modePrompts?.reweave,
    // WHAT DID NOT WORK, the writer's note from the Reweave box, on a reweave only (docs/adr/0012).
    // The take it is about is NOT sent, in any form: the passage at `upToOrdinal` stays cut from
    // `passages` above. For one day it went back in, framed, and the model continued it or copied it.
    whatFailed: upToOrdinal == null ? undefined : whatFailed,
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
 *  THE `<think>` STRIP STAYS AND IS NOT DEFENSIVE. This is a reasoning model. A passage in a book
 *  that does not weave is sent `enable_thinking: false`, and the tags come back without it; one in
 *  a book that weaves asks for the plan on purpose and relies on the server to keep it in its own
 *  field. Deleting this with the rest of the function would put the tags in the prose the first
 *  time either of those fails. */
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
