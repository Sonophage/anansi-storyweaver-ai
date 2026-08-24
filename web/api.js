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
  summarize:    (storyId, chapterId) => j('/api/summarize', 'POST', { storyId, chapterId }),
  search:       (q)              => j(`/api/search?q=${encodeURIComponent(q)}`),
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
  saveState:    (storyId, entryId, state) => j('/api/state', 'POST', { storyId, entryId, state }),
  delState:     (storyId, id)    => j('/api/state', 'DELETE', { storyId, id }),
  setPin:       (storyId, chapterId, entryId, mode) => j('/api/pin', 'POST', { storyId, chapterId, entryId, mode }),
  exportStoryDb: (storyId)      => j('/api/export', 'POST', { storyId }),
  ledger:       ()               => j('/api/ledger'),
  models:       ()               => j('/api/models'),
  setModel:     (model)          => j('/api/model', 'POST', { model }),
  importPreview: (name, data)     => j('/api/import/preview', 'POST', { name, data }),
  runImport:    (name, data, into) => j('/api/import', 'POST', { name, data, into: into || undefined }),
  exportUrl:    (id, format)     => `/api/export?story=${id}&format=${format}`,
};
