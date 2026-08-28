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
  ok("  and the @ does not survive — what reaches Anansi reads as English", !after.includes('@'));
  ok("  and the menu closes", !(await menu()).open);
  // The caret has to land after the name, or the next word is typed into the middle of it.
  const caret = await page.eval("document.getElementById('askBox').selectionStart");
  ok(`  with the caret after what it inserted (${caret} of ${after.length})`, caret === after.length);
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

console.log(red ? `\n  ${red} RED` : "\n  all green");
