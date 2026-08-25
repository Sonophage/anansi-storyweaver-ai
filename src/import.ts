// Bringing work in from elsewhere. Three sources, one shape, one inserter.
//
// Everything here parses UNTRUSTED input — a file someone else made. Two rules follow from
// that and are enforced below rather than trusted:
//
//   1. A card's instruction fields (system_prompt, post_history_instructions, jailbreak) are
//      NOT canon and are never placed where they reach the model. They are directives written
//      by a stranger; concatenating them into our prompt is prompt injection with extra steps.
//      They are kept as notes, visible to the writer, inert to the engine.
//   2. Everything is bounded. A card with a 4MB description would otherwise become a story
//      that can never be generated from, and the failure would surface as a budget error
//      three screens away from the import that caused it.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join, dirname, basename, sep } from 'node:path';
import * as db from './db.ts';
import { view } from './story.ts';

/** Imports are read from one folder and nowhere else. The filename is reduced to its basename
 *  first, so `../../etc/passwd` becomes `passwd` and lands inside the folder rather than
 *  escaping it. Two tenants share this process; one must not be able to name the other's files. */
export const IMPORTS_DIR = join(dirname(db.FILE), 'imports');
export function safePath(name: string): string {
  const clean = basename(String(name ?? '')).replace(/^\.+/, '');
  if (!clean) throw new Error('name that file');
  mkdirSync(IMPORTS_DIR, { recursive: true });
  return join(IMPORTS_DIR, clean);
}

const MAX_FIELD = 8_000;      // one entry body; the budget engine works in thousands of tokens
const MAX_ENTRIES = 200;
const MAX_PASSAGES = 2_000;
const clip = (s: unknown, n = MAX_FIELD) =>
  typeof s === 'string' ? s.replace(/\r\n/g, '\n').trim().slice(0, n) : '';

export interface Incoming {
  source: string;
  story: Record<string, any>;
  entries: Record<string, any>[];
  passages: { body: string; author?: string }[];
  notes: string[];            // things deliberately not imported, shown to the writer
}

/** Split a keys field. AI Dungeon writes "a, b, c"; cards write ["a","b"]. */
const keysOf = (k: unknown): string[] =>
  (Array.isArray(k) ? k : String(k ?? '').split(','))
    .map((s) => String(s).trim()).filter(Boolean).slice(0, 8);

// ---- 1. our own export, round-tripped ----

export function fromExport(file: string): Incoming {
  const src = new DatabaseSync(file, { readOnly: true });
  try {
    const story = src.prepare('SELECT * FROM stories LIMIT 1').get() as any;
    if (!story) throw new Error('that file holds no story');
    const branch = src.prepare('SELECT id FROM branches WHERE story_id = ? AND is_primary = 1').get(story.id) as any;
    const entries = src.prepare('SELECT * FROM entries WHERE story_id = ?').all(story.id) as any[];
    // Outfits travel with the character. `exportStory` carries them already — it deletes other
    // stories and lets the cascade do the rest — but reading them back was missed when the table
    // landed, so a round trip quietly returned everyone naked.
    const outfits = src.prepare('SELECT * FROM outfits WHERE story_id = ?').all(story.id) as any[];
    const passages = src.prepare(
      'SELECT body, author FROM passages WHERE story_id = ? AND branch_id = ? AND selected = 1 ORDER BY ordinal')
      .all(story.id, branch?.id) as any[];
    return {
      source: 'anansi export',
      story: { title: story.title, genre: story.genre, premise: story.premise, setting: story.setting,
        pov: story.pov, persona: story.persona, writingStyle: story.writing_style,
        direction: story.direction, spice: story.spice,
        // Whitelisted by hand, so anything not named here is lost silently on a round trip.
        // ponytail: spice_note, max_context and model are still missing from this list — a custom
        // register does not survive an export and re-import. Fix with the columns, not one at a time.
        lockedCharacter: story.locked_character },
      entries: entries.slice(0, MAX_ENTRIES).map((e) => ({ title: e.title, body: clip(e.body),
        notes: clip(e.notes, 2000), entryType: e.entry_type, activation: e.activation,
        keys: keysOf(e.keys && JSON.parse(e.keys)),
        outfits: outfits.filter((o) => o.entry_id === e.id).slice(0, 20)
          .map((o) => ({ name: clip(o.name, 80), body: clip(o.body, 1000), active: !!o.active })) })),
      passages: passages.slice(0, MAX_PASSAGES).map((p) => ({ body: clip(p.body, 20_000), author: p.author })),
      notes: ['Branches, revision history and generation logs are not carried across — the ' +
              'import is a new story, not the same one.'],
    };
  } finally { src.close(); }
}

// ---- 2. AI Dungeon ----

/** Scenario and adventure exports, across several years of format churn. Field names are
 *  tried in the order AI Dungeon has used them; nothing here assumes one shape. */
export function fromAiDungeon(j: any): Incoming {
  const notes: string[] = [];
  const wi = j.worldInfo ?? j.worldInfoList ?? j.worldInfos ?? [];
  const entries = (Array.isArray(wi) ? wi : []).slice(0, MAX_ENTRIES).map((w: any) => ({
    title: clip(w.name ?? w.keys ?? w.key ?? 'Untitled', 120) || 'Untitled',
    body: clip(w.entry ?? w.value ?? w.description ?? w.content),
    entryType: 'lore',
    // AI Dungeon world info is keyword-triggered, which is our `triggered`. An entry with no
    // keys can never fire, so it becomes always_on rather than silently dead weight.
    activation: keysOf(w.keys ?? w.key).length ? 'triggered' : 'always_on',
    keys: keysOf(w.keys ?? w.key),
  })).filter((e: any) => e.body);

  // Memory is AI Dungeon's always-in-context block. That is exactly our always_on canon.
  if (clip(j.memory)) entries.unshift({ title: 'Memory', body: clip(j.memory),
    entryType: 'lore', activation: 'always_on', keys: [] });

  const acts = j.actions ?? j.historyList ?? j.history ?? [];
  const text = (Array.isArray(acts) ? acts : [])
    .map((a: any) => typeof a === 'string' ? a : clip(a.text ?? a.content, 20_000))
    .filter(Boolean);
  const opening = clip(j.prompt ?? j.promptText ?? j.description, 20_000);
  const passages = (opening ? [{ body: opening, author: 'human' }] : [])
    .concat(text.slice(0, MAX_PASSAGES).map((t: string) => ({ body: t, author: 'model' })));

  if (clip(j.authorsNote)) notes.push(`Author's note carried onto chapter one: ${clip(j.authorsNote, 500)}`);
  return {
    source: 'AI Dungeon',
    story: {
      title: clip(j.title ?? j.name, 200) || 'Imported adventure',
      genre: (Array.isArray(j.tags) ? j.tags : []).map((t: any) => clip(t, 30)).filter(Boolean).slice(0, 4).join(', '),
      premise: clip(j.description ?? j.prompt, 2000),
      pov: 'second person, present tense',   // AI Dungeon's house style; the writer can change it
      chapterAuthorsNote: clip(j.authorsNote, 500),
      spice: spiceFromTags(j.tags),
    },
    entries, passages, notes,
  };
}

/** AI Dungeon's *current* export is two files, not one. The "story cards" button writes a bare
 *  JSON array — one object per card, no adventure around it — and the adventure text comes out
 *  separately as markdown. Neither is the whole-adventure JSON above, which is why a real export
 *  used to be rejected as unrecognised. Both are handled; importing both into one story is what
 *  `merge` is for. */
export function fromAiDungeonCards(arr: any[]): Incoming {
  // AI Dungeon's own vocabulary, and it writes the same type in mixed case ("Item", "character").
  // Anything it invents that we have no shelf for is lore, which is the shelf that means "canon".
  const AS: Record<string, string> = { character: 'character', race: 'character', class: 'character',
    item: 'item', faction: 'lore', location: 'lore', place: 'lore' };
  let spoilers = 0;
  const entries = arr.slice(0, MAX_ENTRIES).map((c: any) => {
    const body = clip(c.value ?? c.entry);
    // `description` is AI Dungeon's edit log for the card — dated revisions of the same text.
    // Worth reading, noise in a prompt, so it goes to notes. Unless there is nothing else.
    const desc = clip(c.description, 2000);
    if (c.isSpoiler) spoilers++;
    return {
      title: clip(c.title ?? keysOf(c.keys)[0] ?? 'Untitled', 120) || 'Untitled',
      body: body || desc,
      notes: body ? desc : '',
      entryType: AS[String(c.type ?? '').trim().toLowerCase()] ?? 'lore',
      activation: keysOf(c.keys).length ? 'triggered' : 'always_on',
      keys: keysOf(c.keys),
    };
  }).filter((e) => e.body);

  const notes = ['Story cards carry no prose. Export the adventure text too and import it into ' +
                 'this story to bring the writing across.'];
  if (spoilers) notes.push(`${spoilers} card${spoilers > 1 ? 's were' : ' was'} marked a spoiler in ` +
    'AI Dungeon. That flag has no equivalent here, so they came in as ordinary canon — put them ' +
    'behind a progression if they should stay hidden until a later chapter.');
  return {
    source: 'AI Dungeon story cards',
    story: { title: 'Imported story cards', pov: 'second person, present tense' },
    entries, passages: [], notes,
  };
}

/** An adventure exported as markdown: one `# Title`, then the story in blank-line-separated
 *  blocks. Lines beginning `>` are the player's own turns — measured against a real 107KB
 *  export: 40 of 358 blocks, every one of them standalone — so authorship survives the trip
 *  instead of the whole adventure arriving as if the model wrote it. */
export function fromAiDungeonMarkdown(text: string): Incoming {
  const src = String(text ?? '').replace(/\r\n/g, '\n');
  const h = src.match(/^#[ \t]+(.+)$/m);
  const rest = h ? src.slice(src.indexOf(h[0]) + h[0].length) : src;
  const passages = rest.split(/\n[ \t]*\n/).map((b) => b.trim()).filter(Boolean)
    .slice(0, MAX_PASSAGES)
    .map((b) => b.startsWith('>')
      ? { body: clip(b.replace(/^>[ \t]?/gm, '').trim(), 20_000), author: 'human' }
      : { body: clip(b, 20_000), author: 'model' })
    .filter((p) => p.body);
  const mine = passages.filter((p) => p.author === 'human').length;
  return {
    source: 'AI Dungeon adventure',
    story: { title: clip(h?.[1], 200) || 'Imported adventure', pov: 'second person, present tense' },
    entries: [],
    passages,
    notes: [`${passages.length} passages, ${mine} of them yours — the lines the export marks with ` +
            '">". Everything else is attributed to the model.',
            'Chapters are not in the export, so all of it lands in chapter one. Split it where you want.'],
  };
}

// ---- 3. character cards (SillyTavern / Tavo, V1 V2 V3) ----

/** tEXt chunks out of a PNG, without a dependency. Cards hide their JSON in one keyed
 *  `chara` (V2) or `ccv3` (V3), base64 encoded. */
export function pngText(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return out;
  let p = 8;
  while (p + 12 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    if (len > buf.length - p - 12) break;              // a truncated or lying chunk header
    if (type === 'tEXt') {
      const d = buf.subarray(p + 8, p + 8 + len);
      const z = d.indexOf(0);
      if (z > 0) out[d.toString('latin1', 0, z)] = d.toString('latin1', z + 1);
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return out;
}

export function cardFromPng(buf: Buffer): any {
  const t = pngText(buf);
  const raw = t.ccv3 ?? t.chara;
  if (!raw) throw new Error('that PNG carries no character card');
  return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
}

const spiceFromTags = (tags: unknown): number | undefined => {
  const t = (Array.isArray(tags) ? tags : []).map((x) => String(x).toLowerCase());
  if (t.some((x) => /nsfw|explicit|smut|lewd|erotic/.test(x))) return 5;
  if (t.some((x) => /suggestive|romance/.test(x))) return 3;
  return undefined;
};

export function fromCard(j: any): Incoming {
  const d = j?.data ?? j;                         // V2/V3 nest under data; V1 is flat
  const name = clip(d.name ?? d.char_name, 120) || 'Unnamed';
  const notes: string[] = [];
  const entries: Record<string, any>[] = [];

  // The character itself: description and personality are FACTS about who this is, which is
  // what canon holds. always_on, because a story about someone should always know them.
  const persona = [clip(d.description ?? d.char_persona), clip(d.personality)]
    .filter(Boolean).join('\n');
  if (persona) entries.push({ title: name, body: persona, entryType: 'character', activation: 'always_on', keys: [] });

  // A card's lorebook is keyword-triggered canon, the same idea under a different name.
  const book = d.character_book ?? d.characterBook ?? j.character_book;
  for (const e of (book?.entries ?? []).slice(0, MAX_ENTRIES)) {
    const body = clip(e.content ?? e.entry ?? e.value);
    if (!body || e.enabled === false) continue;
    entries.push({ title: clip(e.name ?? e.comment ?? keysOf(e.keys)[0] ?? 'Lore', 120) || 'Lore',
      body, entryType: 'lore',
      activation: e.constant ? 'always_on' : 'triggered', keys: keysOf(e.keys ?? e.key) });
  }

  // Instruction fields. Kept, shown, never fed to the model — see the header.
  for (const [k, label] of [['system_prompt', 'System prompt'], ['jailbreak', 'Jailbreak'],
                            ['post_history_instructions', 'Post-history instructions']] as const) {
    const v = clip((d as any)[k], 2000);
    if (v) notes.push(`${label} from the card was NOT imported into the prompt — it is a ` +
      `directive written by whoever made the card. Kept for you to read: ${v.slice(0, 300)}` +
      (v.length > 300 ? '…' : ''));
  }
  if (clip(d.mes_example)) notes.push('Example dialogue was not imported: it is few-shot ' +
    'scaffolding for a chat app, and this engine writes prose.');

  const first = clip(d.first_mes ?? d.char_greeting, 20_000);
  return {
    source: `character card${j?.spec ? ` (${clip(j.spec, 40)})` : ''}`,
    story: {
      title: name, genre: (Array.isArray(d.tags) ? d.tags : []).map((t: any) => clip(t, 30)).filter(Boolean).slice(0, 4).join(', '),
      premise: clip(d.scenario, 2000) || persona.slice(0, 300),
      setting: clip(d.scenario, 500), persona: name, spice: spiceFromTags(d.tags),
    },
    entries: entries.slice(0, MAX_ENTRIES),
    passages: first ? [{ body: first, author: 'model' }] : [],
    notes,
  };
}

// ---- sniffing and insertion ----

export function parse(name: string, buf: Buffer): Incoming {
  if (/\.db$/i.test(name)) throw new Error('a .db import must go through fromExport with a path');
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return fromCard(cardFromPng(buf));
  const text = buf.toString('utf8');
  let j: any;
  try { j = JSON.parse(text); }
  catch {
    // Not JSON. An adventure exported as markdown is the other half of an AI Dungeon export,
    // so a text file is read as prose. The EXTENSION decides, not the content: a .json that
    // fails to parse is a broken export and saying so is more use than silently importing the
    // error message as chapter one.
    if (!/\.(md|markdown|txt|text)$/i.test(name))
      throw new Error('that file is not JSON, a PNG card, or an Anansi export');
    if (text.includes('\u0000')) throw new Error('that file is not text — it has NUL bytes in it');
    const inc = fromAiDungeonMarkdown(text);
    if (!inc.passages.length) throw new Error('that file has no prose in it');
    return inc;
  }
  // A bare array is the story-cards export. Cards are objects with a body under `value`.
  if (Array.isArray(j)) {
    if (!j.length) throw new Error('that export is an empty list');
    if (j.some((c) => c && typeof c === 'object' && ('value' in c || 'keys' in c || 'title' in c)))
      return fromAiDungeonCards(j);
    throw new Error('that file is a list, but not of story cards');
  }
  if (j?.spec === 'chara_card_v2' || j?.spec === 'chara_card_v3' || j?.data?.name || j?.char_name || j?.first_mes)
    return fromCard(j);
  if (j?.worldInfo || j?.worldInfoList || j?.actions || j?.historyList || j?.memory !== undefined)
    return fromAiDungeon(j);
  if (j?.storyCards) return fromAiDungeonCards(j.storyCards);   // the same list, wrapped
  if (j?.name || j?.description) return fromCard(j);            // a bare V1 card
  throw new Error('unrecognised file: no character card fields and no AI Dungeon fields');
}

/** Recreate a character's wardrobe, and put back on whatever they were wearing. Ids are fresh
 *  like everything else an import writes, so the same file can be imported twice. */
function plant(storyId: string, entryId: string | null, outfits?: any[]) {
  if (!entryId || !Array.isArray(outfits)) return;
  // By NAME, the way entries dedupe by title. Without this, re-importing an edited card planted
  // the whole wardrobe again — three imports gave six outfits — on exactly the workflow `merge`
  // exists for. Only the newest was worn, so the prompt stayed right and the panel filled with
  // dead duplicates, which is the kind of wrong that is easy not to notice.
  const have = new Map(db.outfitsOf(storyId)
    .filter((o: any) => o.entry_id === entryId)
    .map((o: any) => [String(o.name).toLowerCase(), o.id]));
  let worn: string | null = null;
  for (const o of outfits.slice(0, 20)) {
    const name = clip(o?.name, 80), body = clip(o?.body, 1000);
    if (!name || !body) continue;
    const id = db.upsertOutfit(storyId, entryId,
      { id: have.get(name.toLowerCase()) ?? '', name, body });
    if (o.active && id) worn = id;
  }
  if (worn) db.wearOutfit(storyId, entryId, worn);
}

/** Insert an Incoming as a NEW story owned by `owner`. Ids are always fresh, so importing
 *  the same file twice gives two stories rather than a primary-key collision — an import
 *  that can fail on its second run is an import people stop trusting. */
export function absorb(owner: string, inc: Incoming) {
  const story = db.createStory(owner, inc.story);
  let entries = 0, passages = 0;
  for (const e of inc.entries.slice(0, MAX_ENTRIES)) {
    if (!clip(e.body)) continue;
    const id = db.upsertEntry(story.id, owner, { ...e, body: clip(e.body), lastEditor: 'human' });
    plant(story.id, id, e.outfits);
    entries++;
  }
  for (const p of inc.passages.slice(0, MAX_PASSAGES)) {
    if (!clip(p.body, 20_000)) continue;
    db.addPassage({ ...story, storyId: story.id, body: clip(p.body, 20_000), author: p.author ?? 'model' });
    passages++;
  }
  // updateChapter overwrites the title too, so the default has to be restated here rather
  // than passed as undefined — binding undefined would blank the chapter's name.
  if (inc.story.chapterAuthorsNote)
    db.updateChapter(story.id, story.chapterId,
      { title: 'Chapter One', authorsNote: clip(inc.story.chapterAuthorsNote, 500) });
  return { storyId: story.id, source: inc.source, entries, passages, notes: inc.notes };
}

/** Add an Incoming to a story that already exists. AI Dungeon exports one adventure as two
 *  files — cards and prose — and neither is worth a story of its own, so the second one merges
 *  rather than founding a second library entry. Entries go in by title: re-importing a card
 *  after editing it updates that card instead of leaving two of it. Prose only ever appends. */
export function merge(owner: string, storyId: string, inc: Incoming) {
  // Import is on the OPEN list because it usually names no story — so the request gate never
  // runs, and this is the only ownership check there is. Without it, `into` would be a way to
  // write prose into another writer's story through the one route that skips the gate.
  if (!db.ownsStory(storyId, owner)) throw Object.assign(new Error('no such story'), { code: 404 });
  const v = view(storyId);
  if (!v) throw Object.assign(new Error('no such story'), { code: 404 });
  const byTitle = new Map(v.entries.map((e: any) => [String(e.title).toLowerCase(), e.id]));
  let entries = 0, updated = 0, passages = 0;
  for (const e of inc.entries.slice(0, MAX_ENTRIES)) {
    if (!clip(e.body)) continue;
    const hit = byTitle.get(String(e.title ?? '').toLowerCase());
    const id = db.upsertEntry(storyId, owner, { ...e, id: hit ?? '', body: clip(e.body), lastEditor: 'human' });
    plant(storyId, id, e.outfits);
    if (hit) updated++; else entries++;
  }
  for (const p of inc.passages.slice(0, MAX_PASSAGES)) {
    if (!clip(p.body, 20_000)) continue;
    db.addPassage({ storyId, branchId: v.branchId!, chapterId: v.currentChapter.id,
      body: clip(p.body, 20_000), author: p.author ?? 'model' });
    passages++;
  }
  return { storyId, source: inc.source, entries, updated, passages, notes: inc.notes };
}
