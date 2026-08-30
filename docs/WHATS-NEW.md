# What changed

The app's own release notes, served straight from this file by `GET /api/whatsnew`.

**Newest first. `##` is a release, `###` is one thing in it.** Written by hand in the same
commit as the work, which is the whole point: it used to be a model call over the git log,
and it was slow on a cold cache and said nothing on three different failures without
distinguishing them.

Everything below this line was written by that model call, before it was removed on
2026-08-29. Kept because it is the app's history and the notes were true when written.

## 2026-08-29 · You can see what each model is for, and have a cover drawn for you

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
