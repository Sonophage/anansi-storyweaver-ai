// Route table. One entry per endpoint; the HTTP shell in serve.ts does the plumbing.
import { count, chat, structured, structuredRetry, model, models, setModel } from './llama.ts';
import { SYSTEM } from './render.ts';
import { SUMMARY, ARC, EXTRACT, EXTRACT_SCHEMA, SPARK, SPARK_SCHEMA, CHECK, checkSchema } from './prompts.ts';
import * as db from './db.ts';
import * as imp from './import.ts';
import { view, assemble, budgetFor, clean } from './story.ts';
import { resolveBody } from './context.ts';
import type { Slot } from './story.ts';

export interface Ctx {
  body: any; query: URLSearchParams; owner: string; slot: Slot;
  gen: Record<string, any>; setGen: (g: Record<string, any>) => void;
}
type Handler = (c: Ctx) => Promise<any> | any;

const need = (v: any, msg: string) => { if (!v) throw Object.assign(new Error(msg), { code: 404 }); return v; };
const viewOf = (id: string, chapter?: string) => need(view(id, chapter), 'no such story');

/** Routes that must not be reachable with someone else's story id.
 *
 *  Everything except the three that do not name a story: listing your own library, creating
 *  a story, and reading generation settings. Postgres would express this as RLS; here it is
 *  one gate in the dispatcher, because Council #3's backend seat was right that per-handler
 *  discipline is the thing that gets forgotten — and it had been, on all twenty-nine of these. */
export const OPEN_ROUTES = new Set([
  // These name no story. `GET /api/search` belongs here because db.search is already
  // owner-scoped in SQL — gating it by story made every search return 400, which is the
  // security fix breaking the feature it was protecting.
  'GET /api/stories', 'POST /api/stories', 'POST /api/spark', 'GET /api/search',
  'POST /api/import',
  'GET /api/models', 'GET /api/ledger',
]);

/** The story a request is about, wherever it names it. */
export function storyIdOf(body: any, query: URLSearchParams): string | null {
  return body?.storyId ?? body?.id ?? query.get('story') ?? null;
}

async function generate(c: Ctx, mode: string, directive: string | undefined, role = 'prose') {
  const v = viewOf(c.body.storyId);
  const upTo = c.body.regenerateOf
    ? v.passages.find((p) => p.id === c.body.regenerateOf)?.ordinal : undefined;
  const { manifest, prompt } = assemble(v, c.slot, mode, directive, upTo, Number(c.gen.max_tokens) || 900);
  if (manifest.overflowed) return { error: manifest.overflowReason, manifest };

  // The estimate draws the meter; this decides. One /tokenize before a call that costs
  // ~30s of prefill is cheap, and it is the only number the server will agree with.
  try {
    const exact = await count(prompt);
    manifest.totals.used = exact;
    if (exact > manifest.totals.budget) {
      const first = manifest.blocks.find((b) => b.state === 'included');
      return { manifest, error: `${exact} tokens against a budget of ${manifest.totals.budget}. ` +
        `The server would drop ${first?.kind}/${first?.id} from the head first.` };
    }
  } catch { /* model asleep — let the call fail with its own error */ }
  const { thinking, ...sampler } = c.gen;
  const t0 = Date.now();
  try {
    const r = await chat(SYSTEM, prompt.slice(SYSTEM.length),
      { ...sampler, chat_template_kwargs: { enable_thinking: !!thinking } });
    const ms = Date.now() - t0;
    db.logGeneration({ storyId: v.id, chapterId: v.currentChapter.id, model: model(), role,
      params: c.gen, manifest, promptTokens: r.usage?.prompt_tokens,
      completionTokens: r.usage?.completion_tokens, timings: r.timings, latencyMs: ms });
    return { prose: clean(r.prose, v.story.stripPatterns), reasoning: r.reasoning.length,
             seconds: +(ms / 1000).toFixed(1), manifest };
  } catch (e: any) {
    db.logGeneration({ storyId: v.id, model: model(), role, manifest, error: e?.message, latencyMs: Date.now() - t0 });
    return { error: e?.message ?? 'generation failed', manifest };
  }
}

/** Summaries bound the context without the budget engine: old chapters collapse, the
 *  recent tail stays whole. The hash is over the covered prose, so a later edit makes the
 *  summary detectably stale rather than quietly wrong. */
async function summarise(c: Ctx, storyId: string, chapterId?: string) {
  const v = need(view(storyId), 'no such story');
  const ch = v.chapters.find((x) => x.id === chapterId) ?? v.currentChapter;
  const ps = db.passagesOfChapter(ch.id).filter((p: any) => !p.is_break && p.body.trim());
  if (!ps.length) return { error: 'nothing to summarise' };
  const bodies = db.passagesOfChapter(ch.id).map((p: any) => p.body);
  // 280 rather than 400: 180 words is about 240 tokens, and the old headroom was room to pad in.
  const r = await chat(SUMMARY(180), ps.map((p: any) => p.body).join('\n\n'),
    { temperature: 0.2, max_tokens: 280, chat_template_kwargs: { enable_thinking: false } });
  const summary = clean(r.prose, v.story.stripPatterns);
  db.setSummary(ch.id, summary, ps.at(-1)!.ordinal, db.proseHash(bodies));
  return { summary, chapterId: ch.id };
}

/** Classify a proposed entry against what the ledger already holds.
 *
 *  `conflict` is the one that matters: a model proposal against a body a human pinned.
 *  The arbitration rule keys on provenance (`last_editor`), so those never auto-apply and
 *  are excluded from bulk accept — screen 28's "Accept all but the conflict". */
export function classifyFor(existing: any[], p: any) { return classify(existing, p); }

function classify(existing: any[], p: any) {
  const norm = (t: string) => String(t).toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(the|a|an) /, '');
  const words = (t: string) => norm(t).split(' ').filter((w) => w.length > 3);
  const pn = norm(p.title);

  // Resolve on the TITLE only. "Marek Vale" is not "Marek" under exact match, so containment
  // and a shared distinctive word are both needed. Keys are deliberately NOT used: a proposal
  // for "The Bell" listed "Aldis" among its trigger words and matched the Aldis entry, which
  // is a keyword naming another character, not evidence of being that character.
  const hit = !pn ? undefined : existing.find((e) => {
    const en = norm(e.title);
    if (!en) return false;
    if (en === pn || en.includes(pn) || pn.includes(en)) return true;
    const ew = new Set(words(e.title));
    return words(p.title).some((w) => ew.has(w));
  });

  if (!hit) return { kind: 'new', entry_id: null, delta: 'New entry' };
  if (hit.body.trim() === p.body.trim()) return null;   // nothing to say
  // A conflict is specifically a proposal against a BODY a human wrote. If you renamed the
  // entry but never touched its body, the body is still the model's to update.
  const bodyEditor = (() => { try { return JSON.parse(hit.field_editors || '{}').body; } catch { return null; } })();
  const kind = bodyEditor === 'human' ? 'conflict' : 'changed';
  return { kind, entry_id: hit.id,
    delta: kind === 'conflict'
      ? `Would overwrite a body you pinned: "${hit.body.slice(0, 70)}…"`
      : `Was: "${hit.body.slice(0, 70)}…"` };
}

/** Check one passage against the canon that reached the prompt for it.
 *
 *  Runs on a SELECTED passage, not on every variant — checking takes are wasted calls on
 *  prose the writer may never keep. Flags only; nothing is rewritten. */
async function check(c: Ctx, storyId: string, passageId: string) {
  const v = need(view(storyId), 'no such story');
  const passage = v.passages.find((p) => p.id === passageId);
  if (!passage) return { error: 'no such passage' };

  // SPEC §8.4: the input is "the manifest's included canon entries" — not the whole ledger.
  //
  // This was checking every entry in the story, which blames the writer for the engine's
  // omissions: a triggered entry that never fired was still checked, so a passage could be
  // flagged for contradicting canon it was never shown. It also gets worse as the ledger
  // grows, because every extra fact is another chance to reach.
  //
  // Rebuilding the manifest as of this passage gives exactly what it saw — the right
  // entries, with the right state in force for its chapter.
  const asOf = assemble(v, c.slot, 'direct', undefined, passage.ordinal);
  const reached = new Set(asOf.manifest.blocks
    .filter((b) => b.kind.startsWith('CANON') && b.state === 'included').map((b) => b.id));
  const chapter = v.chapters.find((ch) => ch.id === passage.chapterId) ?? v.currentChapter;
  const facts = v.entries
    .filter((e) => reached.has(e.id))
    .map((e) => ({ id: e.id, title: e.title, body: resolveBody(e, chapter.index) }))
    .filter((f) => f.body.trim());
  if (!facts.length) return { checked: 0, found: 0, violations: [] };

  const numbered = facts.map((f, i) => `${i + 1}. ${f.body}`).join('\n');
  const r = await structuredRetry(CHECK, `CANON:\n${numbered}\n\nPASSAGE:\n${passage.body}`,
    checkSchema(facts.length));
  if (!r.data) return { error: r.error ?? 'the check returned nothing usable' };

  db.clearViolations(passageId);   // re-checking replaces, it does not accumulate

  // Only narration commits the story to a fact. A character may lie, be wrong, guess, or
  // speak figuratively — the prompt says so and the model flags it anyway, so the filter is
  // here rather than left to instruction. Deterministic, and it costs nothing.
  const spans: [number, number][] = [];
  for (const m of passage.body.matchAll(/["“][^"”]*["”]/g))
    spans.push([m.index!, m.index! + m[0].length]);
  const inDialogue = (quote: string) => {
    const at = passage.body.indexOf(quote.slice(0, 40));
    return at >= 0 && spans.some(([a, b]) => at >= a && at < b);
  };

  const found = (r.data.contradictions ?? []).filter((x: any) => {
    if (!x?.quote) return false;
    if (!passage.body.includes(String(x.quote).slice(0, 30))) return false;  // must be in the passage
    if (inDialogue(String(x.quote))) return false;                            // speech is not narration
    return (x.confidence ?? 1) >= 0.6;
  });
  for (const x of found) {
    const f = facts[x.canon - 1];
    db.addViolation(storyId, { passageId, entryId: f?.id, quote: x.quote,
      reason: x.why, confidence: x.confidence });
  }
  // Same shape the view uses, so a caller never has to know a row from a record.
  return { checked: facts.length, found: found.length,
    violations: db.violationsOf(storyId).map((x: any) => ({ id: x.id, passageId: x.passage_id,
      entryId: x.entry_id, quote: x.quote, reason: x.reason, confidence: x.confidence })) };
}

export const routes: Record<string, Handler> = {
  // ---- library ----
  'GET /api/stories':    (c) => ({ stories: db.listStories(c.owner), model: model(), slot: c.slot, gen: c.gen }),

  // The router serves several models. Listing is open because it names no story; switching is
  // process-wide and gated, because two tenants share this process and one changes it for both.
  // Names no story on purpose: it spans them. Owner-scoped in SQL, like search.
  'GET /api/ledger': (c: Ctx) => ({ entries: db.ledgerOf(c.owner).map((e: any) => ({
    id: e.id, story: e.story, storyTitle: e.story_title, title: e.title, body: e.body,
    notes: e.notes ?? '', entryType: e.entry_type, activation: e.activation,
    keys: JSON.parse(e.keys || '[]'),
  })) }),

  'GET /api/models': async () => {
    try { return { models: await models(), active: model() }; }
    catch (e: any) { return { models: [], active: model(), error: e?.message ?? 'the router did not answer' }; }
  },
  'POST /api/model': async (c) => {
    try { return { active: await setModel(String(c.body.model ?? '')) }; }
    catch (e: any) { return { error: e?.message ?? 'could not switch model' }; }
  },
  'POST /api/stories':   (c) => {
    const made = db.createStory(c.owner, c.body);
    for (const e of c.body.entries ?? []) db.upsertEntry(made.id, c.owner, e);
    if (c.body.opening) db.addPassage({ ...made, storyId: made.id, body: c.body.opening, author: 'model' });
    return made;
  },
  'DELETE /api/stories': (c) => { db.delStory(c.body.id, c.owner); return { ok: true }; },

  /** Idea in, skeleton out. Creates nothing: the writer edits every field first, and the
   *  characters arrive as proposed entries rather than as canon. */
  'POST /api/spark': async (c) => {
    const idea = String(c.body.idea ?? '').trim();
    if (idea.length < 8) return { error: 'give it a sentence to work from' };
    const r = await structured(SPARK, idea, SPARK_SCHEMA);
    if (!r.data?.title) return { error: r.error ?? 'the spark returned nothing usable' };
    const d = r.data;
    return {
      story: {
        title: d.title, premise: d.premise, genre: d.genre, setting: d.setting,
        pov: d.pov, spice: d.spice, writingStyle: d.writingStyle, direction: '',
      },
      // One always-on entry per character, in the bracket format the ledger uses.
      entries: (d.characters ?? []).map((ch: any) => ({
        title: ch.name, entryType: 'character', activation: 'always_on',
        body: `[${ch.name}: ${ch.role}. ${ch.description}]`, keys: [ch.name],
      })),
    };
  },

  // ---- one story ----
  'GET /api/story':      (c) => {
    const v = viewOf(c.query.get('story')!, c.query.get('chapter') ?? undefined);
    return { ...v, model: model(), slot: c.slot, gen: c.gen, budget: budgetFor(v.story, c.slot, Number(c.gen.max_tokens) || 900) };
  },
  'POST /api/story':     (c) => { db.updateStory(c.body.id, c.body.story); return viewOf(c.body.id); },
  'POST /api/chapter':   (c) => { db.updateChapter(c.body.storyId, c.body.chapterId, c.body.chapter); return viewOf(c.body.storyId); },
  'POST /api/chapter/end': async (c) => {
    const v = viewOf(c.body.storyId);
    // A break is a real passage so NEW SCENE has something to fire on and ordinals stay dense.
    db.addPassage({ storyId: v.id, branchId: v.branchId!, chapterId: v.currentChapter.id,
      body: c.body.note ?? '', author: 'human', isBreak: true });
    const closing = v.currentChapter.id;
    const r = db.endChapter(v.id, v.branchId!, c.body.nextTitle);
    // Summarise on close rather than on a button nobody remembers. Summaries are what bound
    // the context without the budget engine; leaving it manual leaves the bound optional.
    if (c.body.summarise !== false) {
      try { await summarise(c, v.id, closing); } catch { /* model asleep; the button still works */ }
    }
    return { ...r, ...viewOf(v.id) };
  },

  // ---- history & revert. §7.4's safety argument is "you can revert" — this is the revert. ----
  'GET /api/history':      (c) => ({
    passage: c.query.get('passage') ? db.passageHistory(c.query.get('story')!, c.query.get('passage')!) : [],
    entry:   c.query.get('entry')   ? db.entryHistory(c.query.get('story')!, c.query.get('entry')!)     : [],
  }),
  'POST /api/revert':      (c) => {
    if (c.body.passageId) db.revertPassage(c.body.storyId, c.body.passageId, c.body.revisionId);
    else db.revertEntryField(c.body.storyId, c.body.entryId, c.body.revisionId);
    return viewOf(c.body.storyId);
  },
  // Gated: it copies every tenant's book and returns the host path, and twelve presses
  // evict everyone's snapshots.
  'POST /api/backup':      () => db.backup(),
  'POST /api/export':      (c: Ctx) => db.exportStory(c.body.storyId, c.owner),
  // ponytail: no client calls this yet — the audit found it as the only route with no caller,
  // which is this project's own half-built pattern. The importers and their 7 checks are real;
  // what is missing is a file picker on either surface. Wire it when the import screen exists.
  // Creates a story, so it names no existing one and cannot be gated on ownership — it is
  // open for the same reason POST /api/stories is, and the new story is owned by the caller.
  'POST /api/import': (c: Ctx) => {
    const name = String(c.body.name ?? '');
    if (/\.db$/i.test(name)) return imp.absorb(c.owner, imp.fromExport(imp.safePath(name)));
    const data = String(c.body.data ?? '');
    if (!data) throw Object.assign(new Error('send the file as base64 in `data`'), { code: 400 });
    const buf = Buffer.from(data, 'base64');
    if (buf.length > 20_000_000) throw Object.assign(new Error('that file is over 20MB'), { code: 400 });
    return imp.absorb(c.owner, imp.parse(name, buf));
  },

  // ---- prose ----
  'POST /api/write':   (c) => {
    const v = viewOf(c.body.storyId);
    if (c.body.body?.trim()) db.addPassage({ storyId: v.id, branchId: v.branchId!,
      chapterId: v.currentChapter.id, body: c.body.body.trim(), author: 'human', speaker: c.body.speaker ?? null });
    return viewOf(v.id);
  },
  'POST /api/accept':  (c) => {
    const v = viewOf(c.body.storyId);
    // Regenerate over an existing slot keeps every take; a fresh accept appends.
    const id = c.body.variantOf
      ? db.addVariant(v.id, c.body.variantOf, c.body.body)
      : db.addPassage({ storyId: v.id, branchId: v.branchId!, chapterId: v.currentChapter.id,
          body: c.body.body, author: 'model', speaker: c.body.speaker ?? null,
          directive: c.body.directive ?? null });
    // SPEC §8.4: check on SELECT, not on every variant. Detached — a flag is not worth
    // making the writer wait, and it appears on the next refresh.
    if (id && c.body.check !== false) void check(c, v.id, id).catch(() => {});
    return viewOf(v.id);
  },
  'POST /api/variant':   (c) => { db.selectVariant(c.body.storyId, c.body.id); return viewOf(c.body.storyId); },

  // ---- branches ----
  /** Fork at a passage. Copy-on-write: the new path gets its own rows, so regenerating on it
   *  cannot rewrite the one you came from. */
  'POST /api/fork': (c) => {
    const v = viewOf(c.body.storyId);
    const at = v.passages.find((p) => p.id === c.body.passageId)?.ordinal
      ?? v.passages.at(-1)?.ordinal ?? 0;
    const id = db.forkBranch(v.id, v.branchId!, at, c.body.name);
    if (!id) return { error: 'could not fork from that branch' };
    db.setActiveBranch(v.id, id);
    return viewOf(v.id);
  },
  'POST /api/branch':    (c) => {
    if (!db.setActiveBranch(c.body.storyId, c.body.id)) return { error: 'no such branch' };
    return viewOf(c.body.storyId);
  },
  'DELETE /api/branch':  (c) => {
    if (!db.deleteBranch(c.body.storyId, c.body.id))
      return { ...viewOf(c.body.storyId), error: 'the first path cannot be removed' };
    return viewOf(c.body.storyId);
  },
  'POST /api/check':     (c) => check(c, c.body.storyId, c.body.passageId),
  'POST /api/violation': (c) => { db.setViolationStatus(c.body.storyId, c.body.id, c.body.status ?? 'dismissed');
    return viewOf(c.body.storyId); },
  'POST /api/passage':   (c) => { db.editPassage(c.body.storyId, c.body.id, c.body.body); return viewOf(c.body.storyId); },
  'DELETE /api/passage': (c) => { db.delPassage(c.body.storyId, c.body.id); return viewOf(c.body.storyId); },

  // ---- ledger ----
  'POST /api/entry':   (c) => { db.upsertEntry(c.body.storyId, c.owner, c.body.entry); return viewOf(c.body.storyId); },
  'DELETE /api/entry': (c) => { db.delEntry(c.body.storyId, c.body.id); return viewOf(c.body.storyId); },

  // Canon over time. The state in force is resolved at assembly, so writing chapter 3
  // cannot see what chapter 7 establishes.
  'POST /api/state':   (c) => { db.upsertState(c.body.storyId, c.body.entryId, c.body.state); return viewOf(c.body.storyId); },
  /** Per-chapter override. `mode` null clears it. */
  'POST /api/pin':     (c) => {
    const ok = db.setPin(c.body.storyId, c.body.chapterId, c.body.entryId, c.body.mode ?? null);
    return { ...viewOf(c.body.storyId), ...(ok ? {} : { error: 'that chapter or entry is not in this story' }) };
  },
  'DELETE /api/state': (c) => { db.delState(c.body.storyId, c.body.id); return viewOf(c.body.storyId); },

  // ---- engine ----
  'POST /api/manifest': async (c) => {
    const v = viewOf(c.body.storyId, c.body.chapterId);
    const upTo = c.body.regenerateOf
      ? v.passages.find((p) => p.id === c.body.regenerateOf)?.ordinal : undefined;
    const { manifest, prompt } = assemble(v, c.slot, c.body.mode ?? 'direct', c.body.directive, upTo, Number(c.gen.max_tokens) || 900);
    let exact: number | null = null;
    try { exact = await count(prompt); } catch { /* model asleep */ }
    return { manifest, prompt, exact };
  },
  'POST /api/generate': (c) => generate(c, c.body.mode ?? 'direct', c.body.directive),

  'POST /api/summarize': async (c) => {
    const r = await summarise(c, c.body.storyId, c.body.chapterId);
    return r.error ? r : { ...r, ...viewOf(c.body.storyId) };
  },

  /** Export. The only claim in SPEC §12 that had no mechanism; Lens 3 costed it at four
   *  hours and called it the highest value-per-hour item in the plan. */
  'GET /api/export': (c) => {
    const v = need(view(c.query.get('story')!), 'no such story');
    const fmt = c.query.get('format') ?? 'md';
    const safe = v.story.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'story';
    if (fmt === 'json') return { __raw: { type: 'application/json',
      filename: `${safe}.json`, body: JSON.stringify({ ...v, exportedAt: new Date().toISOString() }, null, 2) } };
    const byCh = new Map(v.chapters.map((c2) => [c2.id, [] as any[]]));
    for (const p of v.passages) byCh.get(p.chapterId)?.push(p);
    const md = [`# ${v.story.title}`, '',
      v.story.genre ? `*${v.story.genre}*` : '', v.story.premise, '',
      ...v.chapters.flatMap((ch) => [`## ${ch.title}`, '',
        ...(byCh.get(ch.id) ?? []).map((p: any) =>
          p.isBreak ? (p.body ? `*${p.body}*\n\n---` : '---')
          : p.speaker ? `**${p.speaker}:** ${p.body}` : p.body),
        '']),
    ].filter((x) => x !== null).join('\n\n');
    return { __raw: { type: 'text/markdown', filename: `${safe}.md`, body: md } };
  },

  /** Read a chapter and propose ledger entries. Nothing written here is canon: every
   *  proposal is held until accepted (design screen 28). Re-running is safe — the unique
   *  index on content hash means the same fact is not proposed twice. */
  'POST /api/extract': async (c) => {
    const v = viewOf(c.body.storyId);
    const ch = v.chapters.find((x) => x.id === c.body.chapterId) ?? v.currentChapter;
    const ps = db.passagesOfChapter(ch.id).filter((p: any) => !p.is_break && p.body.trim());
    if (!ps.length) return { error: 'nothing to read in this chapter' };
    const existing = db.entriesOf(v.id);
    const r = await structuredRetry(EXTRACT, ps.map((p: any) => p.body).join('\n\n'), EXTRACT_SCHEMA);
    if (!r.data?.entries) return { error: r.error ?? 'extraction returned nothing usable' };
    let added = 0;
    for (const e of r.data.entries) {
      if (!e?.title?.trim() || !e?.body?.trim()) continue;
      const cls = classify(existing, e);
      if (!cls) continue;
      if (db.addProposal(v.id, { ...cls, chapterId: ch.id, title: e.title.trim(),
        body: e.body.trim(), entryType: e.type, keys: e.keys ?? [] })) added++;
    }
    return { added, chapter: ch.index, proposals: db.proposalsOf(v.id) };
  },
  'POST /api/proposal': (c) => {
    const ids: string[] = c.body.ids ?? [c.body.id];
    for (const id of ids) {
      const p = db.proposal(c.body.storyId, id);
      if (!p) continue;
      if (c.body.accept) {
        // Accepting makes it yours, so last_editor is human and the entry is pinned from here.
        db.upsertEntry(p.story_id, c.owner, { id: p.entry_id || undefined, title: p.title,
          body: c.body.body ?? p.body, entryType: p.entry_type,
          activation: p.entry_type === 'character' ? 'always_on' : 'triggered',
          keys: JSON.parse(p.keys || '[]'), lastEditor: 'human' });
      }
      db.setProposalStatus(c.body.storyId, id, c.body.accept ? 'accepted' : 'rejected');
    }
    return viewOf(c.body.storyId);
  },

  /** Collapse a run of chapters into one act-level summary. The chapters it covers stop
   *  being sent individually, which is what stops EARLIER growing with the book. */
  'POST /api/rollup': async (c) => {
    const v = viewOf(c.body.storyId);
    const from = Number(c.body.from), to = Number(c.body.to);
    const run = v.chapters.filter((ch) => ch.index >= from && ch.index <= to && ch.summary
      && !ch.summaryStale);
    if (run.length < 2) return { error: 'need at least two summarised chapters to roll up' };
    const already = (v.arcs ?? []).some((a: any) => a.fromChapter <= to && a.toChapter >= from);
    if (already) return { error: 'those chapters are already inside an arc' };
    const text = run.map((ch) => `Chapter ${ch.index} — ${ch.title}: ${ch.summary}`).join('\n\n');
    const r = await chat(ARC(from, to, 220), text,
      { temperature: 0.2, max_tokens: 500, chat_template_kwargs: { enable_thinking: false } });
    const summary = clean(r.prose, v.story.stripPatterns);
    if (!summary) return { error: 'the roll-up returned nothing usable' };
    db.addArc(v.id, { branchId: v.branchId, fromChapter: from, toChapter: to,
      title: `${run[0].title} to ${run.at(-1)!.title}`, summary });
    return { summary, ...viewOf(v.id) };
  },
  'DELETE /api/arc': (c) => { db.delArc(c.body.storyId, c.body.id); return viewOf(c.body.storyId); },

  // ---- misc ----
  /** The evidence behind PLAN-02 §7.2's trigger: when prefill gets slow, or the prefix keeps
   *  moving, the budget engine has earned its place. Until then this is how you know it has not. */
  'GET /api/activity': (c) => {
    const rows = db.recentGenerations(c.query.get('story')!);
    const t = (r: any) => { try { return JSON.parse(r.timings || '{}'); } catch { return {}; } };
    const prefills = rows.map(t).map((x) => x.prompt_ms).filter((x) => x > 0);
    return {
      runs: rows.map((r) => ({
        id: r.id, role: r.role, at: r.created_at, error: r.error,
        promptTokens: r.prompt_tokens, completionTokens: r.completion_tokens,
        seconds: r.latency_ms == null ? null : +(r.latency_ms / 1000).toFixed(1),
        prefillSeconds: t(r).prompt_ms ? +(t(r).prompt_ms / 1000).toFixed(2) : null,
        prefillRate: t(r).prompt_per_second ? Math.round(t(r).prompt_per_second) : null,
      })),
      worstPrefillSeconds: prefills.length ? +(Math.max(...prefills) / 1000).toFixed(2) : null,
      failures: rows.filter((r) => r.error).length,
    };
  },

  // Mapped to the shape the client renders, so `storyId` and the story's title cannot be
  // mistaken for each other again.
  'GET /api/search':    (c) => ({ results: db.search(c.owner, c.query.get('q') ?? '').map((x: any) => ({
    kind: x.kind, id: x.id, storyId: x.story_id, story: x.story_title,
    where: `${x.story_title} · ${x.loc}`, body: x.body,
  })) }),
  // Gated deliberately. `gen` is one process-wide object, so an open route means one writer's
  // sampler lands on another's next generation — including `thinking: true`, which measured
  // as returning no prose at all (F5). Naming a story at least proves you are a tenant.
  'POST /api/settings': (c) => {
    // Whitelisted. This body was spread straight into the chat payload, so `messages`,
    // `model` or `response_format` from a client would have replaced the prompt itself.
    const allowed = ['temperature', 'top_p', 'min_p', 'dry_multiplier', 'xtc_probability',
      'max_tokens', 'thinking'] as const;
    const clean: Record<string, any> = {};
    for (const k of allowed) {
      if (!(k in c.body)) continue;
      const v = c.body[k];
      if (k === 'thinking') { clean[k] = !!v; continue; }
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      // max_tokens has to leave room for itself: the budget reserves 600 and the guard only
      // counts the prompt, so an unbounded reply length ran the whole call past the slot.
      clean[k] = k === 'max_tokens' ? Math.min(Math.max(64, Math.round(n)), 2000)
        : Math.min(Math.max(0, n), 4);
    }
    c.setGen(clean);
    return { gen: c.gen };
  },
};
