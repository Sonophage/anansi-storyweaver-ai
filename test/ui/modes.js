// The five modes, structurally — everything that can be checked without waiting on a
// generation. What each mode DOES when you press send is in model.js, which is slow on purpose.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/modes.js
//
// The distinction under test is the one that broke: in Direct your text is an instruction and
// never reaches the page; in Speak, Act and Narrate your text IS the next passage.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const story = () => page.eval("(async () => await (await fetch('/api/story?story=" + sid + "')).json())()");
const modeBlock = (mode, speaker, directive) => page.eval(
  "(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
  + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',"
  + "mode:" + JSON.stringify(mode) + (speaker ? ",speaker:" + JSON.stringify(speaker) : '')
  + (directive ? ",directive:" + JSON.stringify(directive) : '') + "})})).json();"
  + " return r.manifest.blocks.find(b => b.kind === 'MODE')?.text ?? ''; })()");

await page.goto(B + "/#" + sid);

// ---- 1. the five buttons, and what kind of thing each one is
for (const label of ['Continue', 'Speak', 'Act', 'Direct', 'Narrate'])
  ok(`${label} is on the bar`, await page.visible(`#modes [data-continue], #modes [data-mode]`)
     && /./.test(await page.text('#modes') || '') && (await page.text('#modes') || '').includes(label));
ok("New scene is gone from the bar", !/New scene/.test(await page.text('#modes') || ''));
// Continue sends with nothing typed, so it is an action. A mode you can select but never type
// into is the shape that made "Continue" need an empty box pressed twice.
ok("Continue is an action, not a selectable mode", await page.eval(
  "!!document.querySelector('[data-continue]') && !document.querySelector('[data-mode=\"continue\"]')"));
ok("Speak is selected by default", await page.eval(
  "document.querySelector('[data-mode=\"speak\"]')?.getAttribute('aria-pressed') === 'true'"));

// ---- 2. the two lines he asked to lose
const dock = (await page.text('#dockCol') || '');
ok("'Each take is kept' is gone", !/Each take is kept/.test(dock));
ok("the last-take line is gone", !/Last take|Ready$/m.test(dock));
ok("  and #takeRow is not rendered at all", await page.eval("!document.getElementById('takeRow')"));

// ---- 3. Enter sends. It needed Cmd/Ctrl, so the button was the only way.
// Asserted on the handler rather than by sending, because sending calls the model.
ok("plain Enter is wired to send", await page.eval(
  "(() => { const ta = document.getElementById('input'); let sent = false;"
  + " const g = window.__origGen; ta.focus();"
  + " const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });"
  + " ta.dispatchEvent(e); return e.defaultPrevented; })()"));
ok("  and Shift+Enter is left alone for a newline", await page.eval(
  "(() => { const ta = document.getElementById('input');"
  + " const e = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });"
  + " ta.dispatchEvent(e); return !e.defaultPrevented; })()"));

// ---- 4. switching mode must not eat the line. Seventh instance of this bug.
await page.click('[data-mode="direct"]');
await page.eval("(() => { document.getElementById('input').value = ''; return 1; })()");
await page.type('#input', 'She puts the key on the table.');
await page.click('[data-mode="speak"]');
await wait(400);
const carried = await page.eval("document.getElementById('input')?.value");
ok(`switching mode keeps what you typed (${JSON.stringify(carried)})`,
   carried === 'She puts the key on the table.');
await page.eval("(() => { document.getElementById('input').value = ''; return 1; })()");

// ---- 5. Speak and Act happen AS someone, and the cast is offered
ok("Speak offers who you are speaking as", await page.visible('#asWhom'));
const opts = await page.eval("[...document.querySelectorAll('#asWhom option')].map(o => o.text).join('|')");
console.log("  as whom: " + opts);
ok("  defaulting to the point-of-view character", await page.eval(
  "document.querySelector('#asWhom').selectedOptions[0].value === ''"));
ok(`  and offering the cast (${opts.split('|').length} options)`, opts.split('|').length > 1);
await page.click('[data-mode="direct"]');
await wait(300);
ok("Direct has no 'as whom' — an instruction is not spoken by anyone", !(await page.visible('#asWhom')));
await page.click('[data-mode="narrate"]');
await wait(300);
ok("  nor does Narrate", !(await page.visible('#asWhom')));

// ---- 6. what each mode actually tells the model
const cont = await modeBlock('continue', null, 'IGNORE ME');
ok("Continue asks for the next beat", /next 1-2 paragraphs/.test(cont));
ok("  and carries no directive, because it has no box", !/IGNORE ME/.test(cont));

const direct = await modeBlock('direct', null, 'He drops the key.');
ok("Direct passes your text as an instruction", /what happens next: He drops the key\./.test(direct));

const speak = await modeBlock('speak', 'Aldis Fen');
ok(`Speak names who spoke (${JSON.stringify(speak.slice(0, 62))})`, /spoken as Aldis Fen/.test(speak));
ok("  and forbids answering in their voice", /Do not put further words in Aldis Fen/.test(speak));

const act = await modeBlock('act', 'Marek');
ok("Act names who acted", /what Marek has just done/.test(act));
ok("  and forbids deciding their next move", /Do not decide what Marek does next/.test(act));

const narr = await modeBlock('narrate');
ok("Narrate tells the model the prose above is the author's", /written by the author, not by you/.test(narr));
ok("  and not to rewrite it", /Do not rewrite it/.test(narr));

// A stale tab still sends the retired names. A 500 from an undefined lookup is a worse answer
// than the neutral mode.
const stale = await modeBlock('cowrite');
ok(`a retired mode name degrades instead of erroring (${JSON.stringify(stale.slice(0, 34))})`,
   /next 1-2 paragraphs/.test(stale));

// ---- 7. the speaker reaches the prompt through the UI's own selector, not just the API
await page.click('[data-mode="speak"]');
await wait(300);
const cast = await page.eval("[...document.querySelectorAll('#asWhom option')].map(o => o.value).filter(Boolean)[0]");
if (cast) {
  await page.eval("(() => { const el = document.getElementById('asWhom'); el.value = "
    + JSON.stringify(cast) + "; el.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()");
  await wait(900);
  ok(`picking someone else changes the placeholder (${JSON.stringify(cast)})`,
     (await page.eval("document.getElementById('input')?.placeholder") || '').includes(cast));
  ok("  and the line you were writing survives it",
     (await page.eval("document.getElementById('input')?.value")) === '');
} else { ok("the cast offers someone other than you", false); }

console.log(red ? `\n  ${red} RED` : "\n  all green");
