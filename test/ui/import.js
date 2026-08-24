// The import screen, driven through the actual file picker. This scenario exists because the
// screen shipped saying "Not wired yet" while src/import.ts was tested and unreachable, and
// because a real AI Dungeon export was rejected as unrecognised — the parsers had only ever
// been fed fixtures I wrote myself.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/import.js
//
// Point it at a COPY. It creates stories.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const { writeFileSync, mkdtempSync } = await import("node:fs");
const { join } = await import("node:path");
const { tmpdir } = await import("node:os");
const lib = () => page.eval("(async () => (await (await fetch('/api/stories')).json()).stories)()");
const D = mkdtempSync(join(tmpdir(), "anansi-import-"));

// Shapes copied from a real export, not invented: a bare array of story cards with the keys
// as one comma-separated string, and the adventure as markdown with the player's turns on '>'.
const CARDS = join(D, "adventure--Ws97-story-cards-5.json");
writeFileSync(CARDS, JSON.stringify([
  { isSpoiler: false, showInStoryCards: true, keys: "Sliver", type: "Item", title: "Sliver",
    value: "Name: The Sliver\nIt unfolds flesh into memory.", description: "" },
  { isSpoiler: false, keys: "Lavender, The Murmur , Vel", type: "character", title: "The Murmur",
    value: "Name: The Murmur\nStill and sharp.", description: "\n\n---\n05/30/2025, 02:56 AM\nrevision" },
  { isSpoiler: false, keys: "The Rust , The Choir", type: "faction", title: "The Rust Choir",
    value: "A faction that sings in rust." },
]));
const PROSE = join(D, "sutera-remembers.md");
writeFileSync(PROSE, '# Sutera: Remembers\n\nSutera.\nA city built into the ribcage of a god.\n\n'
  + '> You say "Any work?"\n\nThe man looks up from the bar.\n\n> You take the weapon.\n');
const JUNK = join(D, "notes.json");
writeFileSync(JUNK, "this is not json and never was");

const pick = async (path) => {
  await page.file("#impfile", [path]);
  for (let i = 0; i < 25; i++) { if (await page.visible('[data-doimport]')) return true; await wait(200); }
  return false;
};

// ---- 1. a markdown adventure: previewed, not written
await page.goto(B + "/");
await page.click('[data-nav="import"]');
ok("the import page offers a file picker", await page.eval("!!document.getElementById('impfile')"));
ok("  and no longer says it is unwired", !/Not wired/.test(await page.text('#page') || ''));

const n0 = (await lib()).length;
ok("choosing an adventure shows a preview", await pick(PROSE));
let txt = (await page.text('#page') || '').replace(/\s+/g, ' ');
ok(`  read as an AI Dungeon adventure (${JSON.stringify((txt.match(/AI Dungeon[a-z ]*/i) ?? [''])[0])})`,
   /AI Dungeon/.test(txt));
ok("  named from the heading in the file", /Sutera: Remembers/.test(txt));
ok("  counting 4 passages", /\b4\b/.test(txt));
ok("  and saying which are yours", /Yours/.test(txt));
// The whole point of a preview: a stranger's file has not touched the library yet.
ok(`  and NOTHING is in the library yet (${n0})`, (await lib()).length === n0);

// ---- 2. importing it for real
await page.click('[data-doimport]');
for (let i = 0; i < 30 && (await lib()).length === n0; i++) await wait(300);
const made = (await lib()).find((s) => s.title === "Sutera: Remembers");
ok(`importing creates the story (${n0} -> ${(await lib()).length})`, !!made);
ok("  and the screen reports what it wrote", /Imported|Passages/.test(await page.text('#page') || ''));
const v = await page.eval("(async () => await (await fetch('/api/story?story=" + made.id + "')).json())()");
ok(`  four passages landed (${v.passages.length})`, v.passages.length === 4);
ok(`  and your own turns are attributed to you (${v.passages.filter((p) => p.author === 'human').length})`,
   v.passages.filter((p) => p.author === 'human').length === 2);
ok("  with the '>' marker stripped, not imported as prose",
   !v.passages.some((p) => p.body.startsWith('>')));

// ---- 3. the story cards, merged into that same story
await page.click('[data-dropimport]');
ok("story cards preview too", await pick(CARDS));
txt = (await page.text('#page') || '').replace(/\s+/g, ' ');
ok("  read as story cards", /story cards/i.test(txt));
ok("  listing all three", /Sliver/.test(txt) && /Murmur/.test(txt) && /Rust Choir/.test(txt));
ok("  with the type AI Dungeon gave each one", /item/.test(txt) && /character/.test(txt) && /lore/.test(txt));
ok("  and the keys that fire them", /Lavender/.test(txt));

// The destination select is what makes two files into one story. A real selection fires change.
const before = (await lib()).length;
await page.eval("(() => { const el = document.getElementById('impinto'); el.value = "
  + JSON.stringify(made.id) + "; el.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()");
await wait(400);
ok(`the button now says where it will go (${JSON.stringify(((await page.text('[data-doimport]')) || '').trim())})`,
   /Sutera/.test(await page.text('[data-doimport]') || ''));
await page.click('[data-doimport]');
for (let i = 0; i < 30; i++) {
  const r = await page.eval("(async () => (await (await fetch('/api/story?story=" + made.id + "')).json()).entries.length)()");
  if (r === 3) break;
  await wait(300);
}
const v2 = await page.eval("(async () => await (await fetch('/api/story?story=" + made.id + "')).json())()");
ok(`the cards joined the existing story (${v2.entries.length} entries)`, v2.entries.length === 3);
ok(`  and did NOT found a second story (${before} -> ${(await lib()).length})`, (await lib()).length === before);
ok(`  the prose is still there, once (${v2.passages.length})`, v2.passages.length === 4);
// The card's own dated edit log is notes, not body: in the body it would be sent to the model
// as canon, twice over.
const murmur = v2.entries.find((e) => e.title === 'The Murmur');
ok("  a card's edit log is kept as notes, not fed to the model",
   !/05\/30\/2025/.test(murmur?.body ?? '') && /05\/30\/2025/.test(murmur?.notes ?? ''));
ok(`  and its keys are split from the one comma-separated string (${JSON.stringify(murmur?.keys ?? [])})`,
   (murmur?.keys ?? []).length === 3);

// ---- 4. re-importing the same cards updates instead of duplicating
await page.click('[data-dropimport]');
await pick(CARDS);
await page.eval("(() => { const el = document.getElementById('impinto'); el.value = "
  + JSON.stringify(made.id) + "; el.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()");
await wait(400);
await page.click('[data-doimport]');
await wait(2500);
const v3 = await page.eval("(async () => await (await fetch('/api/story?story=" + made.id + "')).json())()");
ok(`re-importing the same cards leaves three, not six (${v3.entries.length})`, v3.entries.length === 3);
ok("  and says so", /updated/i.test(await page.text('#page') || ''));

// ---- 5. a file that is not an export at all
await page.click('[data-dropimport]');
await page.file("#impfile", [JUNK]);
await wait(1500);
const toast = (await page.text('#toast') || '').trim();
ok(`junk is refused with a reason (${JSON.stringify(toast.slice(0, 52))})`, toast.length > 8);
ok("  and it is specific, not a shrug", /JSON|PNG|export|card|prose/i.test(toast));
ok("  and nothing was written", (await lib()).length === before);
ok("  and the picker still works afterwards", await page.eval("!!document.getElementById('impfile')"));

// ---- 6. Open the story goes there
await page.click('[data-dropimport]');
await pick(PROSE);
await page.click('[data-doimport]');
await wait(2500);
if (await page.visible('[data-openimported]')) {
  await page.click('[data-openimported]');
  await wait(1200);
  ok("Open the story lands you in the document", await page.eval("!!document.getElementById('input')"));
} else { ok("Open the story button is offered", false); }

console.log(red ? `\n  ${red} RED` : "\n  all green");
