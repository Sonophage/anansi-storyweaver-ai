// Two states this app enters for real: the prompt does not fit, and the model is not there.
// F3 measured that the server REFUSES overflow loudly rather than truncating from the head — so
// the refusal has to reach the writer, naming what would have been dropped.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/limits.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");

// ---- squeeze the budget until the prompt cannot fit
await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
  + " await fetch('/api/story', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ id: '" + sid + "', story: { ...v.story, maxContext: 700 } }) }); })()");

const mani = await page.eval("(async () => { const r = await (await fetch('/api/manifest', { method:'POST',"
  + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ storyId:'" + sid + "', mode:'direct' }) })).json();"
  + " return JSON.stringify({ over: r.manifest.overflowed, why: r.manifest.overflowReason,"
  + " budget: r.manifest.totals.budget, used: r.manifest.totals.used }); })()");
console.log("  manifest at a 700-token cap: " + mani);
const m = JSON.parse(mani);
ok("the engine refuses rather than truncating", m.over === true);
ok(`  and says what would have gone (${JSON.stringify((m.why || '').slice(0, 60))})`, !!m.why);

// the refusal has to reach the writer, not just the JSON
await page.goto(B + "/#" + sid);
await page.click('#send');
await wait(2500);
const toast = (await page.text('#toast') || '').trim();
ok(`the writer is told, in the toast (${JSON.stringify(toast.slice(0, 64))})`, toast.length > 10);
// Specific, not "failed". There are two real messages now: one naming the block that would be
// dropped, one explaining that the cap itself leaves no room. Either is specific; neither is a shrug.
ok("  and it is specific rather than a shrug",
   /token|budget|cap|reply|SPINE|CANON|PROSE|EARLIER|DIRECTIVE|TAIL|MODE|drop/i.test(toast));
ok("  and the composer is usable again", await page.eval("!document.getElementById('send').disabled"));

// the Context panel should show the overflow too, since that is where you would go to fix it
await page.click('[data-panel="inspector"]');
await wait(900);
const side = (await page.text('#sideBody') || '');
ok("the Context panel shows the overflow", /omitted|ceiling|over|refus|drop|no room/i.test(side));

// A cap below the reply reserve gives a budget of zero. It used to render as "Context -168%" and
// "406 / -242"; clamping it at zero then gave "Context Infinity%" and "406 / 1", because the
// divide-by-zero fallback lied. Zero is a state, and the surface has to say so.
const head = (await page.text('#bar') || '');
ok(`no nonsense percentage in the header (${JSON.stringify(head.replace(/\s+/g,' ').match(/(No room|Context [^ ]+)/)?.[0] ?? '')})`,
   !/-\d+%|Infinity|NaN/.test(head));
ok("  it says there is no room instead", /No room/.test(head));
ok("  and the panel explains why, not a meter against nothing",
   /no room for a prompt/i.test(side) && !/\/ 1\b/.test(side));

// ---- put the budget back
await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
  + " await fetch('/api/story', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ id: '" + sid + "', story: { ...v.story, maxContext: null } }) }); })()");
const back = await page.eval("(async () => { const r = await (await fetch('/api/manifest', { method:'POST',"
  + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ storyId:'" + sid + "', mode:'direct' }) })).json();"
  + " return r.manifest.overflowed; })()");
ok("clearing the cap clears the refusal", back === false);

console.log(red ? `\n  ${red} RED` : "\n  all green");
