// One thread, altered: the Alter screen of the v2 Threads redesign (2026-10-25).
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/threadalter.js
//
// The shape: Cancel and Save in the header, the four tabs as they were (The thread · Over time ·
// Pockets · More — Seth, twice: Over time does not move into More), Picture and Kind under More,
// and wake words as chips. And the rules around it: Cancel, Back and Esc ask before throwing away
// what is not saved; Back from Alter returns to Read; a refused save says so and keeps the typing;
// the field being typed in stays above an on-screen keyboard; every control the form had is still
// on it. Last, a thread followed from a world book, which the fixture did not have.
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
const openThread = async (name) => {
  const id = await page.eval(`[...document.querySelectorAll('#thlist .card.plate[data-entry]')]
    .find((c) => c.querySelector('.platename')?.textContent === ${JSON.stringify(name)})?.dataset.entry ?? ''`);
  await page.click(`#thlist .card.plate[data-entry="${id}"]`);
  await wait(700);
  return id;
};
const alter = async () => { await page.click('#sideBody .readbody'); await wait(700); };
const where = () => page.eval(`JSON.stringify({ alter: !!document.querySelector('#sideHead [data-cancelalter]'),
  read: !!document.querySelector('#sideBody .readface'), list: !!document.getElementById('thq'),
  drawer: !document.getElementById('side').hidden })`).then(JSON.parse);
const vis = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
  return !!e && e.offsetParent !== null; })()`);
const typeInto = (sel, text) => page.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
  el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
const chips = () => page.eval("[...document.querySelectorAll('#keychips .keychip')].map(c => c.firstChild.textContent.trim())");
// Out of Alter whatever it asks: pressed until the form is gone, at most twice.
const leaveAlter = async () => {
  for (let i = 0; i < 2 && (await where()).alter; i++) { await page.click('#sideHead [data-cancelalter]'); await wait(600); }
};
const back = async (ms = 800) => { await page.eval("(() => { history.back(); return 1; })()"); await wait(ms); };

for (const [w, h, size] of [[390, 844, 'the iPhone'], [360, 360, 'the Titan']]) {
  await page.mobile(w, h);
  await page.goto(B + "/");
  await wait(900);
  // By title, not "the first tale on the rack": the iPhone pass makes a tale of its own, and the
  // newest is first.
  const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s => s.title === 'The Silver Key').id)()");
  const v = await story(sid);
  const key = v.entries.find((e) => e.title === 'the Silver Key');
  console.log(`  -- ${size} (${w}x${h})`);
  await list(sid); await openThread('the Silver Key'); await alter();

  // ---- The header: Cancel and Save, and nothing that would leave without asking
  const head = await page.eval(`JSON.stringify((() => {
    const c = document.querySelector('#sideHead [data-cancelalter]'), s = document.querySelector('#sideHead [data-saveentry]');
    const box = (x) => x ? [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)] : null;
    return { cancel: c?.textContent.trim() ?? null, save: s?.textContent.trim() ?? null,
      left: c ? c.getBoundingClientRect().left < innerWidth / 2 : false, right: s ? s.getBoundingClientRect().left > innerWidth / 2 : false,
      saves: document.querySelectorAll('[data-saveentry]').length, close: !!document.querySelector('#sideHead [data-panel=""]'),
      bar: !!document.querySelector('#sideBody .savebar'), cbox: box(c), sbox: box(s) }; })())`).then(JSON.parse);
  ok(`the header is Cancel on the left and Save on the right (${JSON.stringify(head)})`,
     head.cancel === 'Cancel' && head.save === 'Save' && head.left && head.right && head.saves === 1);
  ok("  with no Close beside them and no bar in the form", !head.close && !head.bar);

  // ---- The four tabs, as they were
  const tabs = await page.eval(`JSON.stringify([...document.querySelectorAll('[data-cardtab]')].map((t) => ({ k: t.dataset.cardtab,
    label: t.textContent.trim(), top: Math.round(t.getBoundingClientRect().top),
    fits: t.scrollWidth <= t.clientWidth + 1 })))`).then(JSON.parse);
  ok(`the tabs are The thread · Over time · Pockets · More (${tabs.map((t) => t.label).join(' · ')})`,
     tabs.map((t) => t.k).join() === 'card,time,rooms,more'
       && tabs.map((t) => t.label).join() === 'The thread,Over time,Pockets,More');
  ok("  in one row, each label inside its tab", new Set(tabs.map((t) => t.top)).size === 1 && tabs.every((t) => t.fits));

  // ---- The thread tab: name, how it reaches, info, wake words as chips. No picture, no kind.
  ok("The thread holds the name, both reach chips, the info and the wake words",
     (await vis('#f-card-title')) && (await vis('[data-act="always_on"]')) && (await vis('[data-act="triggered"]'))
       && (await vis('#f-card-body')) && (await vis('#keychips')));
  ok("  and not the picture or the kind", !(await vis('[data-picfind]')) && !(await vis('[data-kind]')));
  ok(`  the wake words are one chip each (${JSON.stringify(await chips())})`,
     JSON.stringify(await chips()) === JSON.stringify(key.keys));
  // Every x is 44px to the finger.
  const xs = await page.eval(`JSON.stringify([...document.querySelectorAll('#keychips [data-keyx]')].map((b) => {
    b.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const C = 'button, a[href], select, summary, [role=button], label, input';
    return document.elementFromPoint(cx, cy)?.closest('[data-keyx]') === b
      && [[0, -21], [0, 21], [-21, 0], [21, 0]].every(([dx, dy]) => !!document.elementFromPoint(cx + dx, cy + dy)?.closest(C)); }))`).then(JSON.parse);
  ok(`  and each chip's x is 44px to the finger (${JSON.stringify(xs)})`, xs.length === key.keys.length && xs.every(Boolean));

  // ---- More: the picture and the kind moved here; Over time did not
  await page.click('[data-cardtab="more"]'); await wait(400);
  ok("More holds the picture and the kind now",
     (await vis('[data-picfind]')) && (await page.eval("[...document.querySelectorAll('[data-kind]')].filter(b => b.offsetParent).length")) === 4);
  ok("  and not Over time", !(await vis('[data-addstate]')) && !(await vis('[data-fold="states"]')));
  await page.click('[data-cardtab="time"]'); await wait(400);
  ok("Over time is still its own tab", (await page.eval(
    "(() => { const f = document.querySelector('[data-fold=\"states\"]'); return !!f && f.offsetParent !== null; })()")));
  await page.click('[data-cardtab="card"]'); await wait(300);

  // ---- The keyboard: the field being typed in stays on screen
  // Headless Chrome has no soft keyboard, so the one this layout makes room for is played by
  // what the viewport does when a keyboard opens: it gets shorter (interactive-widget=
  // resizes-content), here by 40% of the screen.
  await page.eval("(() => { const i = document.getElementById('f-card-keys'); i.scrollIntoView({ block: 'end' }); i.focus(); return 1; })()");
  await page.mobile(w, Math.round(h * 0.6)); await wait(600);
  const kb = await page.eval(`JSON.stringify((() => { const i = document.activeElement, r = i.getBoundingClientRect();
    const head = document.getElementById('sideHead').getBoundingClientRect();
    return { id: i.id, top: Math.round(r.top), bottom: Math.round(r.bottom), floor: innerHeight, ceil: Math.round(head.bottom) }; })())`).then(JSON.parse);
  ok(`with the keyboard up, the wake-word box is still on screen (${JSON.stringify(kb)})`,
     kb.id === 'f-card-keys' && kb.top >= kb.ceil && kb.bottom <= kb.floor);
  await page.mobile(w, h); await wait(500);

  if (w !== 390) continue;   // the presses below change the book; once is enough

  // ---- Chips: Enter adds, a comma adds, a pasted list splits, duplicates are not added, x removes
  await page.click('#f-card-keys'); await wait(200);
  await typeInto('#f-card-keys', 'vault');
  await page.key('Enter', 13); await wait(300);
  const afterEnter = await chips();
  await typeInto('#f-card-keys', 'brass, lin');
  await wait(300);
  const afterComma = await chips();
  const left = await page.eval("document.getElementById('f-card-keys').value");
  await typeInto('#f-card-keys', 'lining, "Key", a, the archive,');
  await wait(300);
  const afterPaste = await chips();
  ok(`Enter adds a word (${JSON.stringify(afterEnter)})`, JSON.stringify(afterEnter) === JSON.stringify([...key.keys, 'vault']));
  ok(`  a comma adds what is before it and leaves the rest to type on (${JSON.stringify(afterComma)}, box "${left}")`,
     afterComma.at(-1) === 'brass' && left === 'lin');
  ok(`  a pasted list splits, a word already there in another case is not added twice, one letter is not a word (${JSON.stringify(afterPaste)})`,
     JSON.stringify(afterPaste) === JSON.stringify([...key.keys, 'vault', 'brass', 'lining', 'the archive']));
  await page.click('#keychips [data-keyx="0"]'); await wait(300);
  const afterX = await chips();
  ok(`  and x takes one off (${JSON.stringify(afterX)})`, JSON.stringify(afterX) === JSON.stringify(afterPaste.slice(1)));
  // ---- Save: stores what the chips show, and goes back to Read
  await page.click('#sideHead [data-saveentry]'); await wait(900);
  const saved = (await story(sid)).entries.find((e) => e.id === key.id);
  ok(`Save stores exactly the words on the chips (${JSON.stringify(saved.keys)})`, JSON.stringify(saved.keys) === JSON.stringify(afterX));
  ok("  and returns to Read", (await where()).read);

  // ---- A reach chip saves itself and keeps what is typed above it
  await alter();
  await typeInto('#f-card-title', 'the Brass Key');
  await page.click('[data-act="always_on"]'); await wait(900);
  ok("pressing Always on saves it and keeps the name typed above, unsaved",
     (await story(sid)).entries.find((e) => e.id === key.id).activation === 'always_on'
       && (await page.eval("document.getElementById('f-card-title').value")) === 'the Brass Key');
  await page.click('[data-act="triggered"]'); await wait(900);

  // ---- Cancel: straight out when nothing changed, two presses when something did
  await page.click('#sideHead [data-cancelalter]'); await wait(600);
  const c1 = await where();
  // Pressed again only if the first press asked: a Cancel that never asks has already left, and
  // the check below should fail by its name rather than the scenario dying on a missing button.
  if (c1.alter) { await page.click('#sideHead [data-cancelalter]'); await wait(700); }
  const c2 = await where();
  ok(`Cancel with a change asks first (${JSON.stringify(c1)}) and the second press throws it away (${JSON.stringify(c2)})`,
     c1.alter && c2.read && (await story(sid)).entries.find((e) => e.id === key.id).title === 'the Silver Key');
  if ((await where()).alter) { await page.click('#sideHead [data-cancelalter]'); await wait(600); }
  await alter();
  await page.click('#sideHead [data-cancelalter]'); await wait(600);
  ok("  and Cancel with nothing changed goes straight back to Read", (await where()).read);

  // ---- Back from Alter returns to Read, and follows Cancel's rule
  await list(sid); await openThread('the Silver Key'); await alter();
  await back();
  const b1 = await where();
  ok(`Back from Alter returns to Read, not to the list (${JSON.stringify(b1)})`, b1.read && !b1.list);
  await alter();
  await typeInto('#f-card-body', '[the Silver Key: changed and not saved]');
  await back();
  const b2 = await where();
  await back();
  const b3 = await where();
  ok(`Back with a change stays and says so (${JSON.stringify(b2)}), and a second Back throws it away (${JSON.stringify(b3)})`,
     b2.alter && b3.read && !/changed and not saved/.test((await story(sid)).entries.find((e) => e.id === key.id).body));
  await back();
  ok("  and the next Back goes to the list", (await where()).list);

  // ---- Esc is Cancel too
  await openThread('the Silver Key'); await alter();
  await typeInto('#f-card-title', 'Esc test');
  await page.key('Escape', 27); await wait(500);
  const e1 = await where();
  await page.key('Escape', 27); await wait(600);
  const e2 = await where();
  ok(`Esc with a change asks first, and a second Esc throws it away (${JSON.stringify(e1)} > ${JSON.stringify(e2)})`, e1.alter && e2.read);

  // ---- A refused save says so, and keeps what was typed
  // The activation floor refuses any word but the two. The app never sends another, so the request
  // is changed on its way out, which is what a stale or a hand-made client would send.
  await alter();
  await page.eval(`(() => { const real = window.fetch; window.__realFetch = real;
    window.fetch = (u, o) => { if (String(u).includes('/api/entry') && o?.method === 'POST') {
      const b = JSON.parse(o.body); if (b.entry) b.entry.activation = 'keyed'; o = { ...o, body: JSON.stringify(b) }; }
      return real(u, o); }; return 1; })()`);
  await typeInto('#f-card-title', 'Refused name');
  await page.click('#sideHead [data-saveentry]'); await wait(900);
  const toast = (await page.text('#toast') || '').trim();
  ok(`a refused save says so plainly (${JSON.stringify(toast)})`, /not saved/i.test(toast) && /always on or on a word/.test(toast));
  ok("  and the form stays with what was typed",
     (await where()).alter && (await page.eval("document.getElementById('f-card-title').value")) === 'Refused name'
       && (await story(sid)).entries.find((e) => e.id === key.id).title === 'the Silver Key');
  await page.eval("(() => { window.fetch = window.__realFetch; return 1; })()");
  await leaveAlter();

  // ---- Every control the form had is still on it, on its tab
  await list(sid); await openThread('Marek Vale'); await alter();
  const onTab = async (t, sels) => { await page.click(`[data-cardtab="${t}"]`); await wait(400);
    const got = {}; for (const s of sels) got[s] = await vis(s); return got; };
  const have = {
    card: await onTab('card', ['#f-card-title', '[data-act="always_on"]', '#f-card-body', '#f-card-keys']),
    time: await onTab('time', ['[data-fold="states"]']),
    rooms: await onTab('rooms', ['[data-newroom]', '[data-ofn]', '[data-wear]', '[data-saveoutfit]', '[data-deloutfit]', '[data-goslot]']),
    more: await onTab('more', ['[data-picfind]', '[data-kind="lore"]', '[data-invent]', '#f-card-notes', '#f-card-json',
      '[data-cardcopy]', '[data-cardsave]', '[data-cardread]', '[data-fold="edges"]', '[data-retire]', '[data-scanstory]',
      '[data-fold="copy"]', '[data-fieldhistory]', '[data-delentry]']),
  };
  const missing = Object.entries(have).flatMap(([t, m]) => Object.entries(m).filter(([, on]) => !on).map(([s]) => `${t}:${s}`));
  ok(`every control the form had is on its tab (${missing.length ? 'missing ' + missing.join(' ') : 'all there'})`, missing.length === 0);
  await page.click('[data-cardtab="time"]'); await wait(300);
  await page.eval("(() => { const f = document.querySelector('[data-fold=\"states\"]'); if (!f.closest('details').open) f.click(); return 1; })()");
  await wait(400);
  ok("  and Over time still opens to its editor", await vis('[data-addstate]'));
  await leaveAlter();

  // ---- A thread followed from a world book
  // Made here, through the routes a writer's presses use: a world book with one thread, and a tale
  // that follows it. The fixture's own tales are left as they are, which every other scenario counts on.
  const made = await page.eval(`(async () => {
    const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
    const world = await post('/api/world', { title: 'The Vantic Atlas' });
    await post('/api/entry', { storyId: world.id, entry: { title: 'The Tide Bell', entryType: 'lore', body: '[The Tide Bell: rings at low water]', activation: 'always_on', keys: [] } });
    const tale = await post('/api/story/from', { storyId: world.id, title: 'A Tale That Follows' });
    return JSON.stringify({ world: world.id, tale: tale.id }); })()`).then(JSON.parse);
  ok(`a world book and a tale that follows it are made (${JSON.stringify(made)})`, !!made.world && !!made.tale);
  await list(made.tale);
  const followedTag = await page.eval(`[...document.querySelectorAll('#thlist .card.plate[data-entry]')]
    .find((c) => c.querySelector('.platename')?.textContent === 'The Tide Bell')?.textContent.replace(/\\s+/g, ' ') ?? ''`);
  ok(`the followed thread is on the list, tagged with where it lives (${followedTag.slice(0, 60)})`, /from The Vantic Atlas/i.test(followedTag));
  await openThread('The Tide Bell');
  const fh = await page.eval(`JSON.stringify({ back: !!document.querySelector('#sideHead [data-backentry]'),
    more: !!document.querySelector('#sideHead [data-readmenu]'), save: !!document.querySelector('[data-savefollowed]'),
    take: !!document.querySelector('[data-takeover]'), drop: !!document.querySelector('[data-dropfollow]') })`).then(JSON.parse);
  ok(`its Read screen has "‹ Threads", no ⋯, and its own Save, Take over and Remove (${JSON.stringify(fh)})`,
     fh.back && !fh.more && fh.save && fh.take && fh.drop);
  await typeInto('[data-followedbody]', '[The Tide Bell: rings at low water, and once at high]');
  await page.click('[data-savefollowed]'); await wait(900);
  ok("  and Save writes it in the world book it lives in",
     /once at high/.test((await story(made.world)).entries.find((e) => e.title === 'The Tide Bell')?.body ?? ''));
  await page.click('#sideHead [data-backentry]'); await wait(600);
  ok("  and ‹ Threads goes back to that tale's list", (await where()).list);
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
