// #143 · WHAT THE HEM WROTE, AND WHAT WAS WRONG WITH IT. Every hemmed scene's proposals, read against
// the failures found in the library on 2026-11-05: the inner life of a character the hem must keep
// outside (the one the writer plays, and the Hands off one while the switch is on), template text
// such as "<a man>" in a card, a card about one thread that names another in its wake words, an
// outfit with no clothes in it, and the passes that failed or overflowed.
//
//   node --experimental-strip-types bench/hem-audit.ts check   # the detectors, planted cases, no db
//   node --experimental-strip-types bench/hem-audit.ts         # the audit, read-only, the live library
//   ANANSI_DB=/path/to.db node --experimental-strip-types bench/hem-audit.ts   # another library
//
// READ-ONLY, AND NOT THROUGH src/db.ts. Importing db.ts opens the library read-write and migrates it,
// so this opens the file itself with `readOnly`. The detectors come from src/outside.ts, the module the
// hem's own floor uses, so the audit and the fix cannot disagree about what a failure is.
//
// What it cannot see: a hem run again replaces its `hems` row, so a pass that failed and was retried
// leaves no mark there. The generations log keeps each call's error; that is what is counted.
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { innerCut, placeholders } from '../src/outside.ts';

const mode = process.argv[2] ?? 'run';

// ---------------------------------------------------------------------------------------------------
// THE DETECTORS, ON PLANTED CASES IN BOTH DIRECTIONS. The "inner" lines are the hem's own words from
// ENCORE (Seth played), the home fixture. The rest are from other tales and other kinds of line, which
// the rule was not written for: a thread's outward facts, an outfit, another person's feelings named
// by name, and dialogue, which may say anything.
if (mode === 'check') {
  let n = 0;
  const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };
  const cuts = (text: string, name: string) => innerCut(text, name).cut.length;

  // Cut: the narrator stating the character's inside, present tense (the hem's tense) and past.
  const INNER = [
    'He feels a quiet resolve settle over him, matching the unspoken promise hanging between him and Halsey.',
    'He wants to reassure her that this isn\'t the end, that there\'s more to come, but the words fail him.',
    'Seth knows he should insist on paying for the diner, should offer to split the bill, but something holds him back.',
    'He feels a mix of nervous anticipation and dawning certainty about his feelings for her, though he keeps them guarded.',
    'Seth\'s voice is measured and controlled, his words carrying a weight of anticipation and nervousness.',
    'He feels the weight of being seen without costume, his composure thinning as he offers her the only honest room he has.',
    'Seth wanted her to stay.',
    'He was afraid of what she would say.',
    'navigating the unfamiliar ease of Halsey\'s world, feeling the suffocating tension of their friendship performance',
    'He has handed her control, and now waits for her response like she holds the power to leave, hoping she will not.',
  ];
  for (const s of INNER) assert.strictEqual(cuts(s, 'Seth'), 1, `INNER-CUT: cut "${s.slice(0, 60)}"`);
  ok(`the narrator stating the played character's inside is cut, ${INNER.length} of ${INNER.length}`);

  // Kept: what is outside. Facts, clothes, where he is, what he does, what others feel by name.
  const OUTSIDE = [
    'Seth sits in the driver\'s seat of his car, his eyes fixed on the road ahead.',
    'bookshop owner; 30s; dark eyes; wears a leather jacket',
    'same dark jeans, button-down now straightened where Halsey fixed it, leather jacket from before',
    'Seth stands in the wings of Halsey\'s concert, watching her perform.',
    'He pulls out his phone and reads her message twice.',
    'Halsey feels the crowd turn toward her, and Seth does not look away.',
    'He speaks in short, clipped sentences, his tone soft.',
    'Write him short of breath and short of words.',
    'He knows the back roads of the city better than anyone.',   // knowledge, not feeling: kept
  ];
  for (const s of OUTSIDE) assert.strictEqual(cuts(s, 'Seth'), 0, `INNER-KEEP: kept "${s.slice(0, 60)}"`);
  ok(`what is outside is kept, ${OUTSIDE.length} of ${OUTSIDE.length}`);

  // Dialogue may say anything: a line he speaks is the scene, not the narrator telling.
  assert.strictEqual(cuts('"I want you to stay," Seth says, and opens the door.', 'Seth'), 0, 'INNER-DIALOGUE: a spoken want is kept');
  // And a quoted line that WOULD be cut as narration: only the quote-stripping keeps it.
  assert.strictEqual(cuts('“He wants you gone,” Halsey tells the crowd, and Seth laughs.', 'Seth'), 0, 'INNER-DIALOGUE-QUOTED: a feeling inside quotes is never the narrator');
  ok('a feeling said aloud is kept');

  // Only the named character: the same sentence about someone else, by name, is not his to lose.
  assert.strictEqual(cuts('Ilse feels the cold in her hands and wants to go home.', 'Seth'), 0, 'INNER-OTHER: another person\'s feeling, named, is kept');
  ok('another character\'s feeling, by name, is kept');

  // A whole stands, sentence by sentence: the outside stays in order, the inside goes.
  const stands = 'Seth sits in his car, his phone buzzing with a new message from Halsey. He feels a mix of anticipation and nervousness. He starts the engine.';
  const r = innerCut(stands, 'Seth');
  assert.strictEqual(r.kept, 'Seth sits in his car, his phone buzzing with a new message from Halsey. He starts the engine.', `INNER-KEPT-ORDER: the rest kept in order (${r.kept})`);
  assert.deepStrictEqual(r.cut, ['He feels a mix of anticipation and nervousness.'], '  and the cut sentence named');
  ok('a stands keeps its outside sentences, in order, and names what was cut');

  // A CARD JOINS CLAUSES WITH SEMICOLONS (Talia's relationships, The Lands Between): only the inner
  // clause goes, not the outward ones it is joined to.
  const joined = innerCut('Claims Morgott as hers; she feels a profound sense of trust in his shadow; walks beside him now.', 'Talia');
  assert.strictEqual(joined.kept, 'Claims Morgott as hers; walks beside him now.', `INNER-CLAUSE: the outward clauses stay (${joined.kept})`);
  ok('in a card of clauses joined by semicolons, only the inner clause goes');

  // Template text: the schema's own shape copied into a card.
  assert.deepStrictEqual(placeholders('<a man>; <middle-aged>; <a scar above his eyebrow>'), ['<a man>', '<middle-aged>', '<a scar above his eyebrow>'], 'PLACEHOLDER: found');
  assert.deepStrictEqual(placeholders('a man; middle-aged; a scar above his eyebrow; 5 < 6 and 7 > 2'), [], 'PLACEHOLDER-NONE: plain text and a bare angle bracket are not');
  ok('template text in angle brackets is found, and plain text is not');

  console.log(`\n${n} checks passed`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------
// THE AUDIT. Each hemmed scene's proposals (by the scene they were chalked for), then the hem calls
// that failed, then what overflowed. A failure's status says whether it reached the tale: accepted
// means the writer sewed it in, and it is in the tale now unless they took it out by hand.
const file = process.env.ANANSI_DB ?? new URL('../anansi.db', import.meta.url).pathname;
const d = new DatabaseSync(file, { readOnly: true });
const all = <T = any>(sql: string, ...a: any[]) => d.prepare(sql).all(...a) as T[];
const lower = (s: unknown) => String(s ?? '').trim().toLowerCase();
const textOf = (p: any) => [p.body, ...Object.values((() => { try { return JSON.parse(p.rooms || '{}'); } catch { return {}; } })())
  .map((r: any) => r?.body ?? r)].map((x) => String(x ?? '')).join(' ');

type Hit = { tale: string; scene: number; what: string; who: string; status: string; room: string; text: string };
const hits: Hit[] = [];
let seen = 0, outsideSeen = 0;
const tales = all(`SELECT DISTINCT s.id, s.title, s.persona, s.locked_character, s.lockout_on FROM hems h JOIN stories s ON s.id = h.story_id ORDER BY s.title`);
for (const s of tales) {
  const outside = [s.persona, s.lockout_on ? s.locked_character : null].map(lower).filter(Boolean);
  const people = all(`SELECT id, title FROM entries WHERE story_id = ? AND entry_type = 'character'`, s.id);
  const titleOf = new Map(people.map((e: any) => [e.id, e.title]));
  const props = all(`SELECT p.*, c.idx FROM proposals p JOIN hems h ON h.chapter_id = p.chapter_id JOIN chapters c ON c.id = p.chapter_id
    WHERE p.story_id = ? ORDER BY c.idx, p.created_at`, s.id);
  for (const p of props) {
    seen++;
    const who = String(titleOf.get(p.entry_id) ?? p.title ?? '');
    const hit = (what: string, text: string) => hits.push({ tale: s.title, scene: p.idx, what, who, status: p.status,
      room: p.field ?? (p.kind === 'memory' ? 'where it stands' : p.kind), text: text.replace(/\s+/g, ' ').slice(0, 140) });
    const text = textOf(p);
    if (outside.includes(lower(who))) { outsideSeen++; for (const c of innerCut(text, who).cut) hit('INNER', c); }
    const ph = placeholders(text);
    if (ph.length) hit('PLACEHOLDER', ph.join(' '));
    // A CARD ABOUT ONE PERSON WHOSE WAKE WORDS NAME ANOTHER: "Seth" carrying "Mr. Blackwood".
    const keys = (() => { try { return JSON.parse(p.keys || '[]'); } catch { return []; } })().map(lower);
    const other = people.filter((e: any) => lower(e.title) !== lower(who) && keys.includes(lower(e.title))).map((e: any) => e.title);
    if (other.length && p.entry_id) hit('OTHER-PERSON', `keys name ${other.join(', ')}: ${p.body ?? ''}`);
    // WHO THEY ARE, REWRITTEN: the new-threads pass proposing a fresh identity for a thread that has one.
    if (p.kind === 'conflict' && (p.field == null || p.field === 'facts')) hit('IDENTITY-REWRITE', String(p.body ?? ''));
  }
}

console.log(`\nHEM AUDIT · ${file}`);
console.log(`${tales.length} tale(s) hemmed · ${all('SELECT COUNT(*) n FROM hems')[0].n} hemmed scene(s) · ${seen} proposal(s) chalked for them · ${outsideSeen} on a character the hem must keep outside\n`);
const kinds = [...new Set(hits.map((h) => h.what))];
for (const k of kinds) {
  const of = hits.filter((h) => h.what === k);
  const by = (st: string) => of.filter((h) => h.status === st).length;
  console.log(`== ${k}: ${of.length} (accepted ${by('accepted')}, rejected ${by('rejected')}, open ${by('open')})`);
  for (const h of of) console.log(`   ${h.tale.slice(0, 22).padEnd(22)} sc ${String(h.scene).padStart(2)}  ${h.status.padEnd(8)} ${h.who.slice(0, 16).padEnd(16)} ${h.room.slice(0, 15).padEnd(15)} ${h.text}`);
  console.log('');
}
if (!kinds.length) console.log('No failure found in the proposals.\n');

const errs = all(`SELECT g.role, g.error, datetime(g.created_at / 1000, 'unixepoch') at, s.title FROM generations g JOIN stories s ON s.id = g.story_id
  WHERE (g.role LIKE 'hem%') AND g.error IS NOT NULL ORDER BY g.created_at`);
const calls = all(`SELECT COUNT(*) n FROM generations WHERE role LIKE 'hem%'`)[0].n;
console.log(`== HEM CALLS THAT FAILED: ${errs.length} of ${calls}`);
for (const e of errs) console.log(`   ${e.at}  ${e.title.slice(0, 22).padEnd(22)} ${e.role.padEnd(18)} ${String(e.error).slice(0, 100)}`);
const over = all(`SELECT s.title, c.idx, h.overflow FROM hems h JOIN stories s ON s.id = h.story_id JOIN chapters c ON c.id = h.chapter_id
  WHERE h.overflow IS NOT NULL AND h.overflow NOT IN ('', '[]') ORDER BY s.title, c.idx`);
console.log(`\n== PAST THE CAP OF SIX (not reviewed, named on the hem's card): ${over.length} of ${all('SELECT COUNT(*) n FROM hems')[0].n} hems`);
for (const o of over) console.log(`   ${o.title.slice(0, 22).padEnd(22)} sc ${String(o.idx).padStart(2)}  ${JSON.parse(o.overflow).join(', ')}`);
const failed = all(`SELECT s.title, c.idx, h.passes FROM hems h JOIN stories s ON s.id = h.story_id JOIN chapters c ON c.id = h.chapter_id`)
  .filter((h: any) => Object.values(JSON.parse(h.passes || '{}')).some((v) => v !== null));
console.log(`\n== PASSES MARKED NOT RUN on the latest run: ${failed.length} (a retried hem replaces its row, so earlier ones are not here)`);
for (const f of failed) console.log(`   ${f.title} sc ${f.idx}: ${f.passes}`);
