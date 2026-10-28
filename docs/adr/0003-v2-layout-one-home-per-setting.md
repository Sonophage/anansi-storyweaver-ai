# The v2 layout: one home per setting, one drawer, one place to act

Seth decided this on 2026-10-24, in a grill after an outside review of every screen. The words are
GLOSSARY.md's (tale, scene, panel, Workbench, basted, and so on).

The app grew one feature at a time, and each feature brought its own surface. By October 2026 the
model was chosen in four places, a tale's voice was set in three, basted things could be decided
in four, scenes were listed in three, and one drawer (the Storyteller) held settings for the
writer and settings for the tale under a heading that said they were shared. On a tablet or a
phone nothing visibly opened the menu, and drawers covered the composer.

## The decision

**Every setting has one home, at its own scope**: the writer (every tale), the tale, or the scene.
A tale shows what it inherits from the writer, with "Change for this tale". The Storyteller is
split: its writer half goes to a Your settings page; its tale half (this tale's model, spinning)
goes to the tale's settings. The composer's Hands off switch is a shortcut to the tale setting,
not a second one.

**The rack** is five pages, each with a web address and a visible menu on every screen size:
Rack (Tales, Bolts, All threads), Cut a new tale (Spark, Blank, Import, Pattern book), What you
have written, Anansi (What changed, Report an issue), Your settings, and an Admin page only the
admin sees. Machine details (snapshots, the slot, the local model's state, catalogue limits) are
shown nowhere else.

**A tale** is a header (the Anansi wordmark back to the rack, the tale and scene, prose search,
labelled Read, Look and Tale settings), a scene list on the left (grouped by panels; each scene
opens to its summary), the scene in the centre (title, Opens with and Heads toward at its top,
Hem this scene at its end, the composer below), and ONE drawer on the right with tabs: Workbench,
Threads, Strings, Talk, Measurements. Tale settings is a page with tabs The tale, Voice,
Characters, Model, Keep.

**The Workbench is the only place to act** on basted things and knots: decisions first, upkeep
below, one main button per item, and a real fix for upkeep (Summarise again, not only "Not now").
Other surfaces show a count that links to it.

**Hemming a scene is one guided page**: the summary, what was basted, then the next scene's brief.
It replaces the setup drawer, its three steps, and the closing report.

**Phone**: prose and the composer; drawer tabs and the scene list open as full pages with Back.
**Tablet**: the drawer pushes the prose aside rather than covering the composer.

## Considered and not chosen

- **Several drawers at once, or separate drawers per feature** (today's shape, and a two-drawer
  variant for wide screens): kept the sprawl; one drawer with tabs is the smallest change that
  gives every feature a home.
- **Fixing only the contradictions** (relabelling the Storyteller): left the model and voice in
  several places.
- **A bottom tab bar on phones**: a second navigation model to keep in step with the desktop one.

## Consequences

- Deep links change: drawer tabs and rack pages need addresses, and today's panel keys must keep
  resolving (the `PANEL_WAS` map is the pattern).
- Many browser scenarios assert today's surfaces and will be rewritten with the surfaces.
- `test/ui/shots.js` gives a before-and-after screenshot of every surface; `bench/words.ts` keeps
  the glossary's words on them.
- What each surface holds depends on the memory-model decisions (what the Workbench and the scene
  list contain); those come next and may refine this.

2026-10-28: the canon check (knots) was deleted (#94); what this record says about it no longer applies.
