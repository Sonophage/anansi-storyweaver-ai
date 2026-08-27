# Anansi — working notes for Claude

Local-first long-form fiction app. Zero dependencies, no build step, no cloud. Node 26+ native
TypeScript stripping and `node:sqlite`. There is no `package.json`; do not add one, and do not
add a dependency without asking.

## Before you change anything

```bash
node --experimental-strip-types test/all.ts     # 192 checks across eleven suites, no model needed
```

Run it before and after. It needs no llama-server, so there is no excuse for skipping it.

## Where the truth lives

**Docs drift from the code. The code wins.** When they disagree, read the code and fix the doc.

1. `docs/findings/P0-FINDINGS.md` — measured numbers. These override `docs/SPEC.md` and the plans
   wherever they conflict, and several already do.
2. `docs/findings/BUILD-STATE.md` — done / half-built / not started, audited against source.
3. `grep -rn "ponytail:" src web bench *.ts *.html` — the debt ledger. Thirteen markers. Each names what
   is missing, why it was left, and the upgrade path.

## Conventions that are not negotiable

- **Blocks are named, never numbered.** Three incompatible numberings once existed across two docs.
  `src/blocks.ts` holds one order and it has no integers.
- **`buildContext` is pure.** No I/O below the line marked in `src/story.ts`. Flags reach it through
  `Input`, never through `process.env`.
- **`render.ts` is the only place block order becomes text.** Do not order blocks anywhere else.
- **Every route is gated.** `serve.ts` fails closed on ownership; `test/scope.ts` proves it with two
  owners. An audit once found zero ownership checks on 27 routes — that is what the gate is for.
- **A deliberate shortcut gets a `ponytail:` comment** naming its ceiling. Adding debt means writing
  down the ceiling.

## Hard-won rules about measurement

This project's findings are its most valuable asset. Five rules, each bought with a wrong answer:

- **Validate the detector before believing the result.** A check that never fires reports
  perfection. F17's probes ship with 22 synthetic cases asserting both that bad input flags and
  that good input does not.
- **Report the informative denominator, not the total.** F10 could not decide anything because most
  of its trials never mentioned the thing under test. Always say how many runs *could* have failed.
- **Falsify the test, not just the code.** Twice on 2026-08-24 a change shipped green because the
  assertion could not see it: a tag-splitting fix whose fixture had no comma in it, and a
  canon-per-take chain whose check asked "does any take carry canon" when only the second take was
  broken. Both were true before the change and true after. Break the code on purpose and watch the
  specific assertion go red, or it is decorative.
- **A guarded assertion can stop running and still report green.** `if (thing) { ...checks... }`
  with no `else` is invisible to a count-based harness. On 2026-08-24 four blocks were found inert
  this way — `ritual.js` had two that never ran because the setup page offered no entry its
  selector could match, and the comment above them explained exactly why without anyone reading it
  as "so this does not run". Assert the guard itself, or put a failing `else` on it.
- **A zero is not an absence.** F12 declared a defect gone on zero-in-sixty. Zero in sixty bounds
  the rate under ~5%; the true rate was 4%. Say "under X%", never "fixed".

Nothing sets a seed, so no generation run is reproducible. Only A/B arms run *simultaneously* are
controlled — `bench/ab.ts` does that, two servers against one router.

## Checks run against narration only

Dialogue may lie; characters may be wrong. Only the narrator commits the story. Every quality
check strips quoted spans first. Ignoring this produced a long run of false positives — a place
name, another character's name, a line of dialogue read as a POV break.

## The model

`write-nt-qwen36-h` on `:8080`, 50,048 tokens per slot (two slots, `kv_unified`). It is a reasoning
model: **`chat_template_kwargs: {enable_thinking: false}` is mandatory** for prose. With thinking on
it returned no prose at all on three runs of four.

Two concurrent writers at full budget fit with a ~5,700-token margin. Oversubscribing the shared
cache does not queue — both requests die with HTTP 500. Do not raise the per-slot budget.
