// PLAIN TEXT IN, THE SCHEMA'S OBJECT OUT (Seth, 2026-10-30: "Let's use text during the hem and in the
// background we add it to the db after"). Asked for JSON, the Featherless model ran on inside it until
// the cap cut it, for minutes at a time (the hem's logged times: 115 s for two open questions, about
// 150 s for the thread changes). Asked for plain lines, a model stops when it is done. So for a remote
// model the hem's structured passes ask for lines in the shape their schema describes (`textShape`),
// and the code reads the lines back into the object the JSON would have been (`fromText`). Everything
// after that is the same code the JSON fed. The local model keeps its grammar (llama.ts `structured`).
//
// THE SHAPES IT KNOWS are the ones the hem's schemas use, and no more: an object whose fields are
// strings, enum strings, integers, lists of strings, and lists of objects of strings (a block per
// item, a line per field, `a | b | c` for a nested object). NOT MEASURED against the JSON it replaces.

import { chat, isRemote, structuredRetry } from './llama.ts';

type Schema = { type?: string; properties?: Record<string, any>; required?: string[]; items?: any; enum?: string[] };

const isObjList = (s: Schema) => s?.type === 'array' && s.items?.type === 'object';
const isStrList = (s: Schema) => s?.type === 'array' && s.items?.type !== 'object';
const fieldsOf = (s: Schema) => Object.entries(s.properties ?? {});

/** The shape a schema wants, as lines, for the end of a prompt. */
export function textShape(schema: Schema): string {
  const blocks: string[] = [], lines: string[] = [];
  for (const [k, s] of fieldsOf(schema)) {
    if (isObjList(s)) {
      const body = fieldsOf(s.items).map(([f, fs]) => isObjList(fs)
        ? `${f}: ${fieldsOf(fs.items).map(([g]) => `<${g}>`).join(' | ')}   (one line each; repeat the line for more, or leave it out)`
        : isStrList(fs) ? `${f}: <${f}>; <${f}>   (separated by ;)`
        : `${f}: <${f}${fs.enum ? `: one of ${fs.enum.join(', ')}` : ''}>`);
      blocks.push(`[${k}]\n${body.join('\n')}\n(a [${k}] block for each one; none at all if there are none)`);
    } else if (isStrList(s)) lines.push(`${k}: <${k}>; <${k}>   (separated by ;, or empty)`);
    else lines.push(`${k}: <${k}>`);
  }
  return ['ANSWER IN PLAIN TEXT, NOT JSON, in exactly this shape. Each value on one line. Nothing else.',
    ...blocks, ...lines].join('\n\n');
}

/** A value read off a line, as its field's schema wants it; undefined when it cannot be. */
function valueOf(raw: string, s: Schema): unknown {
  // `""` is how a model writes an empty value it was told to leave empty (ENCORE, 2026-10-31).
  const v = raw.trim().replace(/^(""|'')$/, '');
  if (isObjList(s)) {
    const parts = v.split('|').map((x) => x.trim());
    const fs = fieldsOf(s.items);
    const o = Object.fromEntries(fs.map(([f], i) => [f, parts[i] ?? '']));
    for (const [f, fsch] of fs) if (fsch.enum && !fsch.enum.includes(o[f])) return undefined;
    return o;
  }
  if (isStrList(s)) return v ? v.split(';').map((x) => x.trim()).filter(Boolean) : [];
  if (s?.type === 'integer' || s?.type === 'number') { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
  if (s?.enum && !s.enum.includes(v)) return undefined;
  return v;
}

/** The lines a model gave, read back into the schema's object. Never null: no blocks is an answer of
 *  none. An item missing a required field (cut off at the cap) or holding a value its enum does not
 *  allow is dropped; the whole ones are kept.
 *
 *  ONE HEADER FOR MANY ITEMS reads as many items (ENCORE, 2026-10-31): the Featherless model wrote one
 *  `[threads]` and every thread under it, a blank line between. Read as one block, each name overwrote
 *  the one before, and a hem chalked nothing for the people the scene was about. So a field the item
 *  already has starts the next item of the same block, and a bare `a | b | c` line after a list of
 *  objects is one more of it (the model left `pockets:` off the second pocket). */
export function fromText(text: string, schema: Schema): Record<string, unknown> {
  const fields = fieldsOf(schema);
  const out: Record<string, any> = Object.fromEntries(fields.map(([k, s]) =>
    [k, s.type === 'array' ? [] : '']));
  const key = (name: string, among: [string, any][]) => among.find(([k]) => k.toLowerCase() === name.trim().toLowerCase());
  let cur: { k: string; s: Schema; o: Record<string, any>; bad: boolean } | null = null;
  // A LINE WITH NO FIELD carries on the string field before it: a model wraps a long value.
  let last: { o: Record<string, any>; f: string } | null = null;
  // The list of objects the line before wrote to, for a bare item after it.
  let list: [string, Schema] | null = null;
  const close = () => {
    if (!cur) return;
    const req = cur.s.items.required ?? [];
    for (const [f, fs] of fieldsOf(cur.s.items)) if (cur.o[f] === undefined && !req.includes(f)) cur.o[f] = fs.type === 'array' ? [] : '';
    for (const [f, fs] of fieldsOf(cur.s.items)) if (fs.type === 'array' && cur.o[f] === undefined) cur.o[f] = [];
    if (!cur.bad && req.every((f: string) => cur!.o[f] !== undefined)) out[cur.k].push(cur.o);
    cur = null;
  };
  for (const line of String(text ?? '').replace(/^```\w*$/gm, '').split('\n')) {
    const head = line.match(/^\s*\[([A-Za-z_]+)\]\s*$/);
    if (head) {
      close(); last = null; list = null;
      const f = key(head[1], fields);
      if (f && isObjList(f[1])) cur = { k: f[0], s: f[1], o: {}, bad: false };
      continue;
    }
    const m = line.match(/^\s*([A-Za-z_]+)\s*:(.*)$/);
    const named = m && (cur ? key(m[1], fieldsOf(cur.s.items)) : null) || (m && key(m[1], fields));
    if (!m || !named) {
      if (cur && list && line.includes('|')) {
        const v = valueOf(line, list[1]);
        if (v !== undefined) cur.o[list[0]] = [...(cur.o[list[0]] ?? []), v];
        continue;
      }
      if (last && line.trim()) last.o[last.f] = `${last.o[last.f]} ${line.trim()}`.trim();
      continue;
    }
    last = null; list = null;
    if (cur) {
      const f = key(m[1], fieldsOf(cur.s.items));
      if (f) {
        if (!isObjList(f[1]) && cur.o[f[0]] !== undefined) { const { k, s } = cur; close(); cur = { k, s, o: {}, bad: false }; }
        const v = valueOf(m[2], f[1]);
        if (v === undefined) { if (!isObjList(f[1])) cur.bad = true; continue; }
        if (isObjList(f[1])) { cur.o[f[0]] = [...(cur.o[f[0]] ?? []), v]; list = f; }
        else { cur.o[f[0]] = v; if (typeof v === 'string') last = { o: cur.o, f: f[0] }; }
        continue;
      }
    }
    const top = key(m[1], fields);
    if (top && !isObjList(top[1])) {
      close(); const v = valueOf(m[2], top[1]);
      if (v !== undefined) { out[top[0]] = v; if (typeof v === 'string') last = { o: out, f: top[0] }; }
    }
  }
  close();
  return out;
}


/** THE HEM'S STRUCTURED ASK. Locally, the grammar (`structuredRetry`), as before. On a remote model,
 *  plain lines on `chat` at the caller's cap and no retry, read back by `fromText`: the cap is the
 *  hard stop, and a cut answer keeps the items it finished. Same `{ data, error }` either way. */
export async function shaped(system: string, body: string, schema: any, opts: Record<string, any> = {}) {
  if (!isRemote(opts.model)) return structuredRetry(system, body, schema, opts);
  try {
    const r: any = await chat(`${system}\n\n${textShape(schema)}`, body,
      // `remoteCap`, or the Featherless adapter drops the cap (prose has none there, Seth 2026-10-27).
      { ...opts, temperature: opts.temperature ?? 0.3, remoteCap: true, chat_template_kwargs: { enable_thinking: false } });
    const raw = String(r?.prose ?? '');
    if (!raw.trim()) return { data: null, raw, error: 'nothing came back' };
    return { data: fromText(raw, schema) as any, raw };
  } catch (e: any) {
    return { data: null, raw: '', error: String(e?.message ?? e) };
  }
}
