// The evergreen half of the manual, and only that.
//
// Definitions, never counts, lists or wording that lives somewhere else. What reaches the model, in
// what order, and what the shipped mode prompts say are all FACTS about the code and would rot here
// within a fortnight — this project's first rule is that docs drift from the code and the code wins,
// so the way to have help that stays true is to write only the things that cannot change.
//
// Attached to the control they explain rather than gathered on a page. A help page is one you
// navigate away to and do not come back from; this opens under the thing you were looking at.
//
// test/app.ts asserts every slug used in web/app.js has an entry here and every entry here is used,
// so renaming a control and forgetting its help turns the suite red.
export const HELP = {
  threads: {
    title: 'Threads',
    body: `<p>A thread is a fact that stays true. A string is a promise the tale has to keep.</p>
      <p>Threads are what the model is told is true: who someone is, what a place is, a rule the
      tale runs on. A pocket is a named part of a thread, such as an outfit, that you switch on
      or off. A retired thread is one the tale is done with: it stops reaching the model.</p>
      <p><strong>Always on</strong> reaches every call. <strong>On a word</strong> arrives only when
      one of its wake words appears in what you are writing.</p>
      <p>On the list, the mark on a thread says which: an open eye is always on, an eye with a
      speech mark is on a word and woken now, a shut eye is on a word and asleep. Tap it to switch
      between always on and on a word.</p>
      <p>A character lying is not a fact.</p>`,
  },
  strings: {
    title: 'Strings',
    body: `<p>A thread is a fact that stays true. A string is a promise the tale has to keep:
      something set up that must pay off later.</p>
      <p>What makes it a string rather than a thread is that it is unresolved.
      <em>Aldis owns a letter</em> is a thread. <em>Aldis has not opened the letter</em> is a string.</p>
      <p>A string is yours alone until you summon it. Summoned, the model is told what is owed
      &mdash; and told not to resolve it yet. A string the tale keeps is tied off; one it abandons
      is let go.</p>`,
  },
  states: {
    title: 'Over time',
    body: `<p>People change, and a thread that cannot change is the wrong shape for a novel.</p>
      <p>Over time is where a thread stands, scene by scene. The first entry is where it stands
      from scene 1. Each later one is where it stands from its own scene on, and the model reads
      only the one in force at the scene being written &mdash; so an entry describes the whole of
      it as it now is, not only what changed. One that says <em>her arm is broken</em> and nothing
      else has quietly deleted her debts. Who or what it is belongs in Always true, which never
      changes.</p>
      <p>Before it opens, an entry is hidden. <strong>Hint</strong> tells the model something exists
      without saying what, so foreshadowing has somewhere to come from.</p>`,
  },
  persona: {
    title: 'You play',
    body: `<p>The character you speak as. It fills the byline, and it is who Speak and Act start from.</p>
      <p>It can be nobody. A tale narrated from outside has nobody to play, and that is a real answer.</p>`,
  },
  locked: {
    title: 'Hands off',
    body: `<p>The character the model keeps its hands off: no dialogue, no action, no interior for
      them &mdash; because you write them.</p>
      <p>It does not stop the scene reacting to them. What others say and do about them is still the
      model's to write, and that is the point.</p>`,
  },
  voice: {
    title: 'Voice',
    body: `<p>How the prose sounds, in your words. It rides in every call, so it is the largest single
      thing you control about the register.</p>
      <p>A few hundred words of your own writing beats any description of it. <em>Short sentences,
      weather does the feeling, nobody's interior is ever stated</em> is a voice. <em>Literary
      noir</em> is a genre and is no use here.</p>`,
  },
  spice: {
    title: 'Spice',
    body: `<p>Where the writing stops. Five levels, from nothing sexual to fully explicit.</p>
      <p>If the number is too blunt, write the register out in your own words underneath &mdash; it
      replaces the level entirely.</p>`,
  },
  horizon: {
    title: 'The horizon',
    body: `<p>A long tale does not fit, and pretending otherwise is how a model forgets scene
      three.</p>
      <p>Scenes are summarised as they are hemmed. When the space runs out the oldest summaries stop
      being sent, and the bar says how many. A <strong>chapter</strong> is a run of scenes gathered
      together: its one chapter summary is sent in place of theirs, which is how the early tale
      keeps reaching the model at scene forty.</p>`,
  },
  context: {
    title: 'What he reads',
    body: `<p>What the model reads for the next passage, in order, and what was left out.</p>
      <p>The percentage is of the space one writer has, not of the tale. A row that was left out says why.</p>`,
  },
  anansi: {
    title: 'Anansi',
    body: `<p>He has kept every thread of the tale and can be asked about it. He answers from the
      threads, the scene summaries and the recent passages, and he names what he drew on.</p>
      <p>He chalks and never writes. Chalked means suggested and not yet in the tale: a thread he
      offers waits on the Workbench until you sew it in; a directive he writes lands in the
      composer unsent.</p>`,
  },
};
