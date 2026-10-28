// The forge: prompts to hand a DIFFERENT model, so what it writes drops into this app whole.
//
// Seth, 2026-08-30: *"a page with a prompt i can give another ai for the following: images,
// characters, locations and story premise and genre voice. the prompts should say that what it is
// and what format it should be written so i can use another ai to forge these thing and have the
// ouput be perfect for my system."*
//
// ADMIN ONLY. Not because the text is secret — it is prompt copy — but because this is a workbench
// for the person who owns the format, and the second writer has no use for a page about Anansi's
// internal shapes. `GET /api/forge` asks the admin question itself; see the note there.
//
// BUILT FROM `src/slots.ts`, NEVER FROM A LIST TYPED IN HERE. A prompt that names the rooms of a
// character is a copy of the slot table, and a copy is a thing that drifts — which is the whole
// reason that module exists. Adding a room to `SLOTS` therefore adds it to the prompt, and
// `test/forge.ts` fails if it has no description below, so the drift is caught at the one point
// where a human has to write English.
//
// THE CARD REGISTER IS NOT RESTATED EITHER. `LEDGER_REGISTER` is what this app's own prompts send
// when they ask for a card, and F36 is why it matters: a finished English sentence sitting in a
// prompt comes back verbatim in the book, by a route no check can see. A forged
// card is read on every call exactly like a written one, so it is held to the same rule, from the
// same string.

import { SLOTS, KINDS, type EntryKind } from './slots.ts';
import { LEDGER_REGISTER } from './prompts.ts';

/** One line per room, in the second person, saying what belongs in it and what does not.
 *
 *  Separate from `SLOT_HINT` in `web/app.js`, which is placeholder text inside a form the writer is
 *  already looking at — it can be three words because the label is beside it. This is the only
 *  thing a foreign model will ever be told about the room, so it has to carry the distinction that
 *  makes the room worth having.
 *
 *  Keyed by slot and not by kind: `facts` and `appearance` are shared, and describing them twice is
 *  how the character version and the place version come to disagree. */
export const ROOM_MEANING: Record<string, string> = {
  facts:         'What is true of them for the whole book and does not change: age, trade, the scar. '
               + 'This room exists because the body gets rewritten at chapter end and this does not.',
  appearance:    'How they look NOW, at the point the book has reached. Not a portrait: the two or '
               + 'three things another character would notice across a room.',
  outfit:        'What they have on. One outfit at a time; give it a name a writer would recognise '
               + 'on a list ("Borrowed Sleepwear"), then what it actually is.',
  interiority:   'What they will not say out loud, and what they do instead of saying it. Wants, '
               + 'refusals, the thing they are wrong about.',
  relationships: 'One other person, and what stands between them — money, history, a promise. One '
               + 'room per relationship; do not put three people in one.',
  voice:         'How they SOUND: sentence length, what they never do, how they answer a question '
               + 'they do not want. Not their accent written out phonetically.',
  atmosphere:    'What the place is like right now — light, weather, sound, what it smells of. The '
               + 'room that changes when the season does.',
  who_is_here:   'Who you find there, and in what capacity. Names if you have them, roles if not.',
  what_it_does:  'What it does, exactly, and what it does not do. A key that opens one door says '
               + 'which door.',
  consequences:  'What breaking it costs, and who collects.',
};

const roomBlock = (kind: EntryKind) => SLOTS[kind]
  .map((s) => `  "${s.name}"${s.exclusive ? '' : '  (you may give more than one of these)'}\n`
            + `      ${ROOM_MEANING[s.name] ?? ''}`)
  .join('\n');

/** The shape every forged thread arrives in. One definition, quoted into both card prompts, so the
 *  character version and the place version cannot describe different JSON. */
const SHAPE = (kind: EntryKind, example: string) =>
`Answer with JSON and nothing else. No prose before it, no code fence, no explanation after.

One object, or an array of them if you were asked for several:

{
  "kind": "${kind}",
  "title": "the name, exactly as it is written in the prose",
  "body": "the notes, in the register described below",
  "keys": ["the words that make this card fire"],
  "activation": "always_on" | "triggered",
  "rooms": {
    "<room name>": { "name": "what to call this room", "body": "the notes" }
  }
}

WHAT EACH FIELD IS FOR:

- "title" is the name and the only thing that identifies the card. Spell it the way the book does.
- "body" is what the model is told about this card EVERY time it fires. It is the summary; the
  rooms are the detail.
- "keys" are trigger words. They only matter when "activation" is "triggered", and they must be
  words that ACTUALLY APPEAR in prose about this subject. A key that is the card's own title
  repeated buys nothing — it fires only when the name is already on the page.
- "activation" is "always_on" for something in every scene, "triggered" for something that should
  arrive only when the prose reaches it. A book where everything is always_on has no budget left.
- "rooms" is optional and it is the point. Every room is written in the same register as the body.

THE ROOMS THIS KIND HAS — use these names exactly, and leave out any you have nothing true for:

${roomBlock(kind)}

${LEDGER_REGISTER}

EXAMPLE OF THE WHOLE ANSWER:

${example}`;

const CHARACTER_EXAMPLE = `{
  "kind": "character",
  "title": "Marek Vale",
  "body": "moneylender; courteous, never raises his voice; has never been seen outside in the rain; holds eleven crowns of Aldis Fen's debt",
  "keys": ["Marek", "Vale", "the moneylender"],
  "activation": "always_on",
  "rooms": {
    "facts": { "name": "What is always true", "body": "fifty-one; moneylender out of the Ambersand; left-handed; keeps the ledger himself and lets nobody else write in it" },
    "voice": { "name": "How he sounds", "body": "short sentences; never raises it; answers a question with a question; says a debtor's full name every time" },
    "relationships": { "name": "Him and Aldis Fen", "body": "eleven crowns, three seasons overdue; knew his father; has not yet asked for the key and both of them know it" }
  }
}`;

const LOCATION_EXAMPLE = `{
  "kind": "lore",
  "title": "the Ambersand",
  "body": "counting-house on the north bank; three storeys, the lower one below the waterline; where debts are written down and where they are collected",
  "keys": ["Ambersand", "counting-house", "the north bank"],
  "activation": "triggered",
  "rooms": {
    "facts": { "name": "What is always true", "body": "built on piles over the old dock; the lower archive floods twice a winter; one door, watched" },
    "atmosphere": { "name": "What it is like now", "body": "lamps out along the bank; wet stone; nobody about after the bell" },
    "who_is_here": { "name": "Who you find there", "body": "the porter; Marek on the second floor; whoever is owed money that week" }
  }
}`;

interface ForgePrompt { key: string; title: string; what: string; prompt: string }

const BOOK_EXAMPLE = `{
  "story": {
    "title": "The Salt Ledger",
    "genre": "noir, gothic",
    "premise": "A tide-clerk counts what the sea returns, and one of the returns is a body the ledger already lists as paid.",
    "setting": "Fallow Quay, a debt-town built on piles over a dead harbour",
    "pov": "third limited, past tense",
    "spice": 2,
    "persona": "Ilva Marren",
    "lockedCharacter": "Ilva Marren",
    "writingStyle": "Write the narration in past tense: she came up the stair, the rain came with her.\\nShort declarative sentences. One image per paragraph and let it stand.\\nName the weather only when it changes what somebody does.",
    "styleNote": "Scenes open in the middle and end one beat early. Money is counted on the page."
  },
  "entries": [
    {
      "kind": "character", "title": "Ilva Marren",
      "body": "tide-clerk; counts what the sea returns; owes the Ambersand nine hundred",
      "keys": ["Ilva", "the clerk"], "activation": "always_on",
      "rooms": {
        "facts": { "name": "What is always true", "body": "thirty-one; left-handed; cannot swim" },
        "voice": { "name": "How she sounds", "body": "short sentences; answers a question with a question" }
      }
    },
    {
      "kind": "lore", "title": "the Ambersand",
      "body": "counting-house on the north bank; where debts are written down and collected",
      "keys": ["Ambersand", "counting-house"], "activation": "triggered",
      "rooms": { "atmosphere": { "name": "What it is like now", "body": "lamps out along the bank; wet stone; nobody about" } }
    }
  ]
}`;

export const FORGE: ForgePrompt[] = [
  {
    key: 'book',
    title: 'A whole tale, in one command',
    what: 'Tale and cast together. Paste it on New tale and the wizard opens with everything filled.',
    prompt:
`You are building a WHOLE BOOK for a long-form fiction app called Anansi: the story itself and the
cast that lives in it, in one answer.

Ask me what the book is about if I have not said. Then write all of it.

Answer with JSON and nothing else. No prose before it, no code fence, no explanation after.

{
  "story": { ... the fields below ... },
  "entries": [ ... cards, in the shape below ... ]
}

THE STORY FIELDS, all of them:

- "title"    the book's title.
- "genre"    two to four genre words, comma separated. Each becomes its own label on a shelf.
- "premise"  two or three sentences, under 60 words. It sits at the top of EVERY request that
             writes a word of this book, so every clause is paid for on every page. Name the person
             it is about and what is forcing the issue. Not a blurb — nobody is being sold this.
- "setting"  where it opens, in a sentence or two.
- "pov"      one of exactly: "first person, present tense", "first person, past tense",
             "second person, present tense", "third limited, present tense",
             "third limited, past tense", "third omniscient, past tense".
- "spice"    1 to 5. 1 nothing sexual, 2 desire but not sex, 3 on the page in the book's voice,
             4 direct and the acts named, 5 fully explicit.
- "persona"  the character the writer speaks as. Must be the exact title of one of your entries,
             or "" if the book is narrated from outside.
- "lockedCharacter"  the one the writing model must never write for, because the writer will.
             Usually the same as persona. Must also be one of your entries, or "".
- "writingStyle"  THE MOST POWERFUL FIELD IN THE APP. It reaches the model as an instruction on
             every call and outranks the book's own prose for register — measured at about 98%
             adherence. Rules, not description, and these rules are measured rather than preferred:
               * ONE RULE PER LINE, separated by \\n. The same rule inside a longer line bought about
                 10%; on its own line it holds at about 98%.
               * The register line must NAME NARRATION and spell the forms out — not "past tense"
                 but "Write the narration in past tense: she came up the stair, the rain came with
                 her." The forms spelled out are the part that works.
               * Say what the narration DOES, never what it feels like. "Atmospheric" is unusable.
               * Six to twelve lines. Every one is paid for on every page.
               * Nothing about plot, character or setting. This field is HOW it is written.
- "styleNote"  the book's genre flavour, kept apart from the voice: what a book of this kind does
             on the page, what it lingers on, what it hurries past. Three sentences at most. Do NOT
             write about tense, person or explicitness here — those belong to writingStyle, and a
             style note that repeats them makes two instructions argue over one sentence.

THE ENTRIES. Four to eight of them, and make them the ones the premise actually needs — the people
it names, the place it happens in, the thing everyone wants, the law that holds until it breaks.

Each entry is exactly the card shape:

{
  "kind": "character" | "lore" | "item" | "rule",
  "title": "the name, spelled as the prose spells it",
  "body": "the notes",
  "keys": ["words that make this card fire"],
  "activation": "always_on" | "triggered",
  "rooms": { "<room name>": { "name": "what to call this room", "body": "the notes" } }
}

"lore" covers places, institutions, factions and histories — a city, a counting-house, an order, a
war are all that kind.

MOST CARDS SHOULD BE "triggered". Only the people and places in nearly every scene are "always_on";
a book where everything is always on has no context budget left for the prose.

THE ROOMS EACH KIND HAS — use these names exactly, leave out any you have nothing true for:

${KINDS
  .map((k) => `${k}:\n${roomBlock(k)}`).join('\n\n')}

${LEDGER_REGISTER}

EXAMPLE OF THE WHOLE ANSWER, shortened — yours should carry more cards:

${BOOK_EXAMPLE}`,
  },
  {
    key: 'character',
    title: 'A character',
    what: 'Comes back as JSON you paste into + Thread. Arrives with its pockets filled.',
    prompt:
`You are writing a CHARACTER CARD for a long-form fiction app called Anansi.

A card is not a character sheet and not a biography. It is what a writing model is told about this
person every time they matter, and it is read INSIDE the prompt that writes the book — so it is
written as notes, never as prose the book could use.

Tell me who to write first if I have not said. Otherwise: write the person I describe below.

${SHAPE('character', CHARACTER_EXAMPLE)}`,
  },
  {
    key: 'location',
    title: 'A place',
    what: 'Same JSON, as a place. Anansi files places, factions and their pasts under one kind.',
    prompt:
`You are writing a PLACE CARD for a long-form fiction app called Anansi.

Anansi keeps places, institutions, factions and histories under one kind, called "lore". A city, a
counting-house, an order of monks and a war are all this shape.

A card is what a writing model is told about the place every time the prose reaches it. It is read
INSIDE the prompt that writes the book, so it is written as notes and never as prose.

MOST PLACES SHOULD BE "triggered", not "always_on". A city the book is set in is always on; a room
in it is not, or every scene carries every building in the story.

${SHAPE('lore', LOCATION_EXAMPLE)}`,
  },
  {
    key: 'premise',
    title: 'A premise, and its genre',
    what: 'Comes back as plain text. Paste it into Title, Genre and Premise yourself.',
    prompt:
`You are writing the PREMISE of a book for a long-form fiction app called Anansi.

The premise is short and it is load-bearing: it sits at the top of every single request that writes
a word of this book, so every clause in it is paid for on every page. It says WHOSE story this is
and what is pulling it forward. It is not a blurb, it is not a pitch, and it does not withhold
anything for effect — nobody is being sold this book.

Answer in exactly this shape, three labelled lines and nothing else. No JSON, no markdown, no
preamble:

TITLE: <the book's title>
GENRE: <two to four genre words, comma separated>
PREMISE: <two or three sentences, under 60 words>

RULES:

- The premise names the person the book is about. A premise with no one in it is a setting.
- It says what is at stake and what is forcing the issue. "A detective in a rainy city" is a
  situation; "a night porter is paying a debt he did not take on, and the ledger has pages cut out
  of it" is a premise.
- Write it flat. No rhetorical questions, no "but everything changes when", no ellipses.
- GENRE is a list of tags, not a sentence. Each becomes its own label on a shelf.
- Do not write the first line of the book. Anything that reads as finished prose will be lifted
  into the book verbatim, and it will be wrong there.`,
  },
  {
    key: 'voice',
    title: 'The voice',
    what: 'Plain text for the voice box. This is the field that decides register.',
    prompt:
`You are writing the VOICE for a book in a long-form fiction app called Anansi.

This is the single most powerful field in the app. It reaches the writing model as an INSTRUCTION,
on every call, and it outranks the book's own existing prose for register — measured at about 98%
adherence even against a book whose finished pages contradict it. So it is written as rules, not as
a description and not as a sample.

Answer as plain text: a short list of instruction lines, nothing else. No JSON, no headings, no
preamble.

THE RULES THAT MAKE IT WORK, and they are measured rather than preferred:

- ONE RULE PER LINE. The same rule buried inside a longer line bought almost nothing (about 10%);
  on its own line it holds at about 98%. Never join two rules with "and".
- A LINE ABOUT REGISTER MUST NAME NARRATION and spell the forms out. Not "past tense" but
  "Write the narration in past tense: she came up the stair, the rain came with her." The forms
  spelled out are the part that works.
- Say what the narration DOES, not what it feels like. "Short declarative sentences; one image per
  paragraph" is usable. "Atmospheric and haunting" is not.
- Write the rules that would be broken otherwise. A line telling a competent model to use correct
  grammar is a line spent on nothing.
- Do NOT write rules about what happens in the story, who anyone is, or what the book is about.
  This field is HOW it is written and nothing else.
- Do NOT write a specimen paragraph. This is not a sample to imitate; a page of prose in this box
  gets read as text to continue.
- Six to twelve lines. It is sent on every call and every line is paid for on every page.

Ask me for the book's genre and premise if I have not given them.`,
  },
  {
    key: 'image',
    title: 'A cover image prompt',
    what: 'Comes back as a prompt for an image model. Nothing is imported — generate it elsewhere and upload the cover.',
    prompt:
`You are writing a PROMPT FOR AN IMAGE MODEL, to make a cover for a book.

You are not making the picture and you are not describing this book to a reader. You are writing
the text I will paste into an image generator.

WHAT THE COVER HAS TO BE:

- A PAINTED ILLUSTRATION, not a photograph and not a 3D render.
- NO LETTERING OF ANY KIND. No title, no author name, no words in the image. The app draws the
  title over the picture itself, so any text in the art collides with it.
- Portrait, roughly 3:4, and it is looked at SMALL — the size of a paperback spine on a shelf. One
  subject, one strong shape, one light source. A busy cover is a grey rectangle at that size.
- It should read as the book's genre before it reads as anything else.

Answer with the prompt text and nothing else. No preamble, no explanation, no alternatives, no
list of options. Under 60 words. Comma-separated phrases rather than sentences, which is what
image models take best.

Ask me for the book's genre, setting and what should be on the cover if I have not said.`,
  },
];
