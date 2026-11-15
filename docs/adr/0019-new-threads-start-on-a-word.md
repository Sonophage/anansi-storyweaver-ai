# New threads start On a word, and each thread has a pronoun

Seth decided this on 2026-11-05.

## The decision

- **Every thread is On a word by default**, and the tales that existed then were flipped too. The
  writer turns on what she wants. The floor is in `upsertEntry`.
- Exceptions: the tale's own threads; the played character and Hands off (`staysOn`); a copy,
  import or paste keeps its settings (`keepOn`).
- Talk wakes an On a word thread that its question names.
- **Each thread has a pronoun**: he, she, they, or not set (`entries.pronoun`). `guessPronoun`
  fills it once. The writer sets it with the kind chips in Read.
- Keep the pocket in the twice rule (`notTwice`).

## What it costs

- The live flip changed 403 threads. `mention_flips` keeps the old settings, and
  `bench/mention-flip.ts undo <tale>` puts one tale back.
