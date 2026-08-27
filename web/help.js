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
    body: `<p>What the model is told is true. A thread is a fact that stays true: who someone is,
      what a place is, a rule the world runs on.</p>
      <p><strong>Always on</strong> reaches every call. <strong>Triggered</strong> arrives only when
      its words appear in what you are writing.</p>
      <p>A character lying is not a fact.</p>`,
  },
  strings: {
    title: 'Strings',
    body: `<p>A promise the story has made and not paid.</p>
      <p>What makes it a string rather than a thread is that it is unresolved.
      <em>Aldis owns a letter</em> is a thread. <em>Aldis has not opened the letter</em> is a string.</p>
      <p>A string is yours alone until you put it in play. In play, the model is told what is owed
      &mdash; and told not to pay it yet.</p>`,
  },
  states: {
    title: 'Canon over time',
    body: `<p>People change, and canon that cannot change is the wrong shape for a novel.</p>
      <p>A state is a description that comes into force from a chapter onward. The one in force
      <strong>replaces</strong> the body rather than adding to it &mdash; so a state has to describe
      the whole person as they now are, not only what changed. A state that says <em>her arm is
      broken</em> and nothing else has quietly deleted her eyes.</p>
      <p>Before it opens, a state is hidden. <strong>Hint</strong> tells the model something exists
      without saying what, so foreshadowing has somewhere to come from.</p>`,
  },
  persona: {
    title: 'Who you are',
    body: `<p>The character you speak as. It fills the byline, and it is who Speak and Act default to.</p>
      <p>It can be nobody. A story narrated from outside has no persona, and that is a real answer.</p>`,
  },
  locked: {
    title: 'The one the model never writes',
    body: `<p>No dialogue, no action, no interior for them &mdash; because you write them.</p>
      <p>It does not stop the room reacting to them. What others say and do about them is still the
      model's to write, and that is the point.</p>`,
  },
  voice: {
    title: 'Voice of the weave',
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
    body: `<p>A long book does not fit, and pretending otherwise is how a model forgets chapter
      three.</p>
      <p>Chapters are summarised as they close. When the budget runs out the oldest summaries stop
      being sent, and the bar says how many. <strong>Acts</strong> collapse a run of chapters into
      one summary, which is how the early book keeps reaching the model at chapter forty.</p>`,
  },
  context: {
    title: 'Context',
    body: `<p>What actually reached the model on the last call, in order, and what came off.</p>
      <p>The percentage is of the slot, not of the book. A row that was dropped says why.</p>`,
  },
  anansi: {
    title: 'Anansi',
    body: `<p>It has kept every thread of the story and can be asked about it. It answers from the
      canon, the chapter summaries and the recent passages, and it names what it drew on.</p>
      <p>It proposes and never writes. A thread it offers waits under Chapter until you accept it;
      a directive it writes lands in the composer unsent.</p>`,
  },
};
