// One thread, altered where it is read (#136, 2026-11-03: Read is the editor, ADR 0013). This was
// the Alter screen's scenario (v2 Threads redesign, 2026-10-25); Alter is gone, and every rule it
// checked is checked on Read.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/threadalter.js
//
// The shape: "‹ Threads" in the header and no Undo my changes, no Done (ADR 0004, pass three: it
// saves as you type, and leaving the thread is the last write); the four tabs (The thread · Timeline ·
// Pockets · More); a field is its text until tapped, then a box in place; the kind opens in place;
// wake words as chips. And the rules around it: Back and Esc keep what was typed and go to the list;
// an emptied Always true is refused and Back stays; a refused save says so; Past edits' Put this
// back is the undo; the field being typed in stays above an on-screen keyboard; every control the
// old form had is still on Read. Last, a thread followed from a world book.
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
// A field of Read opened in place: its text pressed, as a writer taps it.
const tap = async (f) => { await page.click(`#sideBody [data-readedit="${f}"]`); await wait(500); };
const where = () => page.eval(`JSON.stringify({ boxes: !!document.querySelector('#sideBody .readface [data-f], #sideBody .readface [data-ab]'),
  read: !!document.querySelector('#sideBody .readface'), list: !!document.getElementById('thq'),
  drawer: !document.getElementById('side').hidden })`).then(JSON.parse);
const vis = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
  return !!e && e.offsetParent !== null; })()`);
const typeInto = (sel, text) => page.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
  el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
const chips = () => page.eval("[...document.querySelectorAll('#keychips .keychip')].map(c => c.firstChild.textContent.trim())");
const back = async (ms = 800) => { await page.eval("(() => { history.back(); return 1; })()"); await wait(ms); };
const title = async (sid, id) => (await story(sid)).entries.find((e) => e.id === id)?.title;

for (const [w, h, size] of [[390, 844, 'the iPhone'], [360, 360, 'the Titan']]) {
  await page.mobile(w, h);
  await page.goto(B + "/");
  await wait(900);
  // By title, not "the first tale in the library": the iPhone pass makes a tale of its own, and the
  // newest is first.
  const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s => s.title === 'The Silver Key').id)()");
  const v = await story(sid);
  const key = v.entries.find((e) => e.title === 'the Silver Key');
  console.log(`  -- ${size} (${w}x${h})`);
  await list(sid); await openThread('the Silver Key');

  // ---- The header: "‹ Threads", and no Undo my changes and no Done
  const head = await page.eval(`JSON.stringify({ back: !!document.querySelector('#sideHead [data-backentry]'),
    undo: !!document.querySelector('[data-alterundo]'), done: !!document.querySelector('[data-alterdone]'),
    close: !!document.querySelector('#sideHead [data-panel=""]'), bar: !!document.querySelector('#sideBody .savebar') })`).then(JSON.parse);
  ok(`the header is "‹ Threads" with no Undo my changes and no Done (${JSON.stringify(head)})`,
     head.back && !head.undo && !head.done);
  ok("  with Close beside it and no bar in Read", head.close && !head.bar);

  // ---- The four tabs
  const tabs = await page.eval(`JSON.stringify([...document.querySelectorAll('[data-cardtab]')].map((t) => ({ k: t.dataset.cardtab,
    label: t.textContent.trim(), top: Math.round(t.getBoundingClientRect().top),
    fits: t.scrollWidth <= t.clientWidth + 1 })))`).then(JSON.parse);
  ok(`the tabs are The thread · Timeline · Pockets · More (${tabs.map((t) => t.label).join(' · ')})`,
     tabs.map((t) => t.k).join() === 'card,time,rooms,more'
       && tabs.map((t) => t.label).join() === 'The thread,Timeline,Pockets,More');
  ok("  in one row, each label inside its tab", new Set(tabs.map((t) => t.top)).size === 1 && tabs.every((t) => t.fits));

  // ---- Read opens with no box; each field opens its box in place on a tap
  ok("Read opens with no box open", !(await where()).boxes);
  for (const [f, sel] of [['title', '#f-card-title'], ['stands', '#f-card-body, #f-card-now'], ['keys', '#keychips'],
                          ['notes', '#f-card-notes'], ['facts', '#f-card-facts']]) {
    await tap(f);
    ok(`  a tap on ${f} opens its box in place`, await vis(sel));
  }
  ok("  and the eye in the tags is how it reaches the model", await vis(`#sideBody .readtags [data-flipact="${key.id}"]`));
  ok("  and the picture is not on The thread", !(await vis('[data-picfind]')));
  await tap('kind');
  ok("a tap on the kind opens the kinds in place",
     // One per KINDS entry: four since rules left the kinds for the tale's own thread (ADR 0005, 2026-10-29).
     (await page.eval("[...document.querySelectorAll('[data-kind]')].filter(b => b.offsetParent).length")) === 4);
  await tap('kind');
  ok("  and a second tap shuts them", (await page.eval("[...document.querySelectorAll('[data-kind]')].filter(b => b.offsetParent).length")) === 0);
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

  // ---- More: the picture; the Timeline is its own tab
  await page.click('[data-cardtab="more"]'); await wait(400);
  ok("More holds the picture", await vis('[data-picfind]'));
  ok("  and not the Timeline", !(await vis('[data-addstate]')) && !(await vis('[data-fold="states"]')));
  await page.click('[data-cardtab="time"]'); await wait(400);
  ok("Timeline is its own tab", (await page.eval(
    "(() => { const f = document.querySelector('[data-otrow=\"1\"]'); return !!f && f.offsetParent !== null; })()")));
  // A TAB PRESS KEEPS WHAT IS TYPED: the tabs are switched by the stylesheet, not a repaint.
  await page.click('[data-cardtab="card"]'); await wait(300);
  await typeInto('#f-card-notes', 'typed, then a tab');
  await page.click('[data-cardtab="more"]'); await wait(300);
  await page.click('[data-cardtab="card"]'); await wait(300);
  ok("a half-typed box survives a tab press",
     (await page.eval("document.getElementById('f-card-notes')?.value")) === 'typed, then a tab');
  await typeInto('#f-card-notes', key.notes ?? '');

  // ---- The keyboard: the field being typed in stays on screen
  // Headless Chrome has no soft keyboard, so the one this layout makes room for is played by
  // what the viewport does when a keyboard opens: it gets shorter (interactive-widget=
  // resizes-content), here by 40% of the screen.
  await page.eval("(() => { const i = document.getElementById('f-card-keys'); i.scrollIntoView({ block: 'end' }); i.focus(); return 1; })()");
  await page.mobile(w, Math.round(h * 0.6)); await wait(600);
  const kb = await page.eval(`JSON.stringify((() => { const i = document.activeElement, r = i.getBoundingClientRect();
    const head = document.getElementById('sideHead').getBoundingClientRect();
    const box = document.getElementById('keychips').getBoundingClientRect();
    return { id: i.id, top: Math.round(r.top), bottom: Math.round(r.bottom), box: Math.round(box.bottom),
      floor: innerHeight, ceil: Math.round(head.bottom) }; })())`).then(JSON.parse);
  ok(`with the keyboard up, the wake-word box is still on screen (${JSON.stringify(kb)})`,
     kb.id === 'f-card-keys' && kb.top >= kb.ceil && kb.bottom <= kb.floor);
  // Not flush: the whole box, its border and some air above the keyboard (Seth's phone, 2026-10-25).
  ok(`  with room under the box, not flush with the keyboard (${kb.floor - kb.box}px)`, kb.floor - kb.box >= 8);
  await page.mobile(w, h); await wait(500);

  if (w !== 390) { await back(); continue; }   // the presses below change the book; once is enough

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
  // ---- Back: the last write stores what the chips show, and goes to the list
  await typeInto('#f-card-keys', '');
  await back(1200);
  const saved = (await story(sid)).entries.find((e) => e.id === key.id);
  ok(`Back stores exactly the words on the chips (${JSON.stringify(saved.keys)})`, JSON.stringify(saved.keys) === JSON.stringify(afterX));
  ok("  and returns to the list", (await where()).list);
  // Put back, so the next size starts from the same thread.
  await page.eval(`(async () => { const v = await (await fetch('/api/story?story=${sid}')).json();
    const e = v.entries.find((x) => x.id === ${JSON.stringify(key.id)});
    await fetch('/api/entry', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId: ${JSON.stringify(sid)}, entry: { ...e, keys: ${JSON.stringify(key.keys)} } }) }); return 1; })()`);

  // ---- The eye saves itself and keeps what is typed in the name's box
  await list(sid); await openThread('the Silver Key');
  await tap('title');
  await typeInto('#f-card-title', 'the Brass Key');
  const actWas = (await story(sid)).entries.find((e) => e.id === key.id).activation;
  await page.click(`#sideBody .readtags [data-flipact="${key.id}"]`); await wait(1200);
  ok("a tap on the eye saves it and keeps the name typed in its box",
     (await story(sid)).entries.find((e) => e.id === key.id).activation !== actWas
       && (await page.eval("document.getElementById('f-card-title').value")) === 'the Brass Key');
  // Two more taps go round to where it was (off, on a word, on).
  for (let i = 0; i < 2; i++) { await page.click(`#sideBody .readtags [data-flipact="${key.id}"]`); await wait(1200); }
  ok("  and round again to where it was", (await story(sid)).entries.find((e) => e.id === key.id).activation === actWas);
  await back(1200);
  ok("Back writes the name", (await title(sid, key.id)) === 'the Brass Key');

  // ---- Put this back, in Past edits under More, is the undo
  // By id: it is named the Brass Key now.
  await page.eval(`(() => { document.querySelector('#thlist .card.plate[data-entry="${key.id}"]')?.click(); return 1; })()`); await wait(700);
  await page.click('[data-cardtab="more"]'); await wait(300);
  await page.click('[data-fieldhistory]'); await wait(900);
  const put = await page.eval(`(() => { const r = [...document.querySelectorAll('[data-histrow]')]
    .find((x) => x.querySelector('.kind')?.textContent === 'title' && /Silver/.test(x.textContent));
    const b = r?.querySelector('[data-revertfield]'); if (!b) return false; b.click(); return true; })()`);
  await wait(1200);
  ok(`Past edits holds the name as it was, and Put this back puts it back (${put})`,
     put && (await title(sid, key.id)) === 'the Silver Key');

  // ---- Back with a change keeps it and returns to the list
  await list(sid); await openThread('the Silver Key');
  const bodyWas = (await story(sid)).entries.find((e) => e.id === key.id).body;
  await tap('stands');
  await typeInto('#f-card-body', '[the Silver Key: changed, then Back]');
  await back(1200);
  const b2 = await where();
  ok(`Back with a change keeps it and returns to the list (${JSON.stringify(b2)})`,
     b2.list && /changed, then Back/.test((await story(sid)).entries.find((e) => e.id === key.id).body));
  // Put back, so the next size starts from the same thread.
  await openThread('the Silver Key'); await tap('stands'); await typeInto('#f-card-body', bodyWas); await back(1200);
  await back();
  ok("  and the next Back shuts the drawer", !(await where()).drawer);

  // ---- Esc keeps it too
  await list(sid); await openThread('the Silver Key'); await tap('title');
  await typeInto('#f-card-title', 'Esc test');
  await page.key('Escape', 27); await wait(1200);
  const e1 = await where();
  ok(`Esc with a change keeps it and returns to the list (${JSON.stringify(e1)})`,
     e1.list && (await title(sid, key.id)) === 'Esc test');
  await openThread('Esc test'); await tap('title'); await typeInto('#f-card-title', 'the Silver Key'); await back(1200);

  // ---- A thread opened on its own, from a passage: Read is the drawer's own screen there, so Back
  // shuts the drawer, and what was typed is still written (the last write is owed on every way out).
  // The press is the one the passage's thread links make (data-goblock="entry:<id>"), put on the
  // page for the test, so the drawer opens as `entry` and not as the Threads list.
  await page.goto(B + "/#" + sid); await wait(1200);
  const solo = async () => {
    await page.eval(`(() => { const b = document.createElement('button'); b.dataset.goblock = 'entry:${key.id}';
      b.id = 'soloopen'; b.textContent = 'open'; document.body.append(b); b.click(); b.remove(); return 1; })()`);
    await wait(800);
  };
  await solo();
  const s0 = await where();
  ok(`a thread opened from a passage opens on Read, in the drawer (${JSON.stringify(s0)})`, s0.read && s0.drawer && !s0.list);
  await tap('stands');
  await typeInto('#f-card-body', '[the Silver Key: from a passage, kept]');
  await back(1200);
  const s2 = await where();
  ok(`  Back with a change keeps it and shuts the drawer (${JSON.stringify(s2)})`,
     !s2.drawer && /from a passage, kept/.test((await story(sid)).entries.find((e) => e.id === key.id).body));
  await solo(); await tap('stands'); await typeInto('#f-card-body', bodyWas); await back(1200);

  // ---- An emptied Always true is refused: Back says so and stays, with the words in the box
  // On a thread made for it, so no fixture thread is left with an Always true it did not have.
  const probe = await page.eval(`(async () => { const r = await (await fetch('/api/entry', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId: ${JSON.stringify(sid)},
      entry: { title: 'Probe Always True', entryType: 'lore', body: '[Probe]', activation: 'always_on', keys: [] } }) })).json();
    return r.error ?? 'ok'; })()`);
  ok(`a thread to try it on is made (${probe})`, probe === 'ok');
  await list(sid); const pid = await openThread('Probe Always True');
  await tap('facts');
  await typeInto('#f-card-facts', 'a probe, kept');
  await wait(1500);
  await typeInto('#f-card-facts', '   ');
  await back(1200);
  const t1 = (await page.text('#toast') || '').trim();
  const r1 = await where();
  ok(`Back with Always true emptied says so (${JSON.stringify(t1)})`, /Always true needs something in it/.test(t1));
  ok(`  and stays on Read with the box as it was left (${JSON.stringify(r1)})`, r1.read && !r1.list
     && (await page.eval("document.getElementById('f-card-facts')?.value")) === '   ');
  ok("  and nothing empty is stored",
     /a probe, kept/.test(((await story(sid)).entries.find((e) => e.id === pid)?.addons ?? []).find((a) => a.slot === 'facts')?.body ?? ''));
  // Delete the probe from More, two presses.
  await page.click('[data-cardtab="more"]'); await wait(300);
  for (let i = 0; i < 2; i++) { await page.click('[data-delentry]'); await wait(600); }
  ok("  (the probe thread is deleted again)", !(await story(sid)).entries.some((e) => e.id === pid));

  // ---- A refused save says so, and nothing is stored
  // The activation floor refuses any word but the two. The app never sends another, so the request
  // is changed on its way out, which is what a stale or a hand-made client would send.
  await list(sid); await openThread('the Silver Key'); await tap('title');
  await page.eval(`(() => { const real = window.fetch; window.__realFetch = real;
    window.fetch = (u, o) => { if (String(u).includes('/api/entry') && o?.method === 'POST') {
      const b = JSON.parse(o.body); if (b.entry) b.entry.activation = 'keyed'; o = { ...o, body: JSON.stringify(b) }; }
      return real(u, o); }; return 1; })()`);
  await typeInto('#f-card-title', 'Refused name');
  await back(1200);
  const toast = (await page.text('#toast') || '').trim();
  ok(`a refused save says so plainly (${JSON.stringify(toast)})`, /not saved/i.test(toast) && /always on or on a word/.test(toast));
  ok("  and nothing is stored", (await title(sid, key.id)) === 'the Silver Key');
  await page.eval("(() => { window.fetch = window.__realFetch; return 1; })()");

  // ---- Every control the old form had is on Read, on its tab
  await list(sid); await openThread('Marek Vale');
  const onTab = async (t, sels) => { await page.click(`[data-cardtab="${t}"]`); await wait(400);
    const got = {}; for (const s of sels) got[s] = await vis(s); return got; };
  const have = {
    card: await onTab('card', ['[data-readedit="title"]', '[data-readedit="kind"]', '[data-flipact]', '[data-readedit="facts"]',
      '[data-readedit="stands"]', '[data-readedit="keys"]', '[data-readedit="notes"]', '[data-invent]']),
    time: await onTab('time', ['[data-otrow="1"]', '[data-addstate]']),
    rooms: await onTab('rooms', ['#sideHead [data-pocketnew]', '[data-editroom]', '[data-wear]']),
    more: await onTab('more', ['[data-picfind]', '#f-card-json',
      '[data-cardcopy]', '[data-cardsave]', '[data-cardread]', '[data-fold="edges"]', '[data-retire]', '[data-scanstory]',
      '[data-fold="copy"]', '[data-mergestart]', '[data-fieldhistory]', '[data-delentry]']),
  };
  const missing = Object.entries(have).flatMap(([t, m]) => Object.entries(m).filter(([, on]) => !on).map(([s]) => `${t}:${s}`));
  ok(`every control the old form had is on its tab (${missing.length ? 'missing ' + missing.join(' ') : 'all there'})`, missing.length === 0);
  await page.click('[data-cardtab="time"]'); await wait(400);
  ok("  and the Timeline still opens to its editor", await vis('[data-addstate]'));
  await back();

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
    more: !!document.querySelector('#sideHead [data-readmenu], [data-readedit]'), save: !!document.querySelector('[data-savefollowed]'),
    take: !!document.querySelector('[data-takeover]'), drop: !!document.querySelector('[data-dropfollow]') })`).then(JSON.parse);
  ok(`its Read screen has "‹ Threads", no field to open in place, and its own Send to, Take over and Remove (${JSON.stringify(fh)})`,
     fh.back && !fh.more && fh.save && fh.take && fh.drop);
  await typeInto('[data-followedbody]', '[The Tide Bell: rings at low water, and once at high]');
  await page.click('[data-savefollowed]'); await wait(900);
  ok("  and Send to writes it in the world book it lives in",
     /once at high/.test((await story(made.world)).entries.find((e) => e.title === 'The Tide Bell')?.body ?? ''));
  await page.click('#sideHead [data-backentry]'); await wait(600);
  ok("  and ‹ Threads goes back to that tale's list", (await where()).list);
}

// ---- The cross-book Threads page, at a desk's width: Read draws its own "‹ Threads" in the page,
// and leaving by it sends the last write there too.
{
  await page.mobile(1280, 800);
  await page.goto(B + "/"); await wait(900);
  await page.click('[data-nav="canon"]'); await wait(1200);
  // The first thread the page shows: every book but the first starts folded.
  const card = await page.eval(`(() => { const c = document.querySelector('.card.plate[data-entry]');
    if (!c) return ''; c.click(); return c.dataset.entry; })()`);
  await wait(1200);
  const owner = await page.eval(`(async () => { for (const s of (await (await fetch('/api/stories')).json()).stories) {
    const v = await (await fetch('/api/story?story=' + s.id)).json();
    if ((v.entries ?? []).some((e) => e.id === ${JSON.stringify(card)} && !e.sharedFrom)) return s.id; } return ''; })()`);
  const named = async () => owner ? (await story(owner)).entries.find((e) => e.id === card)?.title : null;
  const titleWas = await named();
  await page.eval("(() => { document.querySelector('#page [data-readedit=\"title\"]')?.click(); return 1; })()"); await wait(800);
  const opened = await page.eval("!!document.querySelector('#page #f-card-title')");
  await typeInto('#f-card-title', 'Left on the page');
  await page.eval("(() => { document.querySelector('#page .pagebar [data-backentry]')?.click(); return 1; })()"); await wait(1200);
  ok(`on the cross-book page at 1280px, a tap opens the name in place and leaving keeps it (opened ${opened})`,
     !!card && opened && (await named()) === 'Left on the page');
  // Put back, so a second run starts from the same thread.
  await page.eval(`(() => { document.querySelector('.card.plate[data-entry="${card}"]')?.click(); return 1; })()`); await wait(1200);
  await page.eval("(() => { document.querySelector('#page [data-readedit=\"title\"]')?.click(); return 1; })()"); await wait(800);
  await typeInto('#f-card-title', titleWas ?? '');
  await page.eval("(() => { document.querySelector('#page .pagebar [data-backentry]')?.click(); return 1; })()"); await wait(1200);
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
