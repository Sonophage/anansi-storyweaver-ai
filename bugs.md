# Open

Everything closed on 2026-08-24 has been cut from this file. It is in the git history if you want
to read it back: `0a158c2` importer, `11f1eb8` editor modes, `480496d` menus, `68310d5` the five
small ones. `checklist.md` is how you verify them.

What is left is here, in your words where you wrote them.

---

## Start blank needs a screen

> if were starting blank then the user needs a screen to fill in all these things themselves not
> just start a blank story.

Spark works and returns a skeleton. **Start blank** still just creates `Untitled` and drops you in
the editor. It should ask for the same things Spark fills in — title, genre, premise, setting,
point of view, who you are, style, register — before the first passage.

## Preferences: your name, and a writing dashboard

> preferences this should allow the user to change their name see their stats of writing open
> stories characters etc. just a user stat analytics dash may be useful here.

Neither exists. The name is a hard-coded owner in `serve.ts` — there is a `ponytail:` marker on it
saying exactly that. The numbers for a dashboard are all already in the database: passages,
chapters, entries, generations with timings.

## Characters — the design conversation (PLAN-04 §3 onward)

> this might also have a skill to create the character so that we can prompt and it creates
> something. this should also have a reroller mechanic. it would also be beneficial to have a
> costume and a selector for it so that way things like armor can be taken on or off without it
> being an issue when prompting. were also missing internal thoughts of the characters and their
> threads to the main character or others in the scene.

Four separate things, none built:

- **Character by prompt, with a reroller.** Same shape as Spark, aimed at one character.
- **Outfits.** Designed with you as a named table with a partial unique index — one worn at a
  time — rather than a free "right now" line. Not built.
- **Interiority.** Deliberately behind a measurement first: does putting a character's inner
  state in canon leak into the narration.
- **Threads between characters.** Agreed as a text field on the entry, not a new table.

## New scene → New lore

> new scene button should be replaced by new lore button. that will say to scan what we have, or
> create a new character, place item etc.

New scene is gone from the composer (2026-08-24), but nothing replaced it. What you described is a
button that either reads the chapter for facts — which the chapter ritual already does — or opens
a new entry of a chosen type.

## Regenerate should mark the take you rejected

> the regenerate should prompt to try a different entry marking that the one used wasnt good.

Half of this is done: each take now records the canon its own prompt carried, and History shows it.
The other half is not — nothing marks a take as rejected, so nothing can steer the next one away
from it.

## The model selector

> is ther anyway around that? two harneses think how pi and prime agent are two harnesses the same
> idea would start here.
> for the model selector could i as admin turn on and off what models are available for this app?

**Answered, not built.** Two harnesses is real and the blocker is this codebase, not llama.cpp:

- every request already names its model (`model: MODEL` in each `post` in `src/llama.ts`)
- your router spawns a **separate `llama-server` process per preset** — eight presets on disk,
  `write-nt-qwen36-h` loaded
- so `MODEL` being one module-level global is the only reason switching is process-wide

Per-story model is therefore a small change. The real constraint is VRAM: two models loaded at
once means both sets of weights resident, and at 96 GiB two 35B-class models is tight but not
obviously impossible — it wants measuring, not guessing.

The admin allowlist sits on top of that: a list of permitted model ids, filtered in
`GET /api/models`.

---

## Not built on purpose

- **Homepage / login.** One hard-coded owner, no auth. `serve.ts` carries the `ponytail:` marker.
- **A model selector inside the story.** It is in Preferences because the model is process-wide;
  it moves into the story the day per-story models land.

## Settled, no action

- *"create a story works beautifully"*
- *"themes make sure the theme is easy to build upon. but the way it works now is good"* — themes
  are CSS custom properties on `html[data-ui-theme]`; adding one is a block of variables.
- The `Context NN%` reading stays on the top bar. You confirmed you want it.
