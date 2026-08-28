// Issue #7, the buildable half: "I should be able to summon threads, stories or chapters by using
// the @ symbol and then typing the letters and an autocomplete comes up."
//
// The scoping is Seth's: "it should look inside the story and its threads. it can reach other
// books but only the users. it shouldnt reach out to another users anything." Every source the
// menu reads — V.entries, V.chapters, LIB, LEDGER — is already owner-scoped in SQL, so the last
// clause needs no new check and gets none here either. `test/scope.ts` proves it at the layer
// where it is decidable, with two owners.
//
//   test/ui/run.sh at
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
await page.goto(B + "/#" + sid + "/anansi");
for (let i = 0; i < 40 && !(await page.visible('#askBox')); i++) await wait(250);
ok("the Anansi panel opens with its ask box", await page.visible('#askBox'));

// Type into the box the way a person does — set the value and fire `input`, which is what the
// listener is bound to. The caret has to be at the end or the scan finds nothing.
const type = (text) => page.eval(`(() => { const b = document.getElementById('askBox');
  b.value = ${JSON.stringify(text)}; b.selectionStart = b.selectionEnd = b.value.length;
  b.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
const menu = () => page.eval(`(() => { const l = document.getElementById('atlist');
  if (!l || l.hidden) return { open: false };
  return { open: true, items: [...l.querySelectorAll('[data-atpick]')].map(b => b.textContent.replace(/\\s+/g, ' ').trim()) };
})()`);

// ---- it opens on @ and closes without one
await type("what happened with the ");
ok("no @ typed, no menu", !(await menu()).open);

await type("what happened with the @");
let m = await menu();
console.log("  bare @: " + JSON.stringify(m.items));
ok("a bare @ opens the menu", m.open && !!m.items && m.items.length > 0);

// ---- it filters, and it finds this story's own threads first
await type("what happened with the @key");
m = await menu();
console.log("  @key: " + JSON.stringify(m.items));
ok("typing letters filters the list", m.open && !!m.items && m.items.length > 0);
ok("  and it finds this book's thread by name", !!m.items && m.items.some((t) => /Silver Key/i.test(t)));
ok("  labelled with what it is and where it lives",
   !!m.items && m.items.some((t) => /thread/i.test(t) && /this book/i.test(t)));

// ---- chapters are summonable too
await type("remind me about @chapter");
m = await menu();
console.log("  @chapter: " + JSON.stringify(m.items));
ok("chapters are on the list", m.open && !!m.items && m.items.some((t) => /chapter/i.test(t)));

// ---- a name that matches nothing closes it rather than showing an empty box
await type("@zzzzznothing");
ok("a query that matches nothing shows no menu", !(await menu()).open);

// ---- accepting: the name replaces the @token, the @ itself does not survive
await type("what happened with the @key");
m = await menu();
if (!m.open) { ok("the menu is open to accept from", false); } else {
  await page.eval("(() => { const b = document.querySelector('#atlist [data-atpick=\"0\"]');"
    + " b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return 1; })()");
  await wait(250);
  const after = await page.eval("document.getElementById('askBox').value");
  console.log("  after accepting: " + JSON.stringify(after));
  ok(`accepting writes the name into the question (${JSON.stringify(after)})`, /Silver Key/i.test(after));
  ok("  and the @ stays, so you can see what you summoned", after.includes('@the Silver Key'));
  ok("  and the menu closes", !(await menu()).open);
  // The caret has to land after the name, or the next word is typed into the middle of it.
  const caret = await page.eval("document.getElementById('askBox').selectionStart");
  ok(`  with the caret after what it inserted (${caret} of ${after.length})`, caret === after.length);

  // THE ACCENT IS THE RECEIPT. Seth asked for the @ to be marked AND for "a way to know if it did
  // pull from the id or not"; those are one mechanism, because a mention is marked only while it
  // is still going to be sent. Both directions, or the mark means nothing: a picked name lights
  // up, a hand-typed one does not.
  const marks = () => page.eval("(() => [...document.querySelectorAll('#askMirror mark')].map(m => m.textContent))()");
  let mk = await marks();
  console.log("  marked: " + JSON.stringify(mk));
  ok(`  and the name is marked, because it resolved (${JSON.stringify(mk)})`,
     mk.length === 1 && /@the Silver Key/.test(mk[0]));

  await type("tell me about @the Silver Key and @something i typed myself");
  mk = await marks();
  console.log("  after typing one by hand: " + JSON.stringify(mk));
  ok("  a name typed by hand is NOT marked — there is no id behind it",
     mk.length === 1 && !mk.some((x) => /typed myself/.test(x)));

  await type("tell me about @the Silver Ke");
  mk = await marks();
  ok(`  and editing a letter out of a picked name unmarks it (${JSON.stringify(mk)})`, mk.length === 0);
}

// ---- Escape closes it, and Enter then asks rather than picking
await type("about @key");
ok("the menu is open again", (await menu()).open);
await page.eval("(() => { document.getElementById('askBox').dispatchEvent("
  + " new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); return 1; })()");
await wait(200);
ok("Escape closes it", !(await menu()).open);

// ---- AND THE THING BEHIND THE NAME GOES WITH IT.
//
// Seth: "yes I do want it to do that. that way anansi knows exactly what I'm referring to." The
// name tells her which words were used, and most books have two threads whose titles overlap; the
// id tells her which one.
//
// `fetch` is patched so /api/talk never reaches the server: this is about what the CLIENT sends,
// and letting it through would put a real generation in a scenario that is in the default set.
// The server half — resolving those ids against `ledgerOf(c.owner)` and `listStories(c.owner)` —
// is owner-scoped in SQL and `test/scope.ts:250` already proves that with two owners, which is
// the layer where it is decidable.
await page.eval(`(() => {
  window.__sent = null;
  const real = window.fetch;
  window.fetch = (u, init) => {
    if (String(u).includes('/api/talk')) {
      window.__sent = JSON.parse(init.body);
      return Promise.resolve(new Response(JSON.stringify({ said: 'ok', turns: [] }),
        { headers: { 'Content-Type': 'application/json' } }));
    }
    return real(u, init);
  };
  return 1;
})()`);

const askWith = async (text) => {
  await type(text);
  const m2 = await menu();
  if (m2.open) {
    await page.eval("(() => { const b = document.querySelector('#atlist [data-atpick=\"0\"]');"
      + " b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return 1; })()");
    await wait(250);
  }
  return m2.open;
};

if (!(await askWith("tell me about @key"))) {
  ok("a mention can be accepted before asking", false);
} else {
  await page.eval("(() => { document.querySelector('[data-ask]')?.click(); return 1; })()");
  await wait(500);
  const sent = await page.eval("window.__sent");
  console.log("  sent: " + JSON.stringify(sent && { said: sent.said, mentions: sent.mentions }));
  ok("the question carries the mention, not only the name",
     !!sent && Array.isArray(sent.mentions) && sent.mentions.length === 1);
  ok("  with a kind and an id the server can resolve",
     !!sent?.mentions?.[0]?.kind && !!sent?.mentions?.[0]?.id);
}

// And a mention whose name you deleted is not sent. Otherwise a whole thread arrives in front of
// her for a word that is no longer in the question.
await page.eval("(() => { window.__sent = null; return 1; })()");
if (!(await askWith("tell me about @key"))) {
  ok("a mention can be accepted before deleting it", false);
} else {
  await type("tell me about something else entirely");
  await page.eval("(() => { document.querySelector('[data-ask]')?.click(); return 1; })()");
  await wait(500);
  const sent2 = await page.eval("window.__sent");
  console.log("  after deleting the name: " + JSON.stringify(sent2 && sent2.mentions));
  ok("deleting the name drops the mention with it",
     !!sent2 && (sent2.mentions === undefined || sent2.mentions.length === 0));
}

// ---- AND THE SAME MENU IN THE COMPOSER. Seth: "on the left hand side add an @ symbol that will
// add the feature that we just added to the anansi chat there. that way if doing direction or if
// we want to use a thread that screen with the selector shows up."
//
// CHEAP AND CONSISTENT, which is the half he chose: the composer's mentions carry the NAME and no
// id. That is not nothing — `fires()` scans the DIRECTIVE as well as the prose, so a triggered
// entry whose key is its own title activates from being named in what you typed, and picking it
// off the list is how you get the key exactly right rather than nearly right.
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#input')); i++) await wait(250);

const cmenu = () => page.eval(`(() => { const l = document.getElementById('atlistInput');
  if (!l || l.hidden) return { open: false };
  return { open: true, items: [...l.querySelectorAll('[data-atpick]')].map(b => b.textContent.replace(/\\s+/g, ' ').trim()) };
})()`);

// NO @ BUTTON. Typing the character is the whole gesture, and a button for a character you can
// type is a control earning nothing. Asserted as absent, so it does not come back by accident.
ok("there is no @ button — typing one is the gesture",
   !(await page.eval("!!document.querySelector('[data-atopen]')")));
const order = await page.eval("[...document.querySelectorAll('#inputRow > *')].map(e => e.id || (e.dataset.bigin && 'bigin') || e.tagName)");
console.log("  input row: " + JSON.stringify(order));
ok("  the full-screen button is on the LEFT of the box",
   order.indexOf('bigin') === 0 && order.indexOf('inputWrap') === 1);
ok("  and Send is still on the right where it was", order.includes('send'));

let cm;
await page.eval(`(() => { const b = document.getElementById('input');
  b.value = 'she looks at @'; b.selectionStart = b.selectionEnd = b.value.length;
  b.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
await wait(350);
cm = await cmenu();
console.log("  after typing @: " + JSON.stringify(cm.items));
ok("typing @ opens the menu on its own", cm.open && !!cm.items && cm.items.length > 0);

await page.eval(`(() => { const b = document.getElementById('input');
  b.value = '@key'; b.selectionStart = b.selectionEnd = b.value.length;
  b.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
await wait(300);
cm = await cmenu();
ok("typing filters it here too", cm.open && !!cm.items && cm.items.some((t) => /Silver Key/i.test(t)));

if (cm.open) {
  await page.eval("(() => { const b = document.querySelector('#atlistInput [data-atpick=\"0\"]');"
    + " b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return 1; })()");
  await wait(300);
  const v = await page.eval("document.getElementById('input').value");
  console.log("  composer after accepting: " + JSON.stringify(v));
  ok(`accepting writes @name into the directive (${JSON.stringify(v)})`, /@the Silver Key/i.test(v));
  const marks = await page.eval("(() => [...document.querySelectorAll('#inputMirror mark')].map(m => m.textContent))()");
  console.log("  composer marks: " + JSON.stringify(marks));
  ok(`  and it is marked, the same as in the ask box (${JSON.stringify(marks)})`,
     marks.length === 1 && /@the Silver Key/.test(marks[0]));
  // THE TWO BOXES MUST NOT SHARE A STORE. The first version of this checked that #askMirror had
  // no marks — and passed with the stores merged, because the ask box was EMPTY after a reload and
  // an empty box has nothing to mark either way. Decorative. So: open the Anansi panel, put the
  // same name in ITS box, and assert the composer's pick did not light it up there.
  await page.eval("(() => { document.querySelector('[data-panel=\"anansi\"]')?.click(); return 1; })()");
  await wait(500);
  await page.eval(`(() => { const b = document.getElementById('askBox');
    if (!b) return 0; b.value = 'and what about @the Silver Key';
    b.selectionStart = b.selectionEnd = b.value.length;
    b.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await wait(300);
  const askMarks = await page.eval("(() => [...document.querySelectorAll('#askMirror mark')].map(m => m.textContent))()");
  console.log("  ask box marks after a COMPOSER pick: " + JSON.stringify(askMarks));
  ok("  a name picked in the composer does not light up in the ask box — separate stores",
     askMarks.length === 0);
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
