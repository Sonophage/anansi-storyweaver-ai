// #143 · OUTSIDE ONLY: WHAT THE HEM MAY SAY OF A CHARACTER IT MUST NOT GET INSIDE OF. The character the
// writer plays, and the Hands off one while the switch is on (`outsideOf` in routes.ts names them). The
// prompt says OUTSIDE ONLY, and the model wrote his feelings anyway: into where he stands ("He feels a
// quiet resolve settle over him"), his relationships ("Seth knows he should insist… but something holds
// him back") and his voice ("carrying a weight of anticipation and nervousness"), across ENCORE's hems,
// and the writer accepted them because they read well. Seth, 2026-11-05: cut the sentences, keep the
// rest. So this file owns which sentences those are, and the hem drops them before a card is chalked.
//
// Pure: no database, no model, no route. bench/hem-audit.ts reads the library with the same rule, so
// the audit and the floor cannot disagree about what a failure is.
//
// NARRATION ONLY. A line the character SAYS ("I want you to stay") is the scene, not the narrator
// telling his inside, so quoted spans are taken out before any rule is tried.
//
// ponytail: an English word list, on the hem's own sentences. Ceilings: a feeling it has no word for,
// and another person's feeling told with a pronoun in this character's card ("she wants him to stay"
// is cut with his). Trigger: a writer finding his feelings still in a card, or another person's
// missing from one; then ask the model for the inside as its own field and drop that field here.

/** The words a sentence names the character by: each word of the title, but not "the" or initials. */
const namesOf = (name: string) => String(name ?? '').split(/\s+/)
  .map((w) => w.replace(/[^\p{L}'’-]/gu, '').replace(/['’]s$/i, ''))
  .filter((w) => w.length > 2 && !/^the$/i.test(w));

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const FEEL = String.raw`(feel|feels|felt|feeling|want|wants|wanted|wish|wishes|wished|hope|hopes|hoped|fear|fears|feared|wonder|wonders|wondered|long|longs|longed|yearn|yearns|yearned|crave|craves|craved|dread|dreads|dreaded|regret|regrets|regretted|love|loves|loved|realise|realises|realised|realize|realizes|realized|decide|decides|decided|believe|believes|believed|trust|trusts|trusted|doubt|doubts|doubted|think|thinks|thought|worry|worries|worried|ache|aches|ached)`;
// "He knows the back roads" is knowledge, kept; "he knows he should" is the inside.
const KNOW = String.raw`(know|knows|knew|known)\s+(that|he|she|they|it|what|how|why|whether|this|there)`;
const AUX = String.raw`((does|did|do|can|could|would|will|should|must|has|had|have|is|was|still|already|suddenly|no longer|never|not|n't|almost|barely|only|just)\s+)*`;
const STATE = String.raw`(afraid|nervous|anxious|certain|sure|guarded|relieved|ashamed|angry|scared|frightened|hopeful|torn|vulnerable|jealous|uneasy|lonely|desperate|hurt|elated|giddy|terrified|resigned|determined|conflicted|overwhelmed)`;
const NOUN = String.raw`(feelings?|fear|fears|shame|guilt|longing|desire|resolve|composure|nervousness|anticipation|certainty|dread|relief|anxiety|hope|hopes|yearning|regret|unease|loneliness|vulnerability|heartache|heart\s+(pounds|pounding|races|racing|aches|sinks))`;
// No subject at all: a clause that opens on the feeling ("…, feeling the suffocating tension").
const OPENS = new RegExp(String.raw`(^|[,;:—–-]\s*)(feeling|hoping|wanting|wishing|fearing|wondering|longing|dreading|yearning|regretting|knowing\s+(that|he|she|they))\b`, 'i');
const WEIGHT = new RegExp(String.raw`\b(a|the)\s+(weight|mix|wave|surge|flicker|pang|knot|rush|swell|tangle)\s+of\s+([\w-]+\s+)*?${NOUN}\b`, 'i');

const rulesFor = (name: string) => {
  const who = String.raw`\b(${[...namesOf(name).map(esc), 'he', 'she', 'they'].join('|')})(['’]s)?`;
  const own = namesOf(name).map((n) => `${esc(n)}['’]s`);
  return [
    new RegExp(`${who}\\s+${AUX}${FEEL}\\b`, 'i'),
    new RegExp(`${who}\\s+${AUX}${KNOW}\\b`, 'i'),
    new RegExp(`${who}\\s+${AUX}(is|was|feels|felt|seems|seemed|grows|grew|becomes|became)\\s+(\\w+\\s+)?${STATE}\\b`, 'i'),
    new RegExp(`\\b(his|her|their${own.length ? '|' + own.join('|') : ''})\\s+(own\\s+)?(\\w+\\s+)?${NOUN}\\b`, 'i'),
    OPENS, WEIGHT,
  ];
};

/** Quoted speech out, so dialogue is never read as the narrator. Straight and curly quotes. */
const unspoken = (s: string) => s.replace(/"[^"]*"|“[^”]*”/g, ' ');

/** THE SENTENCES OF `text` THAT STATE `name`'S INSIDE, cut, and the rest kept in order. */
export function innerCut(text: string, name: string): { kept: string; cut: string[] } {
  const parts = String(text ?? '').match(/[^.!?]+[.!?]+["'”’)]*\s*|[^.!?]+$/g) ?? [];
  const rules = rulesFor(name);
  const inner = (p: string) => { const s = unspoken(p); return rules.some((r) => r.test(s)); };
  const kept: string[] = [], cut: string[] = [];
  for (const p of parts) {
    // A CARD JOINS CLAUSES WITH SEMICOLONS ("Claims Morgott as hers; she feels…; walks beside him"),
    // so the clause is the unit: the inner one goes and the outward ones it was joined to stay.
    const clauses = p.trim().replace(/[.!?]+["'”’)]*$/, '').split(/\s*;\s*/);
    const out = clauses.filter(inner);
    if (!out.length) { kept.push(p); continue; }
    cut.push(...(clauses.length === 1 ? [p.trim()] : out));
    const rest = clauses.filter((c) => !inner(c));
    if (rest.length) kept.push(`${rest.join('; ')}${p.trim().match(/[.!?]+["'”’)]*$/)?.[0] ?? ''} `);
  }
  return { kept: kept.join('').trim(), cut };
}

/** TEMPLATE TEXT IN A CARD: the schema's own "<who>; <age>" shape copied out as if it were the answer
 *  (ENCORE scene 9: "<a man>; <middle-aged>; <a scar above his eyebrow>", accepted once). */
export function placeholders(text: string): string[] {
  // No space just inside either bracket: "5 < 6 and 7 > 2" is arithmetic, "<a man>" is a slot.
  return String(text ?? '').match(/<[^<>\s][^<>\n]{0,58}[^<>\s]>|<[^<>\s]>/g) ?? [];
}

/** #143 · NOTHING TWICE ON A NEW CARD. The card contract says it and the model writes it anyway: of
 *  eight cards Seth would fix in five Ornith hems (2026-11-05), four said one thing in the thread's own
 *  text and again in a pocket ("abstract shapes; muted colors" over an appearance pocket of "abstract
 *  shapes in muted colors"). His rule: the pocket keeps it and the thread's text loses it; between two
 *  pockets, the later one loses it. A pocket left with nothing of its own is dropped; a thread left
 *  with nothing is its title, as a World person's card is when it has no Always true.
 *
 *  A clause is a repeat when two thirds of its words (three letters or more, not the little ones) are
 *  in the text it is checked against. Words, not letters, so "abstract shapes" is said by "abstract
 *  shapes in muted colors", and no length floor, so "bare feet" goes as well as a long clause.
 *  ponytail: a word list, English only. Ceiling: a repeat in other words ("barefoot" for "bare feet")
 *  stays, and a clause whose words another clause happens to share goes. Trigger: a writer finding a
 *  repeat on a new card, or a fact missing from one; then ask the model which clauses repeat. */
const LITTLE = new Set(['the', 'and', 'not', 'does', 'did', 'with', 'his', 'her', 'hers', 'him', 'she', 'they', 'them', 'their',
  'its', 'from', 'into', 'onto', 'for', 'are', 'was', 'were', 'has', 'have', 'had', 'who', 'that', 'this', 'when', 'than',
  'then', 'any', 'all', 'one', 'off', 'out', 'but', 'over', 'under', 'upon', 'there', 'what', 'which', 'while']);
const wordsOf = (t: string) => (t.toLowerCase().replace(/['’]s\b/g, '').match(/[\p{L}\p{N}]+/gu) ?? [])
  .filter((w) => w.length > 2 && !LITTLE.has(w)).map((w) => w.length > 3 ? w.replace(/s$/, '') : w);
/** The clauses of a card's text, each with the mark that ended it. */
const clausesOf = (t: string) => String(t ?? '').match(/[^;.!?]+[;.!?]*["'”’)]*\s*/g) ?? [];
/** `text` without the clauses `known` already says, or '' when nothing of its own is left. */
const unsaid = (text: string, known: Set<string>) => clausesOf(text)
  .filter((c) => { const w = wordsOf(c); return !w.length || w.filter((x) => known.has(x)).length * 3 < w.length * 2; })
  .join('').trim().replace(/[;,]\s*$/, '');

export function notTwice(title: string, body: string, rooms: Record<string, any>) {
  const out: Record<string, any> = {}, said = new Set<string>();
  for (const [slot, r] of Object.entries(rooms)) {
    const own = typeof r === 'object' && r ? String(r.body ?? '') : String(r ?? '');
    const kept = unsaid(own, said);
    for (const w of wordsOf(own)) said.add(w);
    if (kept) out[slot] = typeof r === 'object' && r ? { ...r, body: kept } : kept;
  }
  return { body: unsaid(body, said) || title, rooms: out };
}
