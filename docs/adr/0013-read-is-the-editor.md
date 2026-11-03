# Read is the editor

Seth decided this on 2026-11-03 (bugs.md, section Threads; spec #132, built in #136). It supersedes
the Read / Alter split of ADR 0003's v2 layout, for threads. Passages keep their Alter box.

## Why

A thread had two screens: Read, to look at it, and Alter, to change it. Since ADR 0004's third pass
Alter saved as you type, so the split no longer protected anything. On Read, a tap on Always true or
on where it stands already opened Alter. The rarer actions sat under a ⋯ menu that drew its rows
inline and pushed the thread down.

## The decision

- **A thread is edited where it is read.** A tap on the name, the kind, Always true, where it
  stands, the wake words or the notes turns that field into a box in place. The eye in the tags is
  the activation, cycled by a tap, as on the Threads list. A box stays open until the thread is left.
- **It saves as you type, through ADR 0004's draft contract.** A pause writes a draft, which keeps
  no revision and stales no summary. Leaving the thread (Back, another thread, Esc, a hidden tab,
  another tale) sends one last write that names what Read opened on. So Past edits holds one entry
  per visit, and a scene summary is marked out of date once, only if something it said is gone.
  There is no Save, no Done and no Undo my changes: Past edits' Put this back is the undo.
- **An emptied Always true is never written**, and the writer is told. Back, another thread and Esc
  are refused until it holds something.
- **Read has four tabs: The thread, Timeline, Pockets, More.** They are switched by the stylesheet,
  not by drawing the screen again, so a half-typed box survives a tab press.
- **More holds the rare actions** that the ⋯ menu held: Stitched together, Copy to another tale,
  Merge with another thread, Read the whole tale for this thread, This thread as JSON, Retire or
  Bring it back, and Delete, which still asks twice. It also holds Past edits, with Put this back.
- **Timeline is story time; Past edits is edit history.** The Timeline is sent to the model by
  scene. Past edits is never sent. Both stay (#135).
- **Old doors still open.** A link or a press that opened Alter opens Read on The thread; one that
  opened a row of the menu opens Read on the tab that holds it.
- **A followed World thread keeps its own face**: its text is edited in place and Send to writes it
  to the World it lives in.

## Considered and not chosen

- **Keep Alter as a second screen with Done.** It saved as you type already, so it was a second
  place to look for the same fields.
- **Keep the ⋯ menu beside the tabs.** Two ways to the same rows; More is a tab like the others.

## Consequences

- Browser scenarios that drove Alter or the menu are rewritten for Read: `threadread`,
  `threadalter`, `overtime`, `merge`, `talethread`.
- A repaint keeps what is typed in Read's open boxes, by thread, so a poll or a fading eye word
  does not put the stored text back under the writer.
