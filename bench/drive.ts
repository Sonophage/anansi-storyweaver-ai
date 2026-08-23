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
  /** Click by CSS selector, through a real mouse event at the element's centre — a
   *  dispatched click() would skip the capture-phase and delegation this app relies on. */
  async click(sel: string) {
    // Scroll it in first. Panels scroll, so a button below the fold reported a y outside the
    // viewport and the click landed on whatever happened to be there — or on nothing.
    const box = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return null;
      e.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return { hidden: true };
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!box) throw new Error(`click: no element for ${sel}`);
    if (box.hidden) throw new Error(`click: ${sel} has no box — hidden, or waiting on :hover`);
    await wait(120);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    }
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
