# What changed

The app's own release notes, served straight from this file by `GET /api/whatsnew`.

**Newest first. `##` is a release, `###` is one thing in it.** Written by hand in the same
commit as the work, which is the whole point: it used to be a model call over the git log,
and it was slow on a cold cache and said nothing on three different failures without
distinguishing them.

Everything below this line was written by that model call, before it was removed on
2026-08-29. Kept because it is the app's history and the notes were true when written.

## 2026-09-02 · The composer is two dials, the bar counts chapters, and the covers sit straight

### Speak, Act, Direct and Narrate are one control
Four buttons and three doors were fighting for one line. The four modes are a dial you open and
pick from, and it reads **Speaking As** or **Acting As** when you are in the two that need a name —
because the name of who you are being now sits directly beside it, instead of on a strip of its own
above the row. Threads and add-a-thread are a second dial beside it, and **Hold back** is a button
shape now, so it does not disappear when it is off.

The hints in the box were rewritten. One of them had been saying "What Wren Halloway do".

### The bar under the header counts chapters
It was a percentage of the model's memory. It is one segment per chapter now — one chapter is one
long line, two are two — with the one you are writing lit. The reading under it, which chapter and
how many words and what the context costs, is always open; it used to be behind a press on the bar.

### Covers that were sliding down their cards
On the shelf, a book whose blurb ran short had its cover pushed down inside the card — by 70 pixels
on the worst of them — so the picture and the genre labels on it slid out of view. They sit at the
top of the card now, every one of them.

A thread card with a picture on it was cut off at the bottom, taking the description with it. It
grows to fit what is in it.

### Smaller things you will notice
The composer's gold line moved off the row and onto the box itself, dim until you are writing in it.
The waiting screen starts at the top of the window and writes downward, instead of creeping upward
as the passage grew. Messages appear in the middle of the screen rather than over the composer. The
buttons under a passage wear that passage's own colour.

## 2026-09-02 · A passage Continue wrote carries its colour down the margin

### Continue's accent was drawn but never saved
Every press marks its passage with a coloured rule down the left margin, and Continue got its own
colour yesterday. The colour was never saved with the passage, though, so a passage Continue wrote
sat on the page with no rule beside it at all — and Continue is the press you use most, so that was
the most common passage in the book.

Every passage written from now on carries it, and the ones already in your books have been marked
after the fact: 22 of them, across The Anagram, The Tin Orchard and The Transaction of Silence.

### A new path kept the prose and lost every colour
Branching from a passage copies the book so far onto the new path. The copies arrived with no
accent on any of them — the press that wrote each one was left behind — so a branched timeline read
as though nothing in it had ever been pressed. The Transaction of Silence has a path like that, 21
passages long.

The copies keep their colours now, and those 21 have theirs back.

## 2026-09-02 · Regenerate's wording is in Storyteller, which yesterday's note said it already was

### The re-roll's instruction has its own row
Yesterday's note said Storyteller listed it beside the five modes. It did not — the panel still
drew five, so the one instruction with no way to change it was the one you asked to be able to
change. It is the sixth row now, and it saves and goes back the same way: empty the box, press
**Save**, and the shipped wording returns.

It is the wording a re-roll of a plain passage uses. Re-rolling a passage you **directed** still
re-runs that passage's own instruction, which you edit on the passage itself.

## 2026-09-02 · The words arrive while she writes them, and The Anagram is quick again

### The passage types itself out while you watch, and you leave when you are ready
The waiting screen used to hold until the whole passage was finished, and on a long one that is
twenty seconds of watching letters roll.

The waiting screen shows nothing now — no web, no letters, nothing standing in for a passage that
has not been written. The page goes down to a blur and stays there.

Then the words arrive, one at a time, focusing out of that blur. The last three stay gold so you can
see where the writing has got to; everything behind them settles into the page. A thin gold rule
down the left is the only other thing on the screen: no count, no status, nothing to read but the
passage. It starts at the top and stays there.

The prose is set large and quiet while it arrives, so the screen you wait on is a page rather than a
progress bar.

**The passage does not touch the page until you leave the screen.** It arrives whole when you do,
which is what stops the book being rebuilt underneath the words while they are still arriving.

When it finishes, the screen **stays**. It is the take, and it is yours to sit with. **Start typing
and it gets out of the way** — the letter you typed goes into the box, so carrying on writing is one
motion. A tap anywhere on it closes it too, and so does Escape.

**Stop** stays for the whole time she is writing and goes when she finishes, because by then there
is nothing left to stop. A passage that fails still puts you straight back on the page.

### The Anagram is back on the usual model
It had been set to write with **Artemis**, which is about ten times slower than the model the rest of
your books use — a passage there was taking a bit over a minute where the others take ten seconds.
Nothing about the book has changed and nothing you wrote was touched; it just uses the default again.

If you had picked Artemis on purpose and want it back, it is under **Story → Model**. Be ready for
the wait.

## 2026-09-01 · Threads say Back, switch in one press, and the reading toggle is visible again

### Always on or triggered is one press, on the list
The chip under each thread on the **Threads** panel used to be a label. It is a switch now: press it
and the thread flips between **Always on** (sent on every call) and **Triggered** (sent only when one
of its words appears). Changing that used to mean opening the thread, pressing Edit and finding the
row — three steps for a two-way flip.

If you flip a thread to **Triggered** and it has no trigger words, the app says so, because a thread
in that state cannot reach the model at all.

### A filter for what is actually in context
Above the list, **All** and **In context**, each with a count. **In context** shows the always-on
threads plus anything you have pinned into this chapter. It does not guess at triggered threads —
whether their words come up depends on prose you have not written yet — so pinned is the only way one
appears there.

### The thread card says Back, not Exit
There is already a **Close** on the panel, and Exit did something different: it returned you to the
list of threads. It says **Back** now.

### Reading mode looks switched on when it is
The book icon in the top bar went blank once reading mode was on — a gold icon on a gold button. It
reads dark-on-gold now, the same as every other lit control.

### Read / Edit / Back sits against the panel head
On a thread it floated below the header with a gap above it and a stripe of background either side.
It is flush under **Threads / Close** now and its ground runs the full width of the panel, so the
form passes behind it instead of alongside it. Every other panel's **Save** bar sits the same way.

## 2026-09-01 · Regenerate has its own words now, and they are yours to change

### A re-roll asks for another take, not for the next passage
Regenerate used to borrow whichever mode the composer was showing — so asking for another pass at a
paragraph could arrive as *"carry the scene forward by one small beat"*, which is the instruction for
the **next** passage. It has its own wording now: same moment, same canon, a different way through
it, and explicitly not a continuation or a resolution.

**Storyteller lists it beside the five modes**, so you can replace it with your own words the same way
— and blank still puts the shipped one back.

Two cases keep what they had, because the passage decides: re-rolling a **directed** passage still
re-runs its instruction, and re-rolling **dialogue** keeps the speaker, since the new wording names
nobody. The Context panel shows whichever instruction a re-roll will actually use.

## 2026-09-01 · A chapter that went missing, where the page lands, and who wrote what

### Every passage says where it came from
A small chip above each one names the press that made it — **Speak**, **Act**, **Direct**,
**Narrate** — and a spoken line names who said it. It wears the same colour as the rule beside it, so
the two say one thing twice. Reading mode hides them with the rest of the apparatus.

### Continue has an accent now, like every other press
It was the only one without a coloured rule down its margin — and it writes more of a book than
anything else, so the shape you see most was the one with no mark on it. Its colour comes off the
page's ink rather than the accent: the other four say you chose something, and Continue is the
storyteller carrying on by itself.

### And the rules down the margin are thicker
They were a hairline, and several of the colours differ from each other by lightness alone, which is
exactly when a hairline is hard to read. Three times the width now, into the gap — the prose has not
moved.

### A book can no longer be left with nowhere to write
Deleting a chapter refused only when it was the book's **last** chapter — so a book with chapter one
closed and an empty chapter two open let you delete chapter two, and then every screen showed a
closed chapter one and there was nowhere to write, with nothing saying why.

**The Transaction of Silence was in that state.** It has a Chapter 2 again, opened where the close
would have left one. Deleting a chapter now refuses when it is the last one **open**.

### A passage that arrives leaves you at the end of the one before it
Sending already worked that way — you land on the last line you had read, with the new prose starting
under it. Everything else jumped to the bottom of the new passage: one that finished while your phone
was in your pocket, **Continue**, a re-roll, and the other writer's passage arriving. They all land
the same way now.

A repaint that changed nothing still leaves the page alone, and switching chapters still takes you to
the end of that chapter.

## 2026-09-01 · The writing instruction, rewritten

### It reads as a continuation now, not as an engine
The standing instruction every passage is written against opened with *"You are a prose engine for a
novel."* It now opens with *"You are the continuation of this manuscript"*, and asks the model to
carry on from the **final word** of what you have rather than from the general sense of it.

### It reads the register off your own page
A new paragraph tells it to match what is in front of it: interior, atmospheric or reflective writing
gets narrator authority — interpret, linger, let subtext breathe. External, dialogue-heavy or
scene-advancing writing gets seamless continuation — match the rhythm, advance the beat, disappear.
Where there is more dialogue and action than reflection it continues rather than deepens, and it is
told not to announce the shift.

Three rules are new alongside it: hold the point of view and tense you established, match the
emotional temperature and narrative distance, and where the canon is silent leave the gap rather than
fill it with speculation.

### What it costs, said plainly
The instruction is longer — about 556 tokens against 300 — and that comes off the room left for your
canon and your prose on every call. A book capped at 4,000 tokens keeps around 256 fewer of its own.

And nothing about this is measured. It says what you asked it to say; whether the prose reads better
is a question only writing with it will answer.

## 2026-09-01 · Pictures, and three corrections

### A thread's picture is at the top, everywhere a thread is drawn
On its card, on its face, in the Threads list, and on the page that spans every book. It used to be
one row buried under the facts — so on a card with a face, the fastest way to recognise it was the
one thing you had to scroll past the words to reach.

### Show me more pictures
Both picture searches — a thread's and the book's cover — have **Show me more**, which walks further
down the same search rather than starting over. It keeps what is already on screen and adds what is
new, and says so when a set of words has run out.

### Looking on one site
Add **site:pinterest.com** — or artstation.com, unsplash.com, any host — to look on one site alone.
**!goi** or **!bii** at the front asks Google or Bing images only. Icons are dropped now: they cannot
become a picture, so a grid of them was a row of presses that could only fail.

### Anansi no longer pastes links
A card she wrote with help from a search used to carry the URL in its own text, which then rode into
every prompt that thread fired. The links under her replies are gone too. She still looks things up;
you just are not handed the bibliography.

### Chapters are separated again when you read the whole book
Reading mode draws every chapter, and they had run together — chapter one's last paragraph into
chapter two's heading. There is a proper break between them now, and each chapter has its own anchor.

### Ending a chapter lands you on what it left, and new threads live under Anyone new
Two things a close proposes, and they are different things: a **change** writes into a thread you
already have — that is **What it left**. A **new thread** is one this book does not have yet — that
is **Anyone new**, whether Anansi offered it when the chapter closed or you asked for one in the tray
on that step a moment ago. They used to all pile onto the first step, which was worst on Anyone new
itself: you pressed *Have Anansi write someone* and the card appeared two steps away.

Each step counts what it owes, and the panel opens on whichever is waiting — still after a reload. A
queue you left from two chapters back is not a debrief; that stays in Waiting.

**Anyone new** is now the accented press on the beat step, above **Save and write**: the beat is what
says who is needed, so it is the step worth offering next. Save and write is the way out.

## 2026-09-01 · The rooms of a card say what they are for

### A character's voice is an instruction, not a note
Fill in a character's **voice** and it used to reach the storyteller filed alongside their
appearance and their history — a description of how they sound, sitting among the other things that
are true about them. It now arrives as a direction about their dialogue, naming them: *when she
speaks, write it this way*.

This is the same change that made the book's own voice field work, applied to the people in it. A
rule written as a note gets read as background; written as an instruction, it gets followed. If you
have voices written already, they start working harder on the next passage without you touching
them.

Two things worth knowing. A voice only reaches the story if the room is **switched on**, the same
as an outfit — a voice you wrote but never turned on has never been sent. And this is a change to
how the instruction is worded, not a promise about the result: whether two people in a scene now
sound further apart is being measured, and is not yet known.

### What they will not say now arrives as what they do
The **interiority** room is where you put what a character keeps back and what they do instead of
saying it. It used to reach the story under whatever you had titled it, so a room called *Product
or predator* arrived as a heading with no clue what it was for. It now says whose it is and what
it is for, and keeps your title after it — so three of them on one character stay told apart.

### A room named after its own character stops saying the name twice
If you titled a room with the character's own name, their card arrived carrying two blocks that both
opened *"Seth:"* — one their description, one the room — with nothing to say which was which. The
room now names itself instead. Nothing to change on your side; the cards that did this are fixed
where they stand.

### Rooms written in brackets no longer arrive inside two sets
A room whose text you had already written as `[like this]` was reaching the story wrapped a second
time. Forty-three rooms across the library were in that state. They now arrive with one set of
brackets, the way they read on the card.

## 2026-09-01 · Small corrections to how the app reads

### Tapping a label puts you in the field
**Every** field in the app is now joined to the word above it — the wizard, Story, Chapter, a
thread's card, its rooms, its timeline, the blank-book form, the trays. Tapping the label focuses the
box, which matters most on a phone where the labels are the easiest thing to hit.

The boxes that never had a word above them — the paste boxes, the sliders, the search fields, the
steer lines — are now named too. Nothing looks different; they just have names now.

### The rail says which row you are on, and the chapter list which chapter
It was a colour and nothing else. Same for the **coat chips** under a character on Threads and the
threads you tick when starting a book from another one: which is on was in the border and nowhere a
screen reader could reach it.

Nothing moved and nothing looks different — this is the app saying out loud what it was only
showing.

## 2026-09-01 · A shared thread, decided one thread at a time

Following a world book used to be all or nothing: every thread in it reached your book, live, and no
single one could be excepted. Now each card decides for itself, and every choice is reversible.

### Edit a shared thread from either book
Open a followed thread here and its description is editable, with **Save to <the world book>**. It
writes the one card — so every book following that world sees the change. There is one thread, not
two copies being kept in step, which is why it cannot drift.

Its rooms, its timeline and what wakes it are still edited in the book it lives in.

### Make it this book's own
**Make it this book's own** copies the thread here exactly as it stands — rooms, wardrobe and all —
and stops it following. From then on it is an ordinary thread of this book: edit it, give it states,
delete it, and the world book never knows. Changes there stop reaching it.

The card remembers where it came from, so there are two ways back:

- **Send this version up and follow again** — your wording goes into the world book, every book
  following it gets it, and this book goes back to reading the shared card
- **Drop this copy and follow again** — throw yours away and take the world's

### Or take it out of this book only
**Remove it from this book** stops the thread reaching your prompts and leaves it completely
untouched where it lives. Threads you have taken out are listed under **Part of a world**, each with
**Bring it back**.

### And when a book is deleted, its threads can go home
Deleting a book that follows a world offers **Send them home** first, by name. A thread you took over
lands back **on the card it came from** rather than beside it, so nothing is doubled — and anything
written in this book arrives in the world as a new thread.

## 2026-09-01 · You can ask Anansi to correct a contradiction

### Let Anansi correct it, on the flag itself
Open a red contradiction line and there is a third press: **Let Anansi correct it**. She rewrites
only the sentences that break canon, then **checks her own work** and tells you what actually
happened — *"2 of 3 corrected, one still contradicts"*, not just *"corrected"*.

The correction arrives as a **new take**, so the version you had is one press away under History.
Nothing is overwritten.

### It says so when it fails, which is the whole point
A repair that did not work used to look exactly like a passage with nothing wrong. Now:

- if it comes back shorter than the passage, it was a rewrite rather than a correction, and it is
  refused — nothing is changed
- if the checker cannot read its own answer, nothing is claimed and the flags you had stay on screen
- if it made things worse, it says that too

### And not on a flag a rewrite cannot fix
A **Never sent** line means the model was never given that thread — the fix there is a trigger word
or switching it always-on, not a rewrite. Those flags are not offered the button.

### Storyteller says whether it is worth pressing
A new **Corrections** row, counted over the takes you asked to correct rather than over every call:
how many came out clean, how many made it worse, how many were refused.

## 2026-09-01 · Hold them back, while you are still setting up

### The switch is in the wizard now, not only under Story
Naming somebody as the one **the model never writes** offers **Hold them back** right there, on the
same step. Turn it off for a book where you want the model to write them after all — the name stays,
so turning it back on is one press rather than picking them again. It used to live only under Story,
which meant a book could not be set up that way until after it existed.

### And the two pickers say the same thing in both places
**You are** and **The model never writes** were worded differently in the wizard and under Story —
down to *anyone* against *everyone* — and the wizard gave you one line where Story gives you three.
Now it is one set of words, wherever you meet them, with the same **?** explainers.

## 2026-09-01 · You say where a change goes

### Anansi can finally name the room, and she has to
Ask her in the chat to pad out a card and she used to have no way of saying which part of it she
meant — so accepting the offer rewrote the card's whole description and everything else you had
written there went with it. She now names the room, the same as the passes that run when a chapter
closes: appearance, voice, interiority, one relationship, history, role. The change lands in that
one room and the rest of the card is left exactly as it is.

She is also told outright that **What is always true** is not the answer for most changes. It is for
what never changes.

### And if she picks the wrong one, you move it
Every offer about a card you already have now carries **Goes in** — a picker with that card's own
rooms in it, and *the card's own Info* at the top for a change that really is to the whole
description. Move it before you accept it. A place is offered a place's rooms; a person is offered a
person's.

Beside it: **the words that wake it**, so a room arrives already keyed instead of arriving switched
off. And **Make it a state instead, from chapter N** — for a change that should replace the
description from a point in the book rather than edit it, which is a different thing and only you
know which one you meant.

What you choose is saved as soon as you choose it, edits to the words included, so nothing is lost
if you come back to it later.

## 2026-09-01 · A thread can have a picture

### Optional, and it stays optional
Every card now has a **Picture** row. Find one on the web, choose a file, or leave it — no picture is
the normal state and it says so rather than showing you an empty frame. **Remove it** takes it off
again.

It is shrunk to 900px and stored in the book like a cover, so it travels with an export and comes
back with a restore.

### It is for your eye, not the model's
A picture is never sent to the model. Not as a room, not in the body, not anywhere — there is no
field on the thing the engine reads that could carry one. A card is still words as far as the writing
is concerned.

### And it belongs to its own book
A thread followed from a world book keeps the picture where the thread lives. A picture set in one
book is not reachable through another, which is the same rule its cards and its timeline already
follow.

## 2026-09-01 · A cover found on the web, and Anansi can look things up

### She can search, and it is one switch everywhere
Anansi's **Search before responding** box is live now that the server has a search endpoint. The same
switch appears wherever she can look something up — asking her a question, or having her write a
thread — and it is one preference: tick it once and it stays ticked in both.

Asked a question with it on, she reads what came back and answers from it, with the sources.

### Find a cover instead of drawing one
The cover section has **Find one on the web** beside **Have one drawn**. Type a phrase, get a wall of
thumbnails, press one, and it becomes the cover — shrunk to 900px like every other cover.

The box starts filled in from the book's own setting and genre, so there is something to press rather
than an empty field.

Where the picture comes from is worth knowing, because it is different from the drawn one: the words
go to your own search endpoint, and the picture itself comes back **through Anansi** rather than from
your browser. Nothing about the book is sent — not the premise, not a word of the prose.

## 2026-09-01 · Anansi remembers whether she looks things up

### The Search the web switch stays where you left it
Ticking **Search the web** in Anansi's ask box lasted until the next reload and then went back off.
If you were researching for an hour you re-ticked it every refresh.

It is remembered now, on this device. Not synced between your phone and the desk on purpose: the desk
may be able to reach a search endpoint where a phone on mobile data cannot, so it is a fact about
where you are sitting rather than about you.

It still starts **off** the first time. That switch sends your question somewhere else, and the first
time is yours to decide.

## 2026-09-01 · The buttons say which one is chosen

### A selected button is now readable, not only visible
Five sets of buttons showed which one was picked by colour alone — the theme list, the Blocks/Prompt
switch on Context, the kind chips in the wizard and on the chapter's setup screen, and the kinds on a
lore card. A screen reader had no way to tell which was on.

They say so now. Nothing looks different.

## 2026-09-01 · The threads suggest themselves, and what you keep is kept

### They are written for you on the way in
Pressing on from the book now asks for the threads while you are still reading the next heading. They
are there, or arriving, when you land — instead of a screen with a button on it.

If Anansi cannot be reached the step is simply empty and says nothing happened, and it does not
ask again every time you walk past.

### Say what you need after you have seen what you got
The steer box moved below the list, because that is when you have something to say. Read what she
proposed, untick what you do not want, then tell her what the book actually needs.

### Asking again keeps what you ticked
This is the part that was wrong before: asking again replaced everything, so reading six threads,
keeping four and asking for two more lost all six. Now the ones still ticked stay exactly as they
are and only the ones you unticked get rewritten. The button says which.

With nothing unticked it asks for **more** alongside what you have, and says so. To get a genuinely
different set, untick them all first.

## 2026-09-01 · Threads, with their triggers, and a world to set them in

### Characters, places, items and rules are all asked for from the start
The threads step used to have only **characters** selected, so a book that wanted its places and its
rules written had to know to turn them on. All four are on when you arrive. Turn off what this book
does not need.

### Every thread arrives with its trigger words
A thread called *Aldis Fen* now comes with **Aldis Fen**, **Aldis** and **Fen** already in its
trigger list. Particles are left out — *the Ambersand* gets **Ambersand** and nothing else.

Your threads still go in **always on**, so nothing about what the model is told changes: the triggers
are there for the moment you switch one over to firing on its words instead. That way round on
purpose — a card that drops out of the prompt when the scene does not name it reads as the model
forgetting who someone is.

### You can set the book in a book you already have
Under the thread picker there is now **set it in a book you already have**. Pick one — a world book,
or any book on your shelf — and the new book reads that book's threads rather than copying them. Edit
a card there later and it changes here too, and a thread you write in this book with the same name
still wins where this book needs to disagree.

It is the same thing **Start a book here** does from the Threads page, reached from the wizard.

## 2026-09-01 · Ask again for just the title

### The title, the genre and the premise each re-roll on their own
Under each of the three there is now **ask again for this**. It rewrites that one field and leaves
the other two exactly as you have them — so a premise you are happy with survives a title you are
not.

What it writes is told about the fields you kept, and about your original idea, so a new title
belongs to the book on screen rather than to a better one it would rather have been given. Editing
the idea first and then asking changes what comes back.

The whole-skeleton re-roll is still there, at the foot of the step, for when nothing is right.

## 2026-09-01 · Making a story, in seven steps instead of eight

### The screen that read your own sentence back to you is gone
The wizard opened on a page showing the idea you had just typed. It now opens on the book itself —
title, genre, premise, voice — and your idea sits at the top of it as one line you can still edit.
It has to stay somewhere: every re-roll asks again from exactly that sentence, so changing it changes
what comes back.

### The cast is called the threads
Same screen, same cards, the name it has everywhere else in the app.

### A second look comes earlier, where it can still change something
Anansi's read-back used to come after you had picked who you play. It now comes straight after the
threads — which matters, because one of the things she offers is threads the book implies and the
list is missing. Those arrive before you choose your character out of that list, instead of after.

## 2026-09-01 · The character you hold back is held back harder

### Anansi now knows which lines in your book are yours
When you hold a character back, the model is told not to write them — and then handed the recent
prose, which may contain you writing them yourself. Those two things fought each other, and the prose
usually won.

Your own passages are now marked as yours in what the model reads. It changes the result more than it
sounds: measured over 1,300 passages, the model acting for a held-back character **fell by half**.

The way it works is worth knowing, because it explains what you will see. It does not make the model
avoid your character's name — they stay just as present. What changes is that they stop being the one
*doing* things: the scene comes to them, the room answers around them, and the writing stops where
they would act. Which is what holding someone back was always meant to mean.

It is not a guarantee. Half is a rate, not zero — the model will still occasionally write them, and
when it does the fix is the same as it ever was: re-roll, or write the line yourself.

This only applies while a character is actually held back. Every other book's prompt is unchanged.

## 2026-09-01 · Send it and walk away

### A passage you asked for finishes even if you put the phone down
Pressing Continue and then backgrounding the app used to lose the passage. Not "wrote it and threw it
away" — the writing itself stopped, part way through, because the app treated your browser going
quiet as you cancelling.

Now the command really is sent. Anansi finishes the passage on the machine, whether or not anything
is still listening, and it is there when you come back.

### What arrived while you were gone says so
A passage that landed with nobody watching carries one quiet line under it: *written while you were
away — carry on and it is yours*. It is a real passage, not a decision waiting to be made: you can
read it, edit it, re-roll it, branch from it or delete it exactly like any other. Writing the next
thing is what makes it yours, and the line goes.

Nothing is marked if you were sitting there watching it arrive. And a reload counts as coming back,
which is the point.

### Stop still stops
Because hanging up no longer cancels anything, Stop now tells Anansi you meant it. Pressing it does
what it always did: the half-written passage goes, nothing is kept, and what you typed stays where
it was.

## 2026-09-01 · A new cast keeps what it was written with

### A character's description no longer gets overwritten by chapter one
When a book is made — sparked, or pasted in from the forge — each card's description now goes into
its **facts** room instead of into **Info**.

It matters because those two are not the same kind of box. The pass that runs when you close a
chapter rewrites Info; that is what Info is for, and it is how Anansi keeps a character current. It
has never been able to touch a room. So a cast written into Info at creation was a cast whose
original description the first closed chapter quietly replaced.

Facts is the room that survives. Your cast's spine sits there now, Info starts empty, and the first
chapter-end update writes into an empty box rather than over the top of what you started with.

Nothing changes about what the model is sent: facts reads in the same place the body did. What
changes is what is still there at chapter twelve. A book pasted in that already wrote its own facts
keeps the one it brought.

## 2026-09-01 · Reading the whole book, and changing your mind about an instruction

### Reading mode shows every chapter at once
Reading mode used to show the chapter you were in and nothing else, so getting through a book meant
pressing the pager between every chapter. It now draws the whole book in one scroll, from chapter one
to where you stopped.

Writing still shows one chapter, on purpose: it keeps the page light and the chapter you are working
in is the one you want under the composer. The toggle is the same one it always was.

### The instruction behind a passage can be changed before you re-roll it
Regenerating a passage you had written with Direct re-ran the same instruction, every time. If the
instruction was the problem, you could re-roll for ever and get another version of the same wrong
idea.

Pressing Regenerate on one of those now opens the instruction underneath the passage, with what you
typed still in it. Change it and the new take is written from the change; leave it and you get
another take on the same instruction, as before. The passage you already have is kept either way.

A passage written with Continue, Speak, Act or Narrate has no instruction to show, so it re-rolls on
the press exactly as it did.

### Direct says what it does
The instruction Direct sends now opens **Re write what happens based on this:** rather than "Write
what happens next". It is the same line a re-roll of a directed passage uses, which is where the
wording matters most. If you have written your own version of the Direct prompt, yours is untouched.

### A chapter can be deleted from the Chapter panel
Deleting a chapter was already possible, and its only door was the chapter's own screen — which you
reach by pressing **End this chapter**. Nobody looking for delete presses the button that closes one,
so it read as missing. It is on the Chapter panel now, where you were looking, and it is the same two
presses with the same warning about the numbers not closing up.

### One less line on My stories
The band across the top said "no target set" beside the chapter and word count. There is no target to
set — that setting is how long one passage runs, not how long a book is — so the line only explained
why something you never asked for is absent. It is gone.

## 2026-08-31 · The sliders keep themselves too

### Surprise, Focus and Passage length save when you let go
The whole of Storyteller sat behind its Save button. The three sliders now keep themselves the
moment you let go of one, and the number beside each follows your finger while you drag rather than
catching up later. The Save button is still there and still says Saved when you press it — it just
is not the only way any more.

### And how much of the cover shows
The same slider on the Story panel was the one control left on that screen that still needed a Save
press. It does not. Its hint used to say "Save to see it", which is how it read as deliberate for a
day; it saves itself now like every other switch and picker there.

Anything you TYPE still waits for Save — the title, the premise, the voice, the chapter's name and
its brief. That has not changed and is not going to: a text box that saved itself mid-sentence would
fight you.

### When closing a chapter cannot finish, it says which part
Closing a chapter runs four things: the summary, the character memory, the facts pass, and the scan
for threads the chapter finished. Each one can fail on its own — usually because the model is asleep
— and the chapter still closes, which is right. But you were told nothing, so a chapter that
proposed no facts looked exactly like a chapter whose facts pass never ran.

Now the screen says which one did not run and why, in a box above the queue, and it says plainly
that nothing was lost and the prose is untouched. Each pass has its own button on that screen, so
you can run it again once the model is back.

### @ is this book, @@ is every book
Typing `@` in the composer offers this book's threads and chapters. Typing `@@` widens it to every
book you have, which is what `@` used to do on its own. The narrow menu carries a line telling you
`@@` is there.

### Choosing a custom register sticks
Picking the sixth spice option — the one where you write the register line yourself — snapped back
to the level you had before, and the box you were meant to type into vanished with it. Fixed.

## 2026-08-31 · A banner over the threads you open

### The book you are looking at, above its own cards
Opening a book's threads now draws its cover as a band above them, with the book's name on it. A
world book says so on the band and adds that nothing is written in it.

### The row of book cards at the top of Threads is gone
It did nothing you could not do from the titles below it. **Start a book here** stays where it was,
beside each book's name.

### The Web is called The Web on its own page
The menu row was renamed and the page it opens was not, so they disagreed. The page no longer says
it is the admin's workbench either — it has been open to every writer since this morning.

## 2026-08-31 · Threads opens again

### The Threads page no longer hangs on "Reading the threads…"
If you had made a world book, the whole Threads page stopped loading and sat on that line for ever.
It is fixed. The world book's card draws properly now, tagged as what it is.

## 2026-08-31 · A world book is lore, and Hold back is on the composer

### A world book has no chapters and nothing to write in
The first version made one as a story with an empty Chapter 1 and a composer, which is a book with
nothing in it rather than a world. Opening one now shows what it is: its lore, and a line saying so.
No chapter heading, no prose column, no composer, and the menu lists its lore instead of chapters.

It is the starting point it was meant to be. Put a cast, a map, a set of rules in it, then start
books set there from the Threads page. Each one reads this lore rather than copying it, so you can
write a different story, as a different person, on a different premise, and they all agree about the
world.

### Hold back is beside Threads now
The switch for the character the model must not write sits on the composer row, next to Threads.
Lit means held back, faded means the model may write them. One press, mid-scene, without opening a
panel. It only appears once a book names someone.

## 2026-08-31 · A demo library, one press away

### Show the app without showing your books
The workspace menu has **Demo library** at the foot of it. Press it and the whole app switches to a
demo account with two books and their cards in it — nothing of yours on screen, nothing of yours at
risk. Press **Leave the demo library** to come back.

Both writers can use it; it is the same shared showcase for each of you, not a second private
account. Your own library is untouched while you are in it, and closing Anansi puts you back in
your own books.

## 2026-08-31 · Hold them back, or don't

### A switch on the character the model must not write
The Story panel has **Hold them back** under the name you picked. Turn it off for a scene where you
do want the model to write them, and turn it back on afterwards — the name stays either way, so it
is one press rather than picking them out of the cast again.

Books that already name someone are unchanged: the switch starts on.

## 2026-08-31 · Threads is a shelf now

### Your books, as books, at the top of Threads
Threads opens with a shelf of your books drawn the same way the Stories shelf draws them, world
books among them. Pressing one shows just that book's cards underneath; pressing it again widens
back to every book. The one you are looking at wears a gold ring.

### Start a book from any book's threads, beside the book
Every book on the page has **Start a book here** next to Open story. Name it and it opens already
reading that book's cards. It follows them rather than copying, so changing a card later changes it
everywhere — and the new book can still disagree by writing its own card with the same name.

It is not only for world books. Any book you own can be followed.

## 2026-08-31 · World books

### A book that is only cards
Threads now has **World books** at the top. Make one, put a cast, a map, a set of rules in it, and
it holds them without ever holding prose. It stays off your Stories shelf and it never appears in
what is waiting for you, because there is nothing to write in it.

### Start a book set in one, in one press
Every world book has a box beside it: name a book, press Start a book, and it opens already reading
that world's cards. It **follows** the world rather than copying it — change the world later and
every book set in it changes with it.

Where a book needs to disagree, it can: write a card with the same name in the book itself and the
book's version wins. That is how a character who leaves the city in one story stays put in the rest.

## 2026-08-31 · The app remembers your model and wakes it for you

### Your model is yours, and it survives a restart
The model you pick is now kept with your account instead of in the server's memory, so restarting
Anansi no longer quietly puts you back on the house default. A book that names its own model still
wins over it, as before.

### It starts waking up as you arrive
Opening Anansi begins loading your model in the background, before you have picked a book. The
model goes to sleep after fifteen minutes of quiet, and waking it is the longest wait in the app —
this moves that wait to while you are still looking at your shelf.

## 2026-08-31 · A quieter create screen

### The empty panel beside Create a story is gone
It listed Title, Genre, Point of view, Spice and Cast with a dash beside each and never filled any
of them in — the real review has its own screen and always did.

### Pasting a forged book is behind a door
The JSON box now sits behind a button that says **Forge the whole thing elsewhere**. Press it when
you want it; it stays out of the way when you do not. It is open to every writer now, not only the
admin, the same as The Web.

## 2026-08-31 · Picking a model shows you the model

### The model's page no longer opens underneath the list
Pressing a model in the menu opens what is known about it, and the switch to use it. On a narrow
screen that page was drawn behind the menu you had just pressed, so it looked like nothing had
happened. The menu now steps out of the way.

## 2026-08-31 · The shelf, the menu, and The Web

### Books you have put away sit at their own end of the shelf
Archived books used to fade out at the bottom of the same grid as everything else. They now sit
below a line, under a heading that says Archived. If every book you have is archived, none of them
is promoted to the big card at the top.

### The Web is open to everyone, and is called The Web
It was called The forge and only your account could see it. It has the same name as the other menu
rows now, and any writer can open it.

### The menu no longer repeats your books
The workspace menu listed your four most recent books under Open, directly below My stories — the
same door twice, and the second one only showed four. It has gone.

## 2026-08-31 · Switches and pickers keep themselves

### No Save press for a checkbox or a dropdown
Point of view, the cover switches, the spice picker and the rest of the story panel's toggles now
save the moment you change them. There is nothing to press afterwards and no message about it.

Anything you TYPE still waits for Save — the title, the premise, the voice, the chapter's name and
its brief. A text box that saved itself mid-sentence would fight you, so it does not.

## 2026-08-31 · My stories opens on where you stopped

### The last book you wrote in now shows you the sentence you stopped on
My stories used to open on a cover. The book you were last writing in took up most of the screen as
a picture, the rest of your shelf sat below it out of sight, and the one thing you came back for —
where you actually stopped — was not on the page at all. You had to open the book to find out.

Now that book gets a band across the top: the chapter you are in, the last sentence of your own
prose, how far through the chapter you are, and one gold **Carry on writing** that puts you back at
the end of the book with the cursor already in the box. **Read from chapter one** is beside it when
you want the other thing.

The sentence is always narration. If the last thing written was a character speaking, the band says
so rather than putting their words where the narrator's would go.

### Starting with no books is now the box you type into
The empty shelf used to be a heading, a sentence, and a button that took you somewhere else to find
the place to type. It is the place to type: a line to give me, a gold **Spark it**, and underneath
it the two quieter ways in — start it yourself, or bring a book in.

If llama-server is not running, it says so there, before you press anything, and offers to go and
wake it. When the model is up it says nothing about it.

### The band and the shelf fit a phone
The cover goes to the top with the title set on it, the sentence you stopped on runs underneath, and
**Carry on writing** takes the full width. What a book is waiting on splits into two chips side by
side. The shelf stays two across.

### What a book is waiting on now sits next to the book
The strip along the top of My stories listed the books that wanted something from you and a number
beside each one. That number was never the number of things waiting — a book with nine proposed
threads said "1" — and it did not say what kind of thing it was.

The chips have moved onto the band, where there is one book to talk about, so they can say it
properly: **2 threads proposed**, **1 promise unpaid**, and pressing one opens the panel that
decides that kind rather than a general list.

The trade is real and worth knowing: only the book on the band shows what it is owed. For any other
book, open it and its Waiting panel says the same thing.

### Every book on the shelf says where you left it
Under the cover, a card now reads *left off · chapter 12*, when you last touched it, and the last
sentence of narration from it. A book you have not written in yet says so plainly instead of
counting to zero.

The covers stay the shape of a page, and the shelf sits four across under the band, so the books
below the first one are on screen when you arrive rather than a scroll away.

## 2026-08-31 · Enter makes a line

### The send button is the only thing that sends
Enter used to send what you had typed, and Shift+Enter was supposed to give you a new line. Now
Enter always makes a new line — in the composer and in Anansi's ask box — and the only thing that
sends is the send button. The small ↵ hint beside the box has gone with it.

If you were in the middle of picking a name from the @ list, Enter still takes the highlighted one.
That has not changed.

## 2026-08-31 · Passages land as soon as they are written

### Opening a book gets it ready to write
The first passage after you sit down used to take a long time before a single word appeared —
sometimes half a minute or more — because the model had to read your whole book back before it
could add to it. Every passage after that was quick, and then you would go and make coffee and the
slow one would come back.

Now opening the book starts that reading straight away, in the background, while you are still
looking at the page. By the time you press Continue it is usually already done. Nothing waits on
it, nothing shows, and if you start writing immediately it simply gets out of the way.

### The wait at the end of every passage is gone
A take used to pause for about a second and a half after the last word, while the app checked it
against your ledger and quietly rewrote anything that contradicted it. That pause is gone. The
passage is yours the moment the model finishes writing it.

The check still happens. It runs when you keep a take, in the background, and it does not hold
anything up — you can carry straight on writing while it thinks.

### A contradiction is now a flag, not a silent rewrite
Before, the app would try to fix a contradiction on its own and tell you afterwards. Now it marks
the passage and leaves the prose alone. Open the flag when you want to see what it caught; ignore
it and it will sit there quietly. Nothing about it changes your words for you.

This is a real trade and worth knowing: the app no longer repairs anything by itself. What it
catches, it shows you, and the fix is yours.

### Flags no longer nag from the shelf
The strip above your books counts threads proposed and promises unpaid. It no longer counts flags.
A flag is there when you go looking for it, not on your way past.

## 2026-08-30 · A whole book from one command, and the prompts follow you into the wizard

### One prompt writes the book and its cast together
The forge has a sixth prompt at the top: **A whole book, in one command**. It asks for everything
at once — title, genre, premise, setting, point of view, spice, the voice, the house style, who you
play, who Anansi must never write for, and four to eight cards with their rooms filled.

Paste what comes back on **Create a story** and the wizard opens with all of it already in place.
It does not create the book — you still walk the steps, change what you want, and press Accept.
Every card's rooms travel through with it.

### The prompts are where you need them, not only on the forge page
The wizard's own steps now carry the prompt that belongs to them: the premise prompt beside the
premise, the voice prompt beside the voice, and both card prompts on the cast step. Each is one
press to copy.

The cast step also takes a paste of its own, for when you have forged one character rather than a
whole book. It joins the cast to read and edit like any other, and nothing is written until you
accept.

### A small thing in + Thread
Opening the tray without picking a kind showed a stray button with a missing word after it. It says
what it is for now.

## 2026-08-30 · The forge: build a thread somewhere else and paste it in

### A page of prompts to hand another model
There is a new page in the menu called The forge. It holds five prompts — a character, a place,
a premise, the voice, and a cover image — each with a copy button. Hand one to whatever model you
like, tell it who or what you want, and bring the answer back.

The prompts do the explaining for you: what the thing is in this app, what belongs in each part of
it, and exactly what shape to answer in. The character and place prompts list the rooms this
database actually has, read from the database itself, so they cannot go stale as the app changes.

### A character forged elsewhere arrives whole, rooms and all
The two card prompts come back as JSON, and **+ Thread** has a box to paste it into. It lands
straight in the ledger — not in the proposals queue, because you wrote it, so it is yours already
— with its trigger words, whether it is always on, and every room filled: what is always true,
how they sound, who they are to each other. No other way into this app fills those.

You can paste a whole cast at once. If something in the paste does not fit — a room a place does
not have, a kind that is not one of the four — it is left out and named rather than quietly filed
somewhere it does not belong.

The other three prompts come back as text. Paste those into the fields yourself.

## 2026-08-30 · Starting a book: the cast comes first, and it argues back

### You say who you are after you know who is in it
Who you speak as, and who Anansi must never write for, used to be asked before there was a cast
to choose from — so you typed a name and hoped. They come after the cast now. Both are a pick off
the list you just made, already filled in with what Anansi proposed, and you can change either.
Skip the cast step and they go back to being boxes you type in.

### Tell her what the cast should be, and re-roll them one at a time
There is a box on the cast step for what this book needs from its people: nobody over thirty, a
rival who is family, a city that is a character. Whatever you write there reaches every ask on the
step.

Each proposed card now has its own re-roll. Asking for a different cast replaces all of them, which
is the wrong thing when four are right and one is not — so re-roll the one, and the others stay
exactly where they are, along with the name in "You are". She is told who is staying, so she will
not hand you somebody you already have under a new name.

### Bring threads from books you already have
The cast step can search every book on your shelf. Pick a character, a place, a rule, and it is
copied into the new book when you create it — the same as starting blank has always allowed, now
where the rest of the cast is decided. A copy, not a link: both books keep their own from then on,
and what does not travel is the timeline, because chapter seven there is not chapter seven here.

Asking for a lore book instead of people was always a press — the kinds on that step are
characters, places and facts, things, and rules — and now you can seed one from what you have.

### How this book is written fills itself in
The style box on the second step used to arrive empty and mostly stayed empty. Anansi writes it
now, once, from the genre and the premise, and there is a button to ask for another. It is the
book's flavour and not its voice — those are two boxes and they stay two boxes. Nothing is saved
until you accept, so read it and change it first.

### Pressing Create twice no longer makes two books
Pressing "Accept and start writing" a second time before the first had finished created a second
book behind the first — same title, same cast, nothing on screen saying so, and the shelf was where
you found out. Both that button and "Spark a skeleton" now go dead while they are working.

### "Where this is going" is gone
The box that asked where the book was aiming has been removed, from the new-book steps and from
the Chapter panel. It was optional, most books left it empty, and it was quietly riding along in
every request to the model. What you had already written in it is not deleted — it is simply not
asked for and not used any more.

If you were using it to keep a character from being marked finished at the end of a chapter, that
is worth knowing: nothing replaces it there yet. It was measured and it was not doing that job —
the same number of characters were wrongly marked finished with it as without.

## 2026-08-30 · Anansi has a voice of her own again, and it is yours to change

### She stopped answering in your book's voice
Ask Anansi a question and she was answering in the register your book is written in. A book
written in short flat sentences got a short flat Anansi; a cold, restrained book got a cold,
restrained one. Your book's voice was reaching her as an instruction, and it was drowning hers.
She reads your book exactly as much as she did before — the canon, the chapter summaries, the
recent passages, who is telling the story — but how it is WRITTEN no longer decides how she talks.

### How Anansi talks is now a box in Preferences
Under your own default voice, there is a second box: her register. Change it and she answers you
like that, on every book, from your next question. Empty it and her shipped voice comes back.

What she may offer you is not in that box and cannot be edited away — she still cites what she
drew on, still says "the story does not say" instead of inventing one, and still keeps her
suggestions to what you asked for. You are changing how she sounds, not what she is allowed to do.

### Asking her to write a card no longer hands her your prose
Have Anansi write a character, a place or a room and she writes it as notes for you, not as a
page of your book. Your book's finished prose used to be sitting in that request, and lines from
it came back inside the card.

## 2026-08-30 · Passage length is something you ask for, not somewhere she gets cut off

### Passages stop ending mid-word
Passage length used to be a hard stop. When a passage reached it, it ended — mid-sentence,
mid-word, wherever the count ran out, and nothing on the page said that was what had happened.
Nearly a quarter of the passages written since the 26th ended that way. They don't any more.

### The slider is a target now, and you can leave it to her
Drag it and you are telling Anansi roughly how long you want a passage to run. She aims for it
and is allowed to come in under it — a beat that wants three sentences still gets three
sentences. All the way to the left leaves the length to her entirely, which is how every book
here was written until today, and it is where the slider starts.

### And if a passage ever does run long, she says so
There is still a ceiling, far above where she normally writes, so a runaway cannot eat the whole
page. If a passage reaches it, what lands is trimmed back to its last finished sentence and you
get told it was trimmed — instead of a paragraph that stops for no reason you can see.

## 2026-08-30 · Ending a chapter is three steps, in the order you do them

### What the chapter left comes first
Closing a chapter now opens on the cards it proposed, on their own, with nothing else on the page.
Decide them, or leave them — what you leave stays in Waiting. If it proposed nothing the step is
skipped rather than shown empty.

### Then the next chapter, title and beat together
Its own page: what it is called and where it has to end up, side by side, with a box to steer what
Anansi suggests before she suggests it. Save and write is right there — you never have to go
further than this to start writing.

### Then anyone new, if you want them
A third step that reads the beat you just set and offers to have Anansi write a card for it, with
the beat already in the box as the steer. Who is in the chapter moved here too, next to the cards
themselves rather than under the title.

It was all one page before — a title, a beat, a search box and the whole ledger in two ticked lists
— and nothing said which to do first. Nothing here is required and every step still has Skip, just
write.

### Cutting the book back also takes the chapters it empties
Delete everything below a passage used to leave the later chapters standing with nothing in them.
They go now, and the count says how many.

### Two rules every book gets
No litotes — it writes what a thing is instead of what it is not, never negates before affirming,
and does not use double negatives for emphasis. The rule names the shapes it means, because a rule
that names them holds and one that does not mostly gets nodded at. And contractions are correct in narration, not only
in dialogue. These sit with the engine's own rules rather than in the house voice, so they hold in
every book, including one that has replaced its voice entirely.

## 2026-08-30 · Nothing is smaller than eleven, and a pass runs once

### The smallest text in the app got bigger
Thirty-four places were set below eleven pixels, the smallest of them in small capitals — about a
seven-pixel letter — and one of those was the chip that says what a proposal is about. Nothing is
under eleven now. The UI size control under Appearance still moves everything from there, and the
prose is where it was.

### Re-running a pass at chapter end can only be started once
Summary, Changes, Facts and Finished each ask the model, which takes a few seconds, and each looked
exactly as pressable while it was working. Pressing twice sent a second request; pressing three
times killed both, because the model does not queue. The button now says what it is doing and
cannot be pressed again until it is done. Have Anansi write behaves the same way and always did.

### Saving the next chapter's setup tells the truth
It said Saved whether or not the chapter's name and brief were stored. Those are the two things on
that screen you type by hand, so a failure was silent and reported as a success. It now says what
actually happened.

### Four buttons that had no name have one
The take arrows on a rerolled passage, the appearance button and the × that rejects a proposal were
unlabelled, so a screen reader announced them as nothing. The × is the one that mattered most: it
is the only unnamed control in the app that throws something away.

## 2026-08-30 · Every delete asks twice, and two new ones

### Nothing is deleted on one press any more
Every delete in the app now arms on the first press and does it on the second, and says so while it
is waiting. There is no undo anywhere in Anansi, so a press that removes writing was the one press
that could not be taken back by pressing something else. Ten of them had no confirmation at all,
including Delete this card, which sits directly under Field history — the button you press when you
want something back.

### Delete a chapter
On a chapter's own screen. It takes its prose, its edits, its summary and anything it proposed.
The chapters after it keep the numbers they have: a change over time is anchored to a chapter
number, so closing the gap would quietly move it to a different chapter. A book will not delete its
last chapter, because there would be nowhere left to write.

### Cut the book back to a passage
Double tap any paragraph and the tray offers to delete everything below it — every passage after
that one, every take of each, across chapters, and it says how many before you press. The chapters
it cut into lose their summaries, because a summary of prose that no longer exists is something the
model would still be told.

## 2026-08-30 · Ending a chapter starts the next one

### End this chapter now takes you to the next chapter
It used to leave you looking at a report on the chapter you had just finished, with the next one
as a small grey button under all of it. Now it opens the next chapter, with its name and what it
has to do already suggested for you. What the close found is one line at the top of that page, and
pressing it opens the whole report.

### The report of what closing found is five lines
It was five headings, four buttons and every card the close proposed, whether or not it proposed
any — so a chapter that turned up nothing showed you a list of the nothing. It is five lines now:
closed, summarised, what changed in the people, what it read, and what it thinks is finished. The
proposals themselves are decided on Waiting, beside everything else the book is owed, instead of
being laid out twice in two places. The buttons that run a pass again are still there, in one row
at the bottom, for a close that happened while the model was asleep.

### The report says which chapter it is about
It sits one press away from the next chapter's page and both opened with a chapter name in the
same place. The one looking backwards says closed next to the name now.

### Anansi writes the opening passage of a new chapter again
If you have her opening your chapters, she quietly stopped after the first one — every chapter
after that opened on a blank page. She does it again. She also waits until you have said what the
chapter has to do, so its first passage is written with the same steer as the rest of it, instead
of being the one passage in the chapter that could not have it.

## 2026-08-30 · A card you can read, and one place to add to it

### Press a room's text to edit that room
On a card, the rooms are what you came for. Pressing one used to slide you a little way down the
same page you were already reading. Now it opens the card for editing with the cursor already in
that room, ready to type.

### One way to add to a card, and it is shut until you want it
Adding to a card was a plus button under every heading, plus a separate form for outfits at the
bottom. It is one fold at the top of the card now, called Add to this card. Open it, press what
you are adding — facts, appearance, a relationship, an outfit, whatever that kind of card can
hold — and one set of fields appears for it, with Anansi offered above them. Nothing is chosen
when it opens, so nothing you type can land in the wrong place.

### A card only shows the rooms it has
A character can hold eight kinds of thing, so editing one meant scrolling past eight headings and
six empty boxes before you reached anything you had written. The empty ones are gone. The fold at
the top is where an empty room gets filled, and everything on the page is something that exists.

### On, then off, in the edit screen too
Reading down a card while editing it told you what the card has. It now tells you what the model
will actually be told: everything switched on first, then a line, then everything written down and
not reaching it. That is a different card once half the rooms are off, and it was only the reading
view that said so.

### Over time, Brings in with it and Another book fold away
The three sections at the foot of a card — the timeline, what a card drags in behind it, and
copying it into another book — are behind their own names now and closed until you open one. They
were most of the scroll under the rooms and none of them is why you opened a card. Whichever you
open stays open while you work.

### Save sits at the top of the card and stays there
It was at the very bottom, under a dozen sections. It is at the top now, beside Read, Edit and
Exit, and that row stays on screen while the rest of the card scrolls, so Save is one press away
from wherever you are in it.

### Facts sits above Info
Closing a chapter rewrites a card's Info. It has never been able to touch Facts, which is what
Facts is for — the things about someone that stay true. The two were the wrong way round, so the
box that gets rewritten was the one you met first. Facts is now above it, and each says which is
which.

### Boxes grow to fit what is in them
Every text box on a card — a room, an outfit, a change over time, your notes — was a fixed two
lines with the rest scrolled out of sight. They fit their contents now, up to a limit that keeps
the buttons under them reachable.

### End a chapter from the prose
Double tap a paragraph of the chapter you are writing and End this chapter is in the tray with
Regenerate and Branch. It asks once and closes on the second press. It was only in the Chapter
panel before, two steps away from the page you are actually on.

### The app is called anansiai in the browser
The tab, the bookmark and the installed app now say anansiai. The icon is answered on the plain
address as well, so a link preview or a bookmark that asks for it the old way gets one.

## 2026-08-30 · Rooms Anansi fills in come back the right size again

### Say what kind of thing you are reporting
Report an issue now asks which of three it is before you write: something is broken, something
you want, or a question. It tags the report so the list can be read at a glance instead of
opening every one to find out.

It also fixes a quiet fault in the same screen. Every report was being filed twice: once with a
tag that did not exist on the repository, which failed, and then again without it. Nothing was
lost and you would never have seen it, but no report was carrying a tag at all.

### Cards are written as notes now, not paragraphs
Everything Anansi writes into a card — a description, an interiority, a voice, a relationship,
a whole new thread — used to come back as paragraphs of prose. It reads nicely and it was the
wrong thing. A card is only ever read by the model, on every request that touches it, and
finished sentences in a card get lifted into your book word for word.

So cards come back as notes: clauses split by semicolons, no connective sentences, the bare
fact instead of "she is" and "he has". The name and what they are stays at the front, because
that is a fact too.

Shorter, and safer. The same rewrite that took a card from a hundred and fifty words to fifty
kept every name, number and detail it started with.

Your existing cards are being converted in the same pass.

### A chapter summary now notices when you change a card under it
Once a chapter is old enough, the app stops sending its prose and sends its summary instead —
that is how a long book stays inside the model's memory. But a summary is written once. If you
went back and changed a character afterwards, the summary carried on describing the old version
in every single request, forever, and nothing said so.

Now, when you swap a fact out of a card, any chapter summary that named that fact is marked
Stale and stops being sent until you re-run it. You will see it flagged on the chapter.

It only fires when a fact actually leaves the card. Fixing a comma, rewording a line, or
tightening a description does not touch your summaries — that would have thrown away half the
book's memory every time you tidied something.

### Anansi stops mistaking a cut-off line for narration
When a passage runs out of room mid-sentence, it can end on an open quote mark that never
closes. Every check that reads only the narration — because dialogue can lie and only the
narrator commits the story — was reading that dangling speech as narration. So a character's
line could be flagged as a contradiction, or counted as something the book had established.
Forty-six passages in your library are in that state. They read correctly now.

### Dialogue has a rule again, and it is yours to change
Your books each got one more line in their voice, under Dialogue: a line of dialogue should be
moving information or deepening what is not being said — and a plainly functional exchange is
allowed. "Do you want coffee?" is a real line and the model should not be dressing it up.

It sits in the voice of every book rather than somewhere out of reach, so you can rewrite it or
delete it in any book where it is wrong. The two books with no voice of their own pick it up
from the house voice.

### A room is one room, not a whole character
When you ask Anansi to fill in a single room on a card — the interiority, the voice, an
appearance, a relationship — she was writing you a whole character every time. Three or four
hundred characters of it, for one room, on a card that has eight of them. Cards were coming
back three or four times longer than they should be, and the same person was being described
over and over in rooms that were supposed to be about one thing each.

She now writes a room the length of a room: forty to eighty words, on that room's own subject,
and she is told outright that the rest of the card already exists so she does not repeat it.
Outfits already worked this way and were the only ones that did.

Asking her for a whole new thread is unchanged — that is still the fuller answer you asked for
back in August, and it should be.

**Cards you already have are untouched.** This only changes what she writes from now on. If a
card you already own reads long, it will not shrink on its own.

## 2026-08-29 · You can see what each model is for, and have a cover drawn for you

### Snapshots stop deleting each other
The app keeps twelve rolling snapshots of your library and prunes the rest. It was pruning
the wrong things: any database file sitting in that folder counted toward the twelve,
including snapshots taken by hand before something risky. With twelve of those in there,
every new snapshot was deleted the instant it was written — so *Take a snapshot* had been
reporting a failure, and the automatic one at startup had been failing quietly for days.

It now only ever prunes its own. A snapshot you or anyone else put there by hand is left
alone. The off-disk copies were never affected; those were being kept correctly the whole
time.

### Anansi speaks like herself now
The voice in the chat panel — the one you get from the button that summons her — is older
and more formal than it was. She is a scholar who has watched things rise and fall from the
corner of the room, dry, quietly amused, and she implies rather than boasts. No gestures, no
leaning, no enthusiasm with an exclamation mark behind it.

Three things she still will not do, because a voice is not worth losing a tool over. She
answers first and she lands — no trailing off, no *"but that is only one weaving"*. She does
not borrow the words Thread, String or weave as figures of speech, because those are things
on your screen and it would read as her filing something. And she does not open with an
anecdote about someone she knew, because she never knew them.

This voice is in chat and nowhere else. When she names a chapter, writes a thread, or sums up
a scene, she writes plainly — that text is stored and read back to the writing model on every
call afterwards, and a voice in it would end up in your book by the back door.

### The craft rules are yours now, and they are in your book's voice
The rules about how the prose reads — one strong image, posture over facial cues, no jaw
clenching, lore through action — used to be somewhere you could not reach. They are in
Voice of the weave now, in every book, where you can rewrite any line of them or throw the
lot out. Seven of your books had them appended to the voice they already had; the two with
an empty voice pick them up from the house voice. New books start with them.

They were rewritten on the way, from a list you sent: dialogue that breaks on ambient noise,
speakers who go unfinished, balancing motion against pause, objects that stay where somebody
left them.

One rule was taken out rather than moved. *Begin in action or sensation* is a rule for
opening a scene, and almost nothing you press opens a scene — it was firing on every
three-sentence beat in the middle of one, which is why so many passages started with a body
part moving. It was also telling the model to start something while Narrate was telling it
to pick up mid-thought.

What stays out of your hands is the short list that would break the app if it were switched
off: write prose and nothing else, the canon is true, objects do not teleport, never break
the frame.

Nothing here is measured, and the honest claim is small: the instructions now say what you
wanted them to say, and you can change them. Whether the prose is better is your call.

### "A sample of your prose" is gone, and that is on purpose
The box asked for a few hundred words of your own writing and sent them to the model on
every call. It was empty on every book here, and the reason to stop offering it is a
measured one: finished English sitting in the prompt gets lifted into the prose verbatim,
whole phrases at a time, and the contradiction check cannot see that happening at all. A
page of your own finished paragraphs is the largest possible version of that.

**Voice of the weave still does the work**, and it is the half that was actually measured
— written as an instruction, on its own line, naming narration, it holds the register
about 98% of the time. Nothing that was in the sample box was carried anywhere; no book
had anything in it to lose.

### No book is written with no voice, and the spine is not cut short
Two things about what reaches the model on every call.

Your book's spine — its title, premise, setting and where it is going — had a ceiling
low enough that one of your books was losing the back half of its setting on every
single call, cut off mid-sentence. The ceiling is high enough now that the whole thing
fits, and nothing you have is close to it.

And a book with an empty Voice of the weave used to send no voice at all. Two of yours
were in that state, both imported rather than created here, so they were being written
with nothing but the house rules. An empty voice now falls back to the house voice, on
every call rather than only when a book is made. Clearing the field means the house
voice, not silence — the hint on the field said otherwise and was wrong.

### The model is told who is telling the story
If your book is written in first or second person, Anansi was giving the model two
instructions that cancelled each other: write in first person as Elias, and never write
Elias's thoughts or actions. Then it showed the model a page of Elias thinking and acting
and asked it to continue. Five of your nine books were in that state, and it is the reason
the point of view slipped.

The instruction now follows the grammar. A third-person book keeps the rule exactly as it
was — it was measured and it works. A first- or second-person book is told who is telling
the story instead, and that everyone else is written from outside: what they say, do and
leave behind, never what they think. Where your narrator can only guess, it writes the
guess as a guess.

A book that names who you play now says so to the model. It never did before.

### The premise survives when the prompt is full
The story spine could be shortened when a book got long, and the premise was the first
thing cut while the setting was never touched — which is backwards, because the premise is
usually the only part that names who the book is about. It is kept now, and the setting is
what shortens. Nothing in your library is near that limit yet, so nothing changes today.

### Starting a book is eight steps, in the order the work actually happens
The wizard used to be five steps that put the cast third, the voice last, and asked for your
idea on a screen that vanished the moment you pressed Spark. It now runs: your idea, the
book, you, the cast, a second look, the first scene, the opening, and then it begins.

Your idea is kept and editable, so you can change the sentence everything came from and ask
again from it. Who you play comes BEFORE the cast, because that is a decision about the book
rather than a pick from a list somebody else wrote — and once there is a cast it becomes a
pick over it. The last step says exactly what accepting will create, before you press it.

### Anansi will read your skeleton back and say what she would change
A new fifth step. It is the first moment the book can be read as a whole — your premise was
written before the cast existed, and the cast from a premise you may have rewritten since.
She proposes a replacement for a title, premise, setting or direction, and threads the
skeleton implies and the cast is missing. Every one of them is a press you can skip, and
nothing is applied until you press it. It only runs when you ask.

### Sparking a story is two steps now, and each can be asked again
Spark used to write the whole skeleton and its cast in one go, and if the cast was wrong
the only way back was throwing the lot away and retyping your idea. The book and its people
are separate asks now: you get the title, premise, setting and voice first, and then on the
cast step you say what this book actually needs — characters, places, items, rules, or
nothing at all — and ask for those.

Either can be asked again on its own. Re-rolling the skeleton leaves the cast where it is,
and asking for another cast costs the skeleton nothing. A book with no cast is a real
answer now; it could not be expressed before.

### A contradiction that survives its repair now says so, at the take
Anansi has checked each passage against your canon and corrected it before you see it since
2026-08-25 — but it never looked twice, so it counted a repair it had ATTEMPTED as a repair
that had WORKED, and told you nothing either way. Contradictions that survived turned up
later as red flags, which is exactly the complaint.

The fixed passage is now checked again. If the contradiction is gone you are told it was
caught; if it survived, you are told at the take, while you are reading it, instead of
finding a flag after you have accepted it. Storyteller also shows how often this fires and
how often it works, over the takes where something was actually wrong.

### A library of voices and styles, and your own default voice at last
Save the voice or the house style you are using under a name, and it is there for every
book you write — press one to copy it into the book you are in. They are copies: changing
a book afterwards does not change what is saved, and changing what is saved does not reach
back into books already written.

Storyteller now also shows the voice every NEW book starts from. It has always existed and
been quietly copied into books created with the voice box left blank; there was just
nowhere to read it. Change it and save, and books you make after that start from yours.

### The shelf tells you when a book cannot write
A book pinned to a model the router no longer serves used to fail only when you tried to
write with it, and only said so inside the Storyteller panel. Its card on the shelf now
carries a mark, with the id that is failing.

### Anansi can write the house style for a book
The "How this book is written" field has a button now. It writes from the book's genre and
premise — not from its prose and not from your voice, which are different questions — and
it fills the box and stops. Reading it and pressing Save is still yours.

### A new book can start from threads you already have
Starting a book blank now offers your whole library: search it, pick the characters,
places, items or rules you want, and they are copied into the new book when you create it
— with their trigger words, and without you having to add them afterwards. They are copies,
so the new book owns them and changing one there does not touch where it came from. And
every place that asks for a point of view now shows a line of prose in it, including the
Story panel, which was the last one without.

### Threads: one book at a time, filtered by room, and the card reads in order
The cross-story Threads page now opens on the book you were last writing in, with the
whole shelf one press away, instead of every book at once. Pick a kind and its own rooms
appear as a second row you can filter by — a person's wardrobe and interiority, a place's
atmosphere, and nothing that kind cannot have.

A card's face now reads name, body, everything that is turned on, and then a second section
underneath for everything that is not. That is the difference between what a card holds and
what the model is actually told. And marking a thread finished, or bringing it back, is on
the edit form now: reading a card says what is true of it, changing it is what the form is
for.

### A thread can be read against the whole book
On any thread's own screen there is now "Read the whole book for this thread". It goes
through every passage whose narration names that person, place, item or rule — most recent
first — and proposes what the book has established about them and nobody has written down.
It reads narration only, so a character saying a thing about them is not taken as true, and
it says how many passages it managed to read out of how many name them. Nothing is written
until you accept it.

### The model list says what each one is for
Press the model at the foot of the menu and every model on the box now says what it is
for — writing or roleplay, whether it refuses anything, and whether it is one of the three
that scored highest on prose. Press one and a panel opens with what it is good at, how
fast it has actually written in your library, how much context you get while somebody else
is writing too, and the button that switches to it.

### A cover can be drawn for you
Under the cover on a story's own screen there is now "Have one drawn". It writes a first
line for you out of your setting and your genre, you can rewrite it, and it draws one
picture at a time so you can stop as soon as one is good enough. Only the words in that
box leave your machine — not the premise, and not a line of the prose.

### Sparking a story shows the wizard and nothing else
The empty idea box used to sit beside the wizard after you pressed Spark, and on a phone
it sat above it. It is gone once the wizard is up.

### What changed loads instantly
This page used to be written by the model on the first view after every change, which made
it slow that once and blank when anything went wrong. It is a file kept in the repository
now, written by hand alongside the work.

## 2026-08-28 · You can now retire characters, buildings, and rules, and the app will stop asking about them in future chapters.

### Retirement is now a first-class action.
You can mark a card as finished at the end of a chapter. The app will remember this choice, so retired items no longer clutter your prompts or appear in new scenes unless you explicitly bring them back.

### Retired items stay visible for context.
Even after retirement, you can still see these cards in your Waiting list and on their own faces. This ensures you don't lose track of who or what has been written out of the story.

### Facts now land in specific rooms.
When you accept a fact, you can choose whether it belongs in the card's general body or in a specific room. This prevents the app from overwriting your entire card description when you only meant to update one detail.

### The Ritual screen is now persistent.
The summary of your chapter's progress now survives if you reload the page. You can also see the steps of the ritual before they run, so you know exactly what the app is about to do.

### Navigation has moved.
Your workspace menu is now accessed by clicking the Anansi logo in the top left, and your story menu is accessed by clicking the story title. The old buttons in the composer row have been removed to make space.

### Saving a room no longer erases its timeline.
Previously, saving a room would silently clear its connection to the chapter where it first appeared. This is now fixed, so your character arcs and building histories remain intact across edits.

## 2026-08-28 · The veil now weaves a word instead of a web

### For the veil
You can stop the model mid-sentence now. The animation spells ANANSI down the middle column and fades the rest.

### For the card
You can now edit the card you are looking at. The AI can fill it the same way it fills the threads.

### For the rooms
You can invent any room on a card. The AI can fill it the same way it fills the costume.

### For the routes
You can save a new room. The routes to do so exist.

### For the model
The rooms of a card now reach the model. They obey the same activation rules as an outfit.

### For the connections
Connections are directed. A parent pulls a child.

### For the threads
Threads can retire. A thread can stop reaching the model at a specific chapter.

### For the proposals
Proposals can aim. A proposal can specify a field and an activation.

### For the schema
The activation field is now passed through. It is no longer lost between the schema and the accept path.

### For the wardrobe
The wardrobe moved in among the rooms. It is now one of them.

### For the controls
The controls are one row. Close, Read it and Edit are one row on both views.

### For the face
The face is the default. A view of each thread that only prints out what is filled in with option to turn on or off things.

## 2026-08-28 · You can now manage threads from the composer, and the writing surface is steadier.

### Threads are now a list, not a single entry
The button in the composer now opens the list of threads instead of a single write tray. You can still open the write tray from inside that list, so you can scan chapters for facts or have Anansi write a card without leaving the composer.

### You can assign an outfit to a character from the composer
The write tray now includes an outfit form. When you select it, you are asked whose character it belongs to before you can fill in the details.

### The writing surface no longer drifts or hides text
The composer stays in place while you type, and the text you are writing is always visible. The cursor no longer jumps ahead of the words, and the mirror text matches the input exactly.

### The full-screen mode is less obstructive
The veil that covers the rest of the app is now just a blur, without a dark tint. This lets you see the shape of the page behind the writing without losing focus.

### Mentions are easier to see and create
The @ mention highlight is now visible on all themes, with an underline added to the gold color. You can also type the @ character directly to open the menu, so the dedicated button is gone.

### The Stop button is now on the veil
The composer button stays as Send. If you need to stop the model, use the Stop button on the full-screen veil that covers the page.

## 2026-08-27 · You can now use Chapter autofill, and the model has a new name.

### Chapter autofill is ready
You can now use Chapter autofill; it was the last unbuilt item from round four and is now built.

### Model name changed
The model is now called 'the model' (previously 'write-nt-qwen36-h').

### Web search dropped
Web search is no longer available in the app (though the setting remains for custom URLs).

## 2026-08-27 · You can point at a passage to build a thread of facts, and chapters now close themselves into the ledger.

### You can point at a passage to build a thread of facts.
You can now select a passage and save it as a memory thread. The app extracts facts from that passage and adds them to your chapter’s ledger, so the model remembers specific details without guessing. These facts are proposals, not canon, until you accept them.

### Chapters now close themselves into the ledger.
When you finish a chapter, the app automatically extracts facts from it and adds them to the ledger. This happens in the background, so you do not need to remember to press a button to preserve key details for future chapters.

### Your default model follows you between devices.
Your preferred model is now saved to your account, so you do not have to select it again when you switch devices. The app remembers your choice across browsers and computers.

### Chapters can share the book’s cover image.
You can now choose to display the book’s cover image at the start of each chapter. This option is off by default, so existing books keep their current look unless you turn it on.

### Switching models releases the old one.
When you switch models, the app now releases the previous model immediately. This frees up resources and prevents multiple models from staying active when you are not using them.

### The context bar is now full width and always visible.
The context bar, which shows your word count and context usage, is now a full-width strip directly under the header. It is always visible, even when your context budget is zero, so you can always see how much space you have left.

### The running head and dots handle are gone.
The running head that appeared on scroll is now gone, so it no longer interrupts your reading. The three-dot handle is also gone; you can now open the menu by double-tapping the screen.

### Chapters now propose a title and beat when they open.
When you open a new chapter, the app now proposes a title and a beat for you to edit. These are not saved until you press Save, so you can change them freely before committing.

### You can pull back a chapter’s full prose into the context window.
You can now toggle a setting on each chapter summary to send its full prose instead of its summary. This gives the model more context if it has forgotten something, and you can turn it off again to save space.

### The prose window now cuts at the chapter boundary.
The app now limits the context window to the current chapter and the two before it, rather than including all previous prose. This keeps the context focused and reduces noise, while still preserving the immediate narrative flow.
