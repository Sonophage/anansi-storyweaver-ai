// The only place the client talks to the server. Both surfaces use it.
// Never rejects. A thrown fetch used to leave `busy = true` and the send button disabled
// for the life of the page — the one state a laptop-hosted app enters daily was the one
// state with no handling. Callers already check `.error`, so failures arrive as data.
const j = async (u, m = 'GET', b) => {
  try {
    const r = await fetch(u, m === 'GET' ? {} : {
      method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b ?? {}) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      // A route this server has never heard of, as distinct from a story it will not show you:
      // serve.ts answers the first with exactly 'not found' and the second with 'no such story'.
      // This is what a stale server looks like from the browser — the page was reloaded, the
      // process was not — and "not found" sent someone hunting for a bug in code that was
      // simply not running. Say which of the two it is.
      if (r.status === 404 && data.error === 'not found')
        return { error: `this Anansi server has no ${m} ${u.split('?')[0]} — it is running older `
          + 'code than this page. Restart it and reload.' };
      return { ...data, error: data.error ?? `the server said ${r.status}` };
    }
    return data;
  } catch {
    return { error: 'cannot reach Anansi — is the server still running?' };
  }
};

/** The same POST, read a line at a time. `onDelta` gets each fragment of prose as it is written;
 *  the resolved value is the final line, which is exactly what the non-streaming route returns —
 *  so a caller checks `.error` and reads `.prose` as it always did.
 *
 *  Never rejects, for the same reason `j` does not: a stream that dies mid-passage must not leave
 *  `busy = true` and the composer disabled. */
const jStream = async (u, b, onDelta) => {
  let res;
  try {
    res = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...b, stream: true }) });
  } catch { return { error: 'cannot reach Anansi — is the server still running?' }; }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 404 && data.error === 'not found')
      return { error: `this Anansi server has no POST ${u} — it is running older code than this `
        + 'page. Restart it and reload.' };
    return { ...data, error: data.error ?? `the server said ${res.status}` };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', last = null;
  for (;;) {
    let chunk;
    try { chunk = await reader.read(); } catch { break; }
    if (chunk.done) break;
    buf += dec.decode(chunk.value, { stream: true });
    let nl;
    // Whole lines only. A JSON object split across two reads is not parseable until the rest
    // of it arrives, and a passage is long enough for that to happen more than once.
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      if (o.d != null) onDelta(o.d); else last = o;
    }
  }
  return last ?? { error: 'the model stopped before it finished the passage.' };
};

export const api = {
  library:      ()               => j('/api/stories'),
  createStory:  (s)              => j('/api/stories', 'POST', s),
  spark:        (idea)           => j('/api/spark', 'POST', { idea }),
  deleteStory:  (id)             => j('/api/stories', 'DELETE', { id }),
  story:        (id, chapter)    => j(`/api/story?story=${id}${chapter ? `&chapter=${chapter}` : ''}`),
  saveStory:    (id, story)      => j('/api/story', 'POST', { id, story }),
  saveChapter:  (storyId, chapterId, chapter) => j('/api/chapter', 'POST', { storyId, chapterId, chapter }),
  endChapter:   (storyId, o)     => j('/api/chapter/end', 'POST', { storyId, ...o }),
  write:        (storyId, o)     => j('/api/write', 'POST', { storyId, ...o }),
  accept:       (storyId, o)     => j('/api/accept', 'POST', { storyId, ...o }),
  editPassage:  (storyId, id, body) => j('/api/passage', 'POST', { storyId, id, body }),
  delPassage:   (storyId, id)    => j('/api/passage', 'DELETE', { storyId, id }),
  pickVariant:  (storyId, id)    => j('/api/variant', 'POST', { storyId, id }),
  fork:         (storyId, passageId, name) => j('/api/fork', 'POST', { storyId, passageId, name }),
  switchBranch: (storyId, id)    => j('/api/branch', 'POST', { storyId, id }),
  delBranch:    (storyId, id)    => j('/api/branch', 'DELETE', { storyId, id }),
  saveEntry:    (storyId, entry) => j('/api/entry', 'POST', { storyId, entry }),
  delEntry:     (storyId, id)    => j('/api/entry', 'DELETE', { storyId, id }),
  manifest:     (o)              => j('/api/manifest', 'POST', o),
  generate:     (o)              => j('/api/generate', 'POST', o),
  generateLive: (o, onDelta)     => jStream('/api/generate', o, onDelta),
  summarize:    (storyId, chapterId) => j('/api/summarize', 'POST', { storyId, chapterId }),
  search:       (q, story)       => j(`/api/search?q=${encodeURIComponent(q)}`
    + (story ? `&story=${encodeURIComponent(story)}` : '')),
  activity:     (storyId)        => j(`/api/activity?story=${storyId}`),
  rollup:       (storyId, from, to) => j('/api/rollup', 'POST', { storyId, from, to }),
  delArc:       (storyId, id)    => j('/api/arc', 'DELETE', { storyId, id }),
  settings:     (storyId, gen)   => j('/api/settings', 'POST', { storyId, ...gen }),
  history:      (q)              => j(`/api/history?${new URLSearchParams(q)}`),
  revertField:  (o)              => j('/api/revert', 'POST', o),
  revert:       (o)              => j('/api/revert', 'POST', o),
  backup:       (storyId)        => j('/api/backup', 'POST', { storyId }),
  extract:      (storyId, chapterId) => j('/api/extract', 'POST', { storyId, chapterId }),
  dismissFlag:  (storyId, id)    => j('/api/violation', 'POST', { storyId, id, status: 'dismissed' }),
  decide:       (o)              => j('/api/proposal', 'POST', o),
  saveOutfit:   (storyId, entryId, outfit) => j('/api/outfit', 'POST', { storyId, entryId, outfit }),
  delOutfit:    (storyId, id)    => j('/api/outfit', 'DELETE', { storyId, id }),
  wear:         (storyId, entryId, outfitId) => j('/api/wear', 'POST', { storyId, entryId, outfitId }),
  saveState:    (storyId, entryId, state) => j('/api/state', 'POST', { storyId, entryId, state }),
  delState:     (storyId, id)    => j('/api/state', 'DELETE', { storyId, id }),
  setPin:       (storyId, chapterId, entryId, mode) => j('/api/pin', 'POST', { storyId, chapterId, entryId, mode }),
  exportStoryDb: (storyId)      => j('/api/export', 'POST', { storyId }),
  ledger:       ()               => j('/api/ledger'),
  models:       ()               => j('/api/models'),
  stats:        ()               => j('/api/stats'),
  talk:         (storyId, o)     => j('/api/talk', 'POST', { storyId, ...o }),
  setModel:     (model, storyId) => j('/api/model', 'POST', { model, storyId }),
  router:       (action, storyId) => j('/api/router', 'POST', { action, storyId }),
  importPreview: (name, data)     => j('/api/import/preview', 'POST', { name, data }),
  runImport:    (name, data, into) => j('/api/import', 'POST', { name, data, into: into || undefined }),
  exportUrl:    (id, format)     => `/api/export?story=${id}&format=${format}`,
};
