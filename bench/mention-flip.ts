// EVERY TALE'S ALWAYS-ON THREADS, ON A WORD (Seth, 2026-11-05: "all cards mention only by default,
// including current stories", "flip them too"). Run once over the live library, after a backup and with
// the server stopped; `undo` puts a tale back (src/db.ts `mentionUndo`, which keeps the writer's later
// changes).
//
//   node --experimental-strip-types bench/mention-flip.ts plan  [tale id]   # read-only: what would change
//   ANANSI_DB=anansi.db node --experimental-strip-types bench/mention-flip.ts apply [tale id]
//   ANANSI_DB=anansi.db node --experimental-strip-types bench/mention-flip.ts undo  <tale id>
//   node --experimental-strip-types bench/mention-flip.ts check              # the report, no library
//
// `plan` opens the library read-only and never loads src/db.ts, which would migrate it. `apply` and
// `undo` write, so they take ANANSI_DB by name: nothing here writes a library nobody named.
import { DatabaseSync } from 'node:sqlite';
import { mentionPlan, type Thread } from '../src/mention.ts';

const [, , mode, only] = process.argv;

/** One tale's lines for the writer: how many go on a word, which are not named in the prose yet (they
 *  come in the first time a scene names them), and which stay on and why. */
export function report(title: string, plan: ReturnType<typeof mentionPlan>) {
  const later = plan.flip.filter((f) => !f.named);
  return [`${title}: ${plan.flip.length} now come in when the scene names them, ${plan.kept.length} stay on`,
    ...(later.length ? [`  not named in the story yet: ${later.map((f) => f.title).join(', ')}`] : []),
    ...(plan.kept.length ? [`  stay on: ${plan.kept.map((k) => `${k.title} (${k.why})`).join(', ')}`] : [])].join('\n');
}

if (mode === 'check') {
  const assert = (await import('node:assert')).default;
  const t = (id: string, title: string, keys: string[], activation = 'always_on', entryType = 'character'): Thread =>
    ({ id, title, keys, activation, entryType });
  const out = report('A tale', mentionPlan([t('a', 'Morgott', ['Morgott']), t('b', 'Rennala', ['Rennala']), t('c', 'Talia', ['Talia'])],
    'Morgott knelt.', { persona: 'Talia' }));
  assert.match(out, /^A tale: 2 now come in when the scene names them, 1 stay on/, 'FLIP-REPORT-COUNTS');
  assert.match(out, /not named in the story yet: Rennala$/m, 'FLIP-REPORT-LATER');
  assert.match(out, /stay on: Talia \(your character\)/, 'FLIP-REPORT-KEPT');
  assert.doesNotMatch(out, /not named[^\n]*Morgott/, 'FLIP-REPORT-NAMED: a thread the prose names is not listed as unnamed');
  console.log('  ok  mention-flip: the report says what changes, what waits for its name, and what stays on');
  process.exit(0);
}

if (mode === 'plan') {
  const file = process.env.ANANSI_DB ?? new URL('../../anansi/anansi.db', import.meta.url).pathname;
  const d = new DatabaseSync(file, { readOnly: true });
  const stories = (d.prepare("SELECT s.id, s.title, s.persona, s.locked_character, s.lockout_on, u.login FROM stories s JOIN users u ON u.id = s.owner_id ORDER BY u.login, s.title").all() as any[])
    .filter((s) => !only || s.id === only);
  let flip = 0, kept = 0;
  for (const s of stories) {
    const threads = (d.prepare('SELECT id, title, entry_type, activation, keys, proper_nouns FROM entries WHERE story_id = ?').all(s.id) as any[])
      .map((e) => ({ id: e.id, title: e.title, entryType: e.entry_type, activation: e.activation, keys: JSON.parse(e.keys || '[]'),
        properNouns: e.proper_nouns == null ? undefined : !!e.proper_nouns }));
    if (!threads.some((x) => x.activation === 'always_on')) continue;
    const prose = (d.prepare('SELECT body FROM passages WHERE story_id = ? AND selected = 1 AND (rejected IS NULL OR rejected = 0)').all(s.id) as any[])
      .map((p) => p.body).join('\n');
    const p = mentionPlan(threads, prose, { persona: s.persona, lockedCharacter: s.locked_character,
      lockoutOn: s.lockout_on == null ? null : !!s.lockout_on });
    flip += p.flip.length; kept += p.kept.length;
    console.log(`${s.login} · ${report(s.title, p)}`);
  }
  console.log(`\nall: ${flip} on a word, ${kept} stay on. Read-only: nothing was written.`);
  process.exit(0);
}

if (mode === 'apply' || mode === 'undo') {
  if (!process.env.ANANSI_DB) { console.error('apply and undo write: name the library with ANANSI_DB'); process.exit(2); }
  if (mode === 'undo' && !only) { console.error('undo takes a tale id'); process.exit(2); }
  const db = await import('../src/db.ts');
  const ids = only ? [only] : db.allStoryIds();
  for (const id of ids) {
    const st: any = db.getStory(id);
    if (!st) { console.error(`no tale ${id}`); continue; }
    if (mode === 'undo') { const u = db.mentionUndo(id); console.log(`${st.title}: ${u.restored} put back, ${u.left} left as the writer changed them`); continue; }
    const r = db.mentionApply(id);
    if (r.plan && (r.flipped || r.kept)) console.log(report(st.title, r.plan));
  }
  process.exit(0);
}

console.error('usage: bench/mention-flip.ts plan [tale] | apply [tale] | undo <tale> | check');
process.exit(2);
