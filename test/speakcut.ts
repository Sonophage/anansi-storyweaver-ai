// SPEAK SAVES THE ANSWER ENDED BEFORE THE WRITER'S CHARACTER SPEAKS AGAIN (#147; Seth, 2026-11-05).
// F73/F74: Ornith gives that character a new line in about half of Speak answers, and no prompt sentence
// stopped it. The route cuts the answer (src/speak.ts `cutSpeaker`) before it is saved: who spoke the
// writer's line, the characters in the scene with their pronouns, and the writer's line itself.
//
// Driven against a FAKE llama-server that streams a queued answer, as the page calls Speak.
//   node --experimental-strip-types test/speakcut.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync } from 'node:fs';

const DB = '/tmp/anansi-speakcut.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

let answer = '';
const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    const send = (o: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/tokenize') return send({ tokens: Array.from({ length: 200 }, (_, i) => i) });
    if (b.response_format) return send({ choices: [{ message: { content: JSON.stringify({ entries: [] }) } }] });
    if (b.max_tokens === 1) return send({ choices: [{ message: { content: '' } }] });
    if (!b.stream) return send({ choices: [{ message: { content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 200, completion_tokens: 40 } });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const w of answer.match(/\s*\S+\s*/g) ?? []) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 200, completion_tokens: 40 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;
process.env.ANANSI_FEATHERLESS_KEY_FILE = '/nonexistent';

const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { DatabaseSync } = await import('node:sqlite');

let n = 0;
const ok = (m: string) => { n++; console.log(`  ok  ${m}`); };
const me = db.owner('speakcut');
const s = db.createStory(me, { title: 'The Single Bed', premise: 'A singer and a bookseller.', persona: 'Seth' }) as any;
const put = (title: string, pronoun: string | null) => db.upsertEntry(s.id, me, { title, body: `${title}.`, entryType: 'character',
  activation: 'triggered', keys: [title], pronoun });
put('Seth', 'he'); put('Halsey', 'she'); put('Marcus', 'he');
db.addPassage({ ...s, storyId: s.id, body: 'Seth stands by the window. Halsey watches him from the door.' });
const ctx = (body: any) => ({ body, query: new URLSearchParams(), owner: me, slot: { global: 100096, slots: 2, perSlot: 50048 },
  gen: { temperature: 0.85, top_p: 0.95, target_words: 0, max_tokens: 900 }, setGen: () => {} }) as any;
// THE PAGE'S CALL: the writer's line as a speaker, then Speak streamed. The answer the page is handed last.
const speak = async (line: string, speaker: string, text: string, mode = 'speak') => {
  db.addPassage({ ...s, storyId: s.id, body: line, author: 'human', speaker });
  answer = text;
  const h: any = routes['POST /api/generate'](ctx({ storyId: s.id, mode, speaker, stream: true }));
  const r = await h.__stream(() => {});
  const saved: any = db.passagesOf(s.id).find((p: any) => p.id === r.passageId);
  // `recentGenerations` leaves `params` out, so the row is read as it is stored.
  const raw = new DatabaseSync(DB, { readOnly: true });
  const row: any = raw.prepare('SELECT params FROM generations WHERE story_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(s.id);
  raw.close();
  return { r, saved: String(saved?.body ?? ''), params: JSON.parse(row?.params || '{}') };
};

// THE WRITER AS HALSEY, AND THE ANSWER GIVES HALSEY A SECOND LINE.
const a = await speak("And if I don't?", 'Halsey',
  'Seth doesn\'t blink.\n\nShe takes a step back. "And if I choose you?" she asks again.');
assert.strictEqual(a.saved, 'Seth doesn\'t blink.\n\nShe takes a step back.', 'SPEAKCUT-SAVED: the saved answer ends before her line');
assert.strictEqual(a.r.prose, a.saved, 'SPEAKCUT-HANDED: and the page is handed what was saved');
assert.deepStrictEqual(a.params.speakCut, { cut: true, unknown: 0 }, 'SPEAKCUT-RECORDED: the generation records the cut');
ok('Speak saves the answer ended before the writer\'s character speaks again');

// SOMEONE ELSE ANSWERS: saved as it came.
const b = await speak('Stay.', 'Halsey', 'Seth looks at her. "Then stay," he says.');
assert.strictEqual(b.saved, 'Seth looks at her. "Then stay," he says.', 'SPEAKCUT-WHOLE: an answer from someone else is saved whole');
assert.deepStrictEqual(b.params.speakCut, { cut: false, unknown: 0 }, '  and says it cut nothing');
ok('an answer from someone else is saved whole');

// THE WRITER AS SETH. Marcus is a "he" of the tale but not in the scene, so "he" is Seth.
const c = await speak('I should go.', 'Seth', 'Halsey shakes her head.\n\n"Then go," he says, and does not move.');
assert.strictEqual(c.saved, 'Halsey shakes her head.', 'SPEAKCUT-IN-SCENE: a "he" of the tale who is not in the scene does not share the pronoun');
// MARCUS IN THE SCENE: "he says" could be either man, so it stays and is counted.
const d = await speak('I should go.', 'Seth', 'Marcus leans in the doorway.\n\n"Then go," he says.');
assert.strictEqual(d.saved, 'Marcus leans in the doorway.\n\n"Then go," he says.', 'SPEAKCUT-SHARED: two men in the scene: kept');
assert.deepStrictEqual(d.params.speakCut, { cut: false, unknown: 1 }, '  and counted as one it could not tell');
ok('who is in the scene decides whose a pronoun is; shared, it is kept and counted');

// ONLY SPEAK: Continue keeps whatever it wrote.
const e = await speak('Fine.', 'Halsey', 'She laughs. "Go on, then," she says.', 'continue');
assert.strictEqual(e.saved, 'She laughs. "Go on, then," she says.', 'SPEAKCUT-ONLY-SPEAK: Continue is not cut');
assert.strictEqual(e.params.speakCut, undefined, '  and records nothing about it');
ok('only Speak is cut');

srv.close();
console.log(`\n${n} checks passed`);
process.exit(0);
