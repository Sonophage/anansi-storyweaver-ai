// Story service. Maps database rows to the engine's plain-object Input and back.
// The engine never sees a row; the routes never see SQL.
import { buildContext } from './context.ts';
import type { Input, Entry } from './context.ts';
import { render, entryText } from './render.ts';
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
});
const toStory = (r: any) => ({
  title: r.title, genre: r.genre, premise: r.premise, setting: r.setting, pov: r.pov,
  persona: r.persona, writingStyle: r.writing_style, direction: r.direction, spice: r.spice,
  maxContext: r.max_context, status: r.status, stripPatterns: r.strip_patterns,
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
  const pins = db.pinsOf(storyId);
  const arcs = db.arcsOf(storyId);
  return {
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
      variants: variants.get(`${p.chapter_id}:${p.slot_key}`) ?? [{ id: p.id, selected: true }],
    })),
    entries: db.entriesOf(storyId).map((e: any) => ({
      ...toEntry(e, states.get(e.id) ?? []),
      outfits: outfits.filter((o: any) => o.entry_id === e.id)
        .map((o: any) => ({ id: o.id, name: o.name, body: o.body, active: !!o.active })),
      wearing: outfits.filter((o: any) => o.entry_id === e.id && o.active)
        .map((o: any) => ({ name: o.name, body: o.body }))[0] ?? null,
    })),
    pins: pins.map((p: any) => ({ chapterId: p.chapter_id, entryId: p.entry_id, mode: p.mode })),
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
    })),
  };
}

/** Cheap synchronous estimate, used only to draw the meter on every keystroke.
 *
 *  3.6 chars/token was a guess and measured 24% LOW against `/tokenize` on real prose —
 *  which meant the overflow guard, whose entire job is to refuse an over-length prompt,
 *  was reading a number a quarter under the truth. 2.8 matches this model's tokenizer on
 *  this kind of text. The guard that actually decides is `fits()` below, on real tokens. */
export const estimate = (t: string) => Math.ceil(t.length / 2.8);

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
  return Math.max(0, cap - Math.max(600, maxTokens) - Math.floor(cap * 0.06));
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
    budget: budgetFor(v.story, slot, maxTokens), tailTokens: 220,
    modePrompts,
  };
  const manifest = buildContext(inp, estimate);
  return { manifest, prompt: render(manifest) };
}

/** Strip whatever the writer listed, plus reasoning scaffolding. */
export function clean(text: string, patterns?: string | null) {
  let out = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  // The writer's own patterns, run on the writer's own machine — but two people share this
  // process, so a runaway pattern would stall the other one's generation too. Bounded rather
  // than trusted: short patterns, few of them.
  const lines = (patterns ?? '').split('\n').map((s) => s.trim())
    .filter((s) => s && s.length <= 200).slice(0, 20);
  for (const line of lines) {
    try { out = out.replace(new RegExp(line, 'g'), ''); } catch { /* not a valid regex; skip it */ }
  }
  return out.trim();
}
