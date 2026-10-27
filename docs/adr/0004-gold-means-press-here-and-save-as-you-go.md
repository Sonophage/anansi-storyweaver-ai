# Gold means press here, and everything saves as you go

Seth decided this on 2026-10-25, in the look grill. The app keeps its dark-and-gold look, its fonts
and its nine themes. The review found two rules missing: gold meant everything, and some screens
saved as you went while others had a Save button.

## The decision

**Gold means "press here", and nothing else.** A screen has one filled gold button, for its main
action. Every other button is an outline in ink. The other jobs gold did move to their own theme
colours: the menu row you are on to bright ink with a rule beside it, labels to `--label`, tags to
ink, warnings to `--warn`. The waiting glow at the top of the screen and the Waiting row move to
`--warn` too, although Seth asked for them "in accent color" on 2026-09-03: they are notices, not
presses.

**Everything saves as you go.** There is no Save button. Alter, which had Cancel and Save with a
two-press Cancel (approved earlier the same day), saves as you type; its Cancel becomes "Undo my
changes", which puts the thread back as it was when Alter opened.

## Consequences

- A new screen must not use gold for a label, a tag, a state or a notice. Review flags it.
- A help mark stays on every label (Seth, the same grill).
- The work goes in three passes, each merged before the next: inline styles into classes (no
  visible change; screenshots before and after must match), then the gold pass, then the
  save-as-you-go pass.
- Pass one, as done (2026-10-27): every style written out in more than one place became a named
  class in the stylesheet. A style used in one place stays inline where it is used, and so does
  one that works out a value as it draws (Seth, the same day). `bench/samestyle.ts` is how "no
  visible change" was checked.
