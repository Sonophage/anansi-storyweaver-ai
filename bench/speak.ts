// #147 · SPEAK: DOES THE ANSWER PUT NEW WORDS IN THE MOUTH OF THE CHARACTER THE WRITER JUST SPOKE AS?
// Seth, 2026-11-05: that one failure counts ("your character talks"); saying the writer's line again
// does not. Seen in his ENCORE takes: he speaks as Seth, and the answer has `"Merch, huh?" he repeats`.
//
// The detector reads the narration around each quoted line to say who speaks it: a tag after the line
// (`"…," he says`, `"…," Seth murmurs`), or the beat before it in the same paragraph (`Seth leans in.
// "Stay."`). A pronoun names a character only when one person in the scene goes by it; otherwise the
// line is counted as unknown, not as a failure, and the report says how many.
//
//   node --experimental-strip-types bench/speak.ts check     # the detector, both directions, no model
//   node --experimental-strip-types bench/speak.ts real      # the detector over the live library's Speak takes, read-only
//
// ponytail: English tags and he/she/they only. Ceiling: an answer that names a speaker some other way
// ("the big man answers") or a scene of two people sharing a pronoun is unknown, never counted. Trigger:
// unknown above a tenth of the lines; then give the scene's people their own words for the tag.

import { speakerTalks, type Who } from '../src/speak.ts';

const CASES: { take: string; speaker: string; who: Who; line?: string; hits: number; unknown?: number; why: string }[] = [
  // FROM SETH'S TAKES: he spoke as Seth, and the answer gave Seth the reply.
  { take: 'Halsey blinks.\n\nBut Seth just smiles. "Merch, huh?" he repeats, and there\'s a warmth in his voice.',
    speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] }, line: 'Keep it. The book and the letter. Think of it as merch.', hits: 1,
    why: 'a tag after the line: "…," he repeats' },
  { take: '"You don\'t have to say anything," he murmurs. "Just keep it."', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] },
    hits: 2, why: 'a tag, then a second line of the same speaker in the same paragraph' },
  { take: '"Stay," Seth says.', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] }, hits: 1, why: 'a tag by name' },
  { take: 'Seth leans back against the seat. "That depends. Where are you headed?"', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] },
    hits: 1, why: 'the beat before the line, by name' },
  { take: 'But Seth only shrugs. "Fine."', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] }, hits: 1, why: 'a beat that opens on "But"' },
  { take: 'He shrugs. "Fine."', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] }, hits: 1, why: 'the beat before the line, by pronoun' },
  // THE OTHER PERSON ANSWERS: nothing to count.
  { take: '"Who do you want me to be?" she says, her voice soft.', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] }, hits: 0,
    why: 'she answers' },
  { take: 'Halsey\'s laugh is short. "Liar," she says.', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] }, hits: 0, why: 'she answers, by beat and by tag' },
  { take: 'Seth finally speaks. "Anywhere," he says.', speaker: 'Halsey', who: { he: ['Seth'], she: ['Halsey'] }, hits: 0,
    why: 'the writer spoke as Halsey, and Seth answering is right' },
  { take: 'Halsey looks away. The car is quiet for a long time.', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] }, hits: 0, why: 'no line at all' },
  // THE WRITER'S LINE SAID AGAIN is not this failure (Seth did not pick it).
  { take: '"Who are you?" he asks, and the question hangs there.', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] }, line: 'Who are you?',
    hits: 0, why: 'his own line said again' },
  // A PRONOUN TWO PEOPLE SHARE names nobody: unknown, not a failure.
  { take: '"Pay up," he says.', speaker: 'Aldis Fen', who: { he: ['Aldis Fen', 'Marek'] }, hits: 0, unknown: 1, why: 'two men in the scene' },
  { take: 'Aldis wipes the rain from his face. "I have not got it."', speaker: 'Aldis Fen', who: { he: ['Aldis Fen', 'Marek'] }, hits: 1,
    why: 'a first name in the beat names him even when a pronoun would not' },
  // A PRONOUN THE SPEAKER DOES NOT GO BY is somebody else's, however many share it (real takes: "she"
  // with Halsey and Lisa both named, when the writer spoke as Seth).
  { take: '"Of course," she says, her voice tight.', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey', 'Lisa'] }, hits: 0, unknown: 0,
    why: 'two women, and he spoke as Seth' },
  // A REACTION AFTER THE LINE IS NOT ITS TAG (the Ornith run: Sabel asks, and Aldis swallows).
  { take: 'Sabel watched him. "What do you want?" Aldis swallowed.', speaker: 'Aldis Fen', who: { he: ['Aldis Fen'], she: ['Sabel'] }, hits: 0,
    why: 'a verb that is not speech, after the line' },
  { take: '"Then go," Aldis growled.', speaker: 'Aldis Fen', who: { he: ['Aldis Fen'], she: ['Sabel'] }, hits: 1, why: 'a speech verb after the line' },
  // A NAME INSIDE THE LINE IS NOT ITS TAG.
  { take: '"Seth, wait," she says.', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] }, hits: 0, why: 'his name said to him' },
  { take: 'Seth\'s voice is low. "Not tonight."', speaker: 'Seth', who: { he: ['Seth'], she: ['Halsey'] }, hits: 1, why: 'a possessive beat' },
];

if (process.argv[2] === 'check') {
  let bad = 0;
  for (const c of CASES) {
    const r = speakerTalks(c.take, c.speaker, c.who, c.line ?? '');
    if (r.hits.length !== c.hits || (c.unknown != null && r.unknown.length !== c.unknown)) {
      bad++; console.log(`  RED  hits ${r.hits.length} (want ${c.hits}), unknown ${r.unknown.length}${c.unknown != null ? ` (want ${c.unknown})` : ''} — ${c.why}\n       ${JSON.stringify(c.take)}`);
    }
  }
  console.log(bad ? `\n  ${bad} RED — do not believe a result from this` : `  ok  speak: ${CASES.length} cases, both directions`);
  process.exit(bad ? 1 : 0);
}

// ---- real: the detector over ENCORE's Speak takes, read-only. Who is he or she is the story's (Seth and
// Marcus he; Halsey, Tessa and Lisa she), narrowed to the people the take or the line names, plus the speaker.
if (process.argv[2] === 'real') {
  const { DatabaseSync } = await import('node:sqlite');
  const d = new DatabaseSync(process.env.ANANSI_DB ?? new URL('../../anansi/anansi.db', import.meta.url).pathname, { readOnly: true });
  const PEOPLE: Record<string, string> = { Seth: 'he', Marcus: 'he', Halsey: 'she', Tessa: 'she', Lisa: 'she' };
  const st = d.prepare("SELECT id, persona FROM stories WHERE title = 'ENCORE'").get() as any;
  const takes = d.prepare("SELECT id, chapter_id, branch_id, ordinal, body, selected FROM passages WHERE story_id = ? AND mode = 'speak' AND author = 'model' ORDER BY created_at").all(st.id) as any[];
  const prev = d.prepare('SELECT speaker, body, author FROM passages WHERE chapter_id = ? AND branch_id = ? AND ordinal < ? AND selected = 1 ORDER BY ordinal DESC LIMIT 1');
  let hit = 0, unk = 0, lines = 0, kept = 0;
  for (const t of takes) {
    const p = prev.get(t.chapter_id, t.branch_id, t.ordinal) as any;
    if (!p || p.author !== 'human') continue;   // a Speak take answers the writer's own line
    kept++;
    const speaker = p.speaker || st.persona;
    const named = Object.keys(PEOPLE).filter((n) => n === speaker || new RegExp(`\\b${n}\\b`).test(`${t.body} ${p.body}`));
    const who: Who = {};
    for (const n of named) (who[PEOPLE[n]] ??= []).push(n);
    const r = speakerTalks(t.body, speaker, who, p.body);
    lines += (t.body.match(/["“][^"”]*["”]/g) ?? []).length;
    if (r.hits.length) { hit++; console.log(`HIT ${t.id} (${speaker}, ${t.selected ? 'kept' : 'not kept'}): ${r.hits.map((h) => JSON.stringify(h)).join(' · ')}`); }
    if (r.unknown.length) { unk += r.unknown.length; console.log(`UNKNOWN ${t.id}: ${r.unknown.map((h) => JSON.stringify(h)).join(' · ')}`); }
  }
  console.log(`\n${hit} of ${kept} takes put words in the speaker's mouth; ${unk} of ${lines} quoted lines could not be told.`);
  process.exit(0);
}

// ---- run: Ornith and Qwen3.6 answer the same Speak lines AT ONCE, each on a scratch server on its own copy
// of the library, prompts as they are on this checkout. Two lines: ENCORE's last, where the writer spoke as
// Halsey ("And if I don't?"), and a small two-person scene where he speaks as Aldis and Sabel answers.
// The route saves an answer only while a page watches it stream; these calls do not stream, so nothing
// is saved and every take answers the writer's line fresh (the reroll fields sent after the first take
// name no passage and change nothing). No seed: only these arms compare (F55).
//   node --experimental-strip-types bench/speak.ts run [takes per line, default 20]
//   node --experimental-strip-types bench/speak.ts report
const ARMS = { ornith: { port: 5301, model: 'Ornith-1.0-RPNTH-35B' }, qwen: { port: 5302, model: 'Qwen3.6-WNTH-35B-A3B-NN' } } as const;
const OUT = process.env.BENCH_OUT ?? '/tmp/anansi-speak';
const FIX = { title: 'SPEAK fixture', persona: 'Aldis Fen',
  line: 'You have until the bells. That is all I can give you.',
  who: { he: ['Aldis Fen'], she: ['Sabel'] } as Who };
const ENC = { speaker: 'Halsey', who: { he: ['Seth'], she: ['Halsey'] } as Who };

type Arm = { port: number; model: string; speak?: (text: string) => string; must?: string };
async function runArms(arms: [string, Arm][], n: number) {
  const { DatabaseSync } = await import('node:sqlite');
  const { spawn } = await import('node:child_process');
  const { mkdirSync, rmSync, appendFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  mkdirSync(OUT, { recursive: true }); rmSync(join(OUT, 'takes.jsonl'), { force: true });
  const SOURCE = process.env.ANANSI_DB ?? new URL('../../anansi/anansi.db', import.meta.url).pathname;
  const kids: any[] = []; process.on('exit', () => kids.forEach((k) => k.kill()));
  const ids: Record<string, { encore: string; fixture: string }> = {};
  for (const [arm, a] of arms) {
    const file = join(OUT, `${arm}.db`);
    for (const x of ['', '-wal', '-shm']) rmSync(file + x, { force: true });
    const src = new DatabaseSync(SOURCE, { readOnly: true }); src.exec(`VACUUM INTO '${file}'`); src.close();
    const d = new DatabaseSync(file);
    const seth = (d.prepare("SELECT id FROM users WHERE login = 'sonophage'").get() as any).id;
    const enc = (d.prepare("SELECT id FROM stories WHERE title = 'ENCORE' AND owner_id = ?").get(seth) as any).id;
    d.prepare('UPDATE stories SET model = ? WHERE id = ?').run(a.model, enc);
    // THE ARM'S ONE CHANGE: the writer's own Speak wording, rewritten in this copy only.
    if (a.speak) {
      const row = d.prepare("SELECT text FROM prompt_overrides WHERE owner_id = ? AND key = 'speak'").get(seth) as any;
      if (!row) { console.error('no saved Speak wording to change'); process.exit(1); }
      const next = a.speak(row.text);
      if (next === row.text) { console.error(`${arm}: the change did not apply`); process.exit(1); }
      d.prepare("UPDATE prompt_overrides SET text = ? WHERE owner_id = ? AND key = 'speak'").run(next, seth);
    }
    d.close();
    const kid = spawn(process.execPath, ['--experimental-strip-types', 'serve.ts'], { cwd: new URL('..', import.meta.url).pathname,
      stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ANANSI_PORT: String(a.port), ANANSI_DB: file, ANANSI_MODEL: a.model,
        ANANSI_FEATHERLESS_KEY_FILE: '/nonexistent/featherless.key', ANANSI_ALLOW: '' } });
    kid.stderr.on('data', (b: Buffer) => appendFileSync(join(OUT, `serve-${arm}.log`), b));
    kids.push(kid);
    ids[arm] = { encore: enc, fixture: '' };
  }
  const port = Object.fromEntries(arms.map(([k, a]) => [k, a.port]));
  const j = (arm: string, u: string, b?: unknown, m = 'POST') => fetch(`http://127.0.0.1:${port[arm]}${u}`, b
    ? { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}).then((r) => r.json() as any, (e) => ({ error: String(e) }));
  for (const [arm] of arms) {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) { up = await fetch(`http://127.0.0.1:${port[arm]}/`).then((r) => r.ok, () => false); if (!up) await new Promise((r) => setTimeout(r, 1000)); }
    if (!up) { console.error(`${arm} never came up; see ${OUT}/serve-${arm}.log`); process.exit(1); }
    // THE SMALL SCENE, built the way a writer would: a tale, its two people, the narration, then her line.
    const made = await j(arm, '/api/stories', { title: FIX.title, genre: 'fantasy noir', premise: 'A broke ex-sergeant owes a moneylender more than he can pay.',
      setting: 'Vantic, a canal city, in the third week of rain', pov: 'third limited, past tense', persona: FIX.persona, model: arms.find(([k]) => k === arm)![1].model });
    const put = (title: string, body: string) => j(arm, '/api/entry', { storyId: made.id, entry: { title, body, entryType: 'character', activation: 'always_on', keys: [title.split(' ')[0]] } });
    await put('Aldis Fen', 'He is 34, an ex-Watch sergeant, and owes Marek eleven crowns.');
    await put('Sabel', "She is Marek's collector: broad, unhurried, a woman who says little.");
    await j(arm, '/api/write', { storyId: made.id, body: 'The rain had not stopped for three days. Sabel found him under the fishmonger\'s awning and waited for him to speak.' });
    await j(arm, '/api/write', { storyId: made.id, body: FIX.line, speaker: FIX.persona });
    ids[arm].fixture = made.id;
    for (const id of Object.values(ids[arm])) {
      const v = await j(arm, `/api/story?story=${id}`, undefined, 'GET');
      const want = arms.find(([k]) => k === arm)![1];
      if (v.story?.model !== want.model) { console.error(`${arm} ${id} is on ${v.story?.model ?? v.error}`); process.exit(1); }
      // AND ITS PROMPT, AS SENT: the arm's sentence is in the instruction this server will send.
      if (want.must) {
        const m = await j(arm, '/api/manifest', { storyId: id, mode: 'speak', speaker: id === ids[arm].encore ? ENC.speaker : FIX.persona });
        if (!String(m.prompt ?? '').includes(want.must.replace('{{speaker}}', id === ids[arm].encore ? ENC.speaker : FIX.persona))) {
          console.error(`${arm}: its prompt does not carry its change`); process.exit(1); }
      }
    }
  }
  console.log(`  two servers up; each tale pinned to its arm's model; ${n} takes per line per arm`);
  const t0 = Date.now();
  for (const line of ['encore', 'fixture'] as const) {
    const speaker = line === 'encore' ? ENC.speaker : FIX.persona;
    const first: Record<string, string> = {};
    for (let i = 0; i < n; i++) {
      // BOTH ARMS AT ONCE, take by take.
      await Promise.all(arms.map(async ([arm]) => {
        const body: any = { storyId: ids[arm][line], mode: 'speak', speaker };
        if (first[arm]) Object.assign(body, { regenerateOf: first[arm], rejected: false });
        const r = await j(arm, '/api/generate', body);
        if (!first[arm] && r.passageId) first[arm] = r.passageId;
        appendFileSync(join(OUT, 'takes.jsonl'), JSON.stringify({ arm, model: arms.find(([k]) => k === arm)![1].model, line, i, prose: r.prose ?? null, error: r.error ?? null }) + '\n');
      }));
    }
    console.log(`  ${line}: ${n} takes per arm (${Math.round((Date.now() - t0) / 1000)}s so far)`);
  }
  writeFileSync(join(OUT, 'run.json'), JSON.stringify({ ids, n, arms: arms.map(([k]) => k), seconds: Math.round((Date.now() - t0) / 1000) }));
}

// THE PROMPT A/B (#147, after F73): three arms, all Ornith, differing only in the writer's Speak wording.
//   B  "Do not put further words in X's mouth" made a flat rule: X says nothing more in this passage
//   C  that rule moved to the very end, after the writer's line, nearest where the model starts writing
const OLD = "Do not put further words in {{speaker}}'s mouth, and do not decide what {{speaker}} does next.";
const RULE = "{{speaker}} says nothing more in this passage: no line of dialogue in it is theirs.";
const ORNITH = 'Ornith-1.0-RPNTH-35B';
const AB: [string, Arm][] = [
  ['A', { port: 5301, model: ORNITH }],
  ['B', { port: 5302, model: ORNITH, must: RULE, speak: (t) => t.replace(OLD, `${RULE} Do not decide what {{speaker}} does next.`) }],
  ['C', { port: 5303, model: ORNITH, must: RULE, speak: (t) => `${t.replace(OLD, 'Do not decide what {{speaker}} does next.')}\n\n${RULE}` }],
];

if (process.argv[2] === 'run') { await runArms(Object.entries(ARMS) as [string, Arm][], Number(process.argv[3] ?? 20)); process.exit(0); }
if (process.argv[2] === 'ab') { await runArms(AB, Number(process.argv[3] ?? 20)); process.exit(0); }


if (process.argv[2] === 'report') {
  const { readFileSync } = await import('node:fs');
  const rows = readFileSync(`${OUT}/takes.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  for (const arm of [...new Set(rows.map((r) => r.arm as string))]) {
    let hits = 0, takes = 0, errors = 0, unknown = 0, lines = 0; const per: string[] = [];
    for (const line of ['encore', 'fixture']) {
      const rs = rows.filter((r) => r.arm === arm && r.line === line);
      const ok = rs.filter((r) => r.prose);
      const h = ok.filter((r) => speakerTalks(r.prose, line === 'encore' ? ENC.speaker : FIX.persona, line === 'encore' ? ENC.who : FIX.who,
        line === 'encore' ? 'And if I don\'t?' : FIX.line).hits.length).length;
      for (const r of ok) { const s = speakerTalks(r.prose, line === 'encore' ? ENC.speaker : FIX.persona, line === 'encore' ? ENC.who : FIX.who); unknown += s.unknown.length; lines += (r.prose.match(/["“][^"”]*["”]/g) ?? []).length; }
      hits += h; takes += ok.length; errors += rs.length - ok.length;
      per.push(`${line} ${h}/${ok.length}`);
    }
    console.log(`  ${arm} (${rows.find((r) => r.arm === arm).model}): ${hits} of ${takes} takes give the speaker new words (${takes ? Math.round(hits / takes * 100) : 0}%) · ${per.join(' · ')} · ${errors} failed calls · ${unknown} of ${lines} lines unknown`);
  }
  process.exit(0);
}
