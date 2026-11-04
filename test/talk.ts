// Anansi's structured routes against a fake llama-server: /api/talk, whose answer must not be cut
// off and whose promised room must be the room it is given, /api/invent, which must never write,
// and /api/spark, whose premise and prose voice have to come back big enough to write from.
//
// Driven against a FAKE llama-server, because both bugs are about numbers on the wire rather than
// about anything the real model would say. What the real model DID say is written down in
// P0-FINDINGS F25: the grammar closed the reply at exactly 1,400 characters, mid-word, with the
// JSON still valid — a truncated answer that arrives looking like a finished one.
//
//   node --experimental-strip-types test/talk.ts
import assert from 'node:assert';
import { createServer } from 'node:http';
import { unlinkSync, readFileSync } from 'node:fs';

const DB = '/tmp/anansi-talk.db';
for (const f of ['', '-wal', '-shm']) { try { unlinkSync(DB + f); } catch {} }
process.env.ANANSI_DB = DB;

// Longer than the cap that used to be on the field, and it must arrive whole.
const LONG = ('The story is about penance. ').repeat(110).trim();
// A spark's two long fields, at the length the prompt now asks for: a premise of four to six
// sentences and about a hundred words of prose voice. Both must survive the round trip whole.
const PREMISE = ('Aldis owes the moneylender more than he can pay. ').repeat(5).trim();
const VOICE = ('Short sentences, and the weather does the feeling. ').repeat(14).trim();
// A chapter's beat, at the length its prompt asks for: three to six sentences of instruction.
const NOTE = ('By the end the debt has to be called in. ').repeat(4).trim();
// ✦ (#71). One idea for each way the writer moves the story (Seth, 2026-10-30): a line to speak, an
// action, a direction and a passage to narrate, each the next beat in the shape its mode sends.
const IDEAS = { speak: '"You kept my page," Vel said.',
  act: 'Vel takes the ledger from the stair and tears her page out.',
  direct: 'The lower tiers go dark, and someone below calls Vel by her old name.',
  narrate: 'The lamps on the lower stair went out one by one, and the rain came in after them.' };

// ADR 0009 · the open questions a spark returns beside the premise.
// #121 · the moment the tale opens in, which the spark returns apart from the setting.
const OPENS = 'The lower stair, an hour before dawn; rain off the rock, the lamps guttering.';
const QUESTIONS = [{ title: 'Whether the debt is real', line: 'Nobody has seen the ledger but the moneylender.' },
  { title: 'Who sent the letter', line: 'It came under the door with no name on it.' }];

// Seraphine, 2026-11-04 00:05, word for word as the real model answered "Ok fill out the seraphine
// card and fill her pockets please": no changes, the card sent as an offer for one pocket, and a
// reply that says it filled her in. The body is the 600 characters the grammar cut it to.
const FILLCARD = {"reply":"I have filled out the Seraphine card with all the details from your prompt. Here is the completed entry:\n\n**Character Name:** Seraphine\n\n**Role:** Antagonist / Love Interest / Guide\n\n**Appearance:**\n- **Age:** Late 20s to early 30s\n- **Height:** 5'7\"\n- **Build:** Slender but athletic, with a lithe grace\n- **Hair:** Dark brown, styled in a sleek, modern bob\n- **Eyes:** Piercing green, with a hint of gold\n- **Skin:** Pale, with a faint sheen of sweat\n- **Outfit:**\n  - Black latex bodysuit, form-fitting and glossy\n  - Red latex gloves, elbow-length\n  - Black latex boots, knee-high with a slight heel\n  - A silver pendant necklace, shaped like a key\n\n**Personality:**\n- **Confident:** She knows what she wants and goes after it\n- **Possessive:** She likes to claim things and people\n- **Intellectual:** She enjoys puzzles and challenges\n- **Seductive:** She uses her body and voice as weapons\n- **Mysterious:** She keeps her true motives hidden\n\n**Speech:**\n- **Tone:** Low, husky, and intimate\n- **Pace:** Slow and deliberate, with pauses for effect\n- **Vocabulary:** Precise and evocative, with a touch of archaic flair\n- **Quirks:**\n  - Often uses metaphors related to the body and bones\n  - Speaks in a way that feels both inviting and threatening\n  - Her voice can shift from soft and seductive to sharp and commanding\n\n**Backstory:**\n- **Origin:** Unknown, but she has been in Sutera for a long time\n- **Motivation:** She is drawn to the Stranger and wants to understand them\n- **Conflict:** She must balance her desire for the Stranger with her role in the city\n- **Arc:** She will likely become more involved in the Stranger's journey, possibly helping or hindering them\n\n**Relationships:**\n- **The Stranger:** She is fascinated by them and wants to get close\n- **Vel:** She sees Vel as a rival for the Stranger's attention\n- **The Choir of Saints:** She is a member and follows their rules, but has her own agenda\n\n**Quotes:**\n- \"I have been waiting for you, stranger.\"\n- \"You are a puzzle I intend to solve.\"\n- \"Do not be afraid. I am not your enemy.\"\n\n**Notes:**\n- Seraphine is a complex character with multiple layers\n- She can be both a help and a hindrance to the Stranger\n- Her true motives are not entirely clear, adding to the mystery\n\nLet me know if you would like any changes or additional details!","changes":[],"entries":[{"title":"Seraphine","type":"character","body":"A nun of the Choir of Saints, but not as the poor know them. Her habit is cut low, the black fabric pulled taut over strong thighs, ending in heels that click against the blood-stained cobblestones with precise, deliberate rhythm. Red latex gloves stretch to her elbows, shiny and tight, holding the silence of the confessional in their grip. Her voice is a low murmur, barely louder than the gun’s whisper, but it fills the space between them like spilled oil.\n\nShe is hungry, but not for food. She watches the Stranger like a collector watches a rare, dangerous artifact. There is a maternalpossess","keys":["Seraphine","Choir of Saints","Latex","Habit"],"field":"appearance"}]};

let calls: any[] = [];
let memoType: string | null = null;   // what kind of thread "Remember this" answers with, when set
let breakFirst = false;   // answer the first call with a truncated object, as running out of room does
let breakAll = false;     // and every call, for an answer that fails outright
const srv = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const b = JSON.parse(raw || '{}');
    calls.push(b);
    const cut = breakAll || (breakFirst && calls.length === 1);
    // Answer by the shape of the schema asked for: an outfit wants
    // a name and a body, a ledger entry wants a title and keys, everything else is a reply.
    const props = b.response_format?.json_schema?.schema?.properties ?? {};
    // Keyed on the QUESTION, not on the schema: TALK_SCHEMA always carries `strings` now, so a
    // schema-shaped check made every answer the short one and broke the truncation assertions.
    const asksForStrings = /set up and not paid/.test(String(b.messages?.at(-1)?.content ?? ''));
    // A CHANGE TO A CARD THAT EXISTS, naming the room it belongs in. Keyed on the writer's own
    // words, like the two branches around it. Before 2026-09-01 TALK_SCHEMA had no `field` for this
    // answer to put a room in, which is the defect section 6c is about.
    const asksToPad = /inner life/.test(String(b.messages?.at(-1)?.content ?? ''));
    // "Remember this" wants the same SHAPE as an invented entry — title, body, keys — so the
    // schema cannot tell them apart. Keyed on the question, like the strings case above, and with
    // its own title: the proposals table dedupes on the subject, so two roles answering with one
    // name would make the second look like a refusal rather than a duplicate.
    const asksToRemember = /REMEMBER IT:/.test(String(b.messages?.at(-1)?.content ?? ''));
    // #21 §2. The cast is its own call now, keyed on its own role rather than on a schema shape:
    // it answers `entries` and so do two other roles.
    const asksForCast = /Populate a story that already exists/.test(String(b.messages?.[0]?.content ?? ''));
    // #21 §3 step 5. Its own role again, keyed on its own words.
    const asksForReview = /say what you would change about it/.test(String(b.messages?.[0]?.content ?? ''));
    // #97 · A REQUEST TO CHANGE THE TALE, keyed on the writer's own words like the branches above.
    // Each answer is what a model asked that question would return in `changes`; the route is what
    // decides which of them are done.
    // ABOUT- keys the same answer to a message with no word of asking in it (`entriesAsked` reads it).
    const asked = /(?:CHANGE|ABOUT)-(\w+)/.exec(String(b.messages?.at(-1)?.content ?? ''))?.[1];
    const CHANGES: Record<string, any> = {
      AGE: { reply: 'Done: she is thirty now.',
        changes: [{ op: 'thread.set', thread: 'Talia', room: 'none', text: 'Talia is thirty.' }],
        // And, unasked, a place. An offer, so it is chalked and not made.
        entries: [{ title: 'The Quay', type: 'place', body: 'Where the ferry ties up.', keys: ['quay'], field: 'none' }] },
      VOICE: { reply: 'He speaks slowly now.',
        changes: [{ op: 'thread.set', thread: 'Morgott', room: 'voice', text: 'Slow, formal, never a contraction.' }] },
      NEW: { reply: 'The ferryman is in the tale.',
        changes: [{ op: 'thread.new', title: 'The ferryman', type: 'character',
          text: 'Rows the dead across for a coin.', keys: ['ferryman'], activation: 'triggered' }] },
      // Seraphine (2026-11-03), as a replay on the real model sent her: a new thread once per pocket,
      // the pocket named in `field`, and one of them sent twice.
      SERAPHINE: { reply: 'Done. Seraphine is in the tale.',
        changes: [{ op: 'thread.new', title: 'Seraphine', type: 'character', field: 'voice', text: 'A low murmur; calls everyone darling.' },
                  { op: 'thread.new', title: 'Seraphine', type: 'character', field: 'voice', text: 'A low murmur; calls everyone darling.' },
                  { op: 'thread.new', title: 'Seraphine', type: 'character', field: 'outfit', text: 'A habit cut low; red latex gloves to the elbow.' },
                  { op: 'thread.new', title: 'Seraphine', type: 'character', text: 'A novitiate of the Choir of Saints.' }] },
      // And as the live answer ended (2026-11-03): pockets with no Always true at all, one sent twice,
      // under a reply that says it is done.
      NOALWAYS: { reply: 'Done. Ysolde is in the ledger now, fully dressed.',
        changes: [{ op: 'thread.new', title: 'Ysolde', type: 'character', field: 'voice', text: 'A low murmur.' },
                  { op: 'thread.new', title: 'Ysolde', type: 'character', field: 'voice', text: 'A low murmur.' },
                  { op: 'thread.new', title: 'Ysolde', type: 'character', field: 'outfit', text: 'Red latex gloves.' }] },
      FILLCARD,
      // #144 · A CLAIM IN THE MIDDLE of a reply whose change was not done (2026-11-04).
      MIDCLAIM: { reply: 'Vel is a ferryman of the lower tiers. I have also added her voice and her outfit to the card. Her pockets are now filled in. Ask me anything.',
        changes: [{ op: 'thread.set', thread: 'Nobody Here', room: 'voice', text: 'A low murmur.' }] },
      // #144 · A POCKET THAT IS OFF, written on request, and a new thread made with its pockets.
      WAKEOFF: { reply: 'Her look is written.', changes: [{ op: 'thread.set', thread: 'Odile', room: 'appearance', text: 'Grey wool, silver at the cuffs.' }] },
      MAKEWITH: { reply: 'Here he is.', changes: [{ op: 'thread.new', title: 'Brannoc', type: 'character', text: 'A lockkeeper who counts boats.',
        pockets: [{ room: 'voice', text: 'Slow, and never wrong.' }, { room: 'appearance', text: 'Oilskin and a lantern.' }] }] },
      WAKESIB: { reply: 'Her look is written.', changes: [{ op: 'thread.set', thread: 'Maren', room: 'appearance', text: 'Grey wool, silver at the cuffs.' }] },
      PARTCLAIM: { reply: 'Odile is ready. She says "Mind the cuffs." I have added her voice and her outfit to the card. Her letters are written in cipher. She smiles.',
        changes: [{ op: 'thread.set', thread: 'Odile', room: 'voice', text: 'Soft, and always a question.' },
                  { op: 'thread.set', thread: 'Nobody Here', room: 'outfit', text: 'Wool.' }] },
      // A plain answer that only sounds like a claim: nothing was asked, so nothing is taken off.
      SETIN: { reply: 'The tale is set in Sutera, under the Great Rib. I have made my peace with its bells. Ask me anything.' },
      // The card as one entry with its pockets, which the grammar offers now: her appearance in the
      // entry's own room, and two more pockets beside it.
      FILLPOCKETS: { reply: 'Her card is filled in.',
        entries: [{ title: 'Seraphine', type: 'character', keys: ['Seraphine'], field: 'appearance',
          pockets: [{ room: 'interiority', text: 'She wants the Stranger kept, not saved.' },
                    { room: 'relationships', text: 'Vel: a rival for the Stranger.' }],
          body: 'Tall; a habit cut low; red latex gloves to the elbow.' }] },
      // And a new person offered unasked, with pockets of her own: one card on the Workbench.
      NEWNUN: { reply: 'The choir has an abbess too.',
        entries: [{ title: 'Mother Agathe', type: 'character', keys: ['Agathe'], field: 'none',
          pockets: [{ room: 'voice', text: 'Dry; never raises it.' },
                    { room: 'outfit', text: 'A plain grey habit.' }],
          body: 'The abbess of the Choir of Saints.' }] },
      // Everything here is something the route must refuse, and the reply claims all of it was done.
      BAD: { reply: 'Done, all of it.',
        changes: [{ op: 'thread.set', thread: 'Nobody', text: 'Old.' },
                  { op: 'thread.set', thread: 'Ring Law', room: 'voice', text: 'Loud.' },
                  { op: 'thread.delete', thread: 'Talia' },
                  { op: 'passage.set', text: 'The rain stopped.' }] },
      // #98 · the rest of the list.
      PREMISE: { reply: 'The premise is darker now.',
        changes: [{ op: 'tale.set', field: 'premise', text: 'A river nobody crosses twice.' }] },
      SCENE: { reply: 'Scene 1 is The Ford now, and this one heads for the far bank.',
        changes: [{ op: 'scene.set', scene: 1, field: 'title', text: 'The Ford' },
                  { op: 'scene.set', field: 'heads_toward', text: 'The far bank, at dusk.' },
                  { op: 'scene.set', scene: 9, field: 'title', text: 'Later' }] },
      WAKE: { reply: 'The letter is always there now, and the ferryman waits for his name.',
        changes: [{ op: 'thread.wake', thread: 'the letter', activation: 'always_on' },
                  { op: 'thread.wake', thread: 'Charon', activation: 'triggered', keys: ['Charon', 'ferryman'] }] },
      OVERTIME: { reply: 'From scene 3 she is blind in one eye.',
        changes: [{ op: 'thread.overtime', thread: 'Vel', scene: 3, text: 'Vel is blind in one eye.', label: 'Lost an eye' },
                  { op: 'thread.overtime', thread: 'Vel', scene: 2, text: 'Vel is soaked and cold.' },
                  { op: 'thread.overtime', thread: 'Vel', scene: 7, text: 'Vel is gone.' }] },
      // "Get rid of the letter": a model may reach for a delete; only the retirement is on the list.
      // #99 · a thread made and a thread changed from two pages Anansi read. The model names the
      // page by its number in `sources`, and pastes a link into the text as well, which it must not.
      FROMWEB: { reply: 'The ferryman is Charon, and Talia paid him twice.',
        changes: [{ op: 'thread.new', title: 'Charon', type: 'character', keys: ['Charon'], activation: 'triggered',
                    text: 'Ferries the dead across the Styx for an obol (https://myth.example/charon-greek-myth/1).', sources: [1] },
                  { op: 'thread.set', thread: 'Talia', room: 'none', text: 'Talia paid the ferryman twice.', sources: [2] }] },
      // #100 · TALK WHILE A TALE IS SET UP, on the draft. What a model asked these would return.
      SETUP: { reply: 'Darker, and the innkeeper is gone. Ilva speaks low now, and the ferryman is in.',
        changes: [{ op: 'tale.set', field: 'premise', text: 'Six houses, one winter, and every one of them lies.' },
                  { op: 'thread.remove', thread: 'the innkeeper' },
                  { op: 'thread.set', thread: 'Ilva', room: 'voice', text: 'Low and slow; she never asks.' },
                  { op: 'thread.new', title: 'The Ferryman', type: 'character', text: 'Rows the dead across for a coin.' }] },
      SETUPBAD: { reply: 'Done, all of it.',
        changes: [{ op: 'thread.set', thread: 'Nobody', text: 'Old.' },
                  { op: 'scene.set', scene: 1, field: 'title', text: 'The Ford' },
                  { op: 'thread.remove', thread: 'Mara Voss' },
                  { op: 'thread.set', thread: 'Gull Rock', room: 'voice', text: 'Loud.' }] },
      SETUPASK: { reply: 'Three houses matter most: the Marrens, the Ashes and the crown.',
        entries: [{ title: 'House Marren', type: 'lore', body: 'Holds the northern passes.', keys: ['Marren'], field: 'none' },
                  { title: 'Ilva Marren', type: 'character', body: 'Already in the draft.', keys: ['Ilva'], field: 'none' }] },
      // #101 · an IP named during setup, with a thread made for it and one offered.
      SETUPIP: { reply: 'Elden Ring it is, and Morgott is in.',
        changes: [{ op: 'thread.new', title: 'Morgott', type: 'character', text: 'The Omen King.' },
                  { op: 'tale.set', field: 'world', text: 'Elden Ring' }],
        entries: [{ title: 'Godfrey', type: 'character', body: 'The first Elden Lord.', keys: ['Godfrey'], field: 'none' }] },
      // #128 · a string asked for, a pocket of the tale's thread; one changed by its name; and two
      // offered unasked, a promise and an open question, which are chalked.
      STRINGNEW: { reply: 'It is an open question now.',
        changes: [{ op: 'string.set', kind: 'question', title: 'Who sent the letter', text: 'It came under the door with no name.' }] },
      STRINGEDIT: { reply: 'The letter is sealed now.',
        changes: [{ op: 'string.set', title: 'the letter', text: 'Sealed, and still unopened.' }] },
      // Seth, 2026-10-28: a string made the other kind, asked for in so many words, with no text.
      STRINGKIND: { reply: 'The letter is an open question now.',
        changes: [{ op: 'string.set', kind: 'question', title: 'the letter' }] },
      STRINGOFFER: { reply: 'Two things the tale is carrying.',
        strings: [{ title: 'The debt nobody calls in', body: 'Owed since spring.', fromChapter: 1, kind: 'promise' },
                  { title: 'Whether the ferryman can die', body: 'Nobody has asked him.', fromChapter: 1, kind: 'question' }] },
      SETUPWEB: { reply: 'Charon is in.',
        changes: [{ op: 'thread.new', title: 'Charon', type: 'character',
          text: 'Ferries the dead for an obol (https://myth.example/charon/1).', sources: [1] }] },
      // #101 · in a tale that follows a World: canon, the writer's version, and one the model did
      // not place, beside a premise change that must wait with it.
      CANON: { reply: 'Morgott speaks slowly in the canon now.',
        changes: [{ op: 'thread.set', thread: 'Morgott', room: 'voice', text: 'Slow, formal, never a contraction.', to: 'world' },
                  { op: 'thread.new', title: 'Malenia', type: 'character', text: 'Blade of Miquella.', to: 'world' }] },
      MINE: { reply: 'In your tale he has a queen.',
        changes: [{ op: 'thread.set', thread: 'Morgott', room: 'none', text: 'Morgott has taken Rennala as his queen.', to: 'tale' }] },
      UNSURE: { reply: 'Done, he is blind.',
        changes: [{ op: 'thread.set', thread: 'Morgott', room: 'none', text: 'Morgott is blind.' },
                  { op: 'tale.set', field: 'premise', text: 'Ash over Leyndell.' }] },
      // The tale's own pockets: rules (ADR 0005), the writer's own instructions, where a string
      // stands (ADR 0011), and the tale's own fields beside its premise and setting.
      RULES: { reply: 'The tide turns at night, the toll is two coins, and dawn law is on.',
        changes: [{ op: 'rule.set', title: 'The tide', text: 'The river runs backward at night.', keys: ['night'] },
                  { op: 'rule.set', title: 'the toll', text: 'Every crossing costs two coins.' },
                  { op: 'rule.switch', title: 'Dawn law', on: true }] },
      RULEALWAYS: { reply: 'Dawn law holds always now.', changes: [{ op: 'rule.set', title: 'Dawn law', activation: 'always_on' }] },
      OWNINSTR: { reply: 'Weather carries it now, the tense is present, and no oaths is on.',
        changes: [{ op: 'instruction.set', title: 'Weather', text: 'Let the weather carry the feeling.' },
                  { op: 'instruction.set', title: 'Tense', text: 'Keep to the present tense.' },
                  { op: 'instruction.switch', title: 'No oaths', on: true }] },
      STAND: { reply: 'The letter is tied off and the debt is in play again.',
        changes: [{ op: 'string.stand', title: 'the letter', stand: 'tied_off' },
                  { op: 'string.stand', title: 'the debt', stand: 'in_play' },
                  { op: 'string.stand', title: 'the oath', stand: 'let_go' }] },
      TALEMORE: { reply: 'Renamed, regenred, revoiced, and noted.',
        changes: [{ op: 'tale.set', field: 'title', text: 'The Far Bank' },
                  { op: 'tale.set', field: 'genre', text: 'noir / gothic and horror' },
                  { op: 'tale.set', field: 'voice', text: 'Long, slow sentences; the river does the feeling.' },
                  { op: 'tale.set', field: 'style_note', text: 'Rain in every scene.' }] },
      RETIRE: { reply: 'The letter is gone.',
        changes: [{ op: 'thread.retire', thread: 'The letter' }, { op: 'thread.delete', thread: 'The letter' }] },
    };
    // #99 · THE QUERY CALL, told apart by its own one-field schema and answered by the writer's
    // words: none, one, or more than the cap of three.
    const QUERIES: Record<string, string[]> = { NONE: [], WHO: ['Charon'],
      MANY: ['Charon', 'the Styx', 'obol', 'Hades', 'Cerberus'] };
    const wantsSearch = /SEARCH-(\w+)/.exec(String(b.messages?.at(-1)?.content ?? ''))?.[1] ?? 'NONE';
    // #104 · A NEW IP'S NAMES LIST and ONE THREAD PULLED FOR IT, told apart by their own schemas. The
    // list names the World itself and one name twice, which the route drops; asked for more, it
    // names one already listed again. A pull of "Nobody" says too little to make a thread.
    const sys = String(b.messages?.[0]?.content ?? '');
    const pulled = /Write ONE (\w+) card for "([^"]+)"/.exec(sys);
    const answer = props.found ? { found: /Already on the list/.test(sys)
        ? [{ name: 'Malenia', kind: 'character', line: 'Blade of Miquella, never known defeat.' },
           { name: 'Morgott', kind: 'character', line: 'The Omen King, again.' }]
        : [{ name: 'Morgott', kind: 'character', line: 'The Omen King, who guards Leyndell.' },
           { name: 'Elden Ring', kind: 'place', line: 'The world itself.' },
           { name: 'Godfrey', kind: 'character', line: 'The first Elden Lord.' },
           { name: 'Leyndell', kind: 'place', line: 'The royal capital under the Erdtree.' },
           { name: 'morgott', kind: 'character', line: 'Twice.' }] }
      // #105 · Melina comes back under a longer title than the name ticked for her.
      : pulled && props.rooms ? { title: pulled[2] === 'Nobody' ? '' : pulled[2] === 'Melina' ? 'Melina, the Maiden' : pulled[2],
        body: `${pulled[2]}: the one the Lands Between remember`, keys: [pulled[2].split(' ')[0]],
        rooms: Object.fromEntries(Object.keys(props.rooms.properties ?? {}).map((slot) => [slot,
          slot === 'voice' ? 'Formal, and he calls everyone Tarnished.'
          : slot === 'atmosphere' ? 'Let the gold leaves fall through every scene here.' : ''])) }
      : props.queries ? { queries: QUERIES[wantsSearch] ?? [] }
      : asked && CHANGES[asked] ? CHANGES[asked]
      : asksToPad ? { reply: 'She is more afraid of being right than of being wrong.',
        entries: [{ title: 'Vel', type: 'character', field: 'interiority',
                    body: 'She is more afraid of being right than of being wrong.', keys: ['Vel'] }] }
      : asksForReview && /Hiding in the lower tiers/.test(String(b.messages?.at(-1)?.content ?? '')) ? {
        changes: [], entries: [],
        contradictions: [
          { one: { thread: 'Vel', part: 'stands', says: 'Waits on the stair for Aldis.' },
            other: { thread: 'aldis', part: 'stands', says: 'Hiding in the lower tiers.' },
            fix: { thread: 'Aldis', part: 'stands', text: 'Climbing the stair to meet Vel, late.' },
            why: 'She waits for him on the stair while he hides below.' },
          // A thread the draft does not have.
          { one: { thread: 'Nobody', part: 'always_true', says: 'x' }, other: { thread: 'Vel', part: 'stands', says: 'y' },
            fix: { thread: 'Nobody', part: 'always_true', text: 'z' }, why: 'No such thread.' },
          // A fix to neither of the two places it names.
          { one: { thread: 'Vel', part: 'always_true', says: 'x' }, other: { thread: '', part: 'premise', says: 'y' },
            fix: { thread: 'Aldis', part: 'stands', text: 'z' }, why: 'Elsewhere.' },
          // The held character's inside: the model never writes it (#84), so no fix may either.
          { one: { thread: 'Vel', part: 'interiority', says: 'x' }, other: { thread: 'Aldis', part: 'stands', says: 'y' },
            fix: { thread: 'Vel', part: 'interiority', text: 'She hates him.' }, why: 'Held.' },
          { one: { thread: '', part: 'premise', says: 'Aldis owes the moneylender.' },
            other: { thread: 'Vel', part: 'interiority', says: 'She will forgive the debt.' },
            fix: { thread: '', part: 'premise', text: 'Aldis, on the stair, owes Vel more than he can pay.' },
            why: 'The premise names another lender.' },
          // An empty fix is no fix.
          { one: { thread: 'Vel', part: 'stands', says: 'a' }, other: { thread: 'Aldis', part: 'stands', says: 'b' },
            fix: { thread: 'Aldis', part: 'stands', text: '  ' }, why: 'Nothing.' },
        ] }
      : asksForReview ? {
        changes: [
          { field: 'title', value: 'The Tide Clerk', why: 'The premise counts; the title salts.' },
          // A "change" that returns the field unchanged is not one, and it is the shape a model
          // reaching for something to say produces. Dropped by the route.
          { field: 'premise', value: PREMISE, why: 'No notes.' },
          // A field the wizard cannot apply. Unreachable through the grammar; refused anyway.
          { field: 'spice', value: '5', why: 'Hotter.' },
        ],
        entries: [
          { name: 'The Quay Office', kind: 'lore', body: 'A room of ledgers above the water.',
            // #86. Try it on's threads arrive with pockets now; a voice is not a lore pocket.
            pockets: [{ slot: 'atmosphere', name: 'Damp', body: 'Let the paper curl; keep the water audible.' },
                      { slot: 'voice', name: 'x', body: 'A place has no voice pocket, so this is dropped.' }] },
          // Already in the cast under the same name — the prompt forbids it and this enforces it.
          { name: 'Vel', kind: 'character', body: 'Speaks for the dead god, again.',
            pockets: [{ slot: 'voice', name: 'Murmur', body: 'Write her lines low.' },
                      { slot: 'interiority', name: 'Fear', body: 'Never let her say she is afraid.' }] },
        ],
      }
      : asksForCast ? { entries: [
        { name: 'Vel', kind: 'character', body: 'Speaks for the dead god. Owes nothing and says so.',
          stands: 'Vel: waits on the stair for a debtor who is late.',
          pockets: [{ slot: 'voice', name: 'The Murmur', body: 'Write her lines short and flat; she never asks a question.' },
                    { slot: 'atmosphere', name: 'x', body: 'A person has no atmosphere pocket, so this is dropped.' }] },
        // The real model starts a body with the name it was given (2026-10-27: "Seth: Seth: The
        // Witness"), so this one does.
        { name: 'The Long Stair', kind: 'lore', body: 'The Long Stair: a stair with no landing, cut into the rock.',
          stands: 'Half its lamps are out.' },
        // A kind nobody asked for. The grammar makes this unreachable from a real model; the route
        // drops it anyway, and this is what proves the belt exists as well as the braces.
        { name: 'The Bell', kind: 'item', body: 'Rung once a year, badly.' },
        // #86. A SECOND PERSON, only when the ask names somebody Hands off, so "the voice pocket goes
        // to that thread and no other" has another thread to be wrong on. His pockets are the
        // model's own and must survive; Vel's, when she is the one held, must not.
        ...(/HANDS OFF:/.test(String(b.messages?.at(-1)?.content ?? '')) ? [{ name: 'Aldis', kind: 'character',
          body: 'Owes the moneylender more than he can pay.',
          pockets: [{ slot: 'voice', name: 'Debtor', body: 'Write his lines as apologies that never finish.' }] }] : []),
      ].map((e: any) => e.name === 'Vel' && /HANDS OFF:/.test(String(b.messages?.at(-1)?.content ?? '')) ? { ...e, pockets: [...e.pockets,
          { slot: 'interiority', name: 'Fear', body: 'Never let her say she is afraid; she counts instead.' }] } : e),
      }
      : props.premise ? { title: 'The Rust Year', premise: PREMISE, genre: 'noir, gothic',
        setting: 'Sutera', pov: 'third limited, past tense', spice: 2, writingStyle: VOICE,
        ...(props.opensWith ? { opensWith: `  ${OPENS}  ` } : {}),
        // ADR 0009. The open questions, and one with nothing in it that the route must drop.
        ...(props.questions ? { questions: [...QUESTIONS, { title: '  ', line: 'nothing' }] } : {}),
        characters: [{ name: 'Vel', role: 'the Murmur', description: 'Speaks for the dead god.' },
                     { name: 'Aldis', role: 'a debtor', description: 'Owes more than he can pay.' }] }
      : asksForStrings ? { reply: 'Two things are owed.',
        strings: [{ title: 'The letter he has not opened', body: 'Sent by his brother', fromChapter: 6 }] }
      : props.title && props.note ? { title: 'The Rust Year', note: NOTE }
      : asksToRemember ? { title: 'The Broken Stair',
          body: '[the lower stair: tread gave under her weight, rail came away, unrepaired]',
          keys: ['stair', 'rail'], ...(memoType ? { title: 'The Nun', type: memoType } : {}) }
      // NAME BEFORE KEYS, and the order is load-bearing. An addon's schema is name + body + keys
      // (PLAN-08: a room fires on its own words, so the shape has to be able to carry them), and
      // a card's is title + body + keys. `props.keys` alone no longer tells them apart — checked
      // first, it answered every addon with a card and the wardrobe form filled with nothing.
      : props.name ? { name: 'Mourning grey', body: '[wearing: grey, unpinned, no scripture showing]',
                       keys: ['mourning', 'grey'] }
      : props.keys ? { title: 'The Rust Choir', body: '[The Rust Choir: a congregation]',
                                  keys: ['choir', 'rust'] }
      // ✦ (#71). Its own one-field schema, so the shape alone tells it apart.
      : props.ideas ? { ideas: IDEAS }
      // One field of the skeleton, asked again (SPARK_FIELD_SCHEMA).
      : props.value ? { value: 'Aldis, on the stair at dusk, wants the ledger before the lamps are lit.' }
      : { reply: LONG };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: cut
        // truncated mid-object, unparseable. Short of its close for an answer under 900 (✦'s idea).
        ? JSON.stringify(answer).slice(0, Math.min(900, JSON.stringify(answer).length - 2))
        : JSON.stringify(answer) } }],
      usage: { prompt_tokens: 400, completion_tokens: 900 } }));
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
process.env.ANANSI_LLAMA = `http://127.0.0.1:${(srv.address() as any).port}`;

const db = await import('../src/db.ts');
const { routes } = await import('../src/routes.ts');
const { TALK_SCHEMA, TALK_SETUP_SCHEMA, INVENT } = await import('../src/prompts.ts');
const { ALL_SLOTS: ALL_SLOTS_T } = await import('../src/slots.ts');

const me = db.owner('talker');
const story = db.createStory(me, { title: 'Sutera', premise: 'A city on a dead god.' });
db.upsertEntry(story.id, me, { title: 'Vel', body: 'Vel is the Murmur.', activation: 'always_on' });
db.addPassage({ ...story, storyId: story.id, body: 'The lower tiers still pulse.' });
// A passage with a line of dialogue in it, for "remember this": what the narrator commits is a
// fact, and what a character says is not — the rule extract and remember already follow.
const SPOKEN_LINE = 'I never went down there';
db.addPassage({ ...story, storyId: story.id,
  body: `The stair gave under her weight and the rail came away in her hand. "${SPOKEN_LINE}," she said.` });

const ask = async (perSlot: number) => {
  calls = [];
  return routes['POST /api/talk']({
    body: { storyId: story.id, said: 'What is this story about? The long answer, please.' },
    query: new URLSearchParams(), owner: me,
    slot: { global: perSlot * 2, slots: 2, perSlot },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {},
  } as any);
};

let n = 0;
// Message only — assertions run inline above. db.ts, engine.ts and stream.ts take a callback and
// call it; passing one to THIS `ok` would print a green check for a body that never ran. Refused
// rather than swallowed. See the note in test/app.ts.
const ok = (m: string, fn?: unknown) => {
  if (fn !== undefined) throw new Error(`ok() in this suite takes a message only, and was given a `
    + `second argument for "${m}" — its body would never run. Put the assertions inline above it.`);
  n++; console.log(`  ok  ${m}`);
};

// ---- 1. the grammar no longer holds a bound on the answer
assert.ok(!('maxLength' in (TALK_SCHEMA.properties.reply as any)),
  'a maxLength on reply closes the string mid-word and the JSON stays valid — the answer arrives '
  + 'truncated and looking finished');
// The fields that ARE short keep their bounds: an unbounded string is where a reasoning model
// writes an essay (F18), and those are the fields where that is a defect rather than the answer.
assert.strictEqual((TALK_SCHEMA.properties.directive as any).maxLength, 400);
// An entry's body was bounded at 600 (F18: an unbounded field is where a reasoning model writes an
// essay). It cut Seraphine's pockets mid-word (#144, F25), so it is unbounded like the reply; the
// answer's own token cap is what holds an essay now.
assert.ok(!('maxLength' in (TALK_SCHEMA.properties.entries as any).items.properties.body),
  'ENTRY-UNCAPPED: an entry body is not cut mid-word by the grammar (#144)');
assert.ok(!('maxLength' in (TALK_SETUP_SCHEMA.properties.entries as any).items.properties.body),
  'ENTRY-UNCAPPED-SETUP: nor in the setup talk (#144)');
ok('the reply and an entry body are unbounded; the directive keeps its bound');

// ---- 2. a long answer arrives whole
const wide = await ask(50_048);
assert.ok(!wide.error, wide.error);
assert.strictEqual(wide.reply.length, LONG.length,
  `the whole answer, not the first ${wide.reply.length} characters of it`);
assert.match(wide.reply, /penance\.$/, 'and it ends where the model stopped, not where a cap did');
ok(`a ${LONG.length}-character answer is not truncated on the way through`);
db.setName(me, 'Seth');
await ask(50_048);
assert.match(calls[0].messages.map((m: any) => m.content).join('\n'), /The writer is Seth\./, 'TALK-WRITER: Talk is told who the writer is, by their account name (2026-10-30)');
// A CHAT, NOT ONE LETTER (Seth, 2026-10-30: "It needs to feel like a person no repetition ... a chatbot
// trained basically on the current story"): the story in the system message, the conversation as turns.
calls = [];
await routes['POST /api/talk']({ body: { storyId: story.id, said: 'And who am I?',
  turns: [{ you: true, text: 'Who are you?' }, { text: 'Mina. I keep this tale.' }] },
  query: new URLSearchParams(), owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
  gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any);
{
  const msgs = calls[0].messages.map((m: any) => `${m.role}:${String(m.content).slice(0, 40)}`);
  assert.deepStrictEqual(msgs.slice(1), ['user:Who are you?', 'assistant:Mina. I keep this tale.', 'user:And who am I?'],
    'TALK-CHAT: the conversation goes as turns, writer and Anansi, then this message');
  assert.match(String(calls[0].messages[0].content), /lower tiers still pulse[\s\S]*$/, 'TALK-CHAT: and the story is in the system message');
  assert.doesNotMatch(calls[0].messages.map((m: any) => m.content).join('\n'), /Earlier in this conversation/, '  not pasted in as a document');
  assert.ok(Number(calls[0].temperature) > 0.4, 'TALK-WARM: warmer than it was');
  // No repetition penalties on a JSON answer: they penalise the answer's own keys and quotes, and Talk
  // wrote "changes" and "pocket" as its reply with no change made (Seth, 2026-10-30).
  assert.ok(calls[0].presence_penalty == null && calls[0].frequency_penalty == null, 'TALK-NO-PENALTY: no presence or frequency penalty on Talk');
}
ok('Talk is a chat: the story in the system message, the conversation as turns');
// #144 · ITS OWN WORDS ONLY. The answer a writer was shown carries the app's lines too ("Nothing was
// changed.", "Not done. …", "Offered on the Workbench, not written:"), and sent back as Anansi's turn
// the model copied them into its next reply as if it had said them (Seraphine, 2026-11-04).
calls = [];
await routes['POST /api/talk']({ body: { storyId: story.id, said: 'Try again.',
  turns: [{ you: true, text: 'Fill her card.' },
          { text: 'Nothing was changed.\nNot done. Change Vel: there is no thread called Vel.\n\nShe is ready for you.\n\n'
            + 'Offered on the Workbench, not written:\nVel: voice\n\nThe web search failed (timeout), so this answer does not use the web.' }] },
  query: new URLSearchParams(), owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
  gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any);
assert.strictEqual(calls[0].messages[2].content, 'She is ready for you.',
  `OWN-WORDS: Anansi's earlier turn goes back without the app's lines (${JSON.stringify(calls[0].messages[2].content)})`);
ok('an earlier answer goes back to the model as Anansi\'s own words, not the app\'s notes on it');


// ---- 3. the room reserved is the room spent
// It assembled the prompt against 900 tokens of reserved output and then asked for 1,600. The
// prompt was budgeted for a smaller answer than the one requested, so on a long story the slot
// could be oversubscribed — and this server does not queue an overflow, both writers sharing the
// cache get a 500.
const wire = Number(calls[0].max_tokens);
assert.ok(wire > 900, `the call asks for ${wire} tokens, so 900 cannot be what was reserved`);
const P = wide.tokens;
// budgetFor: cap - max(600, reserved) - 6% of cap, and the guard refuses when the prompt exceeds it.
const budget = (cap: number, reserved: number) =>
  Math.max(0, cap - Math.max(600, reserved) - Math.floor(cap * 0.06));
// A slot with room for the prompt plus 900 of reply, but not the prompt plus what is really asked.
// Reserving 900 and spending `wire` looks fine here; reserving `wire` refuses, which is correct.
let cap = 0;
for (let c = P; c < P * 4 + 20_000; c++)
  if (budget(c, wire) < P && P <= budget(c, 900)) { cap = c; break; }
assert.ok(cap, `no slot size separates the two reservations at a ${P}-token prompt`);
const tight = await ask(cap);
assert.ok(tight.error, `a ${cap}-token slot has no room for a ${P}-token prompt plus ${wire} of reply, `
  + 'and must refuse rather than ask for it anyway');
assert.ok(!tight.reply, 'and nothing is said');
ok(`the prompt is budgeted against the ${wire} tokens the call actually asks for`);

// ---- 4. the retry asks for MORE room, never less
// The failure being retried is an object that ran out of room. structuredRetry used a flat 2,000,
// so a caller already asking for more than that was retried with LESS and the retry could only fail
// harder — which is exactly the caller this file is about, now that it asks for 2,400.
breakFirst = true;
const retried = await ask(50_048);
breakFirst = false;
assert.strictEqual(calls.length, 2, 'an unparseable object is retried once');
assert.ok(!retried.error, retried.error);
assert.ok(Number(calls[1].max_tokens) > Number(calls[0].max_tokens),
  `the retry asked for ${calls[1].max_tokens} against the first call's ${calls[0].max_tokens}`);
assert.strictEqual(retried.reply.length, LONG.length, 'and the second answer arrives whole');
ok(`the retry raises the budget (${calls[0].max_tokens} then ${calls[1].max_tokens}), it does not lower it`);

// ---- 5. invent hands back a draft and writes nothing to the ledger
const invent = (o: any) => { calls = []; return routes['POST /api/invent']({
  body: { storyId: story.id, ...o }, query: new URLSearchParams(), owner: me,
  slot: { global: 100_096, slots: 2, perSlot: 50_048 },
  gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any); };

const before = db.entriesOf(story.id).length;
const vel = db.entriesOf(story.id).find((e: any) => e.title === 'Vel');

const dressed: any = await invent({ kind: 'outfit', entryId: vel.id, direction: 'she is in mourning' });
assert.ok(!dressed.error, dressed.error);
assert.strictEqual(dressed.outfit.name, 'Mourning grey');
assert.match(dressed.outfit.body, /^\[wearing:/, 'a ledger entry, not prose');
assert.strictEqual(db.outfitsOf(story.id, vel.id).length, 0,
  'the outfit is a draft for the Wardrobe form — pressing Add is still the writer\'s');
// The writer's own line outranks the canon, so it has to actually reach the model.
assert.match(String(calls[0].messages[0].content), /she is in mourning/,
  'the direction is in the prompt, or the button did nothing with what they typed');
ok('an invented outfit comes back as two fields and nothing is worn');

// PLAN-08. Every slot invents the same way an outfit did, and an addon carries its own trigger
// words — a room the writer has to key by hand is a room that mostly never fires.
assert.strictEqual(dressed.addon.slot, 'outfit', 'the answer says which room it is for');
assert.deepStrictEqual(dressed.addon.keys, ['mourning', 'grey']);
const spoken: any = await invent({ kind: 'voice', entryId: vel.id, direction: 'she is short with people' });
assert.ok(!spoken.error, spoken.error);
assert.strictEqual(spoken.addon.slot, 'voice', 'a voice is invented the same way a coat is');
const nowhere: any = await invent({ kind: 'voice', direction: 'no card named' });
assert.match(String(nowhere.error), /needs a thread to belong to/,
  'an addon with no card is refused — the model cannot write a voice for nobody');
ok('every slot invents the way an outfit does, and an addon comes back with its own keys');

const thread: any = await invent({ kind: 'lore', direction: 'a rival congregation' });
assert.ok(!thread.error, thread.error);
assert.strictEqual(thread.proposed, 1);
assert.strictEqual(thread.title, 'The Rust Choir');
assert.strictEqual(db.entriesOf(story.id).length, before,
  'an invented thread is a PROPOSAL — the ledger is untouched until it is accepted');
assert.ok(db.proposalsOf(story.id).some((p: any) => p.title === 'The Rust Choir'),
  'and it is in the queue with everything else Anansi offers');
ok('an invented thread lands in the proposals queue, not in the ledger');

// ---- 5b. an invented entry is a jumping-off point, and it has the room to be one
// Seth's spec, verbatim: "it doesnt have to be a single sentence, it also doesnt have to be three
// paragraphs. it should be written in a way where the ai can use it to write but not say things
// verbatim, a jumping off point for it." Two halves that regress independently — the prompt can go
// back to asking for forty words, or the ceiling can go back to the room forty words needed — so
// both are asserted, and the ceiling is read off THE WIRE rather than from the constant.
{
  const said = String(calls[0].messages[0].content);
  // The band the prompt asks for, read OUT of the prompt, and the room that band needs, read off
  // THE WIRE. Tying the two together is the point: the pair regresses independently, and asking
  // for more words inside a ceiling cut for fewer is how F25 happened — valid JSON, closed
  // mid-thought, looking finished.
  const band = said.match(/(?:a )?hundred and twenty to two hundred words/i)
    ?? said.match(/(\w+ )+to (\w+ )+words/i);
  assert.ok(band, 'the prompt must state a word band for the body, or the model decides for itself');
  assert.ok(Number(calls[0].max_tokens) >= 2000,
    `a 200-word body is asked for in ${calls[0].max_tokens} tokens. A body that runs out of room `
    + 'truncates the OBJECT rather than the string, so it does not parse, and the retry costs '
    + 'another whole call at ~7s. Raise the ceiling with the ask, in the same commit.');
  // The FLOOR, not the wording. This asserted the exact phrase "not one sentence, and not three
  // paragraphs" until 2026-08-27 and went red when the band was widened — the same way ritual.js
  // went red for wording that had been renamed under it. What must be true is that the prompt
  // refuses a one-liner, because a ceiling on its own is what made the bodies one line.
  assert.match(said, /not one sentence/i,
    'the prompt has to name the FLOOR as well as the ceiling — a ceiling on its own is what made '
    + 'the bodies one line');
  assert.match(said, /never say it back word for word/,
    'and it has to say the body is material to write from rather than a line to quote');
  // F27 kept keys from repeating the title, which came back as whole titles ("The Synod of the
  // Hollow"). Since 2026-11-01 (Seth: "when it starts is one good keyword") the ask is ONE keyword, a
  // person's name in one word or a thing's name as the prose writes it, and `oneKeyword` holds the floor.
  assert.match(said, /ONE keyword/,
    'the keys instruction that F27 says the model still sometimes ignores must not go missing '
    + 'while the body is being widened');
  ok('an invented entry is asked for as a jumping-off point, in the room one needs');
}

// ---- 5c. A ROOM IS NOT A CARD, and until 2026-08-30 it was asked for as though it were.
// `outfit` was the only addon when INVENT's branch was written, so every other room —
// interiority, appearance, voice, relationships, history, role, facts — fell through to the
// WHOLE-CARD instructions and the whole-card length of 120-200 words. A character has eight
// rooms. The live library shows what that produced: Halsey is 7,113 characters over twelve
// rooms, ~1,778 tokens, for one person, against a canon budget that is 45% of the whole context.
//
// This is a pure function of its arguments, so it is checked directly rather than through a
// route — there is no server behaviour in it and staging one would only add ways to pass.
{
  const words = (t: string) => {
    const m = t.match(/(\w+(?: \w+)*) to (\w+(?: \w+)*) words/i);
    assert.ok(m, `no word band in this prompt at all:\n${t.slice(0, 400)}`);
    return m![0].toLowerCase();
  };
  const card = INVENT('character', '', false, false);
  const room = INVENT('interiority for Halsey', '', false, true);
  const fit  = INVENT('outfit for Halsey', '', false, true);

  assert.match(words(card), /hundred and twenty to two hundred/,
    'the WHOLE-CARD band is what Seth asked for in 7b49bf7 and must not be cut by a room fix');
  assert.match(words(room), /forty to eighty/,
    'a room must have its own band. Without one it inherits the card band and eight rooms become '
    + 'a twelve-hundred-word character.');
  assert.strictEqual(words(fit), words(room),
    'an outfit and any other room are the same size of thing — if these ever diverge, one of the '
    + 'two branches was edited without the other');

  // THE FRAMING, not only the number. The card branch asks for "what it wants, what it costs,
  // relation to someone already in the ledger" — a whole person. A room asking for that is how a
  // card ends up saying who someone is eight times over, which costs the same tokens every time
  // any part of that card fires.
  assert.match(card, /what it wants, what it/,
    'the card branch must still ask for a whole thing');
  assert.doesNotMatch(room, /what it wants, what it/,
    'a room is being asked for a whole character. That is the bug, not the length.');
  assert.match(room, /ONE ROOM OF A CARD, NOT THE CARD/,
    'and it has to SAY so — the model cannot see the other seven rooms from inside this call');

  // The floor survives in the room branch too. A ceiling on its own is what made the bodies one
  // line in the first place, which is the regression 5b exists to stop and which a new branch
  // could reintroduce quietly.
  assert.match(room, /not one sentence/i,
    'the room branch needs the FLOOR as much as the card branch does');
  ok('a room is asked for at room size, and told it is a room');
}

const junk: any = await invent({ kind: 'weapon' });
assert.match(junk.error ?? '', /nothing called/, 'and a kind nobody defined is refused by name');
ok('a kind that does not exist is refused rather than assembled');

// ---- 6. Anansi's strings ride the same queue as everything else it offers
{
  calls = [];
  const said: any = await routes['POST /api/talk']({
    body: { storyId: story.id, said: 'What has this story set up and not paid off?' },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any);
  assert.ok(!said.error, said.error);
  assert.strictEqual(said.proposed, 1, 'the string is proposed, not written');
  const p = db.proposalsOf(story.id).find((x: any) => x.entry_type === 'string');
  assert.ok(p, 'and it is in the SAME queue as every other offer — a second queue is a second '
    + 'place to forget to look');
  assert.strictEqual(db.stringsOf(story.id).length, 0, 'nothing is a string until it is accepted');

  // Sewing one in makes a STRING, not an entry of the cast: a pocket of the tale's thread (#127).
  const before = db.entriesOf(story.id).length;
  await routes['POST /api/proposal']({ body: { storyId: story.id, id: p.id, accept: true },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: {}, setGen: () => {} } as any);
  const made = db.stringsOf(story.id);
  assert.strictEqual(made.length, 1, 'accepting it ties the string');
  assert.strictEqual(made[0].title, 'The letter he has not opened');
  assert.strictEqual(made[0].from_chapter, 6, 'carrying the chapter it was set up in');
  assert.strictEqual(made[0].summoned, 1, "STRING-SEWN-ON: and switched on: Sew it in puts it in play (ADR 0011)");
  assert.strictEqual(made[0].kind, 'promise', '  as a promise');
  assert.strictEqual(db.entriesOf(story.id).length, before, 'and it is not an entry');
  ok("Anansi's strings go to the proposals queue, and sewing one in adds it to the tale's thread, switched on");
}

// (6·0 was six assertions on the RELEASE prompt — what the release-notes writer had to leave out,
// and the ban on stating an outcome the commit log never stated. Removed 2026-08-29 with #24: the
// prompt is gone, because what changed is read from docs/WHATS-NEW.md rather than written by a
// model. `test/app.ts` checks the parser that replaced it.)

// ---- 6a. "remember this": a passage the writer points at, turned into a thread
//
// The writer's own recall. PLAN-06 argues against another retrieval tier and the argument is that
// a keyword or vector layer GUESSES — there is no guess here, the writer points. What is asserted
// is what the model is SHOWN, that it arrives as an instruction rather than as prose, and that it
// lands in the QUEUE with the chapter it came from rather than in canon.
{
  const { MEMO } = await import('../src/prompts.ts');
  calls = [];
  const memo = (passageId: string) => routes['POST /api/memo']({
    body: { storyId: story.id, passageId },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900 }, setGen: () => {}, defaultModel: null } as any) as any;

  const target = db.passagesOf(story.id).filter((p: any) => !p.is_break).at(-1) as any;
  const before = db.proposalsOf(story.id).length;
  const r = await memo(target.id);
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.proposed, 1, 'it proposes exactly one thread');

  // A PROPOSAL, carrying where it came from. Nothing is canon until it is accepted — the rule the
  // ledger queue has always had, and the reason this is safe to offer on any passage.
  const open = db.proposalsOf(story.id);
  assert.strictEqual(open.length, before + 1, 'and it goes in the queue');
  const made = open.find((x: any) => x.title === r.title) as any;
  assert.ok(made, 'the thread is in the queue by name');
  assert.ok(made.chapter_id, 'carrying the chapter it came from, which is what makes it auditable');
  assert.ok(!db.entriesOf(story.id).some((e: any) => e.title === r.title),
    'and nothing became canon');

  // AN INSTRUCTION, not prose. This is the whole reason it cannot be read as dialogue or as a
  // scene: Seth's "autoselecting the direct option", borrowed as a rule rather than as a mode.
  const shown = String(calls[0].messages[1].content);
  assert.match(shown, /REMEMBER IT:/, 'the passage arrives labelled as something to remember');
  assert.match(MEMO, /NOT a scene to continue/, 'and the role says it is not prose to carry on from');
  assert.match(MEMO, /NOT a line anybody is speaking/, 'nor a line somebody said');
  // F36, by construction: a passage IS finished English, so a role that let it through as-is would
  // be an F36 generator.
  assert.match(MEMO, /WRITE IT AS FACTS, NOT AS PROSE/,
    'and it must turn the passage into facts, or the prose goes back into the book word for word');
  // Narration only, like extract and remember: a character lying did not make it true.
  assert.ok(!shown.includes(SPOKEN_LINE),
    'a line of dialogue in the passage must not reach the ask');
  ok('a passage the writer points at becomes a thread in the queue, as facts and as an instruction');

  // A PERSON COMES OUT A CHARACTER (Seraphine, 2026-11-03). The nun was made from "Remember this" on
  // the passage she walks into, and every one it made was lore: the page sends no kind, the route
  // fell back to lore, and the answer had nowhere to say what the thing is.
  const kinds = calls[0].response_format?.json_schema?.schema?.properties?.type?.enum;
  assert.ok(Array.isArray(kinds) && kinds.includes('character'), `MEMO-KIND: the answer may say what kind of thread it is (${kinds})`);
  memoType = 'character';
  const nun = await memo(target.id);
  memoType = null;
  assert.ok(!nun.error, nun.error);
  assert.strictEqual((db.proposalsOf(story.id) as any[]).find((x) => x.title === 'The Nun')?.entry_type, 'character',
    'MEMO-KIND: a person the passage is about is chalked a character');
  assert.strictEqual(made.entry_type, 'lore', '  and with no kind said, it is lore as before');
  // And ITS RAW ANSWER IS KEPT: "Remember this" logged no row, so what made the nun was a guess.
  const memoRow = (new (await import('node:sqlite')).DatabaseSync(DB, { readOnly: true }) as any)
    .prepare("SELECT manifest FROM generations WHERE story_id = ? AND role = 'memo' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(story.id);
  assert.match(JSON.parse(memoRow?.manifest ?? '{}').raw ?? '', /The Nun/, 'MEMO-RAW: Remember this logs what the model answered');
  ok('a passage about a person becomes a character thread, not lore');
}

// ---- 6b. a chapter names itself when it opens
//
// The last item from round four's list. A chapter opened on two blank fields, and the author's
// note is the one thing in this app that rides near the generation point on EVERY call — so an
// empty one is the strongest lever in the engine left unused. What is asserted here is what the
// model is SHOWN and what is done with what it says; whether the name is any good is not a
// question a fake can answer.
{
  const { CHAPTER } = await import('../src/prompts.ts');
  calls = [];
  const propose = () => routes['POST /api/chapter/propose']({
    body: { storyId: story.id, chapterId: db.chapters(story.id).at(-1)!.id },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900 }, setGen: () => {}, defaultModel: null } as any) as any;

  const r = await propose();
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.title, 'The Rust Year', 'the proposed name comes back');
  assert.strictEqual(r.note, NOTE, 'and the beat arrives whole, not clipped to a line');

  // PROPOSES, writes nothing. The rule the spark and the ledger queue already follow, and the
  // reason this is safe to fire on its own when a chapter opens.
  const ch = db.chapters(story.id).at(-1) as any;
  assert.ok(!ch.title || ch.title !== 'The Rust Year', 'proposing must not write the title');
  assert.ok(!ch.authors_note, 'and must not write the note');

  const shown = String(calls[0].messages[1].content);
  assert.match(shown, /NAME CHAPTER \d+/, 'the model is told which chapter it is naming — F33 is '
    + 'that it cannot work this out for itself');
  assert.match(shown, /THE BOOK:/, 'and given the book to name it out of');
  assert.match(CHAPTER, /has not been written yet/,
    'the prompt has to say the chapter is unwritten, or it summarises the one before it');
  assert.match(CHAPTER, /note   Three to six sentences/,
    'and name a length for the beat, or it comes back as a line — the whole failure being fixed');
  ok('a chapter proposes its own name and beat, and writes neither');
}

// ---- #21 §2 · THE CAST IS ITS OWN CALL, FOR THE KINDS THAT WERE ASKED FOR ----
//
// It used to ride on the spark, and `SPARK_SCHEMA` REQUIRED two characters — so "no characters at
// this point" could not be expressed without a schema change, and a book that wanted three places
// and no people had to be given people and have them unticked. Nothing was re-rollable either.
{
  const { CAST, castSchema } = await import('../src/prompts.ts');
  calls = [];
  const cast = (kinds: string[], story: any = { title: 'The Rust Year', genre: 'noir',
      setting: 'Sutera', premise: PREMISE }) => routes['POST /api/spark/cast']({
    body: { kinds, story }, query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any) as any;

  const r = await cast(['character', 'lore']);
  assert.ok(!r.error, r.error);
  // THE KINDS ARE AN ENUM IN THE SCHEMA, which is what a grammar can actually enforce — and the
  // route drops a stray anyway. The fake answers with an `item` nobody asked for, on purpose.
  assert.deepStrictEqual(r.entries.map((e: any) => e.entryType), ['character', 'lore'],
    'only the kinds that were asked for survive');
  assert.deepStrictEqual(castSchema(['character', 'lore']).properties.entries.items.properties.kind.enum,
    ['character', 'lore'], 'and the schema says so where the grammar can read it');
  assert.ok(r.entries[0].body && !/^\[|^Vel:/.test(r.entries[0].body), `bodies arrive as a plain description, no brackets and no name in front (#110): ${r.entries[0].body}`);
  assert.deepStrictEqual(r.entries[0].keys, ['Vel'], 'and fire on their own name');
  assert.strictEqual(r.entries[1].body, 'a stair with no landing, cut into the rock.',
    'CAST-NAME-ONCE: a body that starts with its own name is not given the name twice');
  // FULLY FLESHED FROM THE START (Seth, 2026-10-26): the cast arrives with its pockets, and only the
  // ones its kind can have. Asked for as plain descriptions since ADR 0008; the fake answers as it does.
  assert.deepStrictEqual(Object.keys(r.entries[0].rooms ?? {}), ['voice'], 'CAST-POCKETS: a cast thread arrives with its pockets, its kind\'s only');
  assert.match(r.entries[0].rooms.voice.body, /^Write her lines/, '  each one an instruction');
  assert.match(CAST, /plain DESCRIPTION/, '  and the cast is asked for them as plain descriptions (ADR 0008)');
  assert.doesNotMatch(CAST, /STARTS WITH A VERB/, '  not in the instruction form, which the code now adds');
  const tale: any = routes['POST /api/stories']({ body: { title: 'Cast Pockets', premise: PREMISE, entries: r.entries },
    query: new URLSearchParams(), owner: me } as any);
  const vel: any = db.entriesOf(tale.id).find((e: any) => e.title === 'Vel');
  const voice: any = (db.addonsOf(tale.id) as any[]).find((a) => a.entry_id === vel?.id && a.slot === 'voice');
  assert.ok(voice?.active, 'CAST-ON: made into a tale, its pockets are written and on, so they reach the model');
  // #117 · WHERE EACH STANDS AS THE TALE OPENS is its first Over time entry (the thread's own text),
  // with no name in front; Always true keeps who it is. Only a person starts Always on: a place, lore
  // or an item wakes on its name, so a scene-1 detail is not in every scene's canon.
  assert.strictEqual(r.entries[0].stands, 'waits on the stair for a debtor who is late.', 'CAST-STANDS: the cast hands back where each stands, plain');
  assert.strictEqual(vel.body, 'waits on the stair for a debtor who is late.', 'CAST-STANDS: made, it is the thread\'s first Over time entry');
  assert.match(String((db.addonsOf(tale.id) as any[]).find((a) => a.entry_id === vel.id && a.slot === 'facts')?.body), /Speaks for the dead god/,
    '  and Always true keeps who it is');
  const stair: any = db.entriesOf(tale.id).find((e: any) => e.title === 'The Long Stair');
  assert.strictEqual(stair.body, 'Half its lamps are out.', '  for every kind');
  assert.deepStrictEqual(r.entries.map((e: any) => e.activation), ['always_on', 'triggered'],
    'CAST-WAKE: a person starts Always on; lore wakes on a word');
  assert.strictEqual(vel.activation, 'always_on', 'CAST-WAKE: made, the person is Always on');
  assert.strictEqual(stair.activation, 'triggered', '  and the lore is on a word');
  assert.deepStrictEqual(JSON.parse(stair.keys), ['Long Stair'], 'CAST-ONE-KEY: one keyword, its short name without the article (2026-11-01)');

  // #86 · WHO YOU PLAY IS THE WRITER'S, decided a step before the threads. The fake still names a
  // persona and somebody not in the cast; neither reaches the wizard, because the model was not asked.
  assert.ok(!('persona' in r) && !('lockedCharacter' in r), 'CAST-NO-PICK: the cast never chooses who you play, or who is Hands off');

  // IT IS GIVEN THE SKELETON AS IT STANDS, which is what makes the cast belong to the book the
  // writer has read and edited rather than to the sentence it started from — and what makes
  // asking twice a re-roll rather than a retype.
  const asked = calls.find((x: any) => /Populate a story/.test(String(x.messages?.[0]?.content ?? '')))!;
  assert.match(String(asked.messages[1].content), /The Rust Year/, 'the title it was given');
  assert.match(String(asked.messages[1].content), /KINDS WANTED: character, lore/, 'and the kinds');

  // NONE IS A REAL ANSWER, and it costs no call at all — which is the whole thing the old shape
  // could not express.
  calls = [];
  const none = await cast([]);
  assert.match(none.error, /which kinds/, 'asking for nothing says so');
  assert.strictEqual(calls.length, 0, 'and never reaches the model');
  const bare = await cast(['character'], { title: 'x', premise: '   ' });
  assert.match(bare.error, /no premise/, 'and a skeleton with nothing in it is refused too');
  ok('the cast is its own call, for the kinds asked for, against the skeleton as it stands');
}

// ---- #86 · WHO YOU PLAY REACHES THE CAST, AND THE HANDS-OFF THREAD IS WRITTEN FROM OUTSIDE ----
//
// The wizard asked who you play AFTER it wrote the threads, so the writer's own character got pockets
// that acted for them ("accepting the forty dollars"), which the lock then forbade (#81).
{
  const { CAST, REVIEW, NO_OUTCOMES, YOURS_VOICE } = await import('../src/prompts.ts');
  const base = { title: 'The Rust Year', genre: 'noir', setting: 'Sutera', premise: PREMISE };
  const cast = (story: any, extra: any = {}) => routes['POST /api/spark/cast']({
    body: { kinds: ['character', 'lore'], story, ...extra }, query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any) as any;
  const lastAsk = () => calls.filter((x: any) => /Populate a story/.test(String(x.messages?.[0]?.content ?? ''))).at(-1)!;

  calls = [];
  const r = await cast({ ...base, persona: 'Vel', lockedCharacter: 'Vel' });
  assert.ok(!r.error, r.error);
  const said = String(lastAsk().messages[1].content);
  assert.match(said, /THE WRITER PLAYS: Vel/, 'SPARK-PLAYS: the cast is told who the writer plays');
  assert.match(said, /HANDS OFF: Vel/, '  and who the model never writes');
  assert.match(String(lastAsk().messages[0].content), /OUTSIDE ONLY/,
    'SPARK-OUTSIDE: and is asked to write that thread from the outside only');
  const vel = r.entries.find((e: any) => e.title === 'Vel');
  assert.strictEqual(vel.rooms.voice.body, YOURS_VOICE('Vel'),
    'SPARK-YOURS: the Hands-off thread gets the their-lines-are-yours voice pocket, in place of the model\'s');
  assert.ok(vel.rooms.voice.on, '  switched on');
  assert.ok(!vel.rooms.interiority, 'SPARK-NO-INSIDE: and no pocket from inside their head');
  const aldis = r.entries.find((e: any) => e.title === 'Aldis');
  assert.match(aldis?.rooms?.voice?.body ?? '', /apologies/, 'SPARK-YOURS-ONE: every other thread keeps its own voice pocket');
  assert.strictEqual(r.entries.filter((e: any) => e.rooms?.voice?.body === YOURS_VOICE('Vel')).length, 1,
    '  the yours pocket is on one thread only');

  // A WRITER WHO PLAYS NOBODY GETS TODAY'S CAST: nothing named, nothing held, nothing stripped.
  calls = [];
  const free = await cast(base);
  assert.doesNotMatch(String(lastAsk().messages[1].content), /PLAYS|HANDS OFF/, 'SPARK-NOBODY: playing nobody adds nothing to the ask');
  assert.match(free.entries[0].rooms.voice.body, /^Write her lines/, '  and every voice pocket is the model\'s');
  // Hands off switched off: who you play is named, nobody is held.
  calls = [];
  const loose = await cast({ ...base, persona: 'Vel', lockedCharacter: 'Vel', lockoutOn: false });
  assert.doesNotMatch(String(lastAsk().messages[1].content), /HANDS OFF/, 'SPARK-LOOSE: Hands off switched off holds nobody');
  assert.match(loose.entries[0].rooms.voice.body, /^Write her lines/, '  and her voice is written as anyone\'s');

  // A NEW CHARACTER THE WRITER DESCRIBES is in the tale from the start, even when the model leaves her out.
  calls = [];
  const mara = await cast({ ...base, persona: 'Mara', lockedCharacter: 'Mara', personaAbout: 'a courier who owes Aldis a favour' });
  assert.match(String(lastAsk().messages[1].content), /THE WRITER PLAYS: Mara — a courier who owes Aldis a favour/,
    'SPARK-NEW: the description reaches the ask');
  const m = mara.entries.find((e: any) => e.title === 'Mara');
  assert.strictEqual(m?.body, 'a courier who owes Aldis a favour', '  and she gets a thread from it');
  assert.strictEqual(m?.rooms?.voice?.body, YOURS_VOICE('Mara'), '  with the yours pocket');

  // A RE-ROLL KEEPS WHO YOU PLAY: the one-thread re-roll is the same route with `replacing`.
  calls = [];
  const again = await cast({ ...base, persona: 'Vel', lockedCharacter: 'Vel' }, { replacing: ['The Long Stair'] });
  assert.match(String(lastAsk().messages[1].content), /HANDS OFF: Vel/, 'SPARK-REROLL: a re-roll still names who is held');
  assert.strictEqual(again.entries.find((e: any) => e.title === 'Vel')?.rooms?.voice?.body, YOURS_VOICE('Vel'),
    '  and still writes their thread from outside');

  // NEVER WHAT HAPPENS NEXT, in every wizard prompt that writes a thread (#81: "he does not take the money").
  assert.ok(CAST.includes(NO_OUTCOMES), 'SPARK-NO-OUTCOME: the cast forbids what happens next');
  assert.ok(REVIEW.includes(NO_OUTCOMES), '  and so does Try it on');
  // A rule is a pocket of the tale since 2026-10-29 (ADR 0005), so the cast never offers one as a thread.
  assert.doesNotMatch(CAST, /^\s*rule\s/m, 'SPARK-RULE: the cast offers no rule as a thread');

  // TRY IT ON reads the tale with your character chosen, and its threads come with pockets.
  calls = [];
  const rv: any = await routes['POST /api/spark/review']({
    body: { story: { ...base, persona: 'Vel', lockedCharacter: 'Vel', writingStyle: VOICE },
            entries: [{ title: 'Vel', entryType: 'character', body: '[Vel: speaks for the dead god]' }] },
    query: new URLSearchParams(), owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any);
  const rvAsk = calls.find((x: any) => /say what you would change/.test(String(x.messages?.[0]?.content ?? '')))!;
  assert.match(String(rvAsk.messages[1].content), /THE WRITER PLAYS: Vel/, 'SPARK-LOOK-PLAYS: Try it on knows who you play');
  assert.match(String(rvAsk.messages[1].content), /HANDS OFF: Vel/, '  and who is held');
  assert.deepStrictEqual(Object.keys(rv.entries[0].rooms ?? {}), ['atmosphere'],
    'SPARK-LOOK-POCKETS: its proposed threads carry pockets, their kind\'s only');
  assert.ok(rv.entries[0].rooms.atmosphere.on, '  switched on, like the cast\'s');
  // THE HANDS-OFF FLOOR HOLDS FOR TRY IT ON TOO: a proposed thread for the held character is written
  // from outside, whatever the model gave it. The writer holds somebody the cast has no thread for.
  calls = [];
  const held: any = await routes['POST /api/spark/review']({
    body: { story: { ...base, persona: 'Vel', lockedCharacter: 'Vel', writingStyle: VOICE }, entries: [] },
    query: new URLSearchParams(), owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any);
  const heldVel = held.entries.find((e: any) => e.title === 'Vel');
  assert.strictEqual(heldVel?.rooms?.voice?.body, YOURS_VOICE('Vel'), 'SPARK-LOOK-FLOOR: Try it on writes the held character from outside too');
  assert.ok(!heldVel?.rooms?.interiority, '  with nothing from inside their head');
  assert.ok(!held.entries.some((e: any) => e.title !== 'Vel' && e.rooms?.voice), '  and the yours pocket on no other thread');
  // A DESCRIBED CHARACTER gets a thread even when the cast asks for places only.
  calls = [];
  const placesOnly = await routes['POST /api/spark/cast']({
    body: { kinds: ['lore'], story: { ...base, persona: 'Mara', lockedCharacter: 'Mara', personaAbout: 'a courier' } },
    query: new URLSearchParams(), owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any) as any;
  const mara2 = placesOnly.entries.find((e: any) => e.title === 'Mara');
  assert.strictEqual(mara2?.rooms?.voice?.body, YOURS_VOICE('Mara'),
    'SPARK-NEW-ANY: a character the writer described gets a thread, written from outside, whatever kinds were asked for');

  // CREATE MAKES THE DESCRIBED CHARACTER'S THREAD, even when the cast step never ran (Seth, 2026-10-27):
  // from the writer's words, from outside, with the yours pocket on.
  const mk = (body: any) => routes['POST /api/stories']({ body, query: new URLSearchParams(), owner: me } as any) as any;
  const bare: any = mk({ title: 'Courier', premise: PREMISE, persona: 'Mara', lockedCharacter: 'Mara',
    personaAbout: 'a courier who owes Aldis a favour', entries: [] });
  const maraT: any = db.entriesOf(bare.id).find((e: any) => e.title === 'Mara');
  assert.ok(maraT, 'CREATE-YOU: a described character gets a thread at Create with no cast');
  const maraA = (db.addonsOf(bare.id) as any[]).filter((a) => a.entry_id === maraT.id);
  assert.match(maraA.find((a) => a.slot === 'facts')?.body ?? '', /a courier who owes Aldis a favour/, '  written from the description');
  const yv = maraA.find((a) => a.slot === 'voice');
  assert.strictEqual(yv?.body, YOURS_VOICE('Mara'), '  with the yours pocket');
  assert.ok(yv?.active, '  switched on');
  const twice: any = mk({ title: 'Courier 2', premise: PREMISE, persona: 'Mara', personaAbout: 'a courier',
    entries: [{ title: 'Mara', entryType: 'character', body: '[Mara: the cast wrote her]' }] });
  assert.strictEqual(db.entriesOf(twice.id).filter((e: any) => e.title === 'Mara').length, 1,
    'CREATE-YOU-ONCE: and never a second thread when the cast already wrote one');
  const free3: any = mk({ title: 'Courier 3', premise: PREMISE, persona: 'Mara', personaAbout: 'a courier', entries: [] });
  const looseM: any = db.entriesOf(free3.id).find((e: any) => e.title === 'Mara');
  assert.ok(!(db.addonsOf(free3.id) as any[]).some((a) => a.entry_id === looseM?.id && a.slot === 'voice'),
    'CREATE-YOU-LOOSE: no yours pocket when nobody is held');

  // WHO IS HANDS OFF CAN CHANGE AFTER THE THREADS ARE WRITTEN: a spark Create moves the yours pocket
  // to the thread held now, written from outside, and takes it off the one held before.
  const moved: any = mk({ title: 'Moved', premise: PREMISE, persona: 'Aldis', lockedCharacter: 'Aldis', spark: true, entries: [
    { title: 'Vel', entryType: 'character', body: '[Vel: the Murmur]',
      rooms: { voice: { name: 'Their lines are yours', body: YOURS_VOICE('Vel'), on: true } } },
    { title: 'Aldis', entryType: 'character', body: '[Aldis: a debtor]',
      rooms: { voice: { name: 'Debtor', body: 'Write his lines as apologies.', on: true },
               interiority: { name: 'Shame', body: 'Never let him say it.', on: true } } }] });
  const byTitle = (t: string) => { const id = (db.entriesOf(moved.id) as any[]).find((e) => e.title === t)?.id;
    return (db.addonsOf(moved.id) as any[]).filter((a) => a.entry_id === id); };
  assert.ok(!byTitle('Vel').some((a) => a.slot === 'voice'), 'CREATE-HELD: the yours pocket leaves the one no longer held');
  assert.strictEqual(byTitle('Aldis').find((a) => a.slot === 'voice')?.body, YOURS_VOICE('Aldis'), '  and goes to the one held now');
  assert.ok(!byTitle('Aldis').some((a) => a.slot === 'interiority'), '  written from outside');

  // THE TALE'S OWN POCKETS ride through Create (#75's instruction slot), switched on; a blank one does not.
  const own: any = mk({ title: 'Own', premise: PREMISE, entries: [],
    talePockets: [{ name: 'Slow burn', body: 'Keep it a slow burn.' }, { name: 'Empty', body: '   ' }] });
  const tp = (db.addonsOf(own.id) as any[]).filter((a) => !a.entry_id && a.slot === 'instruction');
  assert.deepStrictEqual(tp.map((a) => a.name), ['Slow burn'], 'CREATE-TALE-POCKETS: the tale\'s own pockets are made, the blank one is not');
  assert.ok(tp[0]?.active, '  and on');
  ok('who you play reaches the cast and Try it on, and the Hands-off thread is written from outside');
}

// ---- #21 §3 · STEP FIVE: SHE READS THE WHOLE THING BACK ----
//
// The first moment anything can be judged together: the premise was written before the cast
// existed, and the cast was written from a premise the writer may since have rewritten.
{
  calls = [];
  const review = (story: any, entries: any[] = []) => routes['POST /api/spark/review']({
    body: { story, entries }, query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any) as any;

  const r = await review({ title: 'The Salt Ledger', genre: 'noir', setting: 'Sutera',
    premise: PREMISE, writingStyle: VOICE, direction: '' },
    [{ title: 'Vel', entryType: 'character', body: '[Vel: speaks for the dead god]' }]);
  assert.ok(!r.error, r.error);

  // ONLY WHAT THE WIZARD CAN APPLY, and only what is actually a change.
  assert.deepStrictEqual(r.changes.map((c: any) => c.field), ['title'],
    'a field the wizard cannot apply is refused, and a value identical to the one it replaces is '
    + 'not a change — that is the shape a model reaching for something to say produces');
  assert.strictEqual(r.changes[0].value, 'The Tide Clerk');

  // AND NEVER A THREAD THE CAST ALREADY HAS. The prompt says so; this is what enforces it.
  assert.deepStrictEqual(r.entries.map((e: any) => e.title), ['The Quay Office'],
    'a name already in the cast is dropped rather than proposed twice');
  assert.strictEqual(r.entries[0].body, 'A room of ledgers above the water.', 'as a plain description, no brackets (#110)');

  // IT IS GIVEN THE CAST AS WELL AS THE BOOK, which is the only reason it can notice they disagree.
  const asked = calls.find((x: any) => /say what you would change/.test(String(x.messages?.[0]?.content ?? '')))!;
  assert.match(String(asked.messages[1].content), /Vel/, 'the cast reaches the ask');
  assert.match(String(asked.messages[1].content), /The Salt Ledger/, 'and so does the book');
  assert.match(String(asked.messages[0].content), /RETURN NOTHING RATHER THAN REACH/,
    'and the role is told an empty answer is the right one for a skeleton that hangs together');

  calls = [];
  const bare = await review({ title: 'x', premise: '  ' });
  assert.match(bare.error, /no premise/, 'a skeleton with nothing in it is refused');
  assert.strictEqual(calls.length, 0, 'and never reaches the model');
  ok('the second look proposes only what the wizard can apply, and never a thread already in the cast');
}

// ---- 7. the spark's premise and prose voice come back big enough to write from
// They were "two or three sentences" and "one sentence" — thinner than the manual form on the same
// screen asks for, so the skeleton had to be rewritten before the first passage. Three things can
// regress here on their own: the prompt asking for a line again, the room it is asked for in, and
// the retry that a longer answer makes worth having. All three are asserted.
{
  const { SPARK, SPARK_SCHEMA, DEFAULT_VOICE } = await import('../src/prompts.ts');
  calls = [];
  const spark = (idea: string) => routes['POST /api/spark']({
    body: { idea }, query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any) as any;

  const skel = await spark('A broke ex-sergeant owes a moneylender more than he can pay.');
  assert.ok(!skel.error, skel.error);
  assert.strictEqual(skel.story.premise, PREMISE,
    'the premise arrives whole — a cap on the field would close it mid-word with the JSON still '
    + 'valid, which is F25 and would look like a finished answer');
  // #123 · THE TALE STARTS WITH THE WRITER'S OWN VOICE. The one the spark wrote comes back apart
  // from the story, offered, and is never the tale's unless the writer chooses it.
  assert.strictEqual(skel.voiceOffer, VOICE, 'VOICE-OFFER: the voice the spark wrote arrives whole, as an offer');
  assert.strictEqual(skel.story.writingStyle, DEFAULT_VOICE,
    'VOICE-START: with no Account Voice set, the tale starts with the shipped one');
  const ACCOUNT = 'Narrate close and cold. Never name a feeling the weather can show.';
  db.setPrompt(me, 'voice', ACCOUNT);
  const mine = await spark('A broke ex-sergeant owes a moneylender more than he can pay.');
  db.setPrompt(me, 'voice', '');
  assert.strictEqual(mine.story.writingStyle, ACCOUNT, 'VOICE-START: the tale starts with the Account Voice');
  assert.strictEqual(mine.voiceOffer, VOICE, '  and the spark\'s is still offered beside it');
  ok('VOICE-START: a new tale starts with the Account Voice, and the spark\'s Voice is only offered');

  // #21 §2. THE CEILING CAME DOWN WITH THE ASK, and this check came down with it. The spark asked
  // for the cast as well until 2026-08-29 — roughly 800 words in one object, which is why the floor
  // here was 3,400. It asks for the book alone now: a premise of eight to twelve sentences, a
  // setting of four to eight, and a hundred words of voice, near 400 words, and JSON with escaping
  // runs about two tokens a word. The rule the number has to satisfy is unchanged, which is why
  // this is a smaller floor and not a deleted check: room for the ask, whatever the ask is.
  assert.ok(Number(calls[0].max_tokens) >= 1800,
    `the spark is asked for in ${calls[0].max_tokens} tokens, and its own prompt asks for about `
    + '400 words. Raise the ceiling with the ask, in the same commit.');
  // AND IT NO LONGER ASKS FOR THE CAST AT ALL. This is the half that would otherwise rot quietly:
  // a prompt that drifts back to requesting characters would be answered, the schema would drop
  // them, and the tokens would be spent on prose nobody ever sees.
  assert.deepStrictEqual(skel.entries, [], 'the scaffold call returns no cast');
  assert.ok(!SPARK_SCHEMA.required.includes('characters' as never),
    'and cannot require one — "no characters at this point" was unreachable while it did');
  assert.match(SPARK, /NO CHARACTERS/, 'the prompt says so on its own line');

  // EVERY field the writer starts from has to name a length, and the lengths are read out of the
  // prompt rather than pinned as phrases: this asserted "premise is four to six sentences"
  // verbatim and went red the moment Seth asked for more detail, which is wording rot, not a
  // regression. What must be true is that each of the four names a band at all — a field with no
  // length comes back as a line, which is the failure being fixed.
  for (const [what, re] of [
    // ADR 0009: the premise is one paragraph, the opening, and that is its length.
    ['the premise', /premise is ONE paragraph/],
    ['the setting', /setting is no more than \w+\s+sentences/],
    // (the character length band moved to CAST with the cast itself — asserted below)
    ['the voice', /One rule per line, twelve lines at\s+most/],
  ] as const) assert.match(SPARK, re,
    `${what} needs a length worth filling, or the model gives it a line`);
  // THE FLOOR PARAGRAPH IS GONE (ADR 0009, 2026-10-28). It said every band was a floor as much as
  // a ceiling, and it pushed the premise long: the live one came back at nineteen sentences against
  // the eight to twelve asked, and a one-paragraph opening cannot share a prompt with a push for
  // length. (It was added because bands were read as ceilings; that is now the lesser risk.)
  assert.doesNotMatch(SPARK, /floor\s+as\s+much\s+as\s+a\s+ceiling|A line is not enough/i,
    'SPARK-NO-FLOOR: nothing in the spark pushes the fields to run long');
  for (const [what, re] of [
    ['a premise is not a blurb', /not a\s+blurb\.\s+No marketing language, no rhetorical questions/],
    // 2026-10-29: the voice came back as a description ("<how the sentences run>; …"), and F37 is
    // what a description buys: a rule buried in a run-on line holds a fraction as well as one on its
    // own line naming narration. It is asked for as instructions now, one per line.
    ['the voice is instructions, one per line, naming narration', /write it as\s+instructions, not a\s+description/],
    ['the voice names narration on the lines about it', /says "Narration"/],
    ['the genre is the shelf, not the category', /the\s+shelf a bookshop would put it\s+on/],
    ['spice is inferred, 2 with no signal', /use 2 when there is no signal/],
    ['genre is two or three comma-separated tags', /comma-separated list of two or three tags/],
  ] as const) assert.match(SPARK, re, `${what} — kept from the version this replaced`);
  // tidyGenre already splits, trims and de-duplicates on the way in. The prompt must not pay for
  // that work twice; it says the shape it wants and stops.
  assert.doesNotMatch(SPARK, /lower ?case|de-?duplicat/i,
    'genre normalisation is db.tidyGenre\'s job and test/db.ts proves it');
  assert.ok(!('maxLength' in (SPARK_SCHEMA.properties.premise as any))
         && !('maxLength' in (SPARK_SCHEMA.properties.writingStyle as any)),
    'and neither long field may be capped in the grammar');
  ok('the spark asks for a premise and a voice worth writing from, in the room they need');

  // 2026-10-29 · PROMPT CLASHES, from the prompt audit. Each is the class the spice 5 line was: two
  // instructions in one prompt that cannot both be followed, or a quoted line a model copies.
  {
    const P = await import('../src/prompts.ts') as any;
    // THE VOICE DOES NOT WRITE ABOUT SPICE. The spice level is its own picker; a voice that restates
    // it goes stale the day the writer moves the level.
    const voicePart = P.SPARK.slice(P.SPARK.indexOf('The writing style is'), P.SPARK.indexOf('Infer the spice level'));
    assert.ok(voicePart.length > 200, 'the voice paragraph must be findable');
    assert.doesNotMatch(voicePart, /spice/i, 'SPARK-NO-SPICE: the voice the spark writes says nothing about the spice level');
    // STYLE IS GENRE TEXTURE, AND NOTHING THE VOICE ALREADY OWNS (Seth chose this, 2026-10-29).
    assert.doesNotMatch(P.STYLE_NOTE, /how long its sentences run|how close the narration sits|how much of a scene is\s+dialogue/,
      'STYLE-TEXTURE: the style note no longer asks for what the voice says');
    assert.match(P.STYLE_NOTE, /texture/, '  and asks for the genre\'s texture');
    // ONE GENRE WORDING, in the spark and in a genre re-roll.
    assert.ok(P.GENRE_FORM && P.SPARK.includes(P.GENRE_FORM) && P.SPARK_FIELD.includes(P.GENRE_FORM),
      'GENRE-FORM: the spark and the re-roll carry the same genre wording');
    // A COUNT IS A CEILING, NEVER A BAND (F18: a band reads as a target), in the spark, which is
    // read on every call for the life of the tale. A card's and a room's bodies KEEP their bands:
    // a ceiling alone made those bodies one line (the room-floor check above), so the floor stays.
    assert.doesNotMatch(P.SPARK, /\b(two|three|four|five|six|eight|ten)\s+to\s+(three|four|five|eight|ten|twelve)\b/i,
      'COUNT-CEILING: the spark asks for no band of sentences, lines or questions');
    const src = readFileSync(new URL('../src/prompts.ts', import.meta.url), 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    // NO QUOTED EXAMPLE A MODEL CAN LIFT. Each of these came back from a prompt, as written.
    for (const q of ['Vel finds', 'arm broken', 'ferry pilot', 'Mourning grey', 'Court plate', 'Charon', 'Radahn',
                     'Imperium executes', 'counts doorways'])
      assert.ok(!src.includes(q), `QUOTED-EXAMPLE: "${q}" is still quoted in a prompt`);
  }
  ok('the voice leaves spice to its picker, the style note is texture only, one genre wording, counts are ceilings, no quoted examples');

  // A longer answer is a likelier truncation, so this was the last caller still on `structured`
  // with no retry: an object that ran out of room came back as "the spark returned nothing usable".
  breakFirst = true; calls = [];
  const again = await spark('A broke ex-sergeant owes a moneylender more than he can pay.');
  breakFirst = false;
  assert.strictEqual(calls.length, 2, 'a truncated skeleton is retried once');
  assert.ok(!again.error, again.error);
  assert.strictEqual(again.story.premise, PREMISE, 'and the second answer arrives whole');
  ok('a spark that runs out of room is retried rather than handed back as nothing usable');
}

// ---- 7b. ADR 0009 · THE PREMISE IS THE OPENING, AND THE OPEN QUESTIONS COME BACK APART FROM IT
// The premise is sent whole at the top of every prompt and never trimmed, so an arc in it (who wants
// what, what it costs, who else wants something incompatible) kept the model steering to an ending.
// One wording, PREMISE_FORM, in all three prompts that write a premise, so a re-roll or a Talk
// change cannot bring the arc back. The wording itself is NOT MEASURED; these check only that it
// is the one asked for, everywhere, and that its examples are shapes.
{
  const { SPARK, SPARK_FIELD, TALK_SETUP, REVIEW, PREMISE_FORM, SPARK_SCHEMA } = await import('../src/prompts.ts') as any;
  assert.ok(typeof PREMISE_FORM === 'string' && PREMISE_FORM.length > 0, 'PREMISE-FORM: one wording for the premise exists');
  assert.match(PREMISE_FORM, /ONE paragraph/, 'PREMISE-FORM: one paragraph');
  assert.match(PREMISE_FORM, /opening/i, 'PREMISE-FORM: and it is the opening');
  // It is read on every call for the life of the tale, so it is how the tale BEGAN, not a standing
  // "now": the shape itself carries "as the tale opens".
  assert.match(PREMISE_FORM, /BEGINS/, 'PREMISE-BEGINS: the premise says how the tale begins');
  assert.match(PREMISE_FORM, /"[^"]*as\s+the\s+tale\s+opens[^"]*"/, 'PREMISE-BEGINS: and its shape is set at the opening');
  assert.match(PREMISE_FORM, /Never\s+how\s+it\s+ends,\s+what\s+it\s+costs\s+or\s+what\s+anyone\s+will\s+do/,
    "PREMISE-FORM: never the ending, the cost or anyone's next move (ADR 0009's words)");
  // SHAPES, NOT EXAMPLES: every quoted span is a shape with an angle-bracket slot, never a sentence
  // the real model can copy word for word (see POCKET_FORM).
  const quoted = [...PREMISE_FORM.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  assert.ok(quoted.length > 0, 'PREMISE-SHAPE: the form gives a shape');
  for (const q of quoted) assert.match(q, /<[^>]+>/, `PREMISE-SHAPE: a quoted example is a shape, not a sentence: "${q}"`);
  for (const [name, text] of [['SPARK', SPARK], ['SPARK_FIELD', SPARK_FIELD], ['TALK_SETUP', TALK_SETUP], ['REVIEW', REVIEW]] as const) {
    assert.ok(text.includes(PREMISE_FORM), `PREMISE-ONE: ${name} asks for the premise in the one wording`);
    assert.doesNotMatch(text, /who else wants something incompatible|eight to twelve sentences/,
      `PREMISE-NO-ARC: ${name} no longer asks for the arc`);
  }
  // The open questions: asked for apart from the premise, two to four, each a title and one line.
  const qs = SPARK_SCHEMA.properties.questions;
  assert.ok(qs && qs.type === 'array' && qs.minItems === 2 && qs.maxItems === 4,
    'QUESTIONS-SCHEMA: the spark returns two to four open questions');
  assert.deepStrictEqual([...qs.items.required].sort(), ['line', 'title'], 'QUESTIONS-SCHEMA: each a title and one line');
  assert.match(SPARK, /open questions/i, 'QUESTIONS-ASK: the spark asks for them');
  for (const q of [...SPARK.matchAll(/"([^"]*)"/g)].map((m) => m[1]).filter((q) => /question|line/i.test(q)))
    assert.match(q, /<[^>]+>/, `QUESTIONS-SHAPE: quoted as a shape: "${q}"`);
  // #121 · THE SETTING HOLDS THE PLACE, THE FIRST SCENE HOLDS THE MOMENT. The setting is sent on
  // every call for the life of the tale, so weather, light or the hour written there hold forever.
  const settingAsk = /The setting is[\s\S]*?(?=\n\n)/.exec(SPARK)?.[0] ?? '';
  assert.ok(settingAsk, 'SETTING-ASK: the spark still asks for a setting');
  assert.doesNotMatch(settingAsk, /weather|light|hour|time of (?:day|night)|season/i,
    'SETTING-STAYS: the setting asks for no weather, light or hour');
  assert.match(settingAsk, /whole tale/i, 'SETTING-STAYS: it asks for what holds for the whole tale');
  const opens = SPARK_SCHEMA.properties.opensWith;
  assert.ok(opens && opens.type === 'string' && (SPARK_SCHEMA.required as readonly string[]).includes('opensWith'),
    'OPENS-SCHEMA: the spark returns the moment the tale opens in, as its own field');
  const opensAsk = /The opening moment is[\s\S]*?(?=\n\n)/.exec(SPARK)?.[0] ?? '';
  assert.match(opensAsk, /weather/i, 'OPENS-ASK: the weather goes to the opening moment');
  assert.match(opensAsk, /light/i, 'OPENS-ASK: and the light');
  assert.match(opensAsk, /time/i, 'OPENS-ASK: and the time');
  const opensQuoted = [...opensAsk.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  assert.ok(opensQuoted.length > 0, 'OPENS-SHAPE: the opening moment is given a shape');
  for (const q of opensQuoted) assert.match(q, /<[^>]+>/, `OPENS-SHAPE: quoted as a shape: "${q}"`);

  // The re-roll sends the same wording on the wire, and the spark hands the questions back.
  calls = [];
  const ctx = (body: any) => ({ body, query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any);
  const rr: any = await routes['POST /api/spark/field'](ctx({ field: 'premise', story: { title: 'The Rust Year' }, idea: 'A debt.' }));
  assert.ok(!rr.error, rr.error);
  assert.ok(String(calls.at(-1).messages[0].content).includes(PREMISE_FORM), 'PREMISE-REROLL: the premise re-roll is asked in the same shape');
  const sk: any = await routes['POST /api/spark'](ctx({ idea: 'A broke ex-sergeant owes a moneylender more than he can pay.' }));
  assert.deepStrictEqual(sk.questions, QUESTIONS.map((q) => ({ title: q.title, line: q.line })),
    'QUESTIONS-BACK: the open questions come back beside the skeleton');
  assert.ok(!('questions' in sk.story), 'QUESTIONS-APART: and not inside the story, so they never land in the premise');
  ok('the premise is asked for as the opening in one wording everywhere, and the open questions come back apart from it');

  // THE TICKED QUESTIONS ARE MADE AS STRINGS AT CREATE, from scene 1, summoned so they reach the
  // model with the order not to resolve them, and inside the one create's rollback.
  const mk = (body: any) => routes['POST /api/stories']({ body, query: new URLSearchParams(), owner: me } as any) as any;
  const tale: any = mk({ title: 'Open Questions', premise: PREMISE, spark: true, entries: [],
    strings: [QUESTIONS[0], { title: '   ', line: 'a question with no title is none' }] });
  assert.ok(!tale.error, tale.error);
  const made = db.stringsOf(tale.id);
  assert.deepStrictEqual(made.map((x: any) => [x.title, x.body, x.from_chapter, x.status, x.summoned, x.kind]),
    [[QUESTIONS[0].title, QUESTIONS[0].line, 1, 'open', 1, 'question']],
    'QUESTIONS-STRINGS: each one sent is a summoned, open question from scene 1; a blank one is not');
  const plain: any = mk({ title: 'No Questions', premise: PREMISE, entries: [] });
  assert.deepStrictEqual(db.stringsOf(plain.id), [], 'QUESTIONS-NONE: a create that sends none makes none');
  // A Create that fails after the strings are written leaves none of them behind.
  const owned = () => (db.listStories(me) as any[]).flatMap((s) => db.stringsOf(s.id)).length;
  const before = owned();
  const refused: any = mk({ title: 'Refused', premise: PREMISE, entries: [], strings: QUESTIONS,
    seed: [{ storyId: 'no-such-tale', entryId: 'no-such-thread' }] });
  assert.match(String(refused.error), /nothing was made/, 'QUESTIONS-ROLLBACK: a refused copy fails the Create');
  assert.strictEqual(owned(), before, 'QUESTIONS-ROLLBACK: and its strings go with it');
  ok('the ticked open questions become strings at Create, inside its rollback');

  // #121 · THE OPENING MOMENT COMES BACK WITH THE SKELETON AND BECOMES SCENE 1'S OPENS WITH AT CREATE,
  // inside the one create's rollback. Opens with is sent only until the scene has prose, which is
  // the right lifetime for the weather, the light and the hour.
  assert.strictEqual(sk.story.opensWith, OPENS, 'OPENS-BACK: the spark hands back the opening moment, trimmed');
  const opened: any = mk({ title: 'Opens', premise: PREMISE, setting: 'Sutera', entries: [], opensWith: `  ${OPENS}\n` });
  assert.ok(!opened.error, opened.error);
  assert.strictEqual((db.chapters(opened.id)[0] as any).opens_with, OPENS,
    "OPENS-SCENE: Create writes the opening moment to scene 1's Opens with");
  assert.strictEqual(db.getStory(opened.id).setting, 'Sutera', 'OPENS-SCENE: and leaves the setting as it was sent');
  const blank: any = mk({ title: 'Opens Blank', premise: PREMISE, entries: [], opensWith: '   ' });
  assert.strictEqual((db.chapters(blank.id)[0] as any).opens_with, null, 'OPENS-NONE: a blank one writes no Opens with');
  const tales = () => (db.listStories(me) as any[]).length;
  const had = tales();
  const nope: any = mk({ title: 'Opens Refused', premise: PREMISE, entries: [], opensWith: OPENS,
    seed: [{ storyId: 'no-such-tale', entryId: 'no-such-thread' }] });
  assert.match(String(nope.error), /nothing was made/, 'OPENS-ROLLBACK: a refused copy fails the Create');
  assert.strictEqual(tales(), had, 'OPENS-ROLLBACK: and takes the scene and its Opens with with the tale');
  ok("the opening moment comes back apart from the setting and becomes scene 1's Opens with at Create");

  // THE SCENE BRIEF KEEPS THE QUESTIONS OPEN AND PRESSES THE PROMISES (#124). Every open string went
  // as "UNPAID PROMISES" to be pressed on, which pushed the tale's own questions to an answer through
  // the brief that rides every call; #116 then sent every string as a question, which left a writer's
  // own promise with nothing pressing it toward payment. Each kind now has its own line.
  const { CHAPTER } = await import('../src/prompts.ts');
  assert.doesNotMatch(CHAPTER, /destination\s+is\s+set/, 'CHAPTER-NO-DESTINATION: no field that no longer exists');
  assert.match(CHAPTER, /unpaid\s+promise[^.]*pressed\s+on/i, 'CHAPTER-PROMISE: an unpaid promise in play may be pressed on, as before #116');
  assert.match(CHAPTER, /open\s+questions[^.]*complicate\s+it,\s+never\s+answer\s+it/i, 'CHAPTER-OPEN: an open question may be complicated, never answered');
  calls = [];
  const brief: any = await routes['POST /api/chapter/propose'](ctx({ storyId: tale.id, chapterId: db.chapters(tale.id).at(-1)!.id }));
  assert.ok(!brief.error, brief.error);
  const shownBrief = String(calls.at(-1).messages[1].content);
  assert.doesNotMatch(shownBrief, /UNPAID PROMISES/, 'BRIEF-OPEN: a tale with only questions is sent no promises');
  assert.match(shownBrief, /OPEN QUESTIONS[^\n]*never answer[^\n]*Whether the debt is real/,
    'BRIEF-OPEN: it is shown them as open questions, with the order never to answer one');
  // The writer adds a promise of her own: it goes on its own line, and not among the questions.
  db.upsertString(tale.id, { title: 'The letter under the floor', fromChapter: 1 });
  calls = [];
  await routes['POST /api/chapter/propose'](ctx({ storyId: tale.id, chapterId: db.chapters(tale.id).at(-1)!.id }));
  const both = String(calls.at(-1).messages[1].content);
  assert.match(both, /^UNPAID PROMISES: The letter under the floor$/m, 'BRIEF-PROMISE: a promise is sent as an unpaid promise, as before #116');
  // #125 · AND IT IS GIVEN WHERE THE TALE STANDS, NOT THE PREMISE, once a hem has written one.
  const lastCh: any = db.chapters(tale.id).at(-1);
  const tt = db.taleThread(tale.id)!;
  db.upsertState(tale.id, tt, { fromChapter: Number(lastCh.idx), body: 'Vel holds the ledger now, and the stair is watched.', label: 'the ledger' });
  calls = [];
  await routes['POST /api/chapter/propose'](ctx({ storyId: tale.id, chapterId: db.chapters(tale.id).at(-1)!.id }));
  const stood = String(calls.at(-1).messages[1].content);
  assert.match(stood, /THE BOOK:[^\n]*Vel holds the ledger now/, 'BRIEF-STANDS: the scene brief reads where the tale stands');
  assert.ok(!stood.includes(String(db.getStory(tale.id).premise).slice(0, 40)), 'BRIEF-STANDS: and not the premise');
  assert.doesNotMatch(both.match(/^OPEN QUESTIONS.*$/m)?.[0] ?? '', /letter under the floor/, 'BRIEF-PROMISE: and not as an open question');
  assert.match(both, /^OPEN QUESTIONS[^\n]*Whether the debt is real$/m, '  while the question stays a question');
  ok('the scene brief keeps the open questions open and presses the promises, each on its own line');
}

// ---- #117 · NEW TALE'S THREADS ARE FULL FROM THE START, AND CAN CHANGE
// Seth, 2026-10-28: Always true holds identity only; wants and secrets go in interiority, and each
// new thread gets a scene-1 Over time entry (where it stands at the opening) so they can change.
// The cast asked for "what it costs" (arc language) and "every pocket its kind can have", which
// clashed with POCKET_FORM's "leave out a pocket its text gives you nothing for". Checked on the text
// only; the wording is NOT MEASURED.
{
  const { CAST, castSchema, NO_OUTCOMES, TALK_SETUP, FROM_WEB, REVIEW } = await import('../src/prompts.ts') as any;
  assert.doesNotMatch(CAST, /what it costs/i, 'CAST-NO-COST: the cast no longer asks what it costs');
  assert.doesNotMatch(CAST, /every pocket its kind can have/i, 'CAST-MATERIAL: it no longer asks for every pocket');
  assert.match(CAST, /premise and setting give/i, '  but for the pockets the premise and setting give material for');
  assert.match(CAST, /Always true[^.]*identity|identity only/i, 'CAST-IDENTITY: Always true is identity only');
  assert.match(CAST, /wants? and (?:their )?secrets?[^.]*interiority/i, 'CAST-WANTS: wants and secrets go in interiority');
  assert.match(CAST, /stands[^.]*as the tale opens/i, 'CAST-STANDS: it asks where each thread stands as the tale opens');
  assert.ok(castSchema(['character']).properties.entries.items.required.includes('stands'),
    'CAST-STANDS: and the schema requires it');
  // NO_OUTCOMES gave an outcome as its example ("he does not take the money"): a shape now.
  assert.doesNotMatch(NO_OUTCOMES, /money/, 'NO-OUTCOMES-SHAPE: its old outcome is gone');
  const quoted = [...NO_OUTCOMES.matchAll(/"([^"]*)"/g)].map((m: any) => m[1]);
  assert.ok(quoted.length > 0, 'NO-OUTCOMES-SHAPE: it still shows the form');
  for (const q of quoted) assert.match(q, /<[^>]+>/, `NO-OUTCOMES-SHAPE: a quoted example is a shape: "${q}"`);
  // Every prompt that writes a thread at setup forbids what happens next (audit, problem I and J).
  for (const [name, text] of [['CAST', CAST], ['REVIEW', REVIEW], ['TALK_SETUP', TALK_SETUP],
    ['FROM_WEB', FROM_WEB('character', 'Paul Atreides', ['voice'])]] as const)
    assert.ok(text.includes(NO_OUTCOMES), `NO-OUTCOMES-ONE: ${name} carries NO_OUTCOMES`);
  // FROM_WEB's register examples were real subjects, and one taught a published fate as a fact to
  // write ("came back as The Preacher"). They are shapes now.
  const web = FROM_WEB('character', 'Paul Atreides', ['voice']);
  assert.doesNotMatch(web, /Preacher|Ferrus|Gorgon|Unterzee/, 'FROM-WEB-SHAPE: no real subject is left as an example');
  assert.match(web, /RIGHT\s+<[^>]+>/, 'FROM-WEB-SHAPE: its RIGHT example is a shape');
  ok('the cast asks for identity in Always true, wants in interiority, where each stands at the opening, and no outcomes');

  // TRY IT ON CHECKS THE THREADS AGAINST EACH OTHER AND THE PREMISE (#81: Seth "accepts the forty
  // dollars" while the forty-dollars thread says he does not). It is sent each thread's Always true,
  // where it stands and its pockets, and hands back each contradiction with both places and one fix.
  // A fix must change one of the two places it names, in a thread the draft has. Code finds what it
  // can on its own (an age given two ways in one thread) and puts those first.
  const { agesSaid } = await import('../src/contradictions.ts');
  for (const [text, want] of [['Temple clerk; 28; speaks for the dead god.', [28]], ['A 34-year-old face, lined early.', [34]],
    ['aged 40, and tired', [40]], ['She is 19 years old.', [19]], ['28', [28]],
    // Numbers that are not ages, which the detector was not written around.
    ['owes 40; still unpaid', []], ['Room 12; damp', []], ['forty dollars on the table', []],
    ['arrived in 1909 with 3 sisters', []], ['the 2-year lease', []]] as [string, number[]][])
    assert.deepStrictEqual(agesSaid(text), want, `AGES: ${JSON.stringify(text)} gives ${JSON.stringify(want)}`);
  calls = [];
  const draft = { story: { title: 'The Rust Year', premise: PREMISE, setting: 'Sutera', persona: 'Vel', lockedCharacter: 'Vel' },
    entries: [
      { title: 'Vel', entryType: 'character', body: 'Temple clerk; 28; speaks for the dead god.', stands: 'Waits on the stair for Aldis.',
        rooms: { interiority: { name: 'Debt', body: 'She will forgive the debt, and hides that she already has.' },
                 appearance: { name: 'Face', body: 'A 34-year-old face, lined early.' } } },
      { title: 'Aldis', entryType: 'character', body: 'A debtor; 50; a ferryman once.', stands: 'Hiding in the lower tiers.' }] };
  const rv: any = await routes['POST /api/spark/review']({ body: draft, query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any);
  assert.ok(!rv.error, rv.error);
  const reviewAsk = String(calls.find((x: any) => /say what you would change/.test(String(x.messages?.[0]?.content ?? ''))).messages[1].content);
  assert.match(reviewAsk, /Hiding in the lower tiers/, 'REVIEW-READS: Try it on is sent where each thread stands');
  assert.match(reviewAsk, /She will forgive the debt/, '  and its pockets');
  assert.match(REVIEW, /contradict/i, 'REVIEW-ASKS: and asked for contradictions');
  assert.deepStrictEqual(rv.contradictions, [
    { one: { thread: 'Vel', part: 'always_true', says: '28' }, other: { thread: 'Vel', part: 'appearance', says: '34' },
      fix: { thread: 'Vel', part: 'appearance', text: 'A 28-year-old face, lined early.' },
      why: 'Vel\'s age is given two ways.', by: 'code' },
    { one: { thread: 'Vel', part: 'stands', says: 'Waits on the stair for Aldis.' },
      other: { thread: 'Aldis', part: 'stands', says: 'Hiding in the lower tiers.' },
      fix: { thread: 'Aldis', part: 'stands', text: 'Climbing the stair to meet Vel, late.' },
      why: 'She waits for him on the stair while he hides below.', by: 'model' },
    { one: { thread: null, part: 'premise', says: 'Aldis owes the moneylender.' },
      other: { thread: 'Vel', part: 'interiority', says: 'She will forgive the debt.' },
      fix: { thread: null, part: 'premise', text: 'Aldis, on the stair, owes Vel more than he can pay.' },
      why: 'The premise names another lender.', by: 'model' },
  ], 'REVIEW-CONTRADICTIONS: code first, then the model\'s; a fix to a thread the draft lacks, to neither place, or to the held one\'s inside, is dropped');
  ok('Try it on reads every thread whole and hands back each contradiction with both places and one fix');
}

// ---- #118 · THE LEDGER REGISTER GIVES A SHAPE, NOT A CHARACTER TO COPY
// Its example was a whole character ("Mara: The Initiator", sharp features, self-cut hair, charcoal on
// the fingertips, "engineers the situation"), and the real model copied it into real threads: six
// pockets in the live library carried "charcoal". It rides in CAST, MEMORY, TIDY, REDO, EXTRACT,
// INVENT and forge, so hemming and Tidy could put it back. It also said to keep the name label in
// front, which ADR 0008 forbids. Checked on the text only; the wording is NOT MEASURED.
{
  const { LEDGER_REGISTER } = await import('../src/prompts.ts');
  for (const phrase of [/Mara/, /charcoal/i, /cuts herself/i, /engineers the situation/i, /ordinary to him/i, /Initiator/])
    assert.doesNotMatch(LEDGER_REGISTER, phrase, `LEDGER-SHAPE: no phrase of the old example is left (${phrase})`);
  assert.doesNotMatch(LEDGER_REGISTER, /opening label|Keep the .{0,20}label/i, 'LEDGER-NO-LABEL: it no longer asks for the name label in front (ADR 0008)');
  assert.doesNotMatch(LEDGER_REGISTER, /\[/, 'LEDGER-NO-BRACKET: and its example has no brackets');
  assert.match(LEDGER_REGISTER, /<[^>]+>;\s*<[^>]+>/, 'LEDGER-SHAPE: its example is angle-bracket slots divided by semicolons');
  // Nothing else in the prompts quotes the old example either: it is sent from one place.
  const src = readFileSync(new URL('../src/prompts.ts', import.meta.url), 'utf8') + readFileSync(new URL('../src/forge.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''), /charcoal on the|hair she cuts herself|engineers the situation/i,
    'LEDGER-SHAPE: no prompt quotes the old example');
  ok('the ledger register gives a shape with no name label, and no prompt quotes the old example');
}

// ---- 7. ANANSI READS THE BOOK; THE BOOK DOES NOT SET HER REGISTER
// Seth, 2026-08-30, on chat answers that came back clipped and flat: "the anansi chatbot should
// have a seperate voice from anything in the book. it can of course read the thread and narrative
// but it shouldnt be affected by it."
//
// It was reaching her as a 500-token VOICE block in the USER message, below the canon and next to
// the ask, while her own persona was the system message — and F37's whole finding is that the
// voice field outranks everything for register. DIRECTIVE went with it: every part of that block
// is an order to a prose engine, on a call that writes no prose.
//
// TWO HALVES THAT REGRESS INDEPENDENTLY, so both are asserted. A guard that is too broad takes the
// story with the craft, and a chat that cannot see the book is a worse defect than one that talks
// like it.
const BOOK_VOICE = 'Every sentence is a stub. The weather does the feeling. Never a subordinate clause.';
db.updateStory(story.id, { writingStyle: BOOK_VOICE, styleNote: 'Gothic noir, close and cold.',
  pov: 'first person, present tense', persona: 'Vel', spiceNote: 'Desire is on the page.' });

const isolated = await ask(50_048);
assert.ok(!isolated.error, isolated.error);
// Talk's material is in its system message since 2026-10-30 (a chat, the story in the system).
const sent = String(calls[0].messages?.[0]?.content ?? '');
assert.ok(!sent.includes(BOOK_VOICE),
  'the book\'s prose voice is in the chat prompt. It outranks her own register (F37) and it is '
  + 'what made her answers read like the book instead of like her.');
assert.ok(!sent.includes('Gothic noir, close and cold.'),
  'the book\'s STYLE note is in the chat prompt — same failure, smaller block');
assert.ok(!/\[Writing: /.test(sent) && !/Desire is on the page\./.test(sent),
  'the DIRECTIVE block is in the chat prompt: the tense and the register are orders to a prose '
  + 'engine, and this call writes no prose');
// FALSIFIED ON PURPOSE, 2026-08-30: dropping the `prose` guard in context.ts turns all four of
// the assertions above red. They are not decorative.
ok('the book\'s voice, style and prose directives do not reach Anansi');

// The other half. She still has the book — this is what catches a guard that took too much.
assert.ok(sent.includes('A city on a dead god.'), 'she has lost the premise');
assert.ok(sent.includes('Vel is the Murmur.'), 'she has lost the canon');
assert.ok(sent.includes('The lower tiers still pulse.'), 'she has lost the prose');
// The POV and the persona were DIRECTIVE's only facts, and dropping that block dropped the one
// statement of who is telling the story. `POST /api/talk` puts them back as a fact rather than as
// an instruction — the wording differs from DIRECTIVE's on purpose, so this cannot pass by the
// block quietly coming back.
assert.match(sent, /written in first person, present tense, and Vel is the one the writer speaks as/,
  'she is not told whose story this is, which DIRECTIVE used to say and nothing else does');
ok('she still has the premise, the canon, the prose and who is telling it');

// ---- 8. her register is the writer's, and what keeps her honest is not
// The contract ships whatever the box says, and it ships FIRST: F37 is why the voice sits closest
// to the material, since the register nearest the ask is the one that wins.
const { TALK_CONTRACT, TALK_VOICE } = await import('../src/prompts.ts');
const shipped = String(calls[0].messages?.[0]?.content ?? '');
assert.ok(shipped.includes(TALK_CONTRACT), 'the contract is not in the system message');
// WHO ARE YOU (Seth, 2026-10-30): asked about himself, Anansi gave a speech about the story and ended
// "the ball's in your court". The contract says a question to him is answered as himself.
assert.match(TALK_CONTRACT, /answered as yourself, in your own voice below, with the story left out of it/, 'TALK-SELF: a question to him is answered as himself');
assert.match(TALK_CONTRACT, /never end on a rally/, 'TALK-NO-RALLY: and no rallying close');
{
  const { TALK_SETUP } = await import('../src/prompts.ts');
  const { DRAFT_CHANGES_SCHEMA } = await import('../src/changes.ts');
  // FILL IN THE TALE (Seth, 2026-10-30): the setup Talk fills every empty box and the threads, in one answer.
  assert.match(TALK_SETUP, /FILL IN THE TALE[\s\S]*every box still empty[\s\S]*stays as it is/, 'SETUP-FILL-ASK: the setup Talk knows what Fill in the tale asks for');
  assert.ok(DRAFT_CHANGES_SCHEMA.maxItems >= 10, `SETUP-FILL-ROOM: room for the boxes and the threads in one answer (${DRAFT_CHANGES_SCHEMA.maxItems})`);
}
assert.match(TALK_CONTRACT, /never repeat a reply of\s+yours/, 'TALK-NO-REPEAT: and never gives back an earlier reply (2026-10-30)');
assert.ok(shipped.includes(TALK_VOICE), 'her shipped voice is not in the system message');
assert.ok(shipped.indexOf(TALK_CONTRACT) < shipped.indexOf(TALK_VOICE),
  'the voice must sit last, closest to the material — that is the whole of F37');
ok('the chat is sent the contract and then her voice, in that order');

const MINE = 'You are Anansi. You answer in one flat line and you never embellish.';
db.setPrompt(me, 'anansi', MINE);
const rewritten = await ask(50_048);
assert.ok(!rewritten.error, rewritten.error);
const withMine = String(calls[0].messages?.[0]?.content ?? '');
assert.ok(withMine.includes(MINE), 'the writer\'s own Anansi voice did not reach the model');
assert.ok(!withMine.includes(TALK_VOICE), 'and it replaces the shipped one rather than joining it');
// THE HALF THAT MATTERS. A writer changing her diction must not thereby switch off the rules that
// keep her from inventing facts on a route that files proposals into the ledger.
assert.ok(withMine.includes(TALK_CONTRACT),
  'rewriting her voice switched off the contract. "Do not fill the gap with invention", the '
  + 'citation rule and "offer nothing you were not asked for" are not the writer\'s to delete.');
ok('a rewritten voice replaces her register and leaves the contract standing');

// Blank is the reset, the way it already is for the book's voice: `db.setPrompt` deletes on empty
// rather than storing it, so she can never end up nameless.
db.setPrompt(me, 'anansi', '   ');
await ask(50_048);
assert.ok(String(calls[0].messages?.[0]?.content ?? '').includes(TALK_VOICE),
  'emptying the box must put her shipped voice back, not leave her with only the contract');
ok('emptying the box gives her back the voice she shipped with');

// ---- 6c · PADDING A CARD IN CONVERSATION LANDS IN THE ROOM IT NAMES ----
//
// Seth, 2026-09-01: *"if i ask anansi through the chat that i want to pad the card or add more info
// it wants to add it to facts, not info, it doesnt matter if it belongs to a room it all goes to
// facts."*
//
// The cause was structural, not a prompt losing an argument: `TALK_SCHEMA.entries` had no `field`
// at all, and the talk route passed none. So `proposalTarget` resolved every chat proposal to
// `body`, and accepting one ran `upsertEntry` — which REWRITES THE WHOLE DESCRIPTION. Extraction
// and the memory pass had both had a room since PLAN-08 Phase 4; the chat was the pass that
// could not answer the question.
//
// Both halves are asserted, because they regress independently: the schema can lose the field
// again, and the route can stop passing it — which is precisely how PLAN-08 Phase 2's `activation`
// landed null on every proposal with three green suites unable to see it.
{
  // The schema half. Structural on purpose: a fake model cannot tell you whether a field exists,
  // only what it did with one.
  const item = (TALK_SCHEMA.properties.entries as any).items;
  assert.ok(item.properties.field, 'TALK_SCHEMA.entries has no `field`, so the chat cannot name a '
    + 'room and every proposal it files rewrites the whole card');
  assert.ok(item.required.includes('field'),
    'and it has to be REQUIRED, or the model omits it and nothing has changed');
  for (const slot of ['interiority', 'appearance', 'voice', 'facts', 'none'])
    assert.ok(item.properties.field.enum.includes(slot), `the enum is missing ${slot}`);

  // THE CONTRACT HAS TO SAY WHAT THE ROOMS ARE. An enum on the wire is a list of tokens; the model
  // cannot tell interiority from facts without being told what each one holds, and `facts` is the
  // widest name on the list — routes.ts:375 records three-for-three landing there when the answer
  // had nowhere else to go.
  const { TALK_CONTRACT: TC } = await import('../src/prompts.ts');
  assert.match(TC, /what they think, fear or want/, 'the contract has to say what interiority is');
  assert.match(TC, /"facts" is not the default/,
    'and say facts is not the default, which is the exact failure being fixed');
  assert.match(TC, /REWRITES THE WHOLE DESCRIPTION/,
    'and say what "none" costs, because that is the branch this defect was hiding in');

  // The route half, end to end.
  calls = [];
  const velBefore = db.entriesOf(story.id).find((e: any) => e.title === 'Vel') as any;
  const padded: any = await routes['POST /api/talk']({
    body: { storyId: story.id, said: 'Pad Vel out a little — more about her inner life.' },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any);
  assert.ok(!padded.error, padded.error);
  assert.strictEqual(padded.proposed, 1, 'the change is proposed, not written');

  const prop = db.proposalsOf(story.id).find((x: any) => x.title === 'Vel') as any;
  assert.ok(prop, 'the change to Vel is in the queue');
  assert.strictEqual(prop.entry_id, velBefore.id, 'pointed at the card that already exists');
  assert.strictEqual(prop.field, 'interiority',
    `the room the chat named did not survive the route — it arrived as ${prop.field}`);
  assert.strictEqual(db.proposalTarget(prop), 'room:interiority',
    'and the accept path has to agree, or the room is decoration');
  ok('a change the chat proposes carries the room it named');

  // ACCEPTING IT ADDS A ROOM AND LEAVES THE DESCRIPTION ALONE. This is the writer-visible claim,
  // and it is the one that was false: the same proposal used to replace Vel's whole body.
  const roomsBefore = db.addonsOf(story.id).length, had = new Set(db.addonsOf(story.id).map((a: any) => a.id));
  await routes['POST /api/proposal']({ body: { storyId: story.id, id: prop.id, accept: true },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: {}, setGen: () => {} } as any);
  const velAfter = db.entriesOf(story.id).find((e: any) => e.id === velBefore.id) as any;
  assert.strictEqual(velAfter.body, velBefore.body,
    'accepting a room change rewrote the card\'s description. That IS the bug.');
  const rooms = db.addonsOf(story.id);
  assert.strictEqual(rooms.length, roomsBefore + 1, 'and it made exactly one room');
  // The one that is new, by id: `addonsOf` orders by kind, and this tale's string sorts after it.
  const made = rooms.find((a: any) => !had.has(a.id)) as any;
  assert.strictEqual(made.slot, 'interiority', 'in the room the chat named');
  assert.strictEqual(made.entry_id, velBefore.id, 'on Vel');
  ok('accepting it fills one room and leaves the rest of the card exactly as it was');

  /* ---- AND NO URL IS GLUED TO THE BODY. Seth, 2026-09-01: "i dont need anansi to post where the
   * information is coming from like the url links."
   *
   * A search-assisted answer used to append ` [https://…]` to every card body it helped write, so a
   * thread's canon carried a link — which then rode into every prompt that fired it, and out again
   * through export.
   *
   * THE ROW THE CHAT JUST FILED IS CHECKED BY NAME, and that is the correction: the first version of
   * this looped over the OPEN queue, and the padded proposal had been accepted four lines above — so
   * it checked every row except the one the talk route had written, and pasting a URL back into that
   * route left it green. `prop` and the room it landed in are read directly. */
  assert.doesNotMatch(String(prop.body), /https?:\/\//,
    `the proposal the chat just filed carries a URL: ${String(prop.body).slice(0, 90)}`);
  assert.doesNotMatch(String(made.body), /https?:\/\//,
    'nor does the room it landed in, which is what reaches every prompt that fires the card');
  for (const row of db.proposalsOf(story.id) as any[]) {
    assert.doesNotMatch(String(row.body), /https?:\/\//,
      `a proposal body carries a URL: ${String(row.body).slice(0, 90)}`);
    assert.doesNotMatch(String(row.body), /\[\s*www\./, 'nor a bare host in brackets');
  }
  // The instruction to cite HER OWN LEDGER stays — it is a different thing and it is load-bearing:
  // "a bare fact from nowhere is the one thing that makes you no use to them."
  const { TALK_CONTRACT: TC2 } = await import('../src/prompts.ts');
  assert.match(TC2, /Cite what you are drawing on/,
    'citing the entry, the summary or the passage is not what was being removed');
  ok('no URL is pasted into a card body, and citing her own ledger still is asked for');
}

// ---- 6e · ASKED MEANS DONE, WITH UNDO (#97, ADR 0007) ----
//
// What the writer asks Talk to change is changed at once, through the same db functions a hand edit
// uses, and comes back as a line in the writer's words with an Undo. The Undo puts back exactly
// what was there, or takes away what Talk made. What Anansi offers unasked is still chalked. A
// change the tale cannot take is not applied, and the reply says so. Prose is never touched.
{
  const tale = db.createStory(me, { title: 'The Crossing', premise: 'A river between the living and the dead.' });
  const talia = db.upsertEntry(tale.id, me, { title: 'Talia Venn', body: '', activation: 'always_on' });
  db.upsertAddon(tale.id, talia, { slot: 'facts', name: 'facts', body: 'Talia is twenty.' });
  const morgott = db.upsertEntry(tale.id, me, { title: 'Morgott', body: '', activation: 'always_on' });
  db.upsertEntry(tale.id, me, { title: 'Ring Law', entryType: 'item', body: 'a ring', activation: 'always_on' });
  db.addPassage({ ...tale, storyId: tale.id, body: 'The ferry left without her.' });
  const ctxOf = (storyId: string, body: any) => ({ body: { storyId, ...body }, query: new URLSearchParams(),
    owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null }) as any;
  const say = (said: string) => { calls = []; return routes['POST /api/talk'](ctxOf(tale.id, { said })) as Promise<any>; };
  const undo = (u: any, storyId = tale.id) => routes['POST /api/talk/undo'](ctxOf(storyId, { undo: u })) as any;
  const room = (entry: string, slot: string) =>
    (db.addonsOf(tale.id) as any[]).filter((a) => a.entry_id === entry && a.slot === slot);
  const prose = () => (db.passagesOf(tale.id) as any[]).map((p) => p.body).join('|');
  const proseBefore = prose();

  // THE ANSWER CAN CARRY CHANGES, and only the operations on the list. Read off the wire, because
  // the schema the model is held to is the one sent, not the constant.
  const age = await say('CHANGE-AGE: make Talia thirty, not twenty');
  assert.ok(!age.error, age.error);
  const ops = calls[0].response_format?.json_schema?.schema?.properties?.changes?.items?.properties?.op?.enum;
  assert.deepStrictEqual(ops, ['thread.new', 'thread.set', 'thread.overtime', 'thread.wake', 'thread.retire', 'tale.set', 'scene.set',
    'string.set', 'string.stand', 'rule.set', 'rule.switch', 'instruction.set', 'instruction.switch'],
    `CHANGE-WIRE: the model may ask for these and no others (${ops})`);

  // Always true, changed at once.
  assert.strictEqual(room(talia, 'facts')[0]?.body, 'Talia is thirty.', 'CHANGE-DONE: Talia\'s Always true is changed');
  assert.strictEqual(room(talia, 'facts').length, 1, 'CHANGE-DONE: in place, not as a second Always true');
  assert.strictEqual(age.changes?.length, 1, `CHANGE-LINE: one change comes back (${JSON.stringify(age.changes)})`);
  assert.match(age.changes[0].words, /Talia Venn.*Always true.*Talia is thirty/,
    `CHANGE-LINE: in the writer's words, naming the thread, the room and the text (${age.changes[0].words})`);
  // #122 · and the text before and after it, which the line draws as a diff under its Undo.
  assert.deepStrictEqual(age.changes[0].diff, { before: 'Talia is twenty.', after: 'Talia is thirty.' },
    'CHANGE-DIFF: the line carries what the Always true said before and what it says now');
  // Offers are still chalked: the place nobody asked for is on the Workbench, not in the tale.
  assert.strictEqual(age.proposed, 1, 'CHANGE-OFFER: the unasked place is chalked');
  assert.ok((db.proposalsOf(tale.id) as any[]).some((p) => p.title === 'The Quay' && p.status === 'open'),
    'CHANGE-OFFER: and it is on the Workbench');
  assert.ok(!(db.entriesOf(tale.id) as any[]).some((e) => e.title === 'The Quay'), 'CHANGE-OFFER: and not in the tale');

  // Undo puts back exactly what was there.
  const back: any = undo(age.changes[0].undo);
  assert.ok(!back.error, back.error);
  assert.strictEqual(room(talia, 'facts')[0]?.body, 'Talia is twenty.', 'UNDO-EXACT: the old Always true, word for word');
  assert.match(back.undone, /Put back Talia Venn's Always true/, `UNDO-EXACT: and says so (${back.undone})`);
  ok('asked to change a thread\'s Always true, Talk changes it, and Undo puts back the exact old text');

  // #111 · TALK'S CHANGE AND ITS UNDO ARE BOTH IN THE THREAD'S HISTORY, so the history agrees with
  // what Undo did: the text Talk wrote over, then the text Undo wrote over. Putting Talk's text back
  // from the history is a revert like any other, and Talk's Undo still applies to it after.
  const hist = () => (routes['GET /api/history']({ ...ctxOf(tale.id, {}),
    query: new URLSearchParams({ story: tale.id, entry: talia }) }) as any).entry as any[];
  const talkKept = hist().filter((r) => r.label === 'Always true').map((r) => r.previous_value);
  assert.deepStrictEqual(talkKept, ['Talia is thirty.', 'Talia is twenty.'],
    `TALK-HIST: Talk's change and its Undo each keep the text they wrote over, newest first (${JSON.stringify(talkKept)})`);
  const revert = (revisionId: string) => routes['POST /api/revert'](ctxOf(tale.id, { entryId: talia, revisionId })) as any;
  const r1 = revert(hist().find((r) => r.previous_value === 'Talia is thirty.').id);
  assert.ok(!r1.error, r1.error);
  assert.strictEqual(room(talia, 'facts')[0]?.body, 'Talia is thirty.', 'TALK-HIST-REVERT: the history puts Talk\'s text back');
  const reUndo: any = undo(age.changes[0].undo);
  assert.ok(!reUndo.error, reUndo.error);
  assert.strictEqual(room(talia, 'facts')[0]?.body, 'Talia is twenty.', 'TALK-HIST-UNDO: and Talk\'s Undo still takes it off');
  assert.strictEqual(hist().filter((r) => r.label === 'Always true').length, 4, '  and both are kept');
  const refused = revert('er-no-such-row');
  assert.match(String(refused.error), /could not be put back/, `REVERT-SAYS: a revert that is refused says so (${JSON.stringify(refused.error)})`);
  ok('Talk\'s change and its Undo are both in the thread\'s history, and the history and Undo agree');

  // One room, and the rest of the thread left alone.
  const voice = await say('CHANGE-VOICE: give Morgott a slow, formal voice');
  assert.ok(!voice.error, voice.error);
  const v1 = room(morgott, 'voice');
  assert.strictEqual(v1.length, 1, 'CHANGE-ROOM: Morgott has a voice');
  assert.strictEqual(v1[0].body, 'Slow, formal, never a contraction.');
  assert.strictEqual(v1[0].active, 1, 'CHANGE-ROOM: switched on, or it never reaches the model (it has no wake words)');
  assert.strictEqual(room(morgott, 'facts').length, 0, 'CHANGE-ROOM: and nothing else of his was written');
  assert.match(voice.changes[0].words, /Morgott's voice/);
  undo(voice.changes[0].undo);
  assert.strictEqual(room(morgott, 'voice').length, 0, 'UNDO-ROOM: a room Talk made is taken away by its Undo');
  ok('asked to change one room, Talk makes that room alone, and Undo takes it away again');

  // A new thread.
  const before = db.entriesOf(tale.id).length;
  const made = await say('CHANGE-NEW: add the ferryman as a character');
  assert.ok(!made.error, made.error);
  const ferry = (db.entriesOf(tale.id) as any[]).find((e) => e.title === 'The ferryman');
  assert.ok(ferry, 'CHANGE-NEW: the ferryman is a thread of the tale');
  assert.strictEqual(ferry.entry_type, 'character');
  assert.strictEqual(room(ferry.id, 'facts')[0]?.body, 'Rows the dead across for a coin.', 'CHANGE-NEW: with his Always true');
  assert.strictEqual(ferry.activation, 'always_on', 'CHANGE-NEW: a character Talk makes is always on');
  assert.match(made.changes[0].words, /new thread.*The ferryman/i);
  assert.strictEqual(made.changes[0].diff ?? null, null, 'CHANGE-DIFF: a new thread replaced no text, so its line has no diff');
  const gone: any = undo(made.changes[0].undo);
  assert.ok(!gone.error, gone.error);
  assert.ok(!(db.entriesOf(tale.id) as any[]).some((e) => e.title === 'The ferryman'),
    'UNDO-NEW: undoing a thread Talk made removes it');
  assert.strictEqual(db.entriesOf(tale.id).length, before, 'UNDO-NEW: and the tale has the threads it had');
  ok('asked to add a thread, Talk makes it, and Undo removes it');

  // A new thread whose Always true the database will not take is not left behind with none. The
  // refusal is a trigger on a connection of its own, so nothing in src/ is bent to make it happen.
  {
    const { DatabaseSync } = await import('node:sqlite');
    const raw = new DatabaseSync(DB);
    raw.exec(`CREATE TRIGGER no_ferry BEFORE INSERT ON addons WHEN NEW.body = 'Rows the dead across for a coin.'
      BEGIN SELECT RAISE(ABORT, 'refused for the test'); END`);
    try {
      const n = db.entriesOf(tale.id).length;
      const half: any = await say('CHANGE-NEW: add the ferryman as a character');
      assert.ok(!half.error, `NEW-HALF: the answer still comes back (${half.error})`);
      assert.strictEqual(db.entriesOf(tale.id).length, n,
        'NEW-HALF: a thread whose Always true could not be written is not left in the tale with none');
      assert.strictEqual(half.changes.length, 0, 'NEW-HALF: and it is not shown as done');
      assert.match(half.reply, /Not done\. Made a new thread: The ferryman/, `NEW-HALF: the reply says so:\n${half.reply}`);
    } finally { raw.exec('DROP TRIGGER no_ferry'); raw.close(); }
  }
  ok('a new thread whose Always true cannot be written is taken away again, and the reply says it was not done');

  // The writer changes what Talk made; its Undo no longer takes it away.
  const again = await say('CHANGE-NEW: add the ferryman as a character');
  const ferry2 = (db.entriesOf(tale.id) as any[]).find((e) => e.title === 'The ferryman');
  db.upsertAddon(tale.id, ferry2.id, { slot: 'facts', name: 'facts', body: 'Rows the dead. Hates the living.' });
  const kept: any = undo(again.changes[0].undo);
  assert.match(String(kept.error), /changed since/, 'UNDO-CHANGED: a thread the writer changed since is theirs');
  assert.ok((db.entriesOf(tale.id) as any[]).some((e) => e.id === ferry2.id), 'UNDO-CHANGED: and it is still there');
  ok('an Undo does not take away a thread the writer has changed since Talk made it');

  // What the tale cannot take is not done, and the reply says so, whatever the model claimed.
  const entriesBefore = JSON.stringify(db.entriesOf(tale.id));
  const roomsBefore = JSON.stringify(db.addonsOf(tale.id));
  const bad = await say('CHANGE-BAD: do all of these');
  assert.ok(!bad.error, bad.error);
  assert.strictEqual(bad.changes.length, 0, 'CHANGE-REFUSED: none of these is done');
  assert.strictEqual(JSON.stringify(db.entriesOf(tale.id)), entriesBefore, 'CHANGE-REFUSED: no thread changed, none deleted');
  assert.strictEqual(JSON.stringify(db.addonsOf(tale.id)), roomsBefore, 'CHANGE-REFUSED: no room changed');
  assert.match(bad.reply, /no thread called "Nobody"/, `CHANGE-REFUSED: the reply names the thread that is not there:\n${bad.reply}`);
  assert.match(bad.reply, /an item has no voice/, 'CHANGE-REFUSED: and the room the kind does not have');
  assert.strictEqual(bad.reply.match(/not something Talk can do/g)?.length, 2,
    'CHANGE-REFUSED: and each operation that is not on the list: a delete, and prose');
  assert.strictEqual(bad.notDone?.length, 4, 'CHANGE-REFUSED: four asked, four not done');
  assert.strictEqual(prose(), proseBefore, 'CHANGE-NO-PROSE: not one passage changed in this whole block');
  ok('a change naming no thread, a room the kind lacks, or an operation off the list is refused, and the reply says so');

  // ITS RAW ANSWER IS KEPT (2026-11-03), beside the context manifest: on Seraphine every change Talk
  // was sent failed, and the row kept only what was sent, so what the model answered was lost.
  {
    const row = (new (await import('node:sqlite')).DatabaseSync(DB, { readOnly: true }) as any)
      .prepare("SELECT manifest FROM generations WHERE story_id = ? AND role = 'talk' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(tale.id);
    const m = JSON.parse(row?.manifest ?? '{}');
    assert.match(String(m.raw ?? ''), /thread\.delete/, 'TALK-RAW: Talk logs what the model answered, changes and all');
    assert.ok(m.totals, 'TALK-RAW: and still the context manifest it was sent');
  }
  ok('Talk keeps the model\'s raw answer in its generation row');

  // A CHARACTER IN SEVERAL POCKETS lands as one thread with its pockets, each line once.
  {
    const sera = await say('CHANGE-SERAPHINE: make the nun a full character called Seraphine');
    assert.ok(!sera.error, sera.error);
    const her = (db.entriesOf(tale.id) as any[]).filter((e) => e.title === 'Seraphine');
    assert.strictEqual(her.length, 1, 'TALK-POCKETS: one thread called Seraphine');
    assert.strictEqual(her[0].entry_type, 'character', 'TALK-POCKETS: a character');
    assert.deepStrictEqual(room(her[0].id, 'facts').map((a) => a.body), ['A novitiate of the Choir of Saints.'], 'TALK-POCKETS: her Always true');
    assert.strictEqual(room(her[0].id, 'voice')[0]?.body, 'A low murmur; calls everyone darling.', 'TALK-POCKETS: her voice');
    assert.ok(room(her[0].id, 'voice')[0]?.active, 'TALK-POCKETS: switched on');
    assert.strictEqual(room(her[0].id, 'outfit')[0]?.body, 'A habit cut low; red latex gloves to the elbow.', 'TALK-POCKETS: her outfit');
    assert.deepStrictEqual(sera.notDone, [], `TALK-POCKETS: nothing refused (${JSON.stringify(sera.notDone)})`);
    assert.strictEqual(sera.changes.length, 3, `TALK-POCKETS: three lines, the voice once (${sera.changes.map((x: any) => x.words).join(' | ')})`);
    // #151 · One card for her: every change names her thread as its card, with its pocket as the row.
    assert.deepStrictEqual([...new Set(sera.changes.map((x: any) => x.card?.key))], [her[0].id], `CARD-KEY: one card, hers (${JSON.stringify(sera.changes.map((x: any) => x.card))})`);
    assert.ok(sera.changes.every((x: any) => x.card.title === 'Seraphine'), 'CARD-TITLE: named for her');
    assert.deepStrictEqual(sera.changes.map((x: any) => x.card.label), ['The thread', 'Voice', 'Outfit'], 'CARD-LABEL: each row its pocket');
    const kept = db.talkSession(me, tale.id, sera.sessionId)!.turns.at(-1);
    assert.strictEqual(kept.changes?.length, 3, 'CARD-KEPT: a kept talk keeps its cards, for a talk opened again');
  }
  ok('a new character sent once per pocket is one thread with its pockets');

  // NOTHING DONE IS SAID FIRST, and the model's "Done." is not left to say otherwise. One line for
  // the thread that was not made, not one more for each of its pockets.
  {
    const n = db.entriesOf(tale.id).length;
    const none = await say('CHANGE-NOALWAYS: send her to the workbench');
    assert.ok(!none.error, none.error);
    assert.strictEqual(db.entriesOf(tale.id).length, n, '  nothing was made');
    assert.match(none.reply, /^Nothing was changed\./, `TALK-NOTHING-DONE: the answer opens by saying nothing was changed:\n${none.reply}`);
    assert.ok(!/^Done\b/m.test(none.reply), `TALK-NOTHING-DONE: and no line of it opens with "Done":\n${none.reply}`);
    assert.match(none.reply, /Ysolde is in the ledger now/, '  the rest of what Anansi said is kept');
    assert.deepStrictEqual(none.notDone.map((x: any) => x.said), ['Make a new thread: Ysolde'],
      `TALK-NOTHING-DONE: one line for the thread, none for its pockets (${JSON.stringify(none.notDone)})`);
  }
  ok('when nothing asked for was done, the answer says so first, once per thing asked');

  {
    const mid = await say('CHANGE-MIDCLAIM: add her voice and outfit');
    assert.ok(!mid.error, mid.error);
    assert.match(mid.reply, /^Nothing was changed\./, `MIDCLAIM-HEAD: nothing done is said first:\n${mid.reply}`);
    assert.ok(!/I have also added|now filled in/.test(mid.reply), `MIDCLAIM-GONE: a claim of a change in the middle of the reply is taken off:\n${mid.reply}`);
    assert.match(mid.reply, /Vel is a ferryman of the lower tiers\.[\s\S]*Ask me anything\./, `MIDCLAIM-KEPT: the rest of the reply stays:\n${mid.reply}`);
  }
  {
    const q = await say('ABOUT-SETIN: where does it happen?');
    assert.ok(!q.error, q.error);
    assert.strictEqual(q.reply, 'The tale is set in Sutera, under the Great Rib. I have made my peace with its bells. Ask me anything.',
      `MIDCLAIM-QUESTION: an answer to a question keeps every sentence:\n${q.reply}`);
  }
  {
    const odile = db.upsertEntry(tale.id, me, { title: 'Odile', body: '', entryType: 'character', activation: 'always_on', keys: [] })!;
    db.upsertAddon(tale.id, odile, { slot: 'facts', name: 'facts', body: 'A weaver.' });
    const part = await say('CHANGE-PARTCLAIM: add her voice and outfit');
    assert.ok(!part.error, part.error);
    assert.strictEqual(part.changes.length, 1, '  one change done');
    assert.ok(!/I have added her voice and her outfit/.test(part.reply), `MIDCLAIM-PARTIAL: with something refused, the reply's claims are taken off; the change lines say what was done:\n${part.reply}`);
    assert.match(part.reply, /Odile is ready\. She says "Mind the cuffs\."[\s\S]*She smiles\./, `MIDCLAIM-SPLIT: a quote closing a sentence still ends it, so the claim after it goes alone:\n${part.reply}`);
    assert.match(part.reply, /Her letters are written in cipher\./, `MIDCLAIM-FACT: a fact about the story is not a claim:\n${part.reply}`);
  }
  ok('a claim of a change anywhere in the reply is taken off when nothing was done');

  // #144 · WRITTEN ON REQUEST, AN OFF POCKET IS ON (Seraphine, 2026-11-04: her appearance was Off, Talk
  // filled it, and it stayed Off, so it never reached a passage). Its Undo puts it back Off.
  {
    const id = (db.entriesOf(tale.id) as any[]).find((e) => e.title === 'Odile').id;
    const look = db.upsertAddon(tale.id, id, { slot: 'appearance', name: 'appearance', body: 'Plain.' })!;
    db.setAddonActivation(tale.id, look, 'off');
    const w = await say('CHANGE-WAKEOFF: write her appearance');
    assert.ok(!w.error, w.error);
    const after = room(id, 'appearance');
    assert.strictEqual(after.length, 1, '  one appearance pocket');
    assert.strictEqual(after[0].body, 'Grey wool, silver at the cuffs.', '  with the new text');
    assert.notStrictEqual(after[0].activation, 'off', `WAKE-ON: a pocket Talk writes on request is switched on (${after[0].activation})`);
    assert.match(w.changes[0].words, /switched it on/i, `WAKE-SAID: the line says so (${w.changes[0].words})`);
    const back = undo(w.changes[0].undo);
    assert.ok(!back.error, back.error);
    assert.strictEqual(room(id, 'appearance')[0].body, 'Plain.', '  Undo puts the text back');
    assert.strictEqual(room(id, 'appearance')[0].activation, 'off', 'WAKE-UNDO: and puts the pocket back Off');
  }
  // THE REVIEW'S CASE: a room with an On a word pocket and an Off one. The write goes over the On a
  // word one, nothing is switched, and the Off one stays Off.
  {
    const id = db.upsertEntry(tale.id, me, { title: 'Maren', body: '', entryType: 'character', activation: 'always_on', keys: [] })!;
    db.upsertAddon(tale.id, id, { slot: 'facts', name: 'facts', body: 'A miller.' });
    // On a word first and Off newest, so "the newest" would pick the Off one.
    const worded = db.upsertAddon(tale.id, id, { slot: 'appearance', name: 'in the rain', body: 'A sodden shawl.', keys: ['rain'] })!;
    db.setAddonActivation(tale.id, worded, 'triggered');
    const off = db.upsertAddon(tale.id, id, { slot: 'appearance', name: 'appearance', body: 'Plain.' })!;
    db.setAddonActivation(tale.id, off, 'off');
    const looks = () => room(id, 'appearance');
    const w = await say('CHANGE-WAKESIB: write her appearance');
    assert.ok(!w.error, w.error);
    const on = looks().find((a) => a.id === worded)!;
    assert.strictEqual(on.body, 'Grey wool, silver at the cuffs.', `WAKE-SIBLING: the On a word pocket is the one written (${JSON.stringify(looks().map((a) => [a.name, a.activation, a.body]))})`);
    assert.strictEqual(on.activation, 'triggered', 'WAKE-SIBLING: and it is still On a word');
    assert.ok(looks().filter((a) => a.id !== worded).every((a) => a.activation === 'off'), 'WAKE-SIBLING: the Off one is left Off');
    assert.ok(!/switched it on/i.test(w.changes[0].words), `WAKE-SIBLING: nothing says it was switched (${w.changes[0].words})`);
  }
  ok('a pocket that was Off is switched on when Talk writes it on request, and Undo puts it back Off');

  // #144 · A THREAD TALK MADE WITH POCKETS is taken away by its own Undo, pockets and all. Its Undo
  // waited until every pocket's Undo had been pressed first.
  {
    const m = await say('CHANGE-MAKEWITH: make the lockkeeper');
    assert.ok(!m.error, m.error);
    const him = (db.entriesOf(tale.id) as any[]).find((e) => e.title === 'Brannoc');
    assert.ok(him, '  Brannoc was made');
    assert.strictEqual(room(him.id, 'voice').length + room(him.id, 'appearance').length, 2, '  with two pockets');
    const made = m.changes.find((x: any) => x.undo?.op === 'thread.unmake');
    const gone = undo(made.undo);
    assert.ok(!gone.error, `UNMAKE-WITH-POCKETS: the thread's own Undo works with its pockets still on (${gone.error})`);
    assert.ok(!(db.entriesOf(tale.id) as any[]).some((e) => e.title === 'Brannoc'), 'UNMAKE-WITH-POCKETS: and he is gone');
  }
  ok('a thread Talk made with pockets is taken away by its own Undo');

  // ASKED, THOUGH THE MODEL SENT IT AS AN OFFER (Seraphine, 2026-11-04). The writer asked for her card
  // to be filled in, and the answer carried no change: only an entry naming her, for one pocket. A
  // question about her is still answered with an offer, chalked; the request is done, with Undo.
  {
    const her = (db.entriesOf(tale.id) as any[]).find((e) => e.title === 'Seraphine');
    const BODY = FILLCARD.entries[0].body;
    const asked = await say('ABOUT-FILLCARD: what is Seraphine wearing?');
    assert.ok(!asked.error, asked.error);
    assert.deepStrictEqual(asked.changes, [], 'TALK-ASKED-ENTRY: a question changes nothing');
    assert.strictEqual(asked.proposed, 1, 'TALK-ASKED-ENTRY: what it offers about her is chalked');
    const offer = (db.proposalsOf(tale.id) as any[]).find((p) => p.title === 'Seraphine' && p.field === 'appearance');
    assert.ok(offer, 'TALK-ASKED-ENTRY: on the Workbench, for her appearance');
    assert.deepStrictEqual(asked.chalked, [offer.id], `CARD-CHALKED: the answer names the offer it chalked, for its card (${JSON.stringify(asked.chalked)})`);
    db.setProposalStatus(tale.id, offer.id, 'rejected');

    const fill = await say('CHANGE-FILLCARD: Ok fill out the seraphine card and fill her pockets please');
    assert.ok(!fill.error, fill.error);
    assert.strictEqual(room(her.id, 'appearance')[0]?.body, BODY.trim(),
      'TALK-ASKED-ENTRY: asked to fill her card, her appearance is written');
    assert.strictEqual(fill.changes.length, 1, `TALK-ASKED-ENTRY: one change, with its line (${JSON.stringify(fill.notDone)})`);
    assert.match(fill.changes[0].words, /Seraphine/, '  naming her');
    assert.strictEqual(fill.proposed, 0, 'TALK-ASKED-ENTRY: and nothing about her is chalked as well');
    assert.ok(!(db.proposalsOf(tale.id) as any[]).some((p) => p.title === 'Seraphine'), '  not on the Workbench');
    const back = await undo(fill.changes[0].undo);
    assert.ok(!back.error, back.error);
    assert.strictEqual(room(her.id, 'appearance').length, 0, 'TALK-ASKED-ENTRY: its Undo takes the pocket away');
  }
  // ASKED, AND ONLY CHALKED: the answer says so first, and the reply's own claim that it filled her
  // in is taken off. Asked by pronoun, the request cannot be told from an offer, so it is chalked.
  {
    const her = (db.entriesOf(tale.id) as any[]).find((e) => e.title === 'Seraphine');
    const fill = await say('CHANGE-FILLCARD: ok now fill out her card please');
    assert.ok(!fill.error, fill.error);
    assert.deepStrictEqual(fill.changes, [], '  nothing done');
    assert.strictEqual(room(her.id, 'appearance').length, 0, '  her appearance is not written');
    assert.match(fill.reply, /^Offered on the Workbench, not written:\n.*Seraphine.*appearance/i,
      `TALK-OFFERED-SAID: the answer opens by saying what was only offered:\n${fill.reply.slice(0, 200)}`);
    assert.ok(!/I have filled out/i.test(fill.reply), `TALK-OFFERED-SAID: and the claim that it was filled is gone:\n${fill.reply.slice(0, 300)}`);
    assert.match(fill.reply, /Let me know if you would like any changes/, '  the rest of the reply is kept');
    for (const p of (db.proposalsOf(tale.id) as any[]).filter((p) => p.title === 'Seraphine')) db.setProposalStatus(tale.id, p.id, 'rejected');
  }
  ok('a request that was only chalked says so first, and the reply does not claim it was written');

  // And the contract says which is which, in one sentence beside the rule (2026-11-04).
  {
    const { TALK_CONTRACT: TC } = await import('../src/prompts.ts');
    assert.match(TC.replace(/\s+/g, ' '), /asks you to fill, write, add to or change a thread[^.]*is a change[^.]*entries[^.]*unasked/,
      'TALK-ASKED-CONTRACT: a request to fill or change a thread is a change; entries are for what is offered unasked');
  }
  ok('a request about a thread the model sent back as an offer is done as asked, with Undo');

  // A CARD WITH ITS POCKETS (2026-11-04). An entry may carry pockets, each its room and its text,
  // declared before its body so the grammar reaches them. Asked, each is done with its own Undo;
  // offered about a thread the tale has, each is chalked on its own; a new thread offered is one card
  // that brings its pockets when it is sewn in.
  {
    const props = calls[0].response_format?.json_schema?.schema?.properties?.entries?.items?.properties ?? {};
    assert.strictEqual(props.pockets?.maxItems, 6, `ENTRY-POCKETS: an entry may carry up to six pockets (${JSON.stringify(props.pockets)})`);
    assert.deepStrictEqual(Object.keys(props.pockets.items.properties), ['room', 'text'], 'ENTRY-POCKETS: each its room and its text');
    const keys = Object.keys(props);
    assert.ok(keys.indexOf('pockets') < keys.indexOf('body'), `ENTRY-POCKETS: declared before the body (${keys.join(', ')})`);

    const her = (db.entriesOf(tale.id) as any[]).find((e) => e.title === 'Seraphine');
    const before = (db.proposalsOf(tale.id) as any[]).length;
    const about = await say('ABOUT-FILLPOCKETS: what is Seraphine like inside?');
    assert.ok(!about.error, about.error);
    const offers = (db.proposalsOf(tale.id) as any[]).filter((p) => p.title === 'Seraphine');
    assert.deepStrictEqual(offers.map((p) => p.field).sort(), ['appearance', 'interiority', 'relationships'],
      `ENTRY-POCKETS: offered, one chalk per pocket (${offers.map((p) => p.field)})`);
    assert.strictEqual((db.proposalsOf(tale.id) as any[]).length, before + 3, '  and nothing else');
    for (const p of offers) db.setProposalStatus(tale.id, p.id, 'rejected');

    const fill = await say('CHANGE-FILLPOCKETS: fill out Seraphine\'s pockets');
    assert.ok(!fill.error, fill.error);
    assert.deepStrictEqual(fill.notDone, [], `ENTRY-POCKETS: nothing refused (${JSON.stringify(fill.notDone)})`);
    assert.strictEqual(room(her.id, 'appearance')[0]?.body, 'Tall; a habit cut low; red latex gloves to the elbow.', 'ENTRY-POCKETS: asked, her appearance');
    assert.strictEqual(room(her.id, 'interiority')[0]?.body, 'She wants the Stranger kept, not saved.', 'ENTRY-POCKETS: asked, her interiority');
    assert.strictEqual(room(her.id, 'relationships')[0]?.body, 'Vel: a rival for the Stranger.', 'ENTRY-POCKETS: asked, her relationships');
    assert.strictEqual(fill.changes.length, 3, `ENTRY-POCKETS: three lines (${fill.changes.map((x: any) => x.words).join(' | ')})`);
    assert.ok(fill.changes.every((x: any) => x.undo), '  each with its Undo');
    for (const x of [...fill.changes].reverse()) assert.ok(!(await undo(x.undo)).error, 'undone');

    const nun = await say('ABOUT-NEWNUN: who runs the choir?');
    assert.ok(!nun.error, nun.error);
    assert.ok(!(db.entriesOf(tale.id) as any[]).some((e) => e.title === 'Mother Agathe'), 'ENTRY-POCKETS: an offer makes no thread');
    const card = (db.proposalsOf(tale.id) as any[]).filter((p) => p.title === 'Mother Agathe');
    assert.strictEqual(card.length, 1, `ENTRY-POCKETS: a new thread offered is one card (${card.length})`);
    assert.deepStrictEqual(Object.keys(JSON.parse(card[0].rooms ?? '{}')).sort(), ['outfit', 'voice'], 'ENTRY-POCKETS: carrying its pockets');
    await routes['POST /api/proposal'](ctxOf(tale.id, { id: card[0].id, accept: true }));
    const agathe = (db.entriesOf(tale.id) as any[]).find((e) => e.title === 'Mother Agathe');
    assert.ok(agathe, 'sewn in');
    assert.strictEqual(room(agathe.id, 'voice')[0]?.body, 'Dry; never raises it.', 'ENTRY-POCKETS: sewn in, it brings its voice');
    assert.strictEqual(room(agathe.id, 'outfit')[0]?.body, 'A plain grey habit.', 'ENTRY-POCKETS: and its outfit');
  }
  ok('an entry carries its pockets: asked, each is done; offered, each is chalked, and a new thread is one card');

  // AN UNDO REACHES ONLY THIS TALE: another tale's thread, named from your own tale,
  // resolves to nothing. The dispatcher's half — another writer's tale id — is test/scope.ts's.
  const other = db.createStory(db.owner('stranger'), { title: 'Not yours' });
  const hers = db.upsertEntry(other.id, db.owner('stranger'), { title: 'Hers', body: '' });
  db.upsertAddon(other.id, hers, { slot: 'facts', name: 'facts', body: 'Hers alone.' });
  const herFacts = (db.addonsOf(other.id) as any[])[0];
  const cross: any = undo({ op: 'thread.set', thread: hers, room: 'facts', addon: herFacts.id, text: 'BOB WAS HERE' });
  assert.match(String(cross.error), /no longer in this tale/, 'UNDO-SCOPE: another tale\'s thread is not in this one');
  const crossGone: any = undo({ op: 'thread.unmake', thread: hers, title: 'Hers', text: 'Hers alone.' });
  assert.ok(crossGone.error, 'UNDO-SCOPE: nor can it be taken away from here');
  assert.strictEqual((db.addonsOf(other.id) as any[])[0].body, 'Hers alone.', 'UNDO-SCOPE: and hers is as it was');
  assert.ok((db.entriesOf(other.id) as any[]).some((e) => e.id === hers), 'UNDO-SCOPE: still there');
  ok('an Undo cannot reach a thread of another tale');
}

// ---- 6f · THE REST OF WHAT TALK CHANGES WHEN ASKED (#98) ----
//
// The tale's premise and setting, a scene's title and where it heads, a thread's Over time, how it
// wakes, and its retirement. Each through the function a hand edit uses, each with an Undo that puts
// back exactly what was there, and nothing ever deleted.
{
  const tale = db.createStory(me, { title: 'The Delta', premise: 'A river between the living and the dead.',
    chapterTitle: 'The Bank' }) as any;
  const ctxOf = (body: any) => ({ body: { storyId: tale.id, ...body }, query: new URLSearchParams(),
    owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null }) as any;
  const say = (said: string) => { calls = []; return routes['POST /api/talk'](ctxOf({ said })) as Promise<any>; };
  const undo = (u: any) => routes['POST /api/talk/undo'](ctxOf({ undo: u })) as any;
  const story = () => db.getStory(tale.id) as any;

  const dark = await say('CHANGE-PREMISE: make the premise darker');
  assert.ok(!dark.error, dark.error);
  assert.strictEqual(story().premise, 'A river nobody crosses twice.', 'TALE-SET: the premise is changed');
  assert.strictEqual(story().title, 'The Delta', 'TALE-SET: and nothing else of the tale');
  assert.match(dark.changes[0]?.words ?? '', /tale's premise/, `TALE-SET: the line says so (${JSON.stringify(dark.changes)})`);
  const back: any = undo(dark.changes[0].undo);
  assert.ok(!back.error, back.error);
  assert.strictEqual(story().premise, 'A river between the living and the dead.', 'UNDO-TALE: the old premise, word for word');
  ok('asked to change the premise, Talk changes it, and Undo puts back the old one');

  // A second scene, which the writer is in. "This one" is scene 2; scene 1 is named by number.
  const c2 = (db.endChapter(tale.id, tale.branchId, 'Mid-river') as any).opened;
  const scene = (id: string) => (db.chapters(tale.id) as any[]).find((x) => x.id === id);
  const sc = await say('CHANGE-SCENE: rename scene 1 The Ford, and send this one toward the far bank');
  assert.ok(!sc.error, sc.error);
  assert.strictEqual(scene(tale.chapterId).title, 'The Ford', 'SCENE-SET: scene 1 is renamed');
  assert.strictEqual(scene(c2).authors_note, 'The far bank, at dusk.', 'SCENE-SET: the scene the writer is in heads there');
  assert.strictEqual(scene(c2).title, 'Mid-river', 'SCENE-SET: and its title is left alone');
  assert.strictEqual(sc.changes.length, 2, `SCENE-SET: two done (${JSON.stringify(sc.changes)})`);
  assert.match(sc.reply, /Not done.*no scene 9/, `SCENE-MISSING: the reply says scene 9 is not there:\n${sc.reply}`);
  assert.strictEqual((db.chapters(tale.id) as any[]).length, 2, 'SCENE-MISSING: and no scene was made for it');
  for (const x of sc.changes) assert.ok(!undo(x.undo).error);
  assert.strictEqual(scene(tale.chapterId).title, 'The Bank', 'UNDO-SCENE: the old title');
  assert.strictEqual(scene(c2).authors_note ?? '', '', 'UNDO-SCENE: and where it heads is empty again, as it was');
  ok('asked to rename a scene or change where it heads, Talk does, refuses a scene that is not there, and Undo puts both back');

  // How a thread wakes. The letter waits for its word; Charon is always on.
  const letter = db.upsertEntry(tale.id, me, { title: 'The letter', entryType: 'item', body: 'Sealed, unread.',
    activation: 'triggered', keys: ['letter', 'envelope'], lastEditor: 'model' });
  const charon = db.upsertEntry(tale.id, me, { title: 'Charon', body: 'Old.', activation: 'always_on', keys: [] });
  const row = (id: string) => (db.entriesOf(tale.id) as any[]).find((e) => e.id === id);
  const was = { letter: { ...row(letter) }, charon: { ...row(charon) } };
  const wake = await say('CHANGE-WAKE: keep the letter always on, and Charon only on his name');
  assert.ok(!wake.error, wake.error);
  assert.strictEqual(row(letter).activation, 'always_on', 'THREAD-WAKE: the letter is Always on');
  assert.deepStrictEqual(JSON.parse(row(letter).keys), ['letter', 'envelope'], 'THREAD-WAKE: and keeps its wake words');
  assert.strictEqual(row(charon).activation, 'triggered', 'THREAD-WAKE: Charon is On a word');
  assert.deepStrictEqual(JSON.parse(row(charon).keys), ['Charon', 'ferryman'], 'THREAD-WAKE: with the words asked for');
  assert.strictEqual(row(letter).body, 'Sealed, unread.', 'THREAD-WAKE: and nothing else of the thread is written');
  assert.match(wake.changes.map((x: any) => x.words).join(' | '), /The letter is Always on now.*Charon is On a word now: Charon, ferryman/);
  for (const x of wake.changes) assert.ok(!undo(x.undo).error);
  for (const [id, before] of [[letter, was.letter], [charon, was.charon]] as const)
    for (const col of ['activation', 'keys', 'title', 'body', 'entry_type', 'last_editor'])
      assert.strictEqual(row(id)[col], before[col], `UNDO-WAKE: ${before.title}'s ${col} is as it was`);
  ok('asked to change how a thread wakes, Talk does, and Undo puts back the old way and the old wake words');

  // Over time. A third scene; Vel already has an entry from scene 2, written by hand.
  db.endChapter(tale.id, tale.branchId, 'Far bank');
  const vel = db.upsertEntry(tale.id, me, { title: 'Vel', body: 'Vel is dry.', activation: 'always_on' });
  const hand = db.upsertState(tale.id, vel, { fromChapter: 2, body: 'Vel is soaked.', label: 'Fell in', beforeMode: 'hint' });
  const states = () => (db.statesForStory(tale.id).get(vel) ?? []).map((s: any) =>
    ({ id: s.id, from: s.from_chapter, body: s.body, label: s.label, mode: s.before_mode }));
  const statesBefore = JSON.stringify(states());
  const ot = await say('CHANGE-OVERTIME: from scene 3 Vel is blind in one eye');
  assert.ok(!ot.error, ot.error);
  const s3 = states().find((s: any) => s.from === 3);
  assert.strictEqual(s3?.body, 'Vel is blind in one eye.', 'THREAD-OVERTIME: an entry from scene 3');
  assert.strictEqual(s3?.label, 'Lost an eye', 'THREAD-OVERTIME: with its label');
  assert.strictEqual(states().find((s: any) => s.from === 2)?.body, 'Vel is soaked and cold.',
    'THREAD-OVERTIME: the entry from scene 2 is written over, not doubled');
  assert.strictEqual(states().length, 2, 'THREAD-OVERTIME: two entries, not three');
  assert.strictEqual(states().find((s: any) => s.from === 2)?.id, hand, 'THREAD-OVERTIME: the same entry');
  assert.strictEqual((db.entriesOf(tale.id) as any[]).find((e) => e.id === vel).body, 'Vel is dry.',
    'THREAD-OVERTIME: and where she stands from scene 1 is left alone');
  assert.match(ot.reply, /Not done.*no scene 7/, `OVERTIME-MISSING: the reply says scene 7 is not there:\n${ot.reply}`);
  assert.strictEqual(ot.changes.length, 2);
  for (const x of ot.changes) assert.ok(!undo(x.undo).error);
  assert.strictEqual(JSON.stringify(states()), statesBefore,
    'UNDO-OVERTIME: the new entry is gone and the old one is back, body, label and hint alike');
  ok('asked to record a change Over time, Talk dates it, refuses a scene that is not there, and Undo puts the record back');

  // Get rid of the letter. The writer is in scene 3, so it is retired from scene 4, and kept.
  const events = () => JSON.stringify(db.eventsForStory(tale.id).get(letter) ?? []);
  const eventsBefore = events();
  const retiredCol = () => (db.entriesOf(tale.id) as any[]).find((e) => e.id === letter)?.retired_at_chapter ?? null;
  const rid = await say('CHANGE-RETIRE: get rid of the letter');
  assert.ok(!rid.error, rid.error);
  assert.ok((db.entriesOf(tale.id) as any[]).some((e) => e.id === letter), 'THREAD-RETIRE: the letter is still a thread of the tale');
  assert.strictEqual(retiredCol(), 4, 'THREAD-RETIRE: retired from the scene after the one the writer is in');
  assert.strictEqual(rid.changes.length, 1, 'THREAD-RETIRE: the retirement is done, and the delete is not');
  assert.match(rid.changes[0].words, /Retired The letter from scene 4/);
  assert.match(rid.reply, /Not done.*not something Talk can do/, 'THREAD-RETIRE: and the reply says the delete was not done');
  const brought: any = undo(rid.changes[0].undo);
  assert.ok(!brought.error, brought.error);
  assert.match(brought.undone, /Brought back The letter/);
  assert.strictEqual(events(), eventsBefore, 'UNDO-RETIRE: its Over time has no retirement in it, as before');
  assert.strictEqual(retiredCol(), null, 'UNDO-RETIRE: and it is not retired at any scene');
  ok('asked to get rid of a thread, Talk retires it and never deletes it, and Undo brings it back as it was');
}

// ---- #128 · A STRING ASKED FOR IN TALK IS ADDED OR CHANGED AT ONCE, WITH UNDO; ONE OFFERED IS CHALKED ----
//
// A string is a pocket of the tale's thread (ADR 0011). Asked for, it is written through the same
// `upsertAddon` the pocket panel's Save uses, on the tale's thread, made the first time it is needed.
{
  const tale = db.createStory(me, { title: 'The Strand', premise: 'A ferry and a debt.' }) as any;
  const ctxOf = (body: any) => ({ body: { storyId: tale.id, ...body }, query: new URLSearchParams(),
    owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null }) as any;
  const say = (said: string) => { calls = []; return routes['POST /api/talk'](ctxOf({ said })) as Promise<any>; };
  const undo = (u: any) => routes['POST /api/talk/undo'](ctxOf({ undo: u })) as any;
  assert.strictEqual(db.taleThreadOf(tale.id), null, 'no tale thread yet');

  const added = await say('CHANGE-STRINGNEW: make who sent the letter an open question');
  assert.ok(!added.error, added.error);
  const s1 = db.stringsOf(tale.id);
  assert.strictEqual(s1.length, 1, `TALK-STRING-NEW: the string is added at once (${JSON.stringify(added.changes)})`);
  assert.strictEqual(s1[0].kind, 'question', 'TALK-STRING-NEW: as an open question');
  assert.strictEqual(s1[0].body, 'It came under the door with no name.');
  assert.strictEqual(s1[0].summoned, 1, 'TALK-STRING-NEW: and in play');
  assert.ok(db.taleThreadOf(tale.id), "TALK-STRING-NEW: on the tale's thread, made for it");
  assert.match(added.changes[0].words, /open question.*Who sent the letter/i, `  the line says so (${added.changes[0].words})`);
  const gone: any = undo(added.changes[0].undo);
  assert.ok(!gone.error, gone.error);
  assert.strictEqual(db.stringsOf(tale.id).length, 0, 'TALK-STRING-UNDO: Undo takes the string away');
  ok("asked for a string, Talk adds it to the tale's thread in play, and Undo takes it away");

  db.upsertString(tale.id, { title: 'The letter he has not opened', body: 'Sent by his brother.', kind: 'promise', summoned: true });
  const changed = await say('CHANGE-STRINGEDIT: the letter is sealed');
  assert.ok(!changed.error, changed.error);
  assert.strictEqual(db.stringsOf(tale.id)[0].body, 'Sealed, and still unopened.', 'TALK-STRING-EDIT: the string is rewritten');
  assert.strictEqual(db.stringsOf(tale.id).length, 1, '  in place');
  assert.deepStrictEqual(changed.changes[0].diff, { before: 'Sent by his brother.', after: 'Sealed, and still unopened.' });
  const back: any = undo(changed.changes[0].undo);
  assert.ok(!back.error, back.error);
  assert.strictEqual(db.stringsOf(tale.id)[0].body, 'Sent by his brother.', 'TALK-STRING-EDIT-UNDO: Undo puts the old text back');
  ok('asked to change a string, Talk rewrites it, and Undo puts back the old text');

  const sid = db.stringsOf(tale.id)[0].id;
  db.upsertAddon(tale.id, db.taleThreadOf(tale.id).id, { id: sid, slot: 'promise', name: 'The letter he has not opened', body: 'Sent by his brother.', owedBy: 6 });
  const turned = await say('CHANGE-STRINGKIND: make the letter an open question, not a promise');
  assert.ok(!turned.error, turned.error);
  const k = db.stringsOf(tale.id)[0];
  assert.deepStrictEqual([k.id, k.kind, k.body, k.owed_by], [sid, 'question', 'Sent by his brother.', null],
    `TALK-STRING-KIND: the same string is an open question at once, its text kept, owed by no scene (${JSON.stringify(turned.changes)})`);
  assert.strictEqual(turned.changes[0].words, 'Made The letter he has not opened an open question.');
  const unturned: any = undo(turned.changes[0].undo);
  assert.ok(!unturned.error, unturned.error);
  assert.deepStrictEqual([db.stringsOf(tale.id)[0].id, db.stringsOf(tale.id)[0].kind], [sid, 'promise'],
    'TALK-STRING-KIND-UNDO: Undo makes it a promise again');
  ok("asked to make a string the other kind, Talk does it at once, and Undo puts back the old kind");

  const offered = await say('CHANGE-STRINGOFFER: what is the tale carrying?');
  assert.ok(!offered.error, offered.error);
  assert.strictEqual(db.stringsOf(tale.id).length, 1, 'TALK-STRING-OFFER: an offered string is not added');
  const chalked = (db.proposalsOf(tale.id) as any[]).filter((p) => p.entry_type === 'string');
  assert.strictEqual(chalked.length, 2, 'TALK-STRING-OFFER: it is chalked');
  const q = chalked.find((p) => p.title === 'Whether the ferryman can die');
  await routes['POST /api/proposal'](ctxOf({ id: q.id, accept: true }));
  assert.strictEqual(db.stringsOf(tale.id).find((x: any) => x.title === q.title)?.kind, 'question',
    'TALK-STRING-OFFER-KIND: an open question offered is sewn in as an open question');
  ok('a string Talk offers unasked is chalked, of its kind');
}

// ---- #128 · ASK ANANSI WRITES A STRING, BY ITS KIND'S RULE, FOR THE TALE'S THREAD ONLY ----
//
// The pocket panel's Ask Anansi calls `/api/invent` with the string's kind. It writes nothing, as for
// every pocket. The tale's kinds are for the tale's thread: with no thread named (the tale may have
// none yet) or the tale's own, and refused on any other thread. Save is `/api/addon`, which makes the
// tale's thread the first time a string needs it.
{
  const tale = db.createStory(me, { title: 'The Weir', premise: 'A mill and a drowned brother.' }) as any;
  db.addPassage({ ...tale, storyId: tale.id, body: 'The wheel stopped at noon.' });
  const miller = db.upsertEntry(tale.id, me, { title: 'The miller', body: '', activation: 'always_on' });
  const ctxOf = (body: any) => ({ body: { storyId: tale.id, ...body }, query: new URLSearchParams(),
    owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null }) as any;
  const inv = (o: any) => { calls = []; return routes['POST /api/invent'](ctxOf(o)) as Promise<any>; };

  const p: any = await inv({ kind: 'promise', direction: 'the mill is owed' });
  assert.ok(!p.error, `INVENT-STRING: a promise can be asked for (${p.error})`);
  assert.strictEqual(p.addon?.slot, 'promise', 'INVENT-STRING: it comes back as a promise for the form');
  assert.ok(p.addon.name && p.addon.body, '  with a name and a description');
  assert.deepStrictEqual(p.addon.keys, [], '  and no wake words: a string is sent while it is on');
  const sys = String(calls[0].messages[0].content);
  assert.match(sys, /pressed toward payment, but do not resolve one unless the writer asks for it/,
    "INVENT-STRING-RULE: the promise's own rule, in the words the writing prompt frames it with");
  assert.ok(!('keys' in (calls[0].response_format?.json_schema?.schema?.properties ?? {})), '  and no keys asked for');
  assert.strictEqual(db.stringsOf(tale.id).length, 0, 'INVENT-STRING: nothing is written');
  assert.strictEqual(db.taleThreadOf(tale.id), null, '  not even the tale\'s thread');

  const q: any = await inv({ kind: 'question' });
  assert.ok(!q.error, q.error);
  assert.match(String(calls[0].messages[0].content), /a scene may complicate one, never answer it/,
    "INVENT-STRING-RULE: an open question's own rule");
  const wrong: any = await inv({ kind: 'promise', entryId: miller });
  assert.match(String(wrong.error), /tale's own thread/, `INVENT-STRING-ELSEWHERE: refused on another thread (${wrong.error})`);
  ok("Ask Anansi writes a string by its kind's rule, writes nothing, and only for the tale's thread");

  // SAVE, from the panel: no thread named is the tale's, made now; another thread is refused.
  const saved: any = routes['POST /api/addon'](ctxOf({ entryId: null,
    addon: { slot: 'question', name: 'Who opened the sluice', body: 'Nobody will say.', fromChapter: 1 } }));
  assert.ok(!saved.error, saved.error);
  const t = db.taleThreadOf(tale.id);
  assert.ok(t, "ADDON-STRING: the tale's thread is made for its first string");
  assert.deepStrictEqual(db.stringsOf(tale.id).map((x: any) => [x.title, x.kind]), [['Who opened the sluice', 'question']],
    "  and the string is a pocket of it");
  const onMiller: any = routes['POST /api/addon'](ctxOf({ entryId: miller, addon: { slot: 'promise', name: 'x', body: 'y' } }));
  assert.ok(onMiller.error, 'ADDON-STRING-ELSEWHERE: a promise on a character is refused');
  const again: any = await inv({ kind: 'promise', entryId: t.id });
  assert.ok(!again.error, `INVENT-STRING: and on the tale's thread by its id (${again.error})`);
  ok("Save makes the tale's thread for its first string, and a string anywhere else is refused");
}

// ---- A NEW POCKET STARTS ON (Seth, 2026-11-03: "a new pocket should automatically be on and turned
// off means it doesn't get awoken"). Made from the panel it is On; an outfit is still made unworn; a
// save of one that exists keeps its eye.
{
  const tale = db.createStory(me, { title: 'The Kiln', premise: 'A kiln that never cools.', chapterTitle: 'Firing' }) as any;
  const ctxOf = (body: any) => ({ body: { storyId: tale.id, ...body }, query: new URLSearchParams(),
    owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null }) as any;
  const potter = db.upsertEntry(tale.id, me, { title: 'Ansel', body: 'a potter', entryType: 'character' })!;
  const add = (addon: any) => routes['POST /api/addon'](ctxOf({ entryId: potter, addon })) as any;
  const eye = (id: string) => (db.addonsOf(tale.id) as any[]).find((a) => a.id === id)?.activation;
  const made = add({ slot: 'interiority', name: 'his fear', body: 'the kiln cracking', keys: ['kiln'] });
  assert.ok(!made.error, made.error);
  assert.strictEqual(eye(made.addonId), 'always_on', 'POCKET-NEW-ON: a pocket made in the panel starts On');
  const coat = add({ slot: 'outfit', name: 'apron', body: 'a clay-stiff apron' });
  assert.notStrictEqual(eye(coat.addonId), 'always_on', 'POCKET-NEW-OUTFIT: an outfit is still made unworn');
  db.setAddonActivation(tale.id, made.addonId, 'off');
  add({ id: made.addonId, slot: 'interiority', name: 'his fear', body: 'the kiln cracking open', keys: ['kiln'] });
  assert.strictEqual(eye(made.addonId), 'off', 'POCKET-SAVE-KEEPS: a save of a pocket that exists keeps its eye');
  db.delStory(tale.id);
  ok('a new pocket starts On, an outfit is made unworn, and a save keeps the eye it has');
}

// ---- 6f2 · AN UNDO NEVER WRITES OVER A LATER EDIT ----
//
// Each Undo carries what Talk wrote. When the thing no longer holds it, because the writer changed it
// since, the Undo is refused and the writer's edit stays. The unmake operations already worked this
// way; this is the same rule for the five that put an old value back.
{
  const tale = db.createStory(me, { title: 'The Weir', premise: 'A weir on a dead river.', chapterTitle: 'The Bank' }) as any;
  const ctxOf = (body: any) => ({ body: { storyId: tale.id, ...body }, query: new URLSearchParams(),
    owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null }) as any;
  const say = (said: string) => { calls = []; return routes['POST /api/talk'](ctxOf({ said })) as Promise<any>; };
  const undo = (u: any) => routes['POST /api/talk/undo'](ctxOf({ undo: u })) as any;
  const talia = db.upsertEntry(tale.id, me, { title: 'Talia', body: '', activation: 'always_on' });
  db.upsertAddon(tale.id, talia, { slot: 'facts', name: 'facts', body: 'Talia is twenty.' });
  db.endChapter(tale.id, tale.branchId, 'Mid-river');
  db.endChapter(tale.id, tale.branchId, 'Far bank');
  const letter = db.upsertEntry(tale.id, me, { title: 'The letter', entryType: 'item', body: 'Sealed.',
    activation: 'triggered', keys: ['letter'] });
  db.upsertEntry(tale.id, me, { title: 'Charon', body: 'Old.', activation: 'always_on', keys: [] });
  const vel = db.upsertEntry(tale.id, me, { title: 'Vel', body: 'Vel is dry.', activation: 'always_on' });
  const hand = db.upsertState(tale.id, vel, { fromChapter: 2, body: 'Vel is soaked.', label: 'Fell in' });
  const row = (id: string) => (db.entriesOf(tale.id) as any[]).find((e) => e.id === id);
  const refusedSince = (r: any, what: string) =>
    assert.match(String(r.error), /^Not undone: it has been changed since/, `UNDO-LATER: ${what} is refused (${JSON.stringify(r.error)})`);

  // thread.set
  const age = await say('CHANGE-AGE: make Talia thirty');
  const facts = (db.addonsOf(tale.id) as any[]).find((a) => a.entry_id === talia && a.slot === 'facts');
  db.upsertAddon(tale.id, talia, { id: facts.id, slot: 'facts', name: 'facts', body: 'Talia is forty.' });
  refusedSince(undo(age.changes[0].undo), 'an Always true the writer changed since');
  assert.strictEqual((db.addonsOf(tale.id) as any[]).find((a) => a.id === facts.id).body, 'Talia is forty.',
    'UNDO-LATER: and the writer\'s Always true stays');

  // tale.set
  const dark = await say('CHANGE-PREMISE: make the premise darker');
  db.updateStory(tale.id, { premise: 'The writer\'s own premise.' });
  refusedSince(undo(dark.changes[0].undo), 'a premise the writer changed since');
  assert.strictEqual((db.getStory(tale.id) as any).premise, 'The writer\'s own premise.', 'UNDO-LATER: and the premise stays');

  // scene.set: the title the writer changed is refused; where it heads, untouched, still goes back.
  const sc = await say('CHANGE-SCENE: rename scene 1 The Ford, and send this one toward the far bank');
  db.updateChapter(tale.id, tale.chapterId, { title: 'The Writer\'s Ford' });
  const [title, heads] = [sc.changes.find((x: any) => /title/.test(x.words)), sc.changes.find((x: any) => /heads/.test(x.words))];
  refusedSince(undo(title.undo), 'a scene title the writer changed since');
  assert.strictEqual((db.chapters(tale.id) as any[]).find((x) => x.id === tale.chapterId).title, 'The Writer\'s Ford',
    'UNDO-LATER: and the title stays');
  assert.ok(!undo(heads.undo).error, 'UNDO-LATER: what nobody changed since is still undone');

  // thread.wake: the writer put the letter back on its word by hand; Charon is untouched.
  const wake = await say('CHANGE-WAKE: keep the letter always on, and Charon only on his name');
  db.upsertEntry(tale.id, me, { id: letter, title: 'The letter', entryType: 'item', body: 'Sealed.',
    activation: 'triggered', keys: ['letter', 'seal'] });
  const [wl, wc] = [wake.changes.find((x: any) => /letter/.test(x.words)), wake.changes.find((x: any) => /Charon/.test(x.words))];
  refusedSince(undo(wl.undo), 'how a thread wakes, changed by the writer since');
  assert.deepStrictEqual(JSON.parse(row(letter).keys), ['letter', 'seal'], 'UNDO-LATER: and the writer\'s wake words stay');
  assert.ok(!undo(wc.undo).error, 'UNDO-LATER: Charon, untouched, is still undone');

  // thread.overtime: the entry from scene 2 Talk wrote over, written again by the writer.
  const ot = await say('CHANGE-OVERTIME: from scene 3 Vel is blind in one eye');
  db.upsertState(tale.id, vel, { id: hand, fromChapter: 2, body: 'Vel is drowned.', label: 'Fell in' });
  const over = ot.changes.find((x: any) => /scene 2/.test(x.words));
  refusedSince(undo(over.undo), 'an Over time entry the writer changed since');
  assert.strictEqual((db.statesForStory(tale.id).get(vel) ?? []).find((s: any) => s.id === hand)?.body, 'Vel is drowned.',
    'UNDO-LATER: and the writer\'s Over time stays');

  // A forged Undo that leaves out what Talk wrote proves nothing, and is refused the same way.
  const { wrote: _w, ...bare } = heads.undo;
  refusedSince(undo(bare), 'an Undo that does not say what Talk wrote');
  ok('an Undo of a thread room, the premise, a scene, how a thread wakes or its Over time never writes over a later edit');
}

// ---- 6g · ANANSI CHOOSES HIS OWN SEARCHES (#99) ----
//
// With the switch on and search set up, one small call asks for up to three short queries, or none.
// They run against the server's search (a fake here, never the web), and the answer reads what came
// back. Every page read is returned with its link. A thread made or changed from a page gets the
// link in its notes, which never reach a model, and never in its text.
{
  const searched: string[] = [];
  let webDown = false;   // the search server answers 500, as a SearXNG with no engines up does
  const web = createServer((req, res) => {
    const q = new URL(String(req.url), 'http://x').searchParams.get('q') ?? '';
    searched.push(q);
    if (webDown) { res.writeHead(500); res.end(); return; }
    const slug = q.toLowerCase().replace(/[^a-z]+/g, '-');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ results: [1, 2].map((i) => ({ title: `${q} page ${i}`,
      url: `https://myth.example/${slug}/${i}`, content: `What the page says about ${q}, part ${i}.` })) }));
  });
  await new Promise<void>((r) => web.listen(0, '127.0.0.1', r));
  const SEARCH = `http://127.0.0.1:${(web.address() as any).port}/search?q={q}&format=json`;
  process.env.ANANSI_SEARCH = SEARCH;

  const tale = db.createStory(me, { title: 'The Styx', premise: 'A ferry for the dead.' }) as any;
  db.updateStory(tale.id, { world: 'Greek myth' });
  const talia = db.upsertEntry(tale.id, me, { title: 'Talia', body: '', notes: 'Her own note.', activation: 'always_on' });
  db.upsertAddon(tale.id, talia, { slot: 'facts', name: 'facts', body: 'Talia is twenty.' });
  const ctxOf = (body: any) => ({ body: { storyId: tale.id, ...body }, query: new URLSearchParams(),
    owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null }) as any;
  const say = (said: string, search?: boolean) => { calls = []; searched.length = 0;
    return routes['POST /api/talk'](ctxOf({ said, search })) as Promise<any>; };
  const undo = (u: any) => routes['POST /api/talk/undo'](ctxOf({ undo: u })) as any;
  const queryCalls = () => calls.filter((x) => x.response_format?.json_schema?.schema?.properties?.queries);
  const wire = () => calls.map((x) => (x.messages ?? []).map((m: any) => m.content).join('\n')).join('\n');
  const notesOf = (title: string) => (db.entriesOf(tale.id) as any[]).find((e) => e.title === title)?.notes;

  // A question that needs the web: Anansi's own short query, narrowed by the tale's world.
  const who = await say('SEARCH-WHO: who is the ferryman in the old stories?', true);
  assert.ok(!who.error, who.error);
  assert.strictEqual(queryCalls().length, 1, 'SEARCH-QUERY: one small call asks for the searches');
  assert.strictEqual(queryCalls()[0].response_format.json_schema.schema.properties.queries.maxItems, 3,
    'SEARCH-CAP: and it may ask for three at most');
  assert.deepStrictEqual(searched, ['Charon Greek myth'],
    `SEARCH-QUERY: the search is Anansi's own short query, narrowed by the tale's world, not the writer's words (${searched})`);
  assert.match(String(calls.at(-1).messages[1].content), /What the page says about Charon Greek myth, part 2/,
    'SEARCH-READS: the answer reads what the search found');
  assert.deepStrictEqual(who.sources, [
    { title: 'Charon Greek myth page 1', url: 'https://myth.example/charon-greek-myth/1' },
    { title: 'Charon Greek myth page 2', url: 'https://myth.example/charon-greek-myth/2' }],
    'SEARCH-SOURCES: every page read comes back with its title and link');
  ok('a question that needs the web makes Anansi\'s own short search, and every page read comes back with its link');

  const none = await say('SEARCH-NONE: how old is Talia?', true);
  assert.ok(!none.error, none.error);
  assert.strictEqual(searched.length, 0, 'SEARCH-NONE: a question that does not need the web searches nothing');
  assert.deepStrictEqual(none.sources, [], 'SEARCH-NONE: and lists no page');
  const many = await say('SEARCH-MANY: tell me everything about the underworld', true);
  assert.ok(!many.error, many.error);
  assert.strictEqual(searched.length, 3, `SEARCH-CAP: five queries asked for, three searched (${searched})`);
  ok('a question that does not need the web searches nothing, and no reply makes more than three searches');

  const off = await say('SEARCH-WHO: who is the ferryman in the old stories?', false);
  assert.ok(!off.error, off.error);
  assert.strictEqual(queryCalls().length, 0, 'SEARCH-OFF: with the switch off, no query call');
  assert.strictEqual(searched.length, 0, 'SEARCH-OFF: and no search');
  delete process.env.ANANSI_SEARCH;
  const unset = await say('SEARCH-WHO: who is the ferryman in the old stories?', true);
  process.env.ANANSI_SEARCH = SEARCH;
  assert.ok(!unset.error, `SEARCH-UNSET: search not set up is an answer without searching, not an error (${unset.error})`);
  assert.strictEqual(queryCalls().length, 0, 'SEARCH-UNSET: no query call');
  assert.strictEqual(searched.length, 0, 'SEARCH-UNSET: and no search');
  assert.strictEqual(unset.searchable, false, 'SEARCH-UNSET: and the answer says search is not set up');
  ok('with the switch off, or search not set up, no query call and no search is made');

  // A search that fails is a question answered without the web, as a failed query call is.
  webDown = true;
  const broke = await say('SEARCH-WHO: who is the ferryman in the old stories?', true);
  webDown = false;
  assert.ok(!broke.error, `SEARCH-FAILED: a failed search is an answer without the web, not an error (${broke.error})`);
  assert.strictEqual(searched.length, 1, 'SEARCH-FAILED: the search was tried');
  assert.ok(broke.reply.startsWith(LONG), 'SEARCH-FAILED: Anansi still answers');
  assert.match(broke.reply, /search failed/i, `SEARCH-FAILED: and the reply says the search failed:\n${broke.reply.slice(-200)}`);
  assert.deepStrictEqual(broke.sources, [], 'SEARCH-FAILED: and lists no page');
  ok('a search that fails is answered without the web, and the reply says the search failed');

  // A thread made, and a thread changed, from a page: the link in the notes, never in the text.
  const fw = await say('SEARCH-WHO CHANGE-FROMWEB: add the ferryman, and Talia paid him twice', true);
  assert.ok(!fw.error, fw.error);
  assert.strictEqual(fw.changes.length, 2, `both changes are done (${JSON.stringify(fw.notDone)})`);
  assert.match(String(notesOf('Charon')), /https:\/\/myth\.example\/charon-greek-myth\/1/,
    `LINK-NOTES: the thread made from page 1 has its link in its notes (${notesOf('Charon')})`);
  assert.doesNotMatch(String(notesOf('Charon')), /charon-greek-myth\/2/, 'LINK-NOTES: and not a page it was not made from');
  assert.match(String(notesOf('Talia')), /^Her own note\./, 'LINK-NOTES: the writer\'s own notes are kept');
  assert.match(String(notesOf('Talia')), /https:\/\/myth\.example\/charon-greek-myth\/2/,
    'LINK-NOTES: and the thread changed from page 2 has that link added');
  for (const e of db.entriesOf(tale.id) as any[]) assert.doesNotMatch(String(e.body), /https?:|myth\.example/, `LINK-NOT-TEXT: ${e.title}'s text`);
  for (const a of db.addonsOf(tale.id) as any[]) assert.doesNotMatch(String(a.body), /https?:|myth\.example/,
    `LINK-NOT-TEXT: no room carries a link (${a.body})`);
  await say('What does Charon want?', false);
  assert.doesNotMatch(wire(), /myth\.example/, 'LINK-NOT-SENT: the link in the notes never reaches the model');
  const talias = fw.changes.find((x: any) => /Talia/.test(x.words));
  const back: any = undo(talias.undo);
  assert.ok(!back.error, back.error);
  assert.strictEqual(notesOf('Talia'), 'Her own note.', 'UNDO-LINK: Undo puts the notes back as they were');
  ok('a thread made or changed from a page has the link in its notes, never in its text, and Undo takes it out');

  delete process.env.ANANSI_SEARCH;
  web.close();
}

// ---- 6h · TALK WHILE A TALE IS SET UP, ON THE DRAFT (#100) ----
//
// There is no tale yet, so the route names none and is open like the Spark routes. It takes the
// draft, the step the writer is on and the turns, and answers in Talk's shape. It writes nothing:
// the changes come back for the page to apply to its own draft, each checked against that draft.
{
  const { DatabaseSync } = await import('node:sqlite');
  const { OPEN_ROUTES } = await import('../src/routes.ts');
  // Every row of every table, read through a connection of its own, so a write anywhere shows. All
  // but the talks kept (2026-10-30): the route writes its own talk, and the checks count that apart.
  const rows = () => {
    const raw = new DatabaseSync(DB, { readOnly: true });
    try {
      const names = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as any[]).map((r) => r.name)
        .filter((t) => t !== 'talk_sessions');
      return Object.fromEntries(names.map((t) => [t, (raw.prepare(`SELECT count(*) AS n FROM "${t}"`).get() as any).n]));
    } finally { raw.close(); }
  };
  const draft = {
    story: { title: 'The Winter Signature', genre: 'political fantasy', premise: 'Six houses have one winter to sign a peace.',
      setting: 'Kesh, under snow', writingStyle: 'Cold, spare, third person.', persona: 'Mara Voss' },
    entries: [
      { title: 'Ilva Marren', entryType: 'character', body: '[Ilva Marren: the envoy nobody trusts]', keys: ['Ilva'],
        rooms: { voice: { name: 'Envoy', body: 'Formal and short.', on: true } } },
      { title: 'The Innkeeper', entryType: 'character', body: '[The Innkeeper: keeps every secret for a price]', keys: ['innkeeper'] },
      { title: 'Mara Voss', entryType: 'character', body: '[Mara Voss: a courier]', keys: ['Mara'] },
      { title: 'Gull Rock', entryType: 'lore', body: '[Gull Rock: where the houses meet]', keys: ['Gull Rock'] },
      // Unticked on the threads step: not in the draft, so nothing can be done to it.
      { title: 'The Old King', entryType: 'character', body: '[The Old King: dead]', keys: ['king'], keep: false },
    ],
  };
  const STEP = 'The threads: What this tale needs, if anything.';
  const setup = (said: string, more: any = {}) => { calls = [];
    return routes['POST /api/spark/talk']({ body: { draft, step: STEP, said, ...more }, query: new URLSearchParams(),
      owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: {}, setGen: () => {},
      defaultModel: null } as any) as Promise<any>; };

  assert.ok(OPEN_ROUTES.has('POST /api/spark/talk'), 'SETUP-OPEN: the setup Talk names no tale, so it is open like Spark');

  const before = rows();
  const talksBefore = db.talkSessions(me, null).length;
  const r = await setup('CHANGE-SETUP: make it darker, lose the innkeeper, Ilva speaks low, and add the ferryman',
    { turns: [{ you: true, text: 'Who matters in Kesh?' }, { you: false, text: 'The houses, mostly.' }] });
  assert.ok(!r.error, r.error);
  const ask = calls.at(-1).messages.map((m: any) => m.content).join('\n');
  assert.ok(ask.indexOf(STEP) >= 0 && ask.indexOf(STEP) < ask.indexOf('Six houses have one winter'),
    `SETUP-STEP-FIRST: the step the writer is on is named before the draft:\n${ask.slice(0, 400)}`);
  for (const seen of ['The Winter Signature', 'political fantasy', 'Kesh, under snow', 'Cold, spare, third person.',
    'the envoy nobody trusts', 'Formal and short.', 'Mara Voss', 'The houses, mostly.'])
    assert.ok(ask.includes(seen), `SETUP-SEES-DRAFT: Anansi sees the whole draft and the turns: ${seen}`);
  assert.ok(!ask.includes('The Old King'), 'SETUP-SEES-DRAFT: a thread the writer unticked is not in the draft');

  const by = (op: string) => r.changes.filter((x: any) => x.change.op === op);
  assert.strictEqual(r.changes.length, 4, `SETUP-CHANGES: all four asked changes come back (${JSON.stringify(r.notDone)})`);
  assert.deepStrictEqual(by('tale.set')[0].change, { op: 'tale.set', field: 'premise', key: 'premise',
    text: 'Six houses, one winter, and every one of them lies.', before: 'Six houses have one winter to sign a peace.' },
    'SETUP-FIELD: the premise, with what it said before, for Undo');
  assert.deepStrictEqual(by('thread.remove')[0].change, { op: 'thread.remove', title: 'The Innkeeper' },
    'SETUP-REMOVE: a draft thread is removed, named as the draft names it');
  assert.deepStrictEqual(by('thread.set')[0].change, { op: 'thread.set', title: 'Ilva Marren', room: 'voice',
    text: 'Low and slow; she never asks.', before: 'Formal and short.' }, 'SETUP-SET: one room of a draft thread');
  const made = by('thread.new')[0].change;
  assert.strictEqual(made.thread.title, 'The Ferryman', 'SETUP-NEW: a new draft thread');
  assert.strictEqual(made.thread.entryType, 'character');
  assert.match(made.thread.body, /Rows the dead across for a coin/, 'SETUP-NEW: with its Always true');
  for (const x of r.changes) assert.ok(String(x.words ?? '').trim(), 'SETUP-WORDS: each change says what it did');
  assert.match(r.reply, /^Darker/, 'SETUP-REPLY: the reply is Anansi\'s');
  assert.deepStrictEqual(rows(), before, 'SETUP-WRITES-NOTHING: not one row of the tale anywhere in the database');
  // The one row it writes is the talk itself (2026-10-30), so it can be revisited.
  assert.strictEqual(db.talkSessions(me, null).length, talksBefore + 1, 'SETUP-WRITES-NOTHING: and one row for the talk itself');
  ok('setup Talk names the step first, sees the whole draft, and returns the asked changes, writing only the talk');

  // The model it uses is the one Spark uses.
  calls = [];
  await routes['POST /api/spark']({ body: { idea: 'Six houses have one winter to sign a peace.' }, query: new URLSearchParams(),
    owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: {}, setGen: () => {}, defaultModel: null } as any);
  const sparkModel = calls[0].model;
  await setup('How should I start?');
  assert.strictEqual(calls.at(-1).model, sparkModel, `SETUP-MODEL: Spark's model (${sparkModel}), not ${calls.at(-1).model}`);
  ok('setup Talk asks the model Spark asks');

  // THE ROUTE IS OPEN, so what it puts in the prompt is capped whatever it is sent: how many threads,
  // how many pockets of each, and how long each piece of text is.
  {
    const huge = 'x'.repeat(5000);
    const pockets = Object.fromEntries(['not_a_slot_' + 'y'.repeat(300), 'setting', ...ALL_SLOTS_T].map((s) =>
      [s, { name: s, body: `${s}:${huge}`, on: true }]));
    const big = { story: { ...draft.story, persona: 'P'.repeat(5000), lockedCharacter: 'L'.repeat(5000), title: 'T'.repeat(5000) },
      entries: Array.from({ length: 200 }, (_, i) => ({ title: `Thread ${i} ${'t'.repeat(300)}`, entryType: 'character',
        body: huge, rooms: pockets })) };
    calls = [];
    const r = await routes['POST /api/spark/talk']({ body: { draft: big, step: STEP, said: 'Who matters?' },
      query: new URLSearchParams(), owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: {},
      setGen: () => {}, defaultModel: null } as any) as any;
    assert.ok(!r.error, r.error);
    const sent = calls.at(-1).messages.map((m: any) => m.content).join('\n');
    const threads = sent.split('\n').filter((l) => /^- Thread \d+/.test(l));
    assert.ok(threads.length <= 30, `SETUP-CAP-THREADS: at most 30 threads reach the prompt (${threads.length})`);
    assert.ok(threads.length > 0, 'SETUP-CAP-THREADS: and some do');
    const first = sent.slice(sent.indexOf('- Thread 0'), sent.indexOf('- Thread 1'));
    const read = first.split('\n').filter((l) => /^ {2}\w+:/.test(l));
    assert.ok(read.length <= 4, `SETUP-CAP-POCKETS: at most four pockets of a thread are read (${read.length})`);
    assert.ok(!/not_a_slot/.test(sent), 'SETUP-CAP-POCKETS: and only pockets that exist');
    assert.ok(!/x{601}/.test(sent), 'SETUP-CAP-TEXT: no piece of thread text over 600 characters');
    assert.ok(!/[PLT]{201}/.test(sent), 'SETUP-CAP-TEXT: nor who the writer plays, who is held, or the title');
    assert.ok(sent.length < 80_000, `SETUP-CAP-TEXT: the whole ask is bounded (${sent.length} characters)`);
  }
  ok('setup Talk caps the threads, the pockets and the text an open request can put in the prompt');

  const bad = await setup('CHANGE-SETUPBAD: do all of this');
  assert.ok(!bad.error, bad.error);
  assert.strictEqual(bad.changes.length, 0, `SETUP-REFUSED: nothing the draft cannot take is done (${JSON.stringify(bad.changes)})`);
  assert.strictEqual(bad.notDone.length, 4, 'SETUP-REFUSED: and each is said');
  assert.match(bad.reply, /Not done\. .*no thread called "Nobody"/, 'SETUP-REFUSED: a thread the draft does not have');
  assert.match(bad.reply, /Not done\. [^\n]*(scene|not something)/i, 'SETUP-REFUSED: a scene, which a draft does not have yet');
  assert.match(bad.reply, /Not done\. [^\n]*you play Mara Voss/i, 'SETUP-REFUSED: the thread you play stays while you play them');
  assert.match(bad.reply, /Not done\. [^\n]*a lore has no voice/i, 'SETUP-REFUSED: a room the thread\'s kind does not have');
  ok('setup Talk refuses what the draft cannot take, and says each in the reply');

  const offer = await setup('CHANGE-SETUPASK: who are the big houses?');
  assert.ok(!offer.error, offer.error);
  assert.strictEqual(offer.changes.length, 0, 'SETUP-OFFER: a question changes nothing');
  assert.deepStrictEqual(offer.entries.map((e: any) => e.title), ['House Marren'],
    'SETUP-OFFER: what he offers comes back to be added, never one the draft already has');
  assert.match(offer.entries[0].body, /northern passes/, 'SETUP-OFFER: in the shape a draft thread has');
  assert.strictEqual(offer.entries[0].entryType, 'lore');
  ok('a question gets an answer and offers, and changes nothing');

  // #101 · NAMING AN IP HANDS OVER TO THE WORLD STEP. The tale's World field is set, which the page
  // matches to a World or looks up (#103, #104); the people he would have made or offered for it are
  // held back, because the World step is the one way they are made.
  const ip = await setup('CHANGE-SETUPIP: it is set in Elden Ring, with Morgott in it');
  assert.ok(!ip.error, ip.error);
  assert.deepStrictEqual(ip.changes.map((x: any) => [x.change.op, x.change.key, x.change.text]), [['tale.set', 'world', 'Elden Ring']],
    `SETUP-IP: the World field is set, and no thread is made (${JSON.stringify(ip.changes)})`);
  assert.strictEqual(ip.changes[0].change.before, '', 'SETUP-IP: with what was there, for its Undo');
  assert.deepStrictEqual(ip.entries, [], 'SETUP-IP: and nothing is offered for the IP either');
  assert.match(ip.reply, /Morgott[^\n]*World/, `SETUP-IP: the reply says where Morgott will come from (${ip.reply})`);
  assert.deepStrictEqual(rows(), before, 'SETUP-IP: and nothing is written');
  ok('naming an IP during setup sets the tale\'s World and leaves its people to the World step');

  // Search, as in a tale: Anansi's own queries, the pages listed, a link in the notes, not the text.
  const searched: string[] = [];
  let webDown = false;
  const web = createServer((req, res) => {
    const q = new URL(String(req.url), 'http://x').searchParams.get('q') ?? '';
    searched.push(q);
    if (webDown) { res.writeHead(500); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ results: [{ title: `${q} page`, url: 'https://myth.example/charon/1', content: `About ${q}.` }] }));
  });
  await new Promise<void>((ok2) => web.listen(0, '127.0.0.1', ok2));
  process.env.ANANSI_SEARCH = `http://127.0.0.1:${(web.address() as any).port}/search?q={q}&format=json`;
  try {
    const off = await setup('SEARCH-WHO CHANGE-SETUPWEB: add the ferryman of the dead');
    assert.strictEqual(searched.length, 0, 'SETUP-SEARCH-OFF: without the switch, no search');
    assert.strictEqual(off.searchable, true, 'SETUP-SEARCH: the answer says search is set up');
    const fw = await setup('SEARCH-WHO CHANGE-SETUPWEB: add the ferryman of the dead', { search: true });
    assert.ok(!fw.error, fw.error);
    assert.deepStrictEqual(searched, ['Charon'], `SETUP-SEARCH: Anansi's own query (${searched})`);
    assert.deepStrictEqual(fw.sources, [{ title: 'Charon page', url: 'https://myth.example/charon/1' }],
      'SETUP-SEARCH: the page read comes back with its link');
    const charon = fw.changes[0]?.change?.thread;
    assert.doesNotMatch(String(charon?.body), /https?:/, 'SETUP-LINK-NOT-TEXT: no link in the thread\'s text');
    assert.match(String(charon?.notes), /https:\/\/myth\.example\/charon\/1/, 'SETUP-LINK-NOTES: the link is in its notes');
    assert.deepStrictEqual(rows(), before, 'SETUP-WRITES-NOTHING: searching writes nothing either');
    webDown = true;
    const broke = await setup('SEARCH-WHO: who ferries the dead?', { search: true });
    webDown = false;
    assert.ok(!broke.error, `SETUP-SEARCH-FAILED: a failed search is an answer without the web (${broke.error})`);
    assert.match(String(broke.reply), /search failed/i, 'SETUP-SEARCH-FAILED: and the reply says the search failed');
  } finally { delete process.env.ANANSI_SEARCH; web.close(); }
  ok('setup Talk searches only when allowed, lists the page, and keeps its link in the notes');
}

// ---- 6i · A NEW IP IS LOOKED UP, AND ITS TICKED PEOPLE BECOME A WORLD (#104) ----
//
// The names list is the World cast's lookup, opened for a tale that is not made yet: it searches,
// names about twelve people and six places with one line each, and writes nothing. With search off,
// failing or finding nothing, the names come from what the model knows, each marked from memory.
{
  const { DatabaseSync } = await import('node:sqlite');
  const { OPEN_ROUTES } = await import('../src/routes.ts');
  const rows = () => {
    const raw = new DatabaseSync(DB, { readOnly: true });
    try {
      const names = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as any[]).map((r) => r.name)
        // The search index's own storage: an insert taken back leaves its segments, not its rows.
        .filter((t) => !/^fts_.*_(data|idx)$/.test(t));
      return Object.fromEntries(names.map((t) => [t, (raw.prepare(`SELECT count(*) AS n FROM "${t}"`).get() as any).n]));
    } finally { raw.close(); }
  };
  const searched: string[] = [];
  let webDown = false, webEmpty = false;
  const web = createServer((req, res) => {
    const q = new URL(String(req.url), 'http://x').searchParams.get('q') ?? '';
    searched.push(q);
    if (webDown) { res.writeHead(500); res.end(); return; }
    const slug = q.toLowerCase().replace(/[^a-z]+/g, '-');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ results: webEmpty ? [] : [{ title: `${q} page`, url: `https://ring.example/${slug}`,
      content: `What the wiki says about ${q}.` }] }));
  });
  await new Promise<void>((r) => web.listen(0, '127.0.0.1', r));
  const SEARCH = `http://127.0.0.1:${(web.address() as any).port}/search?q={q}&format=json`;
  process.env.ANANSI_SEARCH = SEARCH;
  const ctxOf = (body: any, owner = me) => ({ body, query: new URLSearchParams(), owner,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: {}, setGen: () => {}, defaultModel: null }) as any;
  const look = (body: any) => { calls = []; searched.length = 0;
    return routes['POST /api/spark/world/cast'](ctxOf(body)) as Promise<any>; };
  const listCall = () => calls.find((x) => x.response_format?.json_schema?.schema?.properties?.found);
  const listed = (r: any) => (r.found ?? []).map((f: any) => [f.name, f.kind, f.line, !!f.memory]);
  try {
    assert.ok(OPEN_ROUTES.has('POST /api/spark/world/cast'), 'IP-LIST-OPEN: the list names no tale, so it is open like Spark');
    const before = rows();
    const r = await look({ world: 'Elden Ring' });
    assert.ok(!r.error, r.error);
    assert.deepStrictEqual(listed(r), [
      ['Morgott', 'character', 'The Omen King, who guards Leyndell.', false],
      ['Godfrey', 'character', 'The first Elden Lord.', false],
      ['Leyndell', 'place', 'The royal capital under the Erdtree.', false]],
      'IP-LIST: people and places, one line each, never the World itself and never one name twice');
    assert.deepStrictEqual(searched, ['Elden Ring wiki'], `IP-LIST-SEARCH: the World cast's own search (${searched})`);
    const schema = listCall()?.response_format.json_schema.schema;
    assert.strictEqual(schema?.properties.found.maxItems, 18, 'IP-LIST-SIZE: eighteen at most');
    assert.deepStrictEqual(schema?.properties.found.items.properties.kind.enum, ['character', 'place'],
      'IP-LIST-KINDS: people and places only');
    assert.ok(schema?.properties.found.items.required.includes('line'), 'IP-LIST-LINE: each with its line');
    assert.match(String(listCall()?.messages[0].content), /about twelve people and six places/,
      'IP-LIST-SIZE: the ask is about twelve people and six places');
    assert.deepStrictEqual(rows(), before, 'IP-LIST-WRITES-NOTHING: the list writes nothing');
    ok('a new IP is looked up through the World cast: twelve people and six places asked for, one line each, nothing written');

    // ASK FOR MORE: the names already shown are named in the ask, and never come back.
    const more = await look({ world: 'Elden Ring', more: ['Morgott', 'Godfrey', 'Leyndell'] });
    assert.ok(!more.error, more.error);
    assert.match(String(listCall()?.messages[0].content), /Already on the list, so name none of these again: Morgott, Godfrey, Leyndell/,
      'IP-MORE: the ask names what is already listed');
    assert.deepStrictEqual(listed(more), [['Malenia', 'character', 'Blade of Miquella, never known defeat.', false]],
      'IP-MORE: and a name already listed is not offered twice');
    ok('asking for more names what is listed, and offers only new names');

    // FROM MEMORY: search off, failing, or finding nothing. Each name is marked; nothing is written.
    for (const [why, set] of [['off', () => { delete process.env.ANANSI_SEARCH; }],
        ['failing', () => { webDown = true; }], ['empty', () => { webEmpty = true; }]] as const) {
      set();
      const mem = await look({ world: 'Elden Ring' });
      process.env.ANANSI_SEARCH = SEARCH; webDown = false; webEmpty = false;
      assert.ok(!mem.error, `IP-MEMORY (${why}): a search ${why} is not an error (${mem.error})`);
      assert.deepStrictEqual(listed(mem).map((x: any) => x[3]), [true, true, true],
        `IP-MEMORY (${why}): every name is marked from memory`);
      assert.strictEqual(mem.memory, true, `IP-MEMORY (${why}): and the answer says so`);
      assert.match(String(listCall()?.messages[0].content), /There are no search results\. From what you already know/,
        `IP-MEMORY (${why}): the model is asked from what it knows`);
    }
    assert.deepStrictEqual(rows(), before, 'IP-MEMORY: from memory writes nothing either');
    ok('search off, failing or finding nothing gives names from memory, each marked, nothing written');

    // CREATE: the World is made with the ticked names only, written as threads in the shape of every
    // other thread, and the tale follows it. Godfrey was listed and not ticked, so he is not sent.
    const create = (body: any) => { calls = []; searched.length = 0;
      return routes['POST /api/stories'](ctxOf({ title: 'The Lands Between', spark: true, entries: [], ...body })) as Promise<any>; };
    // Another writer's World of the same name is theirs: it neither stops this one nor is followed.
    const other = db.owner('another-writer');
    const theirs = db.createWorld(other, { title: 'Elden Ring' });
    const made = await create({ world: 'Elden Ring', newWorld: { title: 'Elden Ring', threads: [
      { name: 'Morgott', kind: 'character' }, { name: 'Leyndell', kind: 'place', memory: true }] } });
    assert.ok(made && !made.error, made?.error);
    const ring = db.worldNamed(me, 'Elden Ring');
    assert.ok(ring && db.storyOwner(ring.id) === me, 'IP-CREATE-MINE: a World of that name is made, owned by the writer');
    assert.notStrictEqual(ring!.id, theirs.id, 'IP-CREATE-MINE: not the other writer\'s World of that name');
    assert.strictEqual(db.entriesOf(theirs.id).length, 0, 'IP-CREATE-MINE: and nothing is written into theirs');
    const tale = db.getStory(made.id) as any;
    assert.deepStrictEqual([tale.lore_from, tale.world], [ring!.id, 'Elden Ring'], 'IP-CREATE-FOLLOWS: the tale follows it, named');
    const threads = db.entriesOf(ring!.id) as any[];
    assert.deepStrictEqual(threads.map((e) => e.title).sort(), ['Leyndell', 'Morgott'],
      'IP-CREATE-TICKED: only the ticked names are written, as the World\'s threads');
    const pocketsOf = (title: string) => (db.addonsOf(ring!.id) as any[]).filter((a) => a.entry_id === threads.find((e) => e.title === title).id);
    const morgott = threads.find((e) => e.title === 'Morgott');
    assert.match(String(pocketsOf('Morgott').find((a) => a.slot === 'facts')?.body), /the one the Lands Between remember/,
      'IP-CREATE-SHAPE: what he is goes in Always true');
    assert.ok(pocketsOf('Morgott').some((a) => a.slot === 'voice' && a.active && /calls everyone Tarnished/.test(a.body)),
      'IP-CREATE-SHAPE: and his pockets are written and switched on');
    assert.ok(pocketsOf('Leyndell').some((a) => a.slot === 'atmosphere' && a.active), 'IP-CREATE-SHAPE: a place\'s pockets too');
    assert.strictEqual(morgott.activation, 'triggered', 'IP-CREATE-WAKES: a World thread wakes on its words');
    assert.ok(JSON.parse(morgott.keys).includes('Morgott'), 'IP-CREATE-WAKES: and his name is one of them');
    assert.deepStrictEqual(searched, ['Morgott Elden Ring'],
      `IP-CREATE-SEARCH: a looked-up name is searched in its World, a name from memory is not (${searched})`);
    const asked = calls.filter((x) => /Write ONE \w+ card for/.test(String(x.messages?.[0]?.content)));
    assert.match(String(asked.find((x) => /"Leyndell"/.test(x.messages[0].content))?.messages[0].content),
      /There are no search results/, 'IP-CREATE-MEMORY: a name from memory is written from what the model knows');
    assert.match(String(morgott.notes), /https:\/\/ring\.example\/morgott-elden-ring/, 'IP-CREATE-LINK: the page read is in his notes');
    for (const t of [...threads, ...db.addonsOf(ring!.id) as any[]])
      assert.doesNotMatch(`${t.title ?? ''} ${t.body}`, /memory|looked up|https?:/i, `IP-CREATE-NO-MARK: no mark or link in the text (${t.body})`);
    assert.ok(db.entriesFor(made.id).some((e: any) => e.title === 'Morgott'), 'IP-CREATE-REACHES: the World\'s people reach the tale');
    ok('Create makes the writer\'s World of the ticked names only, in the normal thread shape, and the tale follows it');

    // #105 · A NEW WORLD'S PEOPLE IN THE OPENING, PLAYED AND HELD. They are named as they were ticked,
    // and Melina's thread comes back under a longer title: she is still the one played, held and
    // pinned. Rennala is pinned and stays the World's; Melina is taken over into the tale.
    const lv = await create({ world: 'Liurnia', persona: 'Melina', lockedCharacter: 'Melina', inOpening: ['Melina', 'Rennala'],
      newWorld: { title: 'Liurnia', threads: [{ name: 'Melina', kind: 'character' }, { name: 'Rennala', kind: 'character' }] } });
    assert.ok(lv && !lv.error, lv?.error);
    const liurnia = db.worldNamed(me, 'Liurnia')!;
    const inWorld = (t: string) => (db.entriesOf(liurnia.id) as any[]).find((e) => e.title === t)?.id;
    const melina = (db.entriesOf(lv.id) as any[]).find((e) => e.origin_id === inWorld('Melina, the Maiden'));
    assert.ok(melina, 'NEW-WORLD-HELD: the tale takes over the thread of the one it plays and holds');
    assert.deepStrictEqual(db.pinsOf(lv.id).map((p: any) => [p.chapter_id, p.mode, p.entry_id]).sort(),
      [[lv.chapterId, 'force_in', melina.id], [lv.chapterId, 'force_in', inWorld('Rennala')]].sort(),
      'NEW-WORLD-OPENING: both are pinned to the first scene, Rennala by the World\'s own thread');
    ok('a new World\'s people marked in the opening are pinned, and the one played and held is the tale\'s own');

    // A FAILURE AT CREATE LEAVES NOTHING: a name that cannot be written, and a step after the World is made.
    const had = rows();
    const bad = await create({ world: 'Limgrave', newWorld: { title: 'Limgrave', threads: [
      { name: 'Margit', kind: 'character' }, { name: 'Nobody', kind: 'character' }] } });
    assert.match(String(bad?.error), /Nobody/, `IP-FAIL: the error names the one that could not be written (${bad?.error})`);
    assert.deepStrictEqual(rows(), had, 'IP-FAIL: and no World, thread or tale is left behind');
    await assert.rejects(create({ world: 'Limgrave', entries: [null], newWorld: { title: 'Limgrave', threads: [
      { name: 'Margit', kind: 'character' }] } }), 'IP-FAIL-LATE: a step after the World is made fails');
    assert.deepStrictEqual(rows(), had, 'IP-FAIL-LATE: and the World and its threads go with the tale');
    const twice = await create({ world: 'Elden Ring', newWorld: { title: 'elden ring', threads: [{ name: 'Margit', kind: 'character' }] } });
    assert.match(String(twice?.error), /already have a World/, 'IP-TWICE: a second World of a name the writer has is refused');
    assert.deepStrictEqual(rows(), had, 'IP-TWICE: and makes nothing');
    ok('a failure at Create, before or after the World is made, leaves no World, thread or tale behind');
  } finally { delete process.env.ANANSI_SEARCH; web.close(); }
}

// ---- #101 · TALK AND AN IP: CANON TO THE WORLD, THE WRITER'S VERSION TO THE TALE ----
//
// In a tale that follows a World, an asked change to the IP's canon is written to the World's thread
// and every tale that follows it has it; the writer's own version is written to the tale, which takes
// the thread over so the World keeps its own. Both have an Undo, through the same route. A change the
// model did not place is not applied, and nothing else in that answer is either: the reply asks in
// one line. Only the World's owner changes it.
{
  const ring = db.createWorld(me, { title: 'Elden Ring' });
  const wMorgott = db.upsertEntry(ring.id, me, { title: 'Morgott', body: '', entryType: 'character', activation: 'triggered', keys: ['Morgott'] });
  db.upsertAddon(ring.id, wMorgott, { slot: 'facts', name: 'facts', body: 'The Omen King, alone.' });
  const tale = db.storyFollowing(me, ring.id, 'The Lands Between')!;
  const ctxOf = (body: any, owner = me) => ({ body: { storyId: tale.id, ...body }, query: new URLSearchParams(),
    owner, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null }) as any;
  const say = (said: string, owner = me) => { calls = []; return routes['POST /api/talk'](ctxOf({ said }, owner)) as Promise<any>; };
  const undo = (u: any, owner = me) => routes['POST /api/talk/undo'](ctxOf({ undo: u }, owner)) as any;
  const pockets = (storyId: string, entry: string) => (db.addonsOf(storyId) as any[]).filter((a) => a.entry_id === entry)
    .map((a) => [a.slot, a.body]).sort();
  const own = () => (db.entriesOf(tale.id) as any[]).find((e) => e.title === 'Morgott');
  const seen = () => (routes['GET /api/story']({ ...ctxOf({}), query: new URLSearchParams({ story: tale.id }) }) as any)
    .entries.find((e: any) => e.title === 'Morgott');
  const both = () => JSON.stringify([db.entriesOf(ring.id), db.addonsOf(ring.id), db.entriesOf(tale.id), db.addonsOf(tale.id),
    (db.getStory(tale.id) as any).premise]);

  // CANON: the World's Morgott gets the voice, and a new thread of the canon is made in the World.
  const canon = await say('CHANGE-CANON: in Elden Ring Morgott speaks slowly, and add Malenia');
  assert.ok(!canon.error, canon.error);
  assert.match(calls.at(-1).messages.map((m: any) => m.content).join('\n'), /follows the World Elden Ring/,
    'IP-TOLD: Anansi is told which World the tale follows');
  assert.deepStrictEqual(pockets(ring.id, wMorgott), [['facts', 'The Omen King, alone.'], ['voice', 'Slow, formal, never a contraction.']],
    'IP-CANON: the voice is written to the World\'s Morgott');
  assert.ok(!own(), 'IP-CANON: and the tale has no Morgott of its own');
  const malenia = (db.entriesOf(ring.id) as any[]).find((e) => e.title === 'Malenia');
  assert.ok(malenia, 'IP-CANON-NEW: a new thread of the canon is made in the World');
  assert.ok(!(db.entriesOf(tale.id) as any[]).some((e) => e.title === 'Malenia'), 'IP-CANON-NEW: not in the tale');
  assert.strictEqual(canon.changes.length, 2, `IP-CANON: two changes, two lines (${canon.reply})`);
  assert.match(canon.changes[0].words, /Morgott's voice.*Elden Ring/, `IP-CANON-LINE: the line names the World (${canon.changes[0].words})`);
  for (const c of [...canon.changes].reverse()) { const r = undo(c.undo); assert.ok(!r.error, r.error); }
  assert.deepStrictEqual(pockets(ring.id, wMorgott), [['facts', 'The Omen King, alone.']], 'IP-CANON-UNDO: Undo takes the voice back off the World');
  assert.ok(!(db.entriesOf(ring.id) as any[]).some((e) => e.title === 'Malenia'), 'IP-CANON-UNDO: and the new World thread away');
  ok('an asked change to canon goes to the World, and Undo takes it back');

  // THE WRITER'S VERSION: the tale takes Morgott over, and the World keeps its own.
  const mine = await say('CHANGE-MINE: in my tale Morgott has taken Rennala as his queen');
  assert.ok(!mine.error, mine.error);
  assert.ok(own(), 'IP-MINE: the tale has its own Morgott now');
  assert.strictEqual(own().origin_id, wMorgott, 'IP-MINE: taken over from the World\'s, not made beside it');
  assert.deepStrictEqual(pockets(tale.id, own().id), [['facts', 'Morgott has taken Rennala as his queen.']],
    'IP-MINE: with the writer\'s version');
  assert.deepStrictEqual(pockets(ring.id, wMorgott), [['facts', 'The Omen King, alone.']], 'IP-MINE: and the World\'s is untouched');
  assert.ok(!seen().sharedFrom, 'IP-MINE: the tale reads its own Morgott');
  assert.match(mine.changes[0].words, /this tale's own/, `IP-MINE-LINE: the line says it is the tale's own now (${mine.changes[0].words})`);
  const back = undo(mine.changes[0].undo);
  assert.ok(!back.error, back.error);
  assert.ok(!own(), 'IP-MINE-UNDO: Undo hands the thread back');
  assert.strictEqual(seen().sharedFrom, 'Elden Ring', 'IP-MINE-UNDO: and the tale reads the World\'s Morgott again');
  assert.deepStrictEqual(pockets(ring.id, wMorgott), [['facts', 'The Omen King, alone.']], 'IP-MINE-UNDO: which is as it was');
  ok('an asked change to the writer\'s version goes to the tale, taking the thread over, and Undo hands it back');

  // UNCLEAR: nothing in the answer is applied, the premise beside it either, and the reply asks once.
  const was = both();
  const unsure = await say('CHANGE-UNSURE: Morgott is blind, and the premise is ash');
  assert.ok(!unsure.error, unsure.error);
  assert.strictEqual(both(), was, 'IP-UNSURE: nothing is applied, in the World or the tale');
  assert.deepStrictEqual(unsure.changes, [], 'IP-UNSURE: no change line comes back');
  const asks = String(unsure.reply).split('\n').filter((l) => /\?$/.test(l.trim()));
  assert.strictEqual(asks.length, 1, `IP-UNSURE: the reply asks in one line:\n${unsure.reply}`);
  assert.match(asks[0], /Morgott.*Elden Ring.*this tale/, 'IP-UNSURE: naming the thread, the World and the tale');
  ok('an unclear change is not applied, nor anything beside it, and the reply asks which in one line');

  // ONLY THE WORLD'S OWNER: a writer called into the tale cannot change the World through Talk.
  const bob = db.owner('bob-101');
  db.addWriter(tale.id, bob);
  const theirs = await say('CHANGE-CANON: in Elden Ring Morgott speaks slowly', bob);
  assert.ok(!theirs.error, theirs.error);
  assert.deepStrictEqual(pockets(ring.id, wMorgott), [['facts', 'The Omen King, alone.']], 'IP-OWNER: the World is untouched');
  assert.ok(!(db.entriesOf(ring.id) as any[]).some((e) => e.title === 'Malenia'), 'IP-OWNER: and nothing is made in it');
  assert.ok(!(db.entriesOf(tale.id) as any[]).some((e) => e.title === 'Malenia'), 'IP-OWNER: nor in the tale, which was not asked for');
  assert.match(theirs.reply, /Not done/, 'IP-OWNER: and the reply says so');
  // And an Undo naming a World cannot reach one this tale does not follow.
  const other = db.createWorld(me, { title: 'Dune' });
  const spice = db.upsertEntry(other.id, me, { title: 'Spice', body: '', entryType: 'lore', activation: 'always_on' });
  db.upsertAddon(other.id, spice, { slot: 'facts', name: 'facts', body: 'It flows.' });
  const forged = undo({ op: 'thread.unmake', thread: spice, title: 'Spice', text: 'It flows.', world: other.id });
  assert.match(String(forged.error), /^Not undone/, `IP-UNDO-SCOPE: refused (${JSON.stringify(forged.error)})`);
  assert.ok(db.entriesOf(other.id).length === 1, 'IP-UNDO-SCOPE: and that World keeps its thread');
  ok('only the World\'s owner changes it through Talk, and an Undo reaches only the World the tale follows');
}

// ---- 6d · THE WRITER MOVES A PROPOSAL, AND THE WRITER OUTRANKS THE MODEL ----
//
// The other half of the same fix. A room the model chose badly could only be rejected and the whole
// thing retyped by hand — so the screen now offers the room, the trigger words, and the choice
// between a change and a state, and `POST /api/proposal/where` is where the first two land.
//
// It is a route and not client state for one reason: `proposals.target` — the room a Replace would
// stand in for — has to be recomputed for the room CHOSEN, and `roomOffer` holds the rule for
// picking it. Deciding that on the screen would put one rule in two places.
{
  const move = (o: any) => routes['POST /api/proposal/where']({
    body: { storyId: story.id, ...o }, query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: {}, setGen: () => {} } as any) as any;
  const decide = (o: any) => routes['POST /api/proposal']({
    body: { storyId: story.id, ...o }, query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: {}, setGen: () => {} } as any) as any;

  const vel = db.entriesOf(story.id).find((e: any) => e.title === 'Vel') as any;
  // `addProposal` answers true or false, not an id — false meaning the dedupe index already holds
  // this subject. So the row is read back by its body, which is what makes each fixture distinct.
  const fresh = (field: string | null, body: string) => {
    assert.ok(db.addProposal(story.id, { kind: 'changed', entry_id: vel.id, title: 'Vel',
      body, entryType: 'character', keys: ['Vel'], field, delta: 'grew quiet' }),
      'the fixture proposal was deduped away — give it a body of its own');
    const row = db.proposalsOf(story.id).find((x: any) => x.body === body);
    assert.ok(row, 'the fixture proposal is not in the queue');
    return row;
  };

  // A ROOM THE WRITER PICKS OVERRIDES THE ONE THE MODEL DID. The model said facts; this is the
  // press that says voice.
  let p = fresh('facts', 'She has stopped raising her voice.');
  await move({ id: p.id, field: 'voice', keys: ['Vel', 'Murmur'] });
  p = db.proposal(story.id, p.id);
  assert.strictEqual(p.field, 'voice', 'the writer\'s room did not stick');
  assert.deepStrictEqual(JSON.parse(p.keys), ['Vel', 'Murmur'],
    'and the trigger words are the writer\'s too — a room nobody keyed mostly never fires');
  ok('the writer moves a proposal to another room, and keys it');

  // EMPTY IS THE CARD'S OWN BODY, the same as `none` from the model — so a change the model put in
  // a room can be pulled back out to the description.
  await move({ id: p.id, field: '' });
  assert.strictEqual(db.proposal(story.id, p.id).field, null);
  assert.strictEqual(db.proposalTarget(db.proposal(story.id, p.id)), 'body',
    'and the accept path agrees it is the description now');

  // A SLOT THIS KIND DOES NOT HAVE IS REFUSED, not stored. `provenance` belongs to an item; a
  // character with one would be a room no screen draws and no prompt sends.
  await move({ id: p.id, field: 'provenance' });
  assert.strictEqual(db.proposal(story.id, p.id).field, null,
    'a slot a character does not have was accepted — the enum cannot say "per kind", so this is '
    + 'the only place that refusal happens');

  // THE EDITED BODY RIDES ALONG, which is what makes the repaint after a move safe: the decide
  // handler's own note has warned since it was written that a repaint mid-edit loses the box.
  await move({ id: p.id, field: 'voice', body: 'She has stopped raising it at all.' });
  assert.strictEqual(db.proposal(story.id, p.id).body, 'She has stopped raising it at all.',
    'moving a proposal threw away the words the writer had already changed');
  ok('an empty room means the description, a room the kind lacks is refused, and the edit survives');

  // A CHANGE OR A STATE, and only the writer knows which. A change edits the description; a state
  // replaces it from a chapter on. Same proposal, two mechanisms.
  // `statesForStory` answers a Map keyed by entry, not a list.
  const velStates = () => db.statesForStory(story.id).get(vel.id) ?? [];
  const statesBefore = velStates().length;
  // No room on this one: it is a change to the whole description, which is exactly the shape a
  // writer turns into a state. It also has to hash differently from the fixture above — the
  // dedupe index keys on the subject and the target, so two `room:facts` changes to Vel are one.
  const q = fresh(null, 'The god has stopped answering her.');
  await decide({ id: q.id, accept: true, asState: 3 });
  const states = velStates();
  assert.strictEqual(states.length, statesBefore + 1,
    'accepting with asState made no state — it took the room branch instead');
  const st = states.at(-1) as any;
  assert.strictEqual(st.from_chapter, 3, 'from the chapter the writer typed, not the model\'s keys');
  assert.strictEqual(st.entry_id, vel.id, 'on the card it was proposed against');

  // AND A STATE NEEDS A CARD TO BE A STATE OF. A `new` proposal has none, so the flag is ignored
  // rather than making a state of nothing.
  assert.ok(db.addProposal(story.id, { kind: 'new', entry_id: null, title: 'The Rust Gate',
    body: 'A gate nobody has opened.', entryType: 'lore', keys: ['gate'] }));
  const orphan = db.proposalsOf(story.id).find((x: any) => x.title === 'The Rust Gate') as any;
  await decide({ id: orphan.id, accept: true, asState: 2 });
  assert.strictEqual(velStates().length, states.length,
    'a state was made for a card that does not exist');
  assert.ok(db.entriesOf(story.id).some((e: any) => e.title === 'The Rust Gate'),
    'and the proposal still landed as the card it was');
  ok('the writer can accept a change as a state instead, and a state needs a card to be a state of');
}

// ---- #42 · A STALE SUMMARY STAYS OUT OF EVERYTHING ANANSI IS ASKED ----
//
// The writing prompt and the act roll-up held a stale chapter summary back; chapter proposals and a
// chapter the writer names in a question did not. A summary is stale when the prose it covers has
// moved, so sending it tells the model about a book that no longer exists. What is asserted is what
// reaches the wire, in both directions: the current summary arrives and the stale one does not, so
// a route that sent nothing at all could not pass.
{
  const book = db.createStory(me, { title: 'The Ferry', premise: 'A ferryman in debt.' }) as any;
  const base = { storyId: book.id, branchId: book.branchId };
  const c1 = book.chapterId;
  db.addPassage({ ...base, chapterId: c1, body: 'Aldis rowed the last crossing of the year.' });
  const c2 = (db.endChapter(book.id, book.branchId, 'Two') as any).opened;
  db.addPassage({ ...base, chapterId: c2, body: 'The river froze and the boat stayed tied.' });
  const c3 = (db.endChapter(book.id, book.branchId, 'Three') as any).opened;
  const FRESH = 'Aldis sold the boat to pay the moneylender.';
  const STALE = 'Aldis drowned the ferryman at the weir.';
  db.setSummary(c1, FRESH, 1, db.proseHash(db.passagesOfChapter(c1).map((p: any) => p.body)), 'model');
  // A hash that matches no prose: the summary describes a version of chapter two that is gone.
  db.setSummary(c2, STALE, 1, 'prose-that-moved', 'model');
  const wire = () => calls.map((b: any) => (b.messages ?? []).map((m: any) => m.content).join('\n'))
    .join('\n');
  const req = (body: any) => ({ body: { storyId: book.id, ...body },
    query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null }) as any;

  calls = [];
  const r: any = await routes['POST /api/chapter/propose'](req({ chapterId: c3 }));
  assert.ok(!r.error, r.error);
  assert.ok(wire().includes(FRESH), 'a current summary still reaches chapter proposals');
  assert.ok(!wire().includes(STALE),
    'a stale chapter summary reached chapter proposals — "What has happened" told the model about '
    + 'prose the book no longer has');
  ok('chapter proposals send the current summary and hold the stale one back');

  // THE WRITER'S OPENING IS USED AS WRITTEN (Seth, 2026-10-30: "What I enter should be what's used"):
  // it reaches the model, and it comes back as the opening, whatever the model wrote there.
  calls = [];
  const mine = 'Days later, Aldis wakes in the moneylender\'s attic.';
  const o: any = await routes['POST /api/chapter/propose'](req({ chapterId: c3, opens: mine }));
  assert.ok(!o.error, o.error);
  assert.ok(wire().includes(mine), 'PROPOSE-OPENS-SENT: the writer\'s opening reaches the model');
  assert.strictEqual(o.opens, mine, 'PROPOSE-OPENS-KEPT: and comes back as the opening, untouched');
  ok('a scene named from the writer\'s opening keeps that opening as written');

  // THE SCENE'S BRIEF RIDES EVERY ASK (Seth, 2026-11-01: the scene "has nothing to do with the brief I
  // wrote"). Asking again from the setup or the scene panel read only the steer, so the brief the hem
  // stored was dropped. The stored brief is read when none is sent; one sent is saved first.
  const BRIEF = 'Aldis goes to the moneylender to buy the boat back; only the two of them.';
  db.updateChapter(book.id, c3, { brief: BRIEF });
  calls = [];
  const s: any = await routes['POST /api/chapter/propose'](req({ chapterId: c3 }));
  assert.ok(!s.error, s.error);
  assert.match(wire(), /THE WRITER'S BRIEF FOR CHAPTER 3[\s\S]*buy the boat back/,
    'PROPOSE-BRIEF-STORED: the scene\'s own brief reaches the ask');
  const NEW = 'Aldis steals the boat back at night.';
  calls = [];
  await routes['POST /api/chapter/propose'](req({ chapterId: c3, brief: NEW }));
  assert.ok(wire().includes(NEW) && !wire().includes('buy the boat back'),
    'PROPOSE-BRIEF-SENT: a brief sent with the ask is the one asked with');
  assert.strictEqual((db.chapters(book.id) as any[]).find((c) => c.id === c3).brief, NEW,
    '  and it is saved on the scene');
  ok('asking for the scene again reads its brief, and a brief sent with the ask is saved');

  // A CHAPTER THE WRITER NAMES. Held back, and SAID to be held back: the writer pointed at it, so
  // a silent gap would read to the model as "nothing happened in chapter two".
  const named = (id: string) => routes['POST /api/talk'](req({
    said: 'What happened in Chapter Two?', mentions: [{ kind: 'chapter', id }] }));
  calls = [];
  const a: any = await named(c2);
  assert.ok(!a.error, a.error);
  assert.ok(!wire().includes(STALE),
    'a stale chapter summary reached the question when the writer named its chapter');
  assert.match(wire(), /Chapter 2 — Two:\nits summary is stale/,
    'the named chapter must say its summary is stale, not arrive empty');
  calls = [];
  const b: any = await named(c1);
  assert.ok(!b.error, b.error);
  assert.match(wire(), new RegExp(`Chapter 1[^\\n]*:\\n${FRESH}`),
    'a named chapter with a current summary still sends it');
  ok('a chapter named in a question sends a current summary, and says a stale one is stale');
}

// ---- TALK READS WHAT IS ASKED (Seth, 2026-10-30: "it should only really look through everything
// based on what I've prompted it"). An always-on thread is sent to Talk when the question, the
// conversation or the last passages name it; the rest are listed by name only, so Anansi knows they
// exist and can ask for one. The writing prompt is not changed: it still sends every always-on thread.
{
  const tale = db.createStory(me, { title: 'The Narrow Sea', premise: 'Two ports and a debt.' }) as any;
  const base = { storyId: tale.id, branchId: tale.branchId, chapterId: tale.chapterId };
  db.upsertEntry(tale.id, me, { title: 'Oren', body: 'Oren keeps the lighthouse and owes the harbourmaster.', activation: 'always_on', keys: ['Oren'] });
  db.upsertEntry(tale.id, me, { title: 'Maren', body: 'Maren sails the night ferry and never pays tolls.', activation: 'always_on', keys: ['Maren'] });
  db.upsertEntry(tale.id, me, { title: 'The Toll House', body: 'The toll house burned in the spring.', activation: 'always_on', keys: ['toll house'] });
  db.addPassage({ ...base, body: 'Oren lit the lamp an hour early and watched the water.' });
  const wire = () => calls.map((b: any) => (b.messages ?? []).map((m: any) => m.content).join('\n')).join('\n');
  const talk = (said: string) => routes['POST /api/talk']({ body: { storyId: tale.id, said },
    query: new URLSearchParams(), owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null } as any);
  calls = [];
  const r: any = await talk('What does Maren want?');
  assert.ok(!r.error, r.error);
  assert.match(wire(), /never pays tolls/, 'TALK-ASKED: the thread the question names is sent');
  assert.match(wire(), /owes the harbourmaster/, 'TALK-PAGE: and the one the last passage names');
  assert.doesNotMatch(wire(), /burned in the spring/, 'TALK-NOT-ASKED: an always-on thread nothing names is not sent');
  assert.match(wire(), /not sent[^\n]*:[^\n]*The Toll House/, 'TALK-INDEX: but it is named, so Anansi knows it is there');
  // The writing prompt is untouched: an always-on thread still reaches every passage.
  const { assemble, view } = await import('../src/story.ts');
  const v: any = view(tale.id);
  const prose = assemble(v, { global: 100_096, slots: 2, perSlot: 50_048 } as any, 'continue');
  assert.match(prose.prompt, /burned in the spring/, 'TALK-ONLY: the writing prompt still sends every always-on thread');
}
ok('Talk sends the threads the question, the conversation or the page names, and lists the rest by name');

// ---- ✦ (#71). Anansi's three ideas for what comes next: one small call, weaving off, writing nothing.
//
// The writers share four Featherless units, so the call is the smallest that does the job: the
// book's own model, no plan, a small cap, no retry, and nothing on the page until the writer sends.
{
  const req = (storyId: string) => ({ body: { storyId }, query: new URLSearchParams(), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null }) as any;
  const before = db.passagesOf(story.id).length;
  calls = [];
  const r: any = await routes['POST /api/idea'](req(story.id));
  assert.ok(!r.error, r.error);
  assert.deepStrictEqual(r.ideas, ['speak', 'act', 'direct', 'narrate'].map((mode) => ({ mode, text: (IDEAS as any)[mode] })),
    'IDEA-MODES: one idea per mode comes back, in the composer\'s order, as the words the model gave');
  assert.deepStrictEqual([...(calls[0].response_format?.json_schema?.schema?.properties?.ideas?.required ?? [])].sort(),
    ['act', 'direct', 'narrate', 'speak'], 'IDEA-MODES: and the schema asks for all four');
  assert.match(String(calls[0].messages[0].content), /speak:[\s\S]*act:[\s\S]*direct:[\s\S]*narrate:/,
    'IDEA-SHAPES: the prompt says what shape each mode\'s idea takes');
  assert.match(String(calls[0].messages[1].content), /The writer plays: /, 'IDEA-WHO: and who the writer plays, for Speak and Act');
  assert.strictEqual(calls.length, 1, `IDEA-ONE: one call to the model, not ${calls.length}`);
  assert.strictEqual(calls[0].chat_template_kwargs?.enable_thinking, false, 'IDEA-NOPLAN: weaving off');
  assert.ok(Number(calls[0].max_tokens) <= 600, `IDEA-SMALL: a small cap, not ${calls[0].max_tokens}`);
  assert.strictEqual(calls[0].model, 'Qwen3.6-WNTH-35B-A3B-NN', "IDEA-MODEL: the book's model writes it");
  assert.match(String(calls[0].messages[1].content), /The lower tiers still pulse/,
    'IDEA-READS: the ideas are asked from the book, its recent passages included');
  assert.strictEqual(db.passagesOf(story.id).length, before, 'IDEA-WRITES-NOTHING: no passage is added');

  // A BOOK THAT WEAVES still gets no plan for this. It is not on WEAVE_ROOM, so `replyFor` gives
  // it no room, and a plan inside a 300-token cap is a reply with nothing in it (F5).
  db.updateStory(story.id, { weaving: true });
  calls = [];
  const w: any = await routes['POST /api/idea'](req(story.id));
  db.updateStory(story.id, { weaving: false });
  assert.ok(!w.error, w.error);
  assert.strictEqual(calls[0].chat_template_kwargs?.enable_thinking, false,
    'IDEA-NOPLAN-WEAVING: a weaving book still asks for the idea with weaving off');
  assert.ok(Number(calls[0].max_tokens) <= 600, `IDEA-SMALL-WEAVING: and no room is added (${calls[0].max_tokens})`);

  // A CUT ANSWER IS NOT ASKED AGAIN. A retry would double the cap (structuredRetry), and the cap is
  // the point of this call; the writer taps again instead.
  breakFirst = true; calls = [];
  const cut: any = await routes['POST /api/idea'](req(story.id));
  breakFirst = false;
  assert.strictEqual(calls.length, 1, `IDEA-NORETRY: a cut answer is not retried (${calls.length} calls)`);
  assert.ok(cut.error, 'IDEA-CUT: and it says so, rather than handing back no ideas');
  ok('✦ asks the book\'s model for an idea per mode in one call, weaving off, on a small cap, and writes nothing');
}

// #120 · THE STYLE NOTE IS PROSE ONLY. It is sent on every prose call, and asked "what its chapters
// are shaped like", one came back "chapters end on the choice to trust, still unmade" — plot, in the
// one block that is meant to hold how the sentences read. NOT MEASURED: this checks the wording only.
{
  const { STYLE_NOTE } = await import('../src/prompts.ts');
  assert.doesNotMatch(STYLE_NOTE, /shaped like|what its chapters/i, 'STYLE-NO-SHAPE: it never asks what the chapters are shaped like');
  // GENRE TEXTURE since 2026-10-29 (Seth chose it): the prose half — sentences, distance, what is
  // left unsaid, dialogue — is the voice's, and STYLE-TEXTURE in the spark block checks it is gone.
  for (const [asks, what] of [[/senses/i, 'the senses it reaches for'], [/lingers on/i, 'what it lingers on'],
      [/textures/i, 'the textures its world is made of']] as const)
    assert.match(STYLE_NOTE, asks, `STYLE-TEXTURE: it asks for ${what}`);
  assert.match(STYLE_NOTE, /never[^.]*chapter[^.]*end/i, 'STYLE-NO-PLOT: it forbids chapter shape and endings');
  assert.match(STYLE_NOTE, /never reuse the premise's images/i, "STYLE-NO-IMAGES: it forbids the premise's images");
  assert.match(STYLE_NOTE, /<[a-z][^<>]*>/, 'STYLE-SHAPE: it shows the form with angle-bracket placeholders');
  // A quoted span is a shape only if it holds a placeholder; any other quote of four words or more
  // is an example sentence the model will copy.
  const quotes = STYLE_NOTE.match(/"[^"]*"/g) ?? [];
  assert.ok(quotes.some((q) => q.includes('<')), 'STYLE-SHAPE-QUOTED: the shape is given as a quoted form');
  assert.deepStrictEqual(quotes.filter((q) => !q.includes('<') && q.split(/\s+/).length >= 4), [],
    'STYLE-NO-EXAMPLE: no quoted example sentence to copy');
  ok('the style note asks for how the prose reads, never chapter shape, endings or the premise\'s images');
}

// EVERY THREAD KEEPS ITS ALWAYS TRUE (Seth, 2026-10-28: the remove on it is gone). The route refuses
// a hand delete of a thread's Always true, and still removes any other pocket.
{
  const tale = db.createStory(me, { title: 'Keeps Its Core', premise: 'A ferry at night.' });
  const t = db.upsertEntry(tale.id, me, { title: 'Ilse', body: '', activation: 'always_on' });
  const facts = db.upsertAddon(tale.id, t, { slot: 'facts', name: 'facts', body: 'Ilse poles the ferry.' });
  const voice = db.upsertAddon(tale.id, t, { slot: 'voice', name: 'How she talks', body: 'Few words.' });
  const del = (id: string) => routes['DELETE /api/addon']({ body: { storyId: tale.id, id }, query: new URLSearchParams(), owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any);
  const r: any = del(facts);
  assert.match(String(r.error), /Always true cannot be removed/, 'KEEP-ALWAYS: a thread\'s Always true is not removed by hand');
  assert.ok((db.addonsOf(tale.id) as any[]).some((a) => a.id === facts), 'KEEP-ALWAYS: and it is still there');
  const ok2: any = del(voice);
  assert.ok(!ok2.error && !(db.addonsOf(tale.id) as any[]).some((a) => a.id === voice), 'KEEP-ALWAYS: any other pocket still goes');
  ok('a thread keeps its Always true; other pockets can still be removed');
}

// ---- THE TALE'S OWN POCKETS ASKED FOR IN TALK: rules, the writer's own instructions, where a string
// stands, and the tale's own fields. Each done at once through the write the screens use, and each
// with an Undo that puts it back.
{
  const tale = db.createStory(me, { title: 'The Ford', genre: 'noir', premise: 'A ferry and a debt.' }) as any;
  db.addPassage({ ...tale, storyId: tale.id, body: 'The ferry left without her.' });
  const ctxOf = (body: any) => ({ body: { storyId: tale.id, ...body }, query: new URLSearchParams(),
    owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {}, defaultModel: null }) as any;
  const say = (said: string) => { calls = []; return routes['POST /api/talk'](ctxOf({ said })) as Promise<any>; };
  const undo = (u: any) => routes['POST /api/talk/undo'](ctxOf({ undo: u })) as any;
  const own = (slot: string) => (db.addonsOf(tale.id) as any[]).filter((a) => !a.entry_id && a.slot === slot)
    .map((a) => ({ name: a.name, body: a.body, keys: JSON.parse(a.keys || '[]'), on: !!a.active }));
  const named = (slot: string, name: string) => own(slot).find((a) => a.name === name);
  const toll = db.upsertAddon(tale.id, null, { slot: 'rule', name: 'The toll', body: 'Every crossing costs a coin.' });
  db.setAddonActive(tale.id, toll, true);
  db.upsertAddon(tale.id, null, { slot: 'rule', name: 'Dawn law', body: 'Nobody crosses after dawn.', keys: ['dawn'] });
  const tense = db.upsertAddon(tale.id, null, { slot: 'instruction', name: 'Tense', body: 'Keep to the past tense.' });
  db.setAddonActive(tale.id, tense, true);
  db.upsertAddon(tale.id, null, { slot: 'instruction', name: 'No oaths', body: 'Nobody swears in narration.' });
  db.upsertString(tale.id, { title: 'The letter he has not opened', body: 'Sent by his brother.', kind: 'promise', summoned: true,
    fromChapter: 1, owedBy: 4 });
  db.upsertString(tale.id, { title: 'The debt', body: 'Owed since spring.', kind: 'promise', status: 'dropped' });
  const rulesBefore = own('rule'), instrBefore = own('instruction');
  const str = (title: string) => (db.stringsOf(tale.id) as any[]).find((x) => x.title === title);
  const undoAll = (r: any) => [...r.changes].reverse().map((c: any) => { const u: any = undo(c.undo);
    assert.ok(!u.error, `${c.words}: ${u.error}`); return u.undone; });

  // RULES
  const rules = await say('CHANGE-RULES: add a tide rule, make the toll two coins, and switch dawn law on');
  assert.ok(!rules.error, rules.error);
  const shown = calls[0].messages.map((m: any) => m.content).join('\n');
  assert.match(shown, /Rules:[\s\S]*- Dawn law \(off, on a word: dawn\): Nobody crosses after dawn\./,
    'TALK-SEES-OWN: Talk is shown a rule that is off, by name, with its words');
  assert.match(shown, /- No oaths \(off\)/, 'TALK-SEES-OWN: and an instruction that is off');
  assert.match(shown, /- The debt \(a promise, let go\)/, 'TALK-SEES-OWN: and a string with where it stands');
  assert.strictEqual(rules.changes.length, 3, `TALK-RULE: all three are done (${rules.reply})`);
  assert.deepStrictEqual(named('rule', 'The tide'), { name: 'The tide', body: 'The river runs backward at night.', keys: ['night'], on: true },
    'TALK-RULE-NEW: a new rule is added on, with its wake words');
  assert.strictEqual(named('rule', 'The toll')?.body, 'Every crossing costs two coins.', 'TALK-RULE-EDIT: the toll is rewritten in place');
  assert.strictEqual(own('rule').length, 3, '  and not added twice');
  assert.strictEqual(named('rule', 'Dawn law')?.on, true, 'TALK-RULE-SWITCH: dawn law is on');
  assert.deepStrictEqual(rules.changes[1].diff, { before: 'Every crossing costs a coin.', after: 'Every crossing costs two coins.' },
    'TALK-RULE-DIFF: the line draws the old and new text');
  assert.deepStrictEqual(rules.changes.map((c: any) => c.words), ['Added a rule to the tale, on: The tide, on a word: night.',
    'Changed the rule The toll: “Every crossing costs two coins.”', 'Switched the rule Dawn law on.']);
  assert.deepStrictEqual(undoAll(rules), ['Put back the rule Dawn law: off.', 'Put back the rule The toll.', 'Took away the rule The tide.']);
  assert.deepStrictEqual(own('rule'), rulesBefore, 'TALK-RULE-UNDO: Undo puts every rule back as it was');
  ok('asked for a rule, Talk adds, changes or switches it at once, and Undo puts each back');

  // #134 · A RULE'S EYE MOVES WITH TALK'S CHANGE: Always on is On, and its Undo puts it back On a word.
  const eye = (name: string) => (db.addonsOf(tale.id) as any[]).find((a) => !a.entry_id && a.name === name)?.activation;
  routes['POST /api/addon/on'](ctxOf({ id: (db.addonsOf(tale.id) as any[]).find((a) => a.name === 'Dawn law').id, activation: 'triggered' }));
  const always = await say('CHANGE-RULEALWAYS: dawn law holds always');
  assert.ok(!always.error && always.changes.length === 1, always.error ?? always.reply);
  assert.deepStrictEqual([named('rule', 'Dawn law')?.keys, eye('Dawn law')], [[], 'always_on'],
    'TALK-RULE-EYE: Always on takes its words away and sets it On');
  undoAll(always);
  assert.deepStrictEqual([named('rule', 'Dawn law')?.keys, eye('Dawn law')], [['dawn'], 'triggered'],
    'TALK-RULE-EYE-UNDO: Undo puts its words back, On a word');
  routes['POST /api/addon/on'](ctxOf({ id: (db.addonsOf(tale.id) as any[]).find((a) => a.name === 'Dawn law').id, on: false }));
  ok("a rule's eye moves with Talk's change, and back with its Undo");

  // THE WRITER'S OWN INSTRUCTIONS
  const instr = await say('CHANGE-OWNINSTR: add a weather instruction, make it present tense, and switch no oaths on');
  assert.ok(!instr.error, instr.error);
  assert.strictEqual(instr.changes.length, 3, `TALK-INSTRUCTION: all three are done (${instr.reply})`);
  assert.deepStrictEqual(named('instruction', 'Weather'), { name: 'Weather', body: 'Let the weather carry the feeling.', keys: [], on: true },
    'TALK-INSTRUCTION-NEW: added on');
  assert.strictEqual(named('instruction', 'Tense')?.body, 'Keep to the present tense.', 'TALK-INSTRUCTION-EDIT');
  assert.strictEqual(named('instruction', 'No oaths')?.on, true, 'TALK-INSTRUCTION-SWITCH');
  undoAll(instr);
  assert.deepStrictEqual(own('instruction'), instrBefore, 'TALK-INSTRUCTION-UNDO: Undo puts every instruction back as it was');
  ok("asked for one of the writer's own instructions, Talk adds, changes or switches it, and Undo puts each back");

  // WHERE A STRING STANDS
  const stand = await say('CHANGE-STAND: tie off the letter, and bring the debt back');
  assert.ok(!stand.error, stand.error);
  assert.strictEqual(stand.changes.length, 2, `TALK-STAND: two are done (${stand.reply})`);
  assert.match(stand.reply, /Not done\. Change where the string the oath stands: there is no string called "the oath"/,
    'TALK-STAND-UNKNOWN: a string the tale does not have is said not done');
  const letter = str('The letter he has not opened');
  assert.deepStrictEqual([letter.status, letter.summoned, letter.from_chapter, letter.owed_by, letter.body],
    ['paid', 0, 1, 4, 'Sent by his brother.'], 'TALK-STAND-TIE: tied off and out of play, everything else as it was');
  assert.deepStrictEqual([str('The debt').status, str('The debt').summoned], ['open', 1], 'TALK-STAND-REOPEN: the debt is open and in play');
  assert.strictEqual(stand.changes[1].words, 'Reopened the promise The debt: it is in play.');
  undoAll(stand);
  assert.deepStrictEqual([str('The letter he has not opened').status, str('The letter he has not opened').summoned,
    str('The letter he has not opened').owed_by], ['open', 1, 4], 'TALK-STAND-UNDO: the letter is in play again');
  assert.deepStrictEqual([str('The debt').status, str('The debt').summoned], ['dropped', 0], 'TALK-STAND-UNDO: the debt is let go again');
  ok('asked where a string stands, Talk ties it off, reopens it or sets it aside, and Undo puts it back');

  // THE TALE'S OWN FIELDS
  const more = await say('CHANGE-TALEMORE: rename it, regenre it, revoice it, and add a style note');
  assert.ok(!more.error, more.error);
  const st = () => db.getStory(tale.id) as any;
  assert.deepStrictEqual([st().title, st().genre, st().writing_style, st().style_note],
    ['The Far Bank', 'noir, gothic, horror', 'Long, slow sentences; the river does the feeling.', 'Rain in every scene.'],
    `TALK-TALE-FIELDS: title, genre (tidied), voice and style note are changed (${more.reply})`);
  undoAll(more);
  assert.deepStrictEqual([st().title, st().genre, st().style_note ?? ''], ['The Ford', 'noir', ''],
    'TALK-TALE-FIELDS-UNDO: Undo puts each back, the tidied genre included');
  assert.notStrictEqual(st().writing_style, 'Long, slow sentences; the river does the feeling.', '  and the voice');
  ok("asked to change the tale's title, genre, voice or style note, Talk does it, and Undo puts each back");
}

// TALK IS KEPT (Seth, 2026-10-30: "Anansi should hold sessions ... that way I can revisit"). The route
// writes each exchange itself, the writer's words then the answer, into the session the page names,
// and starts one when it names none. Each answer hands back exactly what was sent, for Copy prompt.
{
  const at = (body: any) => { calls = []; return routes['POST /api/talk']({ body: { storyId: story.id, ...body },
    query: new URLSearchParams(), owner: me, slot: { global: 100_096, slots: 2, perSlot: 50_048 },
    gen: { max_tokens: 900, temperature: 0.85 }, setGen: () => {} } as any) as Promise<any>; };
  const first = await at({ said: 'Who keeps the ledger in the lower tiers of the city?' });
  assert.ok(!first.error, first.error);
  assert.match(String(first.sessionId), /^ts-/, 'TALK-KEPT: the first answer starts a session and names it');
  let kept = db.talkSession(me, story.id, first.sessionId)!;
  assert.deepStrictEqual(kept.turns.map((t: any) => [!!t.you, t.text]),
    [[true, 'Who keeps the ledger in the lower tiers of the city?'], [false, first.reply]],
    'TALK-KEPT: the writer\'s words, then the answer as it was shown');
  assert.strictEqual(kept.title, 'Who keeps the ledger in the lower tiers…', 'TALK-TITLE: the first few words of the first message');
  assert.deepStrictEqual(first.prompt, calls.at(-1).messages, 'TALK-PROMPT: the answer carries exactly the messages sent');
  assert.ok(!JSON.stringify(kept).includes('lower tiers still pulse'), 'TALK-PROMPT: and the story material is not kept');

  const second = await at({ said: 'And who reads it?', sessionId: first.sessionId,
    turns: [{ you: true, text: 'Who keeps the ledger in the lower tiers of the city?' }, { text: first.reply }] });
  assert.strictEqual(second.sessionId, first.sessionId, 'TALK-KEPT-ON: naming the session carries it on');
  kept = db.talkSession(me, story.id, first.sessionId)!;
  assert.deepStrictEqual(kept.turns.map((t: any) => t.text).slice(2), ['And who reads it?', second.reply],
    'TALK-KEPT-ON: the next exchange is added after the first');
  assert.strictEqual(kept.title, 'Who keeps the ledger in the lower tiers…', '  and the title stays');

  // A session of another place is not written to: a setup talk named in a tale starts a new one.
  const setupId = db.talkSay(me, null, null, 'A setup question', 'A setup answer');
  const stray = await at({ said: 'Named with a setup talk', sessionId: setupId });
  assert.notStrictEqual(stray.sessionId, setupId, 'TALK-KEPT-PLACE: a session from elsewhere is not carried on here');
  assert.strictEqual(db.talkSession(me, null, setupId)!.turns.length, 2, '  and is left as it was');

  // A failed answer keeps nothing: both tries cut.
  breakAll = true;
  const failed = await at({ said: 'This one fails', sessionId: first.sessionId }).finally(() => { breakAll = false; });
  assert.ok(failed.error, 'the detector: the answer failed');
  assert.strictEqual(db.talkSession(me, story.id, first.sessionId)!.turns.length, 4, 'TALK-KEPT-FAIL: a failed answer keeps nothing');

  // Listed newest first, opened whole, and removed.
  const q = (s: string) => new URLSearchParams(s);
  const ctx = (body: any, query = '') => ({ body, query: q(query), owner: me } as any);
  const list = (await routes['GET /api/talk/sessions'](ctx({}, `story=${story.id}`)) as any).sessions;
  assert.deepStrictEqual(list.map((x: any) => x.id).slice(0, 2), [stray.sessionId, first.sessionId], 'TALK-LIST: newest first');
  assert.strictEqual(list.find((x: any) => x.id === first.sessionId).turns, 4, '  with how many turns each holds');
  assert.ok(!list.some((x: any) => x.id === setupId), '  and no setup talk among a tale\'s');
  const open = await routes['GET /api/talk/session'](ctx({}, `story=${story.id}&session=${first.sessionId}`)) as any;
  assert.strictEqual(open.turns.length, 4, 'TALK-OPEN: one session, with its turns');
  const gone = await routes['POST /api/talk/session/remove'](ctx({ storyId: story.id, session: stray.sessionId })) as any;
  assert.ok(!gone.sessions.some((x: any) => x.id === stray.sessionId), 'TALK-REMOVE: removed, and gone from the list');
  ok('a Talk answer is kept in its session, newest first in the list, and carries exactly the prompt that was sent');

  // AND IN THE SETUP TALK, with no tale.
  calls = [];
  const s1 = await routes['POST /api/spark/talk']({ body: { draft: { story: { title: 'Kesh' }, entries: [] },
    step: 'The tale', said: 'How should Kesh begin, do you think?' }, query: q(''), owner: me,
    slot: { global: 100_096, slots: 2, perSlot: 50_048 }, gen: {}, setGen: () => {}, defaultModel: null } as any) as any;
  assert.ok(!s1.error, s1.error);
  assert.deepStrictEqual(s1.prompt, calls.at(-1).messages, 'SETUP-PROMPT: the setup answer carries exactly the messages sent');
  assert.deepStrictEqual(db.talkSession(me, null, s1.sessionId)!.turns.map((t: any) => t.text),
    ['How should Kesh begin, do you think?', s1.reply], 'SETUP-KEPT: the setup talk is kept, with no tale');
  const setups = (await routes['GET /api/spark/talk/sessions'](ctx({})) as any).sessions;
  assert.strictEqual(setups[0].id, s1.sessionId, 'SETUP-LIST: newest first among the setup talks');
  assert.strictEqual((await routes['GET /api/spark/talk/session'](ctx({}, `session=${s1.sessionId}`)) as any).turns.length, 2,
    'SETUP-OPEN: opened whole');
  assert.ok(!(await routes['POST /api/spark/talk/session/remove'](ctx({ session: s1.sessionId })) as any).error, 'SETUP-REMOVE');
  assert.strictEqual(db.talkSession(me, null, s1.sessionId), null, '  and it is gone');
  ok('a setup Talk answer is kept too, listed, opened and removed, and carries exactly the prompt that was sent');
}

srv.close();
console.log(`\n${n} checks passed`);
