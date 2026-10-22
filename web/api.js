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
const jStream = async (u, b, onDelta, signal) => {
  let res;
  try {
    res = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...b, stream: true }), signal });
  } catch (e) {
    // Stopping is not failing. An aborted fetch throws exactly like an unreachable server, and
    // reporting "cannot reach Anansi" to somebody who just pressed Stop is a lie that sends them
    // looking at the router.
    if (e?.name === 'AbortError' || signal?.aborted) return { aborted: true };
    return { error: 'cannot reach Anansi — is the server still running?' };
  }
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
  // The read loop breaks on abort the same way it breaks on a dropped connection, so the flag
  // is what tells them apart — without it Stop reported "the model stopped before it finished",
  // which is true of the model and wrong about who stopped it.
  if (signal?.aborted) return { aborted: true };
  return last ?? { error: 'the model stopped before it finished the passage.' };
};

export const api = {
  library:      ()               => j('/api/stories'),
  createStory:  (s)              => j('/api/stories', 'POST', s),
  // A world book, and a book set in one. The second names the world as `storyId` so the ownership
  // gate in serve.ts checks it before the handler runs.
  setDemo:      (on)             => j('/api/demo', 'POST', { on }),
  /* STOP. The button used to be `STOP?.abort()` on the fetch and nothing else, which meant hanging
   * up WAS the cancel — so a phone that dropped mid-passage killed the generation instead of coming
   * back to it (bugs.md #9). The abort still happens, to stop this page reading; this is what tells
   * the SERVER the writer meant it. */
  stop:         ()               => j('/api/stop', 'POST', {}),
  /* A PICTURE, LOOKED FOR AND THEN FETCHED. Two calls because they are two acts: the search is a
   * phrase and costs nothing, the fetch is one URL and pulls bytes. `image` goes through Anansi
   * because an arbitrary image on the web sends no CORS header, so this browser cannot read it. */
  // `skip` walks further down the same ranking — the next batch of pictures for one query.
  images:       (q, n, skip = 0) => j('/api/images', 'POST', { q, n, skip }),
  image:        (url)            => j('/api/image', 'POST', { url }),
  newWorld:     (title, premise)  => j('/api/world', 'POST', { title, premise }),
  bookFrom:     (storyId, title)  => j('/api/story/from', 'POST', { storyId, title }),
  spark:        (idea)           => j('/api/spark', 'POST', { idea }),
  // #21 §2. The cast, asked for separately and only for the kinds the writer wants. It carries
  // the skeleton AS IT STANDS, so the cast belongs to the book on screen rather than to the
  // sentence it started from — which is also what makes asking twice a re-roll.
  //
  // `steer` is the writer's own line about what this cast should be. `replacing` names the cards
  // that are staying put, which is what turns the same call into a ONE-CARD re-roll: ask for one
  // kind, say who is already taken, splice the answer in.
  sparkCastCall: (kinds, story, steer, replacing) =>
    j('/api/spark/cast', 'POST', { kinds, story, steer, replacing }),
  // The house style before the book exists. Same prompt as `styleNote`, which reads it off a story
  // that has been created; this one is handed the two facts directly.
  sparkStyle:   (genre, premise) => j('/api/spark/style', 'POST', { genre, premise }),
  /* #40. ONE field of the skeleton, asked again — title, genre or premise. Sent the skeleton the
   * writer has KEPT and their own idea, so a re-rolled title belongs to the book on screen rather
   * than to a better one the model would rather have been given. */
  sparkField:   (field, story, idea, entries) =>
    j('/api/spark/field', 'POST', { field, story, idea, entries }),
  // The forge: prompts to hand a different model. Admin only — the route refuses anyone else, so a
  // caller that gets `error` back is not a failure, it is the answer.
  forge:        ()               => j('/api/forge'),
  // And the way back in. One card or a list; rooms travel with it.
  pasteThread:  (storyId, text)  => j('/api/thread/paste', 'POST', { storyId, text }),
  // A card pulled off the web, in the subject's own canon rather than the book's. See the route.
  fromWeb:      (storyId, subject, kind) => j('/api/fromweb', 'POST', { storyId, subject, kind }),
  // What is IN a world, as names to tick. `world` is the hatch: empty means the book's own.
  worldCast:    (storyId, world, n) => j('/api/world/cast', 'POST', { storyId, world, n }),
  // #21 §3 step 5. Reads the whole skeleton back and says what it would change. Proposes
  // only — there is no story yet for it to write to.
  sparkReview:  (story, entries) => j('/api/spark/review', 'POST', { story, entries }),
  // `into` sends the book's threads to another of yours before it goes. The prose is the book and
  // goes with it; a cast and a city are work that outlives the story they were written for.
  deleteStory:  (id, into)       => j('/api/stories', 'DELETE', { id, ...(into ? { into } : {}) }),
  // Copy this book's threads into another, or into a new one — `into` of 'new' mints it. A COPY,
  // not a link: for a shared world a book follows another's ledger instead.
  copyThreads:  (storyId, into) => j('/api/threads/copy', 'POST', { storyId, into }),
  // The same book twice. `copyThreads` above takes the cast and leaves the prose; this takes both,
  // and the two books share nothing afterwards. A branch cannot do it — the branches of one book
  // read one ledger, so a thread changed on either is changed on both.
  duplicateStory: (storyId, title) => j('/api/story/duplicate', 'POST', { storyId, title }),
  story:        (id, chapter)    => j(`/api/story?story=${id}${chapter ? `&chapter=${chapter}` : ''}`),
  saveStory:    (id, story)      => j('/api/story', 'POST', { id, story }),
  saveChapter:  (storyId, chapterId, chapter) => j('/api/chapter', 'POST', { storyId, chapterId, chapter }),
  endChapter:   (storyId, o)     => j('/api/chapter/end', 'POST', { storyId, ...o }),
  // What the chapter about to be written should be called and what it has to do. Proposes only —
  // the setup panel fills its two fields with this and nothing is saved until you press Save.
  proposeChapter: (storyId, chapterId, steer) => j('/api/chapter/propose', 'POST', { storyId, chapterId, steer }),
  write:        (storyId, o)     => j('/api/write', 'POST', { storyId, ...o }),
  accept:       (storyId, o)     => j('/api/accept', 'POST', { storyId, ...o }),
  editPassage:  (storyId, id, body) => j('/api/passage', 'POST', { storyId, id, body }),
  // allTakes deletes the whole slot rather than the take on screen. Two intents, one route.
  // Everything below one passage, and a whole chapter. Both take storyId, which is what the
  // ownership gate in serve.ts reads.
  delAfter:     (storyId, id) => j('/api/after', 'DELETE', { storyId, id }),
  // Delete-after's first press: the summaries of yours the delete would clear (#46).
  afterYours:   (storyId, id) => j(`/api/after?story=${encodeURIComponent(storyId)}&id=${encodeURIComponent(id)}`),
  delChapter:   (storyId, id) => j('/api/chapter', 'DELETE', { storyId, id }),
  delPassage:   (storyId, id, allTakes) => j('/api/passage', 'DELETE',
                                             { storyId, id, ...(allTakes ? { allTakes: true } : {}) }),
  pickVariant:  (storyId, id)    => j('/api/variant', 'POST', { storyId, id }),
  fork:         (storyId, passageId, name) => j('/api/fork', 'POST', { storyId, passageId, name }),
  switchBranch: (storyId, id)    => j('/api/branch', 'POST', { storyId, id }),
  delBranch:    (storyId, id)    => j('/api/branch', 'DELETE', { storyId, id }),
  saveEntry:    (storyId, entry) => j('/api/entry', 'POST', { storyId, entry }),
  delEntry:     (storyId, id)    => j('/api/entry', 'DELETE', { storyId, id }),
  // `storyId` is the book the entry lives in, which is what the ownership gate reads; `into` is
  // where it is going and the route checks that one itself. Both have to be the caller's.
  copyEntry:    (storyId, into, entryId) => j('/api/entry/copy', 'POST', { storyId, into, entryId }),
  manifest:     (o)              => j('/api/manifest', 'POST', o),
  // The blocking form is gone from the client — every composer path streams now. The ROUTE still
  // answers without `stream`, and four bench harnesses depend on that; this is the browser's only
  // way in, and the browser always watches.
  generateLive: (o, onDelta, signal) => jStream('/api/generate', o, onDelta, signal),
  // `replace` is the second press over a summary that is yours (#46); without it the route refuses.
  summarize:    (storyId, chapterId, replace = false) => j('/api/summarize', 'POST', { storyId, chapterId, replace }),
  // A summary written by hand; an empty one removes it (#43).
  saveSummary:  (storyId, chapterId, summary) => j('/api/summary', 'POST', { storyId, chapterId, summary }),
  search:       (q, story)       => j(`/api/search?q=${encodeURIComponent(q)}`
    + (story ? `&story=${encodeURIComponent(story)}` : '')),
  activity:     (storyId)        => j(`/api/activity?story=${storyId}`),
  rollup:       (storyId, from, to) => j('/api/rollup', 'POST', { storyId, from, to }),
  delArc:       (storyId, id)    => j('/api/arc', 'DELETE', { storyId, id }),
  saveArc:      (storyId, id, title, summary) => j('/api/arc', 'POST', { storyId, id, title, summary }),
  settings:     (storyId, gen)   => j('/api/settings', 'POST', { storyId, ...gen }),
  // With a storyId it is that book's look; without one it is your default for every book.
  // `look: null` and a storyId puts the book back to following you.
  saveLook:     (o)              => j('/api/look', 'POST', o),
  // Calling somebody into a book, or taking them out. A LOGIN, never an account id.
  shareStory:   (storyId, login, remove) => j('/api/writers', 'POST', { storyId, login, remove }),
  history:      (q)              => j(`/api/history?${new URLSearchParams(q)}`),
  revertField:  (o)              => j('/api/revert', 'POST', o),
  revert:       (o)              => j('/api/revert', 'POST', o),
  backup:       (storyId)        => j('/api/backup', 'POST', { storyId }),
  extract:      (storyId, chapterId) => j('/api/extract', 'POST', { storyId, chapterId }),
  // #27. Names a THREAD, never a chapter: there is no shape of this call that asks for a
  // general story-wide sweep, which is the option the issue deliberately did not want.
  scanStory:    (storyId, entryId)  => j('/api/scanstory', 'POST', { storyId, entryId }),
  // #18 §2. Proposes the book's house style from its genre and premise; the writer saves it.
  styleNote:    (storyId)          => j('/api/style', 'POST', { storyId }),
  // Re-runs the character memory on a chapter that already closed. Chapter close fires this
  // itself; this is the way back when the router was down at the time.
  remember:     (storyId, chapterId) => j('/api/remember', 'POST', { storyId, chapterId }),
  // "Remember this." A passage the writer points at, turned into a thread and put in the queue,
  // carrying the chapter it came from. Proposes; nothing becomes canon unaccepted.
  memo:         (storyId, passageId, entryType) => j('/api/memo', 'POST', { storyId, passageId, entryType }),
  // Waved away, for this state of it. Edit the chapter or write past the horizon and it returns.
  dismiss:      (storyId, kind, ref) => j('/api/dismiss', 'POST', { storyId, kind, ref }),
  invent:       (storyId, o)     => j('/api/invent', 'POST', { storyId, ...o }),
  saveString:   (storyId, x)     => j('/api/string', 'POST', { storyId, string: x }),
  delString:    (storyId, id)    => j('/api/string', 'DELETE', { storyId, id }),
  prompts:      ()               => j('/api/prompts'),
  savePrompt:   (key, text)      => j('/api/prompts', 'POST', { key, text }),
  dismissFlag:  (storyId, id)    => j('/api/violation', 'POST', { storyId, id, status: 'dismissed' }),
  // Quiet one canon entry for one chapter, or lift it. Dismiss clears a flag; this stops the
  // stream of them a drifting entry produces while the chapter is still moving.
  mute: (storyId, chapterId, entryId, off) => j('/api/mute', 'POST', { storyId, chapterId, entryId, off }),
  // Issue #9: correct one passage against canon, on demand. A model call, so it is slow.
  repair:       (o)              => j('/api/repair', 'POST', o),
  // #36. A followed card, per card: take it over, hand it back, or take it out of this book.
  takeover:     (o)              => j('/api/entry/unlink', 'POST', o),
  relink:       (o)              => j('/api/entry/relink', 'POST', o),
  dropfollowed: (o)              => j('/api/entry/drop', 'POST', o),
  decide:       (o)              => j('/api/proposal', 'POST', o),
  // Move a proposal before deciding it: which room, and the words that wake the card.
  moveprop:     (o)              => j('/api/proposal/where', 'POST', o),
  // PLAN-08. entryId null is a story-level addon, which is where a string will live.
  saveAddon:    (storyId, entryId, addon) => j('/api/addon', 'POST', { storyId, entryId, addon }),
  addonOn:      (storyId, id, on) => j('/api/addon/on', 'POST', { storyId, id, on }),
  delAddon:     (storyId, id)    => j('/api/addon', 'DELETE', { storyId, id }),
  // PLAN-08 Phase 4. A thread can be finished, and brought back: atChapter null lifts it. Its own
  // route rather than a field on saveEntry, because upsertEntry writes last_editor and that is
  // what arbitration keys on — bringing a character back is not editing their card.
  retire:       (storyId, id, atChapter) => j('/api/retire', 'POST', { storyId, id, atChapter }),
  // PLAN-08. Directed: parent pulls child, never the reverse, so both ends are named.
  link:         (storyId, parentId, childId, confidence) => j('/api/link', 'POST',
                                             { storyId, parentId, childId, confidence }),
  unlink:       (storyId, id)    => j('/api/link', 'DELETE', { storyId, id }),
  // Re-run the finished scan when the router was asleep at chapter end.
  finished:     (storyId, chapterId) => j('/api/finished', 'POST', { storyId, chapterId }),
  saveState:    (storyId, entryId, state) => j('/api/state', 'POST', { storyId, entryId, state }),
  delState:     (storyId, id)    => j('/api/state', 'DELETE', { storyId, id }),
  setPin:       (storyId, chapterId, entryId, mode) => j('/api/pin', 'POST', { storyId, chapterId, entryId, mode }),
  exportStoryDb: (storyId)      => j('/api/export', 'POST', { storyId }),
  ledger:       ()               => j('/api/ledger'),
  // What changed, in the writer's words. Written by Anansi from the commit log and cached on the
  // commit it was written from, so it updates itself on every commit. `refresh` writes it again.
  // #24. No refresh: docs/WHATS-NEW.md is the answer, so there is nothing to regenerate.
  whatsnew:     ()                => j('/api/whatsnew'),
  models:       ()               => j('/api/models'),
  stats:        ()               => j('/api/stats'),
  talk:         (storyId, o)     => j('/api/talk', 'POST', { storyId, ...o }),
  bug:          (o)              => j('/api/bug', 'POST', o),
  setModel:     (model, storyId) => j('/api/model', 'POST', { model, storyId }),
  // The writer's own remote models. `model` is the prefixed id, as stored everywhere else.
  shortlist:    ()               => j('/api/shortlist'),
  addShortlist: (model)          => j('/api/shortlist', 'POST', { model }),
  dropShortlist: (model)         => j('/api/shortlist/remove', 'POST', { model }),
  // The Featherless catalogue, searched by the server. `q` takes q, size, weaving and uncensored.
  catalogue:    (q)              => j(`/api/catalogue?${new URLSearchParams(q)}`),
  // What a catalogue model is, from Hugging Face through the server: the tags of a page of rows
  // in one call, and one model's base model and card paragraph when a row is expanded.
  catalogueTags: (models)        => j('/api/catalogue/tags', 'POST', { models }),
  catalogueCard: (model)         => j(`/api/catalogue/card?${new URLSearchParams({ model })}`),
  importPreview: (name, data)     => j('/api/import/preview', 'POST', { name, data }),
  runImport:    (name, data, into) => j('/api/import', 'POST', { name, data, into: into || undefined }),
  setCover:     (storyId, dataUrl) => j('/api/cover', 'POST', { storyId, dataUrl }),
  delCover:     (storyId)        => j('/api/cover', 'DELETE', { storyId }),
  // `v` is the set_at the shelf was told about, and the route answers immutable for it, so a
  // cover is fetched once per change rather than once per paint.
  coverUrl:     (id, v)          => `/api/cover?story=${id}&v=${v}`,
  /* A PICTURE ON A THREAD. Mirrors the cover's three exactly: a JPEG data URL in, a version-keyed
   * URL out, and a delete. The `v` is the set_at, so the URL names one version and can be cached
   * for a year — the route says so in its own headers. */
  setEntryImage: (storyId, id, dataUrl) => j('/api/entry/image', 'POST', { storyId, id, dataUrl }),
  delEntryImage: (storyId, id)         => j('/api/entry/image', 'DELETE', { storyId, id }),
  entryImageUrl: (storyId, id, v)      => `/api/entry/image?story=${storyId}&entry=${id}&v=${v}`,
  exportUrl:    (id, format)     => `/api/export?story=${id}&format=${format}`,
};
