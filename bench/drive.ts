// A browser I can actually click in. Headless chromium over the DevTools protocol, no
// dependencies — Node has a global WebSocket. This exists because a screenshot found seven
// defects a syntax check could not, and Seth then found an eighth that a screenshot could not:
// "all text boxes trigger the menu meaning nothing is editable". Reading a page is not using it.
//
//   node --experimental-strip-types bench/drive.ts <url> <script.js>
//
// The script runs with `page` in scope: goto, click, type, eval, key, shot, text.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9222 + Math.floor((Date.now() / 1000) % 500);
const profile = mkdtempSync(join(tmpdir(), 'anansi-cdp-'));
const chrome = spawn('chromium', ['--headless=new', '--disable-gpu', '--no-sandbox',
  '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((x) => x.json()) as any[];
      const page = r.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await wait(250);
  }
  throw new Error('chromium never opened a debuggable page');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let seq = 0;
const pending = new Map<number, (v: any) => void>();
ws.addEventListener('message', (m: any) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)!(d); pending.delete(d.id); }
});
/** Set by page.mobile(). Once on, page.click and page.type send touch rather than mouse. */
let touch = false;

function send(method: string, params: any = {}) {
  const id = ++seq;
  return new Promise<any>((res, rej) => {
    pending.set(id, (d) => (d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');

const page = {
  async goto(url: string) {
    // A hash-only change does not reload, which is exactly the case a deep link has to survive.
    // Navigate, then reload, so goto always lands on a freshly booted page.
    await send('Page.navigate', { url });
    await wait(150);
    await send('Page.reload', { ignoreCache: false });
    await wait(1200);
    // The app boots from fetches, so wait for it to have painted something.
    for (let i = 0; i < 40; i++) {
      const r = await page.eval(`document.getElementById('rail').innerHTML.length > 200`);
      if (r === true) break;
      await wait(150);
    }
    await wait(250);
  },
  async eval(expr: string) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.text} — ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  },
  /** Where to press, in viewport coordinates. Shared by click and dbl so the two cannot drift on
   *  the scroll-then-measure order below, which has already cost two scenarios once. */
  async box(sel: string) {
    // Scroll it in first. Panels scroll, so a button below the fold reported a y outside the
    // viewport and the click landed on whatever happened to be there — or on nothing.
    // SCROLL, WAIT, THEN MEASURE. #read sets scroll-behavior:smooth, so scrollIntoView starts an
    // animation and a rect read on the next line is the position the element is LEAVING. This
    // measured and scrolled in one breath and then clicked 120ms later at coordinates the element
    // had since moved away from — silently, as a click on whatever was now there. It only started
    // failing when the chapter band made the document long enough to actually scroll, and it cost
    // two scenarios that had nothing to do with the change.
    const found = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return null;
      e.scrollIntoView({ block: 'center', inline: 'nearest' });
      return true; })()`);
    if (!found) throw new Error(`press: no element for ${sel}`);
    await wait(220);
    const box = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return null;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return { hidden: true };
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!box) throw new Error(`press: element for ${sel} went away while scrolling to it`);
    if (box.hidden) throw new Error(`press: ${sel} has no box — hidden, or waiting on :hover`);
    if (box.x < 0 || box.y < 0) throw new Error(
      `press: ${sel} sits at ${Math.round(box.x)},${Math.round(box.y)} — off-canvas. `
      + 'A drawer that is closed still has its contents in the DOM, so scope the selector.');
    return box as { x: number; y: number };
  },
  /** Click by CSS selector, through a real mouse event at the element's centre — a
   *  dispatched click() would skip the capture-phase and delegation this app relies on. */
  async click(sel: string) {
    const box = await page.box(sel);
    if (touch) {
      // A finger: touchStart then touchEnd at one point. The browser synthesises the click.
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
      }
    }
    await wait(220);
  },
  /** A double click, and on a touch surface a double tap.
   *
   *  Two press/release pairs with NOTHING between them: the browser decides a double press by the
   *  gap between them, and calling page.click twice cannot do it — that settles 220ms after each
   *  press, which is past the threshold. The mouse case says clickCount 2 outright, because for a
   *  dispatched mouse event the count is ours to state rather than the browser's to work out. */
  async dbl(sel: string) {
    const box = await page.box(sel);
    if (touch) {
      for (const _ of [1, 2]) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
    } else {
      for (const clickCount of [1, 2]) {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount });
        }
      }
    }
    await wait(260);
  },
  /** Become a phone: a phone-sized viewport AND a touch screen with no mouse.
   *
   *  Both halves matter and the second is the one that was missing. Every mobile bug reported so far
   *  has been unreproducible here because the driver only ever had a mouse, so `@media (hover:hover)`
   *  rules applied, `matchMedia('(hover:none)')` was false, and a tap was a click with a hover
   *  before it. setTouchEmulationEnabled makes the browser report a touch screen and no hover;
   *  setEmitTouchEventsForMouse turns the dispatched mouse events into real touch events, so
   *  page.click and page.type keep working and start behaving like fingers.
   *
   *  Call it before the first assertion in a scenario. There is no way back inside one run — reload
   *  in a fresh scenario for the desktop case.
   *
   *  NOT setEmitTouchEventsForMouse: with that on, Input.dispatchMouseEvent never returns and every
   *  page.click in the scenario hangs until the run is killed. Measured, twice, on a button that
   *  opens nothing. Real touch events instead — page.click switches to them once this is on, so
   *  scenarios do not need to know. */
  async mobile(width = 390, height = 844) {
    await send('Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 3, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    touch = true;
    await wait(200);
  },
  /** A tap that moves `drift` pixels between touchStart and touchEnd. For finding the point where
   *  the browser stops calling it a tap and starts calling it a scroll — which is what a large card
   *  on a scrolling shelf is vulnerable to on a real finger. */
  async touchDrift(x: number, y: number, drift: number) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    if (drift) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + drift }] });
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(220);
  },
  /** A real mouse move, so CSS :hover applies. A dispatched mouseover event does not. */
  async hover(sel: string) {
    const box = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + Math.min(12, r.height / 2) }; })()`);
    if (!box) throw new Error(`hover: no element for ${sel}`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await wait(180);
  },
  /** In the DOM AND on screen. A querySelector check passes for display:none, which let a
   *  "the stepper appears" assertion go green while the tray it lives in was shut. */
  visible(sel: string) {
    return page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return false; const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0; })()`);
  },
  async type(sel: string, text: string) {
    await page.click(sel);
    for (const ch of text) await send('Input.dispatchKeyEvent', { type: 'char', text: ch });
    await wait(120);
  },
  async key(key: string, code: number, mods = 0) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: code, modifiers: mods });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code, modifiers: mods });
    await wait(200);
  },
  // Hand a real file to a real <input type="file">. The alternative is calling the API from
  // page.eval, which tests the route and leaves the picker — the part that was never wired —
  // untested. `hidden` inputs work: setFileInputFiles goes through the DOM, not the mouse.
  async file(sel: string, paths: string[]) {
    const { root } = await send('DOM.getDocument', { depth: 1 });
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
    if (!nodeId) throw new Error(`no file input at ${sel}`);
    await send('DOM.setFileInputFiles', { nodeId, files: paths });
    await wait(300);
  },
  async shot(path: string, size?: [number, number]) {
    if (size) await send('Emulation.setDeviceMetricsOverride',
      { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: size[0] < 720 });
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path, Buffer.from(r.data, 'base64'));
    return path;
  },
  text: (sel: string) => page.eval(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`),
};

const [url, script] = process.argv.slice(2);
try {
  await page.goto(url);
  const run = new Function('page', 'wait', `return (async () => { ${await import('node:fs').then((f) => f.readFileSync(script, 'utf8'))} })()`);
  await run(page, wait);
} finally {
  ws.close(); chrome.kill();
}
