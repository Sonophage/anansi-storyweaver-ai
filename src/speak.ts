// SPEAK: WHO SAYS EACH LINE OF AN ANSWER, AND WHERE THE ANSWER ENDS WHEN THE WRITER'S CHARACTER WOULD
// SPEAK AGAIN (#147; Seth, 2026-11-05). F73: Ornith gives the character the writer just spoke as a new
// line in about half of Speak answers (Qwen3.6 one in five); F74: no prompt sentence moved it. So the
// answer is cut where that character starts talking, before it is saved (`cutSpeaker`).
//
// A line's speaker is read from the narration around it: a speech-verb tag after it (`"…," he says`), or
// the beat before it in the same paragraph (`Seth leans in. "Stay."`). A name always counts. A pronoun
// counts only when the writer's character is the one person in the scene who goes by it; shared, or
// "they" (also a group), or a character with no pronoun set, it names nobody and the line stays: a miss,
// never a wrong cut. Narration only: a name inside a line is not its tag.
//
// Pure: no database, no model. bench/speak.ts measures it; routes.ts calls it when a Speak answer lands.
// ponytail: English tags and he/she/they only. Ceiling: a speaker named some other way ("the big man
// answers") or a shared pronoun is missed. Trigger: the misses (`unknown`) above a tenth of lines;
// then ask the model only for those lines.

/** The verbs of a dialogue tag. A tag verb not here falls back to the beat before the line. */
const SPEECH = /^(say|said|ask|whisper|murmur|repeat|mutter|repl|answer|add|continu|press|breath|snap|growl|purr|teas|admit|offer|tell|told|call|laugh|sigh|stammer|protest|insist|counter|correct|echo|demand|hiss|manag|begin|began|start|finish|plead|beg|warn|grumbl|whimper|croak|rasp|drawl|interrupt|agree|conced|confess|explain|declar|announc|shout|yell|cr[iy]|scoff|chuckl|smil|grin|sneer|spat|spit|bark|blurt|counter|challeng|prompt|tri|venture|offer|quip|retort|reason|remind|conclud|whisper)/i;
export type Who = Record<string, string[]>;   // a pronoun → the people in the scene who go by it
export type Person = { name: string; pronoun?: string | null };

/** The quoted lines of `take` that `speaker` says, apart from the writer's own line said again, each with
 *  where the answer would end before it, and the lines whose speaker cannot be told. */
export function speakerTalks(take: string, speaker: string, who: Who, writerLine = '') {
  const hits: string[] = [], unknown: string[] = [], at: number[] = [];
  const flat = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const line = flat(writerLine);
  const own = new Set([speaker.toLowerCase(), speaker.split(/\s+/)[0].toLowerCase()]);
  // WHO A SUBJECT IS: 'me' (the speaker), 'other', or 'unknown' (it could be them, and someone else).
  const whoIs = (word: string) => {
    const w = word.toLowerCase().replace(/['’]s$/, '');
    if (own.has(w)) return 'me';
    const by = who[w];
    const me = by?.some((n) => n.toLowerCase() === speaker.toLowerCase());
    // "THEY" IS ALSO A GROUP: it never names the speaker alone.
    if (by) return !me ? 'other' : by.length === 1 && w !== 'they' ? 'me' : 'unknown';
    return 'other';
  };
  const lead = /^(but|and|then|so|still|now|finally)\s+/i;
  const subject = (sentence: string) => (sentence.trim().replace(lead, '')
    .match(/^([A-Z][\p{L}'’-]*|he|she|they|i)\b/iu) ?? [])[1];
  // Each paragraph with where it starts in `take`, so a cut lands at the right place.
  for (const pm of take.matchAll(/[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g)) {
    const para = pm[0], base = pm.index!;
    const quotes = [...para.matchAll(/["“]([^"”]*)["”]/g)];
    quotes.forEach((q, i) => {
      const said = q[1].trim(), end = q.index! + q[0].length;
      const after = para.slice(end, quotes[i + 1]?.index ?? para.length);
      const from = i ? quotes[i - 1].index! + quotes[i - 1][0].length : 0;
      const before = para.slice(from, q.index);
      // A TAG: the line ends open (`,` `?` `!` a dash), and a name or pronoun and a speech verb follow it.
      const tagged = /[,?!—–-]$/.test(said) ? after.match(/^\s*,?\s*([A-Z][\p{L}'’-]*|he|she|they|i)\s+(?:\w+ly\s+)?([a-z]+)/iu) : null;
      const tag = tagged && SPEECH.test(tagged[2]) ? tagged[1] : undefined;
      // Else THE BEAT BEFORE IT: the last sentence of the narration just before the line.
      const sentences = [...before.matchAll(/[^.!?…]*[.!?…]+["'”’)]*\s*|[^.!?…]+$/g)].filter((m) => m[0].trim());
      const last = sentences.at(-1);
      const beat = tag ? undefined : subject(last?.[0] ?? '');
      const by = tag ?? beat;
      if (!by || !said) return;
      const is = whoIs(by);
      if (is === 'unknown') unknown.push(said);
      else if (is === 'me' && !(line && flat(said).length >= 3 && line.includes(flat(said)))) {
        hits.push(said);
        // Where the answer ends: before the beat that names them, else before the line.
        at.push(base + (beat && last ? from + last.index! + (last[0].length - last[0].trimStart().length) : q.index!));
      }
    });
  }
  return { hits, unknown, at };
}

/** THE ANSWER, ENDED JUST BEFORE THE WRITER'S CHARACTER SPEAKS AGAIN. `people` are those in the scene with
 *  the pronoun each goes by (blank names nobody). Unchanged when they do not speak. */
export function cutSpeaker(answer: string, speaker: string, people: Person[], line = '') {
  const who: Who = {};
  for (const p of people) { const k = String(p.pronoun ?? '').trim().toLowerCase(); if (k) (who[k] ??= []).push(p.name); }
  const r = speakerTalks(answer, speaker, who, line);
  if (!r.at.length) return { text: answer, cut: false, unknown: r.unknown.length };
  return { text: answer.slice(0, Math.min(...r.at)).trimEnd(), cut: true, unknown: r.unknown.length };
}

/** A CHARACTER'S PRONOUN FROM ITS OWN TEXT, only where it is clear: one kind at least twice and at least
 *  twice the other, else null. Fills the pronoun once on an older library; the writer sets the rest.
 *  Seth's own thread is mixed (it is full of Halsey), so it stays blank for him to set. */
export function guessPronoun(text: string): 'he' | 'she' | null {
  const t = String(text ?? '').toLowerCase();
  const m = (t.match(/\b(he|him|his|himself)\b/g) ?? []).length, f = (t.match(/\b(she|her|hers|herself)\b/g) ?? []).length;
  return m >= 2 && m >= f * 2 ? 'he' : f >= 2 && f >= m * 2 ? 'she' : null;
}
