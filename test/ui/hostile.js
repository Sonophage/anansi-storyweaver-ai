// Writer text becomes HTML on every surface, built with template literals. This tries to break
// out of that — into a script, into an attribute, into a data-* the delegation reads — and checks
// the text renders literally instead.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/hostile.js
//
// Point it at a COPY. It writes hostile strings into a story and its ledger.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };

const PAYLOADS = [
  ['script tag', '</span><script>window.__xss=1</script>'],
  ['img onerror', '"><img src=x onerror="window.__xss=1">'],
  ['attribute break', '" onmouseover="window.__xss=1" x="'],
  ['a forged action', '"><button data-delstory="1">forged</button>'],
  ['entity already', '&lt;not a tag&gt; &amp; &quot;quoted&quot;'],
  ['a real quote', 'The "Bell" — it\'s Aldis’s, isn’t it?'],
];

// A story whose every field is hostile.
const sid = await page.eval("(async () => { const r = await (await fetch('/api/stories', { method:'POST',"
  + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({"
  + " title: " + JSON.stringify(PAYLOADS[1][1]) + ","
  + " genre: " + JSON.stringify(PAYLOADS[0][1]) + ","
  + " premise: " + JSON.stringify(PAYLOADS[2][1]) + ","
  + " setting: " + JSON.stringify(PAYLOADS[3][1]) + ","
  + " persona: " + JSON.stringify(PAYLOADS[5][1]) + ","
  + " spiceNote: " + JSON.stringify(PAYLOADS[4][1])
  + " }) })).json(); return r.id; })()");
console.log("  hostile story: " + sid);

// Entries and a passage carrying the same.
for (const [name, p] of PAYLOADS) {
  await page.eval("(async () => { await fetch('/api/entry', { method:'POST', headers:{'Content-Type':'application/json'},"
    + " body: JSON.stringify({ storyId: '" + sid + "', entry: { id:'', title: " + JSON.stringify(name + ' ' + p)
    + ", body: " + JSON.stringify(p) + ", entryType:'character', activation:'always_on', keys:[] } }) }); })()");
}
await page.eval("(async () => { await fetch('/api/write', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ storyId: '" + sid + "', body: " + JSON.stringify(PAYLOADS[0][1] + ' ' + PAYLOADS[1][1]) + " }) }); })()");

const clean = async (where) => {
  const fired = await page.eval("window.__xss ?? null");
  ok(`${where}: nothing executed`, fired === null);
  const forged = await page.eval("document.querySelectorAll('[data-delstory]').length");
  return forged;
};

// ---- the story list
await page.goto(B + "/");
await clean("story list");
ok("  the hostile title renders as text",
   /img src=x onerror/.test(await page.text('#page') || ''));

// ---- the document and the cast
await page.goto(B + "/#" + sid + "/cast");
await clean("story surface");
ok("  the passage renders as text", /script>window\.__xss/.test(await page.text('#col') || ''));
ok("  the cast renders as text", /onmouseover|img src=x/.test(await page.text('#sideBody') || ''));
const forged = await page.eval("document.querySelectorAll('[data-delstory]').length");
ok(`  no forged action button got into the DOM (${forged} found, 1 expected from the real UI or 0 here)`, forged <= 1);

// ---- the entry editor, where text goes into value="" attributes
const eid = await page.eval("document.querySelector('[data-entry]')?.dataset.entry");
await page.click('[data-entry="' + eid + '"]');
await clean("entry editor");
const val = await page.eval("document.querySelector('[data-f=\"title\"]')?.value ?? ''");
ok(`  an attribute value survives intact (${JSON.stringify(val.slice(0, 42))})`, val.length > 10);
ok("  and was not truncated at a quote", !/^[^"]*$/.test(val) || !val.includes('img'));

// ---- the ledger page, the prompt view, and search
await page.goto(B + "/");
await page.click('[data-nav="canon"]');
await wait(900);
await clean("worlds page");
await page.goto(B + "/#" + sid + "/inspector");
await page.click('[data-ctxview="prompt"]');
await clean("prompt view");
ok("  the prompt shows the hostile text as text", /onerror|script/.test(await page.text('#sideBody pre') || ''));
await page.goto(B + "/#" + sid + "/search");
await page.type('#q', 'onerror');
await wait(1200);
await clean("search results");

// ---- a real quote in a name must round-trip, which is what esc() escaping quotes is for
const quoted = await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
  + " return v.story.persona; })()");
ok(`a name with curly quotes round-trips (${JSON.stringify((quoted || '').slice(0, 36))})`,
   /Aldis/.test(quoted || '') && (quoted || '').includes('"'));

console.log(red ? `\n  ${red} RED` : "\n  all green");
