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

export type Who = Record<string, string[]>;   // a pronoun → the people in the scene who go by it

/** The quoted lines of `take` that `speaker` says, apart from the writer's own line said again, and the
 *  quoted lines whose speaker it cannot tell. */
export function speakerTalks(take: string, speaker: string, who: Who, writerLine = '') {
  const hits: string[] = [], unknown: string[] = [];
  const flat = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const line = flat(writerLine);
  const own = new Set([speaker.toLowerCase(), speaker.split(/\s+/)[0].toLowerCase()]);
  // WHO A SUBJECT IS: 'me' (the speaker), 'other', or 'unknown' (a pronoun two people share).
  const whoIs = (word: string) => {
    const w = word.toLowerCase().replace(/['’]s$/, '');
    if (own.has(w)) return 'me';
    const by = who[w];
    // Shared, it is unknown only when the speaker is among those who share it: else it is not them.
    const me = by?.some((n) => n.toLowerCase() === speaker.toLowerCase());
    if (by) return !me ? 'other' : by.length === 1 ? 'me' : 'unknown';
    return 'other';
  };
  // The first word of a sentence that names who acts: past a leading "But", "Then" and the like.
  const subject = (sentence: string) => (sentence.trim().replace(/^(but|and|then|so|still|now|finally)\s+/i, '')
    .match(/^([A-Z][\p{L}'’-]*|he|she|they|i)\b/iu) ?? [])[1];
  for (const para of take.split(/\n\s*\n/)) {
    const quotes = [...para.matchAll(/["“]([^"”]*)["”]/g)];
    quotes.forEach((q, i) => {
      const said = q[1].trim(), end = q.index! + q[0].length;
      const after = para.slice(end, quotes[i + 1]?.index ?? para.length);
      const before = para.slice(i ? quotes[i - 1].index! + quotes[i - 1][0].length : 0, q.index);
      // A TAG: the line ends open (`,` `?` `!` a dash), and a name or pronoun and a verb follow it.
      const tag = /[,?!—–-]$/.test(said) ? after.match(/^\s*,?\s*([A-Z][\p{L}'’-]*|he|she|they|i)\s+[a-z]+/iu)?.[1] : undefined;
      // Else THE BEAT BEFORE IT: the last sentence of the narration just before the line.
      const beat = tag ? undefined : subject(before.split(/(?<=[.!?…])\s+/).filter((x) => x.trim()).at(-1) ?? '');
      const by = tag ?? beat;
      if (!by || !said) return;
      const is = whoIs(by);
      if (is === 'unknown') unknown.push(said);
      else if (is === 'me' && !(line && flat(said).length >= 3 && line.includes(flat(said)))) hits.push(said);
    });
  }
  return { hits, unknown };
}

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
