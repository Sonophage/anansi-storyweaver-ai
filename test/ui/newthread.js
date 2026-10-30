// New thread: the last Threads screen of the v2 redesign (2026-10-25).
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/newthread.js
//
// The shape, from the design: "‹ Threads" in the header, the heading, one box for a name or a
// pasted thread, "Write it as" with the four kinds, and "Or let Anansi" as cards. And Seth's call on
// how it works: the kind is a choice with Character lit, Write it makes the thread and opens Alter,
// and the three cards (Write one for me, Look it up online, Read the scene) write the lit kind from
// what is in the box. Back and Esc go back to the list.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

const story = (sid) => page.eval("(async () => JSON.stringify(await (await fetch('/api/story?story=" + sid + "')).json()))()").then(JSON.parse);
// Opened by a press, as a writer opens it: a drawer loaded from its address has no history step.
const list = async (sid) => {
  await page.goto(B + "/#" + sid);
  for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('[data-nav=\"threads\"]')")); i++) await wait(250);
  await page.eval("(() => { document.querySelector('[data-nav=\"threads\"]').click(); return 1; })()");
  for (let i = 0; i < 40 && !(await page.visible('#thq')); i++) await wait(250);
};
const open = async () => { await page.click('#sideHead .headadd'); await wait(600); };
const where = () => page.eval(`JSON.stringify({ add: !!document.getElementById('newname'),
  list: !!document.getElementById('thq'), alter: !!document.querySelector('#sideHead [data-alterdone]'),
  read: !!document.querySelector('#sideBody .readface'), drawer: !document.getElementById('side').hidden })`).then(JSON.parse);
const setBox = (text) => page.eval(`(() => { const el = document.getElementById('newname');
  el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
const back = async (ms = 800) => { await page.eval("(() => { history.back(); return 1; })()"); await wait(ms); };

for (const [w, h, size] of [[390, 844, 'the iPhone'], [360, 360, 'the Titan']]) {
  await page.mobile(w, h);
  await page.goto(B + "/");
  await wait(900);
  const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s => s.title === 'The Silver Key').id)()");
  console.log(`  -- ${size} (${w}x${h})`);
  await list(sid); await open();

  // ---- The header: ‹ Threads, and no + over the screen it opens
  const head = await page.eval(`JSON.stringify({ back: document.querySelector('#sideHead [data-newlore].headback')?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
    add: !!document.querySelector('#sideHead .headadd'), count: !!document.querySelector('#sideHead [data-thcount]') })`).then(JSON.parse);
  ok(`the header is "‹ Threads", with no + and no count (${JSON.stringify(head)})`, head.back === '‹ Threads' && !head.add && !head.count);

  // ---- The screen, in the design's order
  const shape = await page.eval(`JSON.stringify((() => {
    const top = (sel) => { const e = document.querySelector('#sideBody ' + sel); return e ? Math.round(e.getBoundingClientRect().top) : null; };
    const box = document.getElementById('newname');
    return { head: document.querySelector('#sideBody .newhead')?.textContent.trim() ?? null,
      ph: box?.placeholder ?? null, hint: /pasted from Export is read in as it is/.test(document.getElementById('sideBody').textContent),
      kinds: [...document.querySelectorAll('#sideBody [data-lorekind]')].map((b) => b.textContent.trim()),
      lit: [...document.querySelectorAll('#sideBody [data-lorekind][aria-pressed="true"]')].map((b) => b.dataset.lorekind),
      cards: [...document.querySelectorAll('#sideBody .letcard .lettitle')].map((t) => t.textContent.trim()),
      order: [top('.newhead'), top('#newname'), top('[data-lorekind]'), top('[data-newthread]'), top('.letcard')],
      help: !!document.querySelector('#sideBody .tipcard#tip-threads') }; })())`).then(JSON.parse);
  ok(`the heading is New thread, and the box asks for a name or a paste (${JSON.stringify([shape.head, shape.ph])})`,
     shape.head === 'New thread' && shape.ph === 'Name it, or paste one in' && shape.hint);
  // #80 adds Places; #75 adds a rule from the tale's own thread, not here.
  ok(`  Write it as the four kinds, Character lit (${shape.kinds.join(' · ')}; lit ${shape.lit})`,
     shape.kinds.join() === 'Character,Place,Lore,Item' && shape.lit.join() === 'character');
  ok(`  and Anansi's three cards (${shape.cards.join(' · ')})`,
     shape.cards.join() === 'Write one for me,Look it up online,Read the scene');
  ok(`  top to bottom: heading, box, kinds, Write it, the cards (${shape.order})`,
     shape.order.every((y) => y !== null) && shape.order.every((y, i) => i === 0 || y > shape.order[i - 1]));
  ok("  and not the list's help on top of it", !shape.help);

  // ---- Fits, and every press is a finger's size
  const fit = await page.eval(`JSON.stringify((() => {
    const sb = document.getElementById('sideBody');
    // 44px to the finger, measured as the keychip test does: the press 21px above, below and to each
    // side of its centre still lands on a control.
    const C = 'button, a[href], select, summary, [role=button], label, input, textarea';
    const small = [...sb.querySelectorAll('[data-lorekind], [data-newthread], .letcard')].filter((b) => {
      b.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return document.elementFromPoint(cx, cy)?.closest('button') !== b
        || ![[0, -21], [0, 21], [-21, 0], [21, 0]].every(([dx, dy]) => !!document.elementFromPoint(cx + dx, cy + dy)?.closest(C));
    }).map((b) => b.textContent.trim().slice(0, 20));
    sb.scrollTop = 0;
    return { over: sb.scrollWidth - sb.clientWidth, small }; })())`).then(JSON.parse);
  ok(`  nothing runs off the side, and every press is 44px to the finger (${JSON.stringify(fit)})`, fit.over <= 1 && fit.small.length === 0);
  if (w === 390) await page.shot(`${process.env.HOME}/.cache/anansi-v2/newthread/newthread-${w}x${h}.png`);

  // ---- Back and Esc go back to the list
  await back();
  ok("Back from New thread goes back to the list", (await where()).list && (await where()).drawer);
  await open();
  await page.key('Escape', 27); await wait(500);
  ok("  and so does Esc", (await where()).list);
  await open();
  await page.click('#sideHead [data-newlore]'); await wait(500);
  ok("  and so does ‹ Threads", (await where()).list);

  if (w !== 390) continue;   // the presses below change the book; once is enough

  // ---- A kind is a choice, and the box keeps what is typed
  await open();
  await setBox('Ilse Varga');
  await page.click('[data-lorekind="lore"]'); await wait(400);
  const kept = await page.eval(`JSON.stringify({ box: document.getElementById('newname').value,
    lit: [...document.querySelectorAll('[data-lorekind][aria-pressed="true"]')].map((b) => b.dataset.lorekind),
    write: document.querySelector('[data-newthread]').dataset.newthread,
    invent: document.querySelector('[data-invent]').dataset.invent, web: document.querySelector('[data-fromweb]').dataset.fromweb })`).then(JSON.parse);
  ok(`pressing Lore lights it and keeps what is typed (${JSON.stringify(kept)})`,
     kept.box === 'Ilse Varga' && kept.lit.join() === 'lore');
  ok("  and Write it and both of Anansi's writing cards write Lore", kept.write === 'lore' && kept.invent === 'lore' && kept.web === 'lore');

  // ---- Anansi's cards read the one box and the lit kind
  // Caught on the way out, so no model and no search is needed: what is asked for is the check.
  await page.eval(`(() => { const real = window.fetch; window.__realFetch = real; window.__asked = [];
    window.fetch = (u, o) => { if (/\\/api\\/(invent|fromweb)$/.test(String(u))) { window.__asked.push([String(u), JSON.parse(o.body)]);
      return Promise.resolve(new Response(JSON.stringify({ error: 'caught by the test' }), { headers: { 'Content-Type': 'application/json' } })); }
      return real(u, o); }; return 1; })()`);
  await page.click('[data-invent]'); await wait(500);
  // The test server has no search, so the card is shut and says why; it is opened here to check
  // what it would ask for.
  const shut = await page.eval(`(async () => JSON.stringify({ off: document.querySelector('[data-fromweb]').disabled,
    sub: document.querySelector('[data-fromweb] .letsub').textContent.trim(),
    on: (await (await window.__realFetch('/api/story?story=${sid}')).json()).searchable !== false }))()`).then(JSON.parse);
  ok(`Look it up online is shut when the server cannot search, and says so (${JSON.stringify(shut)})`,
     shut.on ? !shut.off : shut.off && /not switched on/.test(shut.sub));
  await page.eval("(() => { document.querySelector('[data-fromweb]').disabled = false; return 1; })()");
  await page.click('[data-fromweb]'); await wait(500);
  const asked = await page.eval("JSON.stringify(window.__asked)").then(JSON.parse);
  await page.eval("(() => { window.fetch = window.__realFetch; return 1; })()");
  const inv = asked.find(([u]) => u.endsWith('/invent'))?.[1], web = asked.find(([u]) => u.endsWith('/fromweb'))?.[1];
  ok(`Write one for me asks for a Lore thread, steered by the box (${JSON.stringify(inv && [inv.kind, inv.direction])})`,
     inv?.kind === 'lore' && inv?.direction === 'Ilse Varga');
  ok(`Look it up online looks up the name in the box, as Lore (${JSON.stringify(web && [web.kind, web.subject])})`,
     web?.kind === 'lore' && web?.subject === 'Ilse Varga');

  // ---- Write it makes the thread, named, and opens Alter on it
  const before = (await story(sid)).entries.length;
  await setBox('Ilse Varga');
  await page.click('[data-newthread]'); await wait(1200);
  const made = (await story(sid)).entries.find((e) => e.title === 'Ilse Varga');
  const at = await where();
  ok(`Write it makes a Lore thread with that name (${JSON.stringify(made && [made.title, made.entryType])})`,
     !!made && made.entryType === 'lore' && (await story(sid)).entries.length === before + 1);
  ok(`  and opens it on Alter, the name in the name box (${JSON.stringify(at)})`,
     at.alter && (await page.eval("document.getElementById('f-card-title')?.value")) === 'Ilse Varga');
  await page.click('#sideHead [data-alterdone]'); await wait(600);
  ok("  and Done goes to its Read screen", (await where()).read);

  // ---- A pasted thread is read in as it is, and opens on Read
  await list(sid); await open();
  await setBox(JSON.stringify({ kind: 'item', title: 'The Tide Book',
    body: '[The Tide Book: kept by the harbour-master; every tide since the flood]', keys: ['tide book'],
    activation: 'triggered', rooms: { provenance: { name: 'Where it came from', body: '[bound in sailcloth]' } } }));
  await page.click('[data-newthread]'); await wait(1500);
  const pasted = (await story(sid)).entries.find((e) => e.title === 'The Tide Book');
  ok(`a pasted thread is read in as it is, pocket and all (${JSON.stringify(pasted && [pasted.entryType, pasted.activation, (pasted.addons || []).map((a) => a.slot)])})`,
     !!pasted && pasted.entryType === 'item' && pasted.activation === 'triggered'
       // #77. Provenance is part of Always true now, under the pocket's own name; #110: stored with no brackets.
       && (pasted.addons || []).some((a) => a.slot === 'facts' && /^Where it came from: bound in sailcloth$/m.test(a.body)));
  ok("  and opens on its Read screen", (await where()).read && !(await where()).add);

  // ---- A name with nothing typed is still a thread to write
  await list(sid); await open();
  await page.click('[data-newthread]'); await wait(1200);
  ok("Write it with the box empty makes an Untitled thread to write", (await where()).alter
     && (await page.eval("document.getElementById('f-card-title')?.value")) === 'Untitled');
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
