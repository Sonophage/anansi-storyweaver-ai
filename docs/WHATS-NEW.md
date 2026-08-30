# What changed

The app's own release notes, served straight from this file by `GET /api/whatsnew`.

**Newest first. `##` is a release, `###` is one thing in it.** Written by hand in the same
commit as the work, which is the whole point: it used to be a model call over the git log,
and it was slow on a cold cache and said nothing on three different failures without
distinguishing them.

Everything below this line was written by that model call, before it was removed on
2026-08-29. Kept because it is the app's history and the notes were true when written.

## 2026-08-30 · Rooms Anansi fills in come back the right size again

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
