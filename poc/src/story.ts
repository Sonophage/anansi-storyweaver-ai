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
  states: states.map((s) => ({ fromChapter: s.from_chapter, body: s.body,
    beforeMode: s.before_mode, label: s.label })),
  notes: r.notes ?? '',            // writer-only. Deliberately absent from the Entry the engine sees.
  stickyFor: r.sticky_for ?? undefined,
  properNouns: r.proper_nouns == null ? undefined : !!r.proper_nouns,
});
const toStory = (r: any) => ({
  title: r.title, genre: r.genre, premise: r.premise, setting: r.setting, pov: r.pov,
  persona: r.persona, writingStyle: r.writing_style, direction: r.direction, spice: r.spice,
  maxContext: r.max_context, status: r.status, stripPatterns: r.strip_patterns,
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
  const pins = db.pinsOf(storyId);
  const arcs = db.arcsOf(storyId);
  return {
    id: storyId, story: toStory(s), chapters,
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
      variants: variants.get(`${p.chapter_id}:${p.slot_key}`) ?? [{ id: p.id, selected: true }],
    })),
    entries: db.entriesOf(storyId).map((e: any) => toEntry(e, states.get(e.id) ?? [])),
    pins: pins.map((p: any) => ({ chapterId: p.chapter_id, entryId: p.entry_id, mode: p.mode })),
    arcs: arcs.map((a: any) => ({ id: a.id, fromChapter: a.from_chapter, toChapter: a.to_chapter,
      title: a.title, summary: a.summary })),
    violations: db.violationsOf(storyId).map((v: any) => ({
      id: v.id, passageId: v.passage_id, entryId: v.entry_id, quote: v.quote,
      reason: v.reason, confidence: v.confidence,
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
  return cap - Math.max(600, maxTokens) - Math.floor(cap * 0.06);
};

/** Assemble the prompt. Pure from here down — no I/O below this line. */
export function assemble(v: NonNullable<ReturnType<typeof view>>, slot: Slot,
                         mode: string, directive?: string, upToOrdinal?: number, maxTokens = 900) {
  // Regenerating passage 3 of 50 must build the context that existed at passage 3. Sending
  // the whole document meant the "new take" was written with knowledge of the 47 passages
  // that come after it — which is not a regeneration, it is a summary of the future.
  const passages = upToOrdinal == null ? v.passages
    : v.passages.filter((p) => p.ordinal < upToOrdinal);
  const inp: Input = {
    story: v.story as any, chapters: v.chapters, passages, arcs: v.arcs,
    entries: v.entries.map((e) => ({ ...e, body: entryText(e) })),
    mode: mode as any, directive, currentChapter: v.currentChapter,
    // Pins are per chapter, so only this chapter's apply.
    pins: Object.fromEntries((v.pins ?? [])
      .filter((p: any) => p.chapterId === v.currentChapter.id)
      .map((p: any) => [p.entryId, p.mode])),
    budget: budgetFor(v.story, slot), tailTokens: 220,
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
