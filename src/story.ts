// Story service. Maps database rows to the engine's plain-object Input and back.
// The engine never sees a row; the routes never see SQL.
import { buildContext } from './context.ts';
import type { Input, Entry } from './context.ts';
import { render, entryText, SYSTEM } from './render.ts';
import { SLOTS } from './slots.ts';
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
  persona: r.persona, writingStyle: r.writing_style, direction: r.direction, spice: r.spice,
  // #18. The instruction is `writingStyle` and always was; these two are the sample and the
  // book's own genre flavour, and the engine reads all three separately now.
  voiceSample: r.voice_sample ?? '', styleNote: r.style_note ?? '',
  maxContext: r.max_context, status: r.status,
  spiceNote: r.spice_note, model: r.model, lockedCharacter: r.locked_character,
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
      wearing: outfits.filter((o: any) => o.entry_id === e.id && o.active)
        .map((o: any) => ({ name: o.name, body: o.body }))[0] ?? null,
      // PLAN-08. The engine reads these; the outfit slot among them is skipped in `context.ts`
      // because `wearing` above still carries the coat from the older table.
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
  // it and its ~445 tokens of standing instruction were room the engine believed it still had.
  // Taken off the budget rather than added to the blocks: a SYSTEM block would need a place in
  // ORDER, a colour, a name in BLOCK_ORIGIN and a row in the panel, which is the same argument
  // `context.ts:548` already used to keep the lockout on DIRECTIVE instead of giving it a block.
  // The number the writer is shown is then true — this is the room you have, SYSTEM is spent.
  return Math.max(0, cap - Math.max(600, maxTokens) - Math.floor(cap * 0.06) - estimate(SYSTEM));
};

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
                         speaker?: string, modePrompts?: Record<string, string>) {
  // Regenerating passage 3 of 50 must build the context that existed at passage 3. Sending
  // the whole document meant the "new take" was written with knowledge of the 47 passages
  // that come after it — which is not a regeneration, it is a summary of the future.
  const passages = upToOrdinal == null ? v.passages
    : v.passages.filter((p) => p.ordinal < upToOrdinal);
  const inp: Input = {
    story: v.story as any, chapters: v.chapters, passages, arcs: v.arcs,
    entries: v.entries.map((e) => ({ ...e, body: entryText(e) })),
    mode: mode as any, directive, speaker, currentChapter: v.currentChapter,
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
