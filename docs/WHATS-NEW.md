# What changed

The app's own release notes, served straight from this file by `GET /api/whatsnew`.

**Newest first. `##` is a release, `###` is one thing in it.** Written by hand in the same
commit as the work, which is the whole point: it used to be a model call over the git log,
and it was slow on a cold cache and said nothing on three different failures without
distinguishing them.

Everything below this line was written by that model call, before it was removed on
2026-08-29. Kept because it is the app's history and the notes were true when written.







## 2026-11-03 · A thread is edited where you read it

### A renamed thread shows its new name in the list
Rename a thread and go back to Threads, with Back or Esc, and the list shows the new name. It
showed the old one until something else redrew the list.
### This thread as JSON is up to date
Under More, This thread as JSON shows the thread as you have written it so far, and Copy it and
Save as a file give you that. It left out what you had typed since the thread was opened.
### A thread is edited where you read it
There is no separate screen for altering a thread any more. Tap its name, its kind, Always true,
where it stands, its wake words or your notes, and it turns into a box right there. What you type
is kept a moment after you stop, and the last of it when you leave the thread, by Back, by opening
another thread or another tale, or by Esc. What the thread said before goes into Past edits once
for each visit. An emptied Always true is never kept: you are told, and the thread stays open until
it holds something. A thread has four tabs: The thread, Timeline, Pockets and More. More holds
Stitched together, Copy to another tale, Merge with another thread, Read the whole tale for this
thread, This thread as JSON, Retire, Delete (two presses), and Past edits with Put this back.
Moving between the tabs keeps anything you were typing.

### Timeline and Past edits
The Timeline is where a thread stands, scene by scene: the model is sent the entry for the scene it
is writing. Past edits, under More, is what the thread and its pockets said before you changed
them, with Put this back. The model never sees Past edits.

### A pocket saves as you type
A pocket you open on a thread, a string, a rule or one of your own keeps what you type a moment
after you stop. So does where a thread stood from scene 1 in its Timeline. Done, at the top,
closes it, and Undo my changes puts it back as it was when you opened it. What a pocket said
before goes into Past edits once, when you press Done. When Anansi edits a pocket, Use this puts
his version in the box, and Done keeps it.

### A pocket is Off, On a word, or On
Each pocket shows the same eye a thread does. The open eye is On: it is sent every time. The shut
eye is On a word: it is sent only when one of its wake words comes up, and the eye opens to show
when one has. The struck eye is Off: it is never sent, even when one of its wake words comes up. A
tap on the eye goes Off, On a word, On, and back to Off, and shows the new state's name for a
moment. The tale's rules and your own instructions have the same eye. A string, one of your
own, and any pocket or rule with no wake words set, goes Off and On. Clear the last wake word of a
rule that is On a word and it is On; clear the last of any other pocket's and it is Off. An outfit keeps Wear this. A pocket
you add starts On; a new outfit is added unworn. Where a thread holds one pocket of a kind at a
time, such as its appearance or its voice, the one you turn On puts the others Off, so only one is
ever sent; their wake words are kept. A pocket Anansi adds, in Talk or when a scene is
hemmed, is On a word when it has wake words and Off when it has none. Your pockets from before keep
doing what they did: one that was on is On, one that was off but had wake words is On a word, and
one that was off with no wake words is Off. A rule that was on with wake words is On a word, one
that was on without them is On, and one that was off is Off. A pocket comes with
its thread when you import a tale you exported.

### Merge two pockets of a thread into one
Open a pocket and press Merge with another pocket… to pick another pocket of the same thread. The
box opens with both texts joined, and Ask Anansi can make them read as one. Change it as you like,
then press Merge. The pocket you opened stays, with that text, its kind and whether it is on, and
it also wakes on the other pocket's wake words. The other pocket is removed, and its text is kept in
Past edits, so you can put it back. Cancel goes back to the pocket and changes nothing.

### Two scenes can change the same pocket
When two hemmed scenes both change one thread's pocket, or what the thread says, each change is on
its own scene's card. Before, the later scene's change was lost while the earlier one waited for
you to sew it in or reject it.

### A new person found in two scenes is offered once
When two hemmed scenes both find the same new person, you are offered one new thread for them, not
two. Before, accepting both made two threads with the same name.

### Storyteller holds everything about the model
Press the model name at the top of the menu to open Storyteller. In a tale it has five tabs: Model,
Shortlist, Add a model, Your voice and Stats. Everything on Model is this tale's own: the model that
writes it, Plans first, how much he reads, how bold his words are, how many words he weighs, and the
longest a passage runs. A tale whose sliders you have not moved keeps the settings you had. The
model shows as one row: press it to open the list of your other models, and press one to choose it.
Each model is in the list once. What it is, under the list, says what the model is for and how fast
it writes; it no longer has a "Write with this one" button, because the list is where you choose. The model you choose for a tale is also your model from then on: a new tale starts with
it, and so does any tale that has no model of its own. The ＋ at the top,
beside full screen and Close, opens Add a model, the Featherless search. Shortlist is your
shortlist, where you remove a model. Your voice is your voice for every tale, how Anansi talks and
the five modes, which were in Account → Writing. Stats is this tale's last calls. In the library,
Storyteller has Shortlist, Add a model and Your voice. Storyteller is no longer a tile in the tale's
menu, and Account no longer has a Writing page.

### The Tale panel opens on Tale
The Tale panel has four tabs, Tale, Thread, Setting and Keep, and opens on Tale. Tale is one scroll: the
cover first, as large as a thread's picture, then the title, the genre and how the tale began,
then the voice and Spice, which were their own Voice tab. Replacing, removing, drawing or finding a
cover, and how it shows at the head of each scene, are in one fold under the cover, shut until you
open it. A tale with no cover shows the ways to add one straight away. Thread is the tale's own
thread: where the tale stands, its rules, its promises and open questions, and your own
instructions.

### The tale's menu in a new order
The tiles in the tale's menu are Tale, Threads, This scene, Scenes, Strings and Workbench, in that
order.

### One button opens and closes the menu on a desk
On a desk the menu button in the header opens the menu and closes it, in one press, whichever menu
is showing. The arrow at the top of the menu is gone. The icon at the top of each menu takes you to
the other one. On a phone, where the menu covers the screen, its ✕ stays.

### Threads in three columns on a wide panel
On a desk, when you make a tale's Threads full screen, the threads sit in three columns. Beside the
page, and on a phone, they stay in one. The cards keep their size.

### The demo library moved to Account
The Demo library switch is no longer in the main menu. It is under Account, in Your books, beside
Import and Export. While you are in the demo library, the library page shows "Leave the demo
library" at the top, so the way back to your own tales is always in sight.

### Add, and Send to
Where a press makes something new, it says Add: a new pocket, a new Timeline entry, and a new
pocket while you set up a tale. A thread your tale follows from a world has Send to and the world's
name: it sends your words to the world, so every tale that follows the thread sees them.
### Arcana, the new look
Anansi now looks like Arcana: painted, with tarot and art deco in it. The page, the menu and the
side panel sit on watercolour paper, and the gilt is line-work: a chevron rule under each scene's
title, stepped corners on cards, a double gilt frame on the tale you left off in, arched like a tarot
card, with a sunburst behind its name. The first letter of a scene is set in a gilt box over a wash.
Titles are thin deco capitals and labels a clean geometric face; your story keeps whatever font you
chose. The one gold button on a screen has a dry brush through it. Buttons, chips, tabs and the
boxes you type in keep their rounded corners; the stepped gilt corners are for cards, frames and
banners.
### Thin, rounded sliders
Every slider, such as the model's settings in Storyteller and how much of a tale's cover shows, is
a thin rounded line with a small round handle, in your theme's colour.
### Every theme is Arcana in its own colours
Look still has five themes, Arcana, Ink, Grimdark, Sci-fi and Romance, and each one now changes only
the colours. The frames, the stars, the numerals and the suits are the same in all five, drawn in
that theme's accent: gold in Arcana and Ink, copper in Grimdark, steel blue in Sci-fi, rose in
Romance. Every theme has the same watercolour paper under its own colour. Arcana is the look a new
writer starts with, and a look saved with a theme that is no longer on the list opens as Arcana.
### A tale or a shelf card with no cover
A tale without a picture shows a card back instead of a plain wash: a watercolour bloom, a sunburst
and a crescent moon on the painted paper.
### Banners and threads, framed in gilt
A tale's banner over its threads, and the picture at the head of a scene, are framed in gilt with
stepped corners; a banner with no cover gets the card back. On the Threads page a card with no
picture has a painted band where the picture would be, so every card stands the same height.
### A tale's threads are its Major Arcana
Every thread card carries a tarot numeral in a gilt diamond, and the numeral says what the thread
is, not where it sits in the list: every character is I, The Magician; lore is II, The High
Priestess; an item is X, The Wheel of Fortune; a place is XXI, The World. Behind the numeral are its
kind's own stars, drawn as its card: a character is Orion the Hunter as he stands in the night sky,
with his belt, his sword and his bow, lore
two pillars under an arch with a veil between them, an item the Wheel, a place the World's globe. A
thread with a picture keeps it, with the sunburst, the stars and its numeral laid faintly over it;
one without a picture has them over a bloom. A tale's cover, on the shelf, at the top of the Library
and over its threads, gets the same faint sunburst and stars.
### A thread's pockets are its Minor Arcana
Each pocket on a thread is a card of the Minor Arcana. Each kind of pocket belongs to a suit: Cups
for feeling and bonds (relationships, what is kept inside), Swords for word and thought (voice, a
question), Pentacles for the body and the things it has (appearance, outfit, what it does), and Wands
for will and motion (a promise, the air of a place, who is here). A pocket shows its suit's mark in a
small gilt diamond and its rank among the pockets of its kind on that thread, over its name: Ace of
Cups, II of Cups, up to X, then Page, Knight, Queen and King. Its rank stays when you turn it off.
Each pocket is framed like a card, with its kind's own stars faint behind its eye, and the eye is
still what turns it on and off. On a thread with a picture, each pocket card carries that picture
at its head, fading to the dark of the card toward its foot, as the thread's own card does. A kind's
heading, and the tale's Promises and Open questions, show their suit's mark. Strings are cards
too, on the Strings screen and on the tale's own Thread tab: a promise is a card of Wands and an open
question a card of Swords, ranked among its kind, with whether it is a promise or a question and how
long it has waited at its foot.
### No glow along the top
The glow across the top of the screen is gone. What is waiting is still counted on the Workbench in
the tale's menu.
### A drawer stays with its tale
Going to another tale closes the drawer you had open, the hem included, so the next tale opens on
its page. A link that names a drawer still opens that drawer.
### The side panel, spaced evenly
An open thread reads with even room: its name, its tags, its four tabs, then each part under its
own heading with the same space between every part. Rewrite where it stands is a small press under
the text it rewrites. The header's presses sit on one line, and the rule under it runs its whole
width. On the Threads list the kinds sit in one row, starting with All kinds, and on a phone the row
slides sideways rather than wrap. A character's outfits sit just under its card, in line with its
words. Tags are set closer, so a row of them is no wider than it needs to be.

## 2026-11-02 · The library shows who is in your scene

### A quieter thread editor and pocket box
Editing a thread now opens on its kind and its name, set large on a line, with the tabs under
them. Always true is one box, not a box with a Save of its own. Always on
and On a word sit beside Wake words. Asking Anansi is one row at the foot: say what to change, then
Anansi edits. The pocket shortcuts above the tabs are gone; Pockets is one tap away. The short
explanations under each heading now open from the small mark beside it.

A pocket's box is one screen: its kind, its name, its description and wake words, then the same
one-row ask, with Look it up online first under it. Write it and Ask Anansi are no longer two tabs.

A thread's pockets are one tidy list, on its page and on the Pockets tab: no box around each one.
Each row is the pocket's name with its text under it and its switch on the right, grouped under its
kind: Outfit, Relationships and so on. What is off sits under Not turned on, a little dimmer, grouped
the same way.
While you edit a thread, ＋ beside Done at the top adds a pocket, from any tab.

### Bigger thread cards, with the picture behind them
In a tale's Threads, every card is twice as tall. A thread with a picture wears it across the whole
card: dark at the foot, where the name and its lines are, and the picture above. Open a thread and
its picture is up to twice as large as before, fading away toward the name.

### Four themes
Obsidian, Parchment, Cyberpunk, Fantasy and Novelist are gone. Ink, Grimdark, Sci-fi and Romance
stay. A tale or a default set to Cyberpunk now reads as Sci-fi; one set to any of the others reads
as Ink. Ink is the theme a new writer starts on.

### A thread's eye: off, on a word, on
In a tale's Threads, the whole right side of a thread's card switches it. Each tap goes from Off
to On a word to On, and back to Off, and a small label names the state as you tap. Off now means
off in every scene, like putting the thread away, until you turn it back on. Taps answer straight
away, so two quick taps move two steps. New threads start On a word.

### Sent now keeps what you tap, and kind tabs
A thread you tap while Sent now is showing stays on the list until the next passage, so you can
cycle through its states without it vanishing. Under the search, tabs show All, Characters,
Places, Lore or Items.

### Editing a pocket looks like altering a thread
The pocket screen has its two presses at the top, the same tabs and the same name box as when you
alter a thread. It still fills the screen.

### Quote the newest passage in your own instructions
In Account → Writing, your own wording for an action can say {{last}} where the newest passage of
the scene should go, so the instruction can come first and what it works on last.

### Passages stay inside the length slider, and end properly
When a passage gets close to the length slider, Anansi lets it finish the sentence it is in, then
asks for a short ending in the words that are left. A passage no longer runs past the slider, and
it ends as an ending rather than being cut off. With the slider at its left end, nothing changes.

### Put the length slider into your own instructions
In Account → Writing, your own wording for an action can say {{words}} where the length slider's
number should go, for example "Write this in about {{words}} words". Anansi then sends your line
in place of its own "no more than" line. When the slider is at its left end, the line with
{{words}} in it is left out.

### Any panel can fill the screen
On a computer, the button beside Close in a panel's header spreads it over the page, and the same
button puts it back at the side. Threads, Scenes, Strings and the rest each remember their own
choice on this computer.

### The folded menu on a computer is a clean row of icons
When the menu is folded on a wide screen, it now shows one column of whole icons, with the one you
are on marked. Hold the pointer over an icon to see its name. The model's light and the arrow that
opens the menu are at the top, and in a tale the search icon at the bottom opens the menu with the
cursor in the search box.

### Picking who you play starts with who is in the scene
In Speak and Act, pressing the name beside the mode opens a list with a search box at the top.
Under it are you and the characters in this scene, then everyone else. Type a few letters to find
someone further down.

### Where you left off shows the threads in your scene
The row of bars under the title on the library used to count your scenes. It now shows the threads
that are sent in the scene you last worked on, the same bar you see under a tale's header: one line
for each thread, in its kind's colour, dimmed when a word brought it in. Pressing anywhere on it
opens the tale at that scene.

## 2026-11-01 · Hemming starts from what the next scene is

### A scene starts with its own cast
What Anansi is sent in a scene is who is in it from the start and whoever the scene itself names.
Names from the end of the scene before no longer carry over into the next one. And a thread no
longer wakes because one of its wake words is somebody else's name: Lisa is not sent every time
Halsey is mentioned.

### The summary, to read
On the hem, the summary now shows in full at reading size, with Skip, Edit and Use like the drafts
under it. Edit opens it in a big box. Skip removes it, after a second press. And Was and Now show
plain text: the changed words are no longer underlined, since the two buttons already show the
change.

### A new thread starts with one good keyword
Every thread Anansi makes now starts with one wake word: a person's name in one word as the prose
says it ("Marek"), and anything else its name as the prose writes it ("Iron Hands", "Long Stair").
Never someone else's name or an everyday word. You can still add more. Threads that had no wake word
at all were given one the same way, checked against your pages.

### The brief says who starts the scene
Whoever you name in what the next scene is starts it. Anyone else who is always on becomes mention
only for that scene: Anansi is sent them only when they are named on the page. Their eye shows on a
word, and one tap still takes them out or puts them back. A thread is counted as named by its own
name only, so a brief naming Halsey no longer brings in everyone whose wake words mention her. And
Anansi now looks for what the scene needs beyond new people and places: an outfit, what someone is
thinking, how a place feels, for the people in it at the start. They wait on Anyone new as cards to
sew in.

### Fewer "Featherless is busy"
Hemming asks the model one thing at a time. It had been asking two at once, and on a plan that runs
one big model at a time the second was refused, so a step showed "Featherless is busy". A hem takes
a little longer, and its steps finish.

### Each question asked once
Setting up the next scene asks "What is the next scene?" first, holding what you told the hem, and
"Have Anansi suggest another" works from it. It replaces the "Steer it" box, which asked the same
thing and left your brief out. Who is in the next scene is chosen on the hem screen; Anyone new now
just says who, with a button back to that list. The setup's second step is called The brief, so it is
no longer mistaken for the hem's own "The next scene" step, and the help on who is in a scene
describes the eye.

### What you say the next scene is, kept
If the app had been open since before this change, what you wrote for the next scene could be lost,
and Anansi drafted the scene from nothing. It is kept now. And when you leave it empty, the drafts
say Anansi chose the scene, not that they came from what you wrote.

### Hemming, smoother
Start writing no longer writes the first passage for you when the scene has an opening: the opening
waits in the box, in Direct, until you press Send. Pressing Done on who is in the next scene is
remembered on this device, so coming back to the hem does not ask again. Sewing in a change to a
thread you already have keeps its name: it no longer renames "Marek Vale" to "Marek". The hem's
steps say plainly what is next, and the drafts' Use is no longer a second gold button.

### Hemming asks what the next scene is
After you hem a scene, the first question is what the next scene is: its goal, who is in it, and
where. Anansi brings in the threads you name, makes sure where they stand is up to date, suggests
anyone new the scene needs, and drafts how the scene opens and where it is going from what you wrote.
### Use, edit or skip the drafts
The opening and where the scene is going show on the hem's screen, each with Use, Edit and Skip.
Skip leaves that box empty.
### The opening is your first Direct
When you start the new scene, the opening is already in the box, in Direct, waiting for you to press
Send. If you skipped it, the scene starts with a plain Continue.

## 2026-11-01 · The bar shows the threads Anansi is sent

### Anyone new uses the eye too
Who is in the next scene shows each thread with the same eye as the Threads list, in place of the
Always on / This scene only / When it's named pill. A tap moves it On, On a word, Off here, and a
thread you change stays on the list so you can see it. The ✕ takes a thread off the list; on one
already Off here, it changes nothing else.
### A thread's eye shows four states, and a tap moves through three
On: an open eye, sent on every call. Woken: on a word, and its word is on the page, so it is sent
now. On a word: a shut eye, waiting for its word (where a new thread starts). Off here: the eye struck
through, not sent in this scene even if its word comes up. Tapping the eye goes On, On a word, Off
here, On. Off lasts for this scene only. Sent now, and what Anansi is sent, is the On and the Woken
ones.

### A thread that comes in blinks
When a thread joins what Anansi is sent, its piece of the bar blinks three times, slowly. While
the numbers are shut, the bar is dimmer, so it stays out of the way. Open, the two lines are
centred, with What is in it on the left and the threads icon on the right.

### The thin bar under the header is the threads sent now
It used to show the scenes. Now it has one piece for each thread Anansi is sent on the next call,
coloured by kind: characters, places, lore and items each have their own colour. A thread that is
always on is bright; one that a word on the page woke is dimmed. Which scene you are in is still in
the header.
### The numbers under it count those threads
Open the numbers with the handle. The first line counts the threads sent by kind, with the same
colours. The icon on its left opens What is in it; the icon on its right opens Threads on Sent now,
and pressing it again shuts it. The second line has the scene's words and how much of his room is
used.

## 2026-10-31 · The hem keeps every person it reads

### Where things stand no longer reads the next scene's opening
When you hem a scene, or press Rewrite where it stands, Anansi no longer sees how you said the
next scene starts. Where the tale and each person stand is written from the scene that was hemmed,
so the next scene's opening can no longer appear in it as if it had already happened. Naming the
next scene still uses your opening.

### Rewrite where it stands, on every thread and the tale
Under where a thread stands, and under where the tale stands on the Tale's Thread tab, there is a
Rewrite where it stands button. Anansi rewrites it from the last scene the thread was in: where it
is, how they feel and what they want, how it stands with the others, and the scene it was last
seen in. It comes to the Workbench as a card, and nothing changes until you sew it in. Pressing it
again replaces the card.

### Storyteller's sliders have plainer names
Surprise is now How bold his words are, Focus is How many words he weighs, and Passage length is
Longest a passage runs, which reads "up to 400 words" and so on. They work as before.

### New default wording for Continue, Speak, Act, Direct, Narrate and Reweave
The wording each button sends is now the one Seth wrote for his own books. If you never changed a
button's wording in Account → Writing, your next passage uses the new one. If you did, yours is
kept.

### Where a thread stands is short, and says where they are
After a hem, where each person, place or thing stands is at most four short sentences: where it
is, how a person feels and what they want going into the next scene, how it stands with the
others, and the scene it was last seen in. Clothes are not put there: new clothes the scene shows
come to the hem's card as an outfit pocket instead. Anansi no longer copies the
scene into it, and a long one is cut at the end of a sentence.

### Each person in a scene gets their own changes again
On a Featherless model, a hem could read only the last person in its answer. Everyone before
them was lost: where they stand and their new pockets never reached the hem's cards, and the
last person could get the others' pockets instead. Now each person keeps their own.
### Where the tale stands can be changed
On the Tale's Thread tab, tap where the tale stands to open it and change it. It saves as you
type, like the other panels.

## 2026-10-30 · Everything saves as you type

### Altering a passage saves as you type
There is no Save on the Alter box any more. What you type is kept a moment after you stop, and
Done keeps the last of it and closes the box. Cancel is now Undo my changes: it puts the passage
back as it was when you opened Alter. Esc and Back keep what you typed. If a change cannot be
saved, Anansi says so and the box stays open with your words in it. One opening of Alter is still
one entry in the passage's Alterations, however long you type.
### A scene summary saves as you type
When you open a scene's summary and change it, the change is kept a moment after you stop typing.
Done closes it, and Undo my changes puts back the summary that was there when you opened it. To
remove a summary, empty it and press Done twice: an empty box is never saved while you type.
### A chapter's title and summary save as you type
The same for a chapter: its title and summary are kept as you type, Done closes it, and Undo my
changes puts them back as they were when you opened it. A chapter summary cannot be empty, so an
empty box is not saved; Remove this chapter is still how a chapter goes.
### The five modes in your words save as you type
In Account, under Writing, a mode's instruction you open and change is kept a moment after you
stop typing, and when you close it. Undo my changes puts back what it said when you opened it;
Reset still gives you Anansi's own wording.
### A change over time saves as you type
When you open a thread's change over time and alter its scene, what it says or what changed, it is
kept as you type. Done closes it, and Undo my changes puts it back as it was when you opened it. A
new change is still added with its own press.
### Pockets in a new tale's setup save as you type
While you set up a new tale, a pocket you open on one of its threads keeps what you type. Done
closes it, and Undo my changes puts back what it said when you opened it. A new pocket is still
added with its own press.
## 2026-10-30 · The next scene starts the way you say

### A hem you never answered waits for you
If you leave the hem without saying how the next scene starts, where the tale stands and the
changes to the people in it are not lost: the scene's card on the Workbench says they are paused.
Press Run them now and Anansi does them, reading the next scene's opening if you have written one
since. And once you have answered, the hem does not ask again after you reload the page.
### Hemming asks about the next scene first, then who is in it, then shows the summary
As soon as you hem a scene, the hem asks how the next scene should start. What you write is the
next scene's opening, word for word; press Enter and Anansi names the scene and says where it heads
from it, while he finishes reading this one. Then you choose who is in the next scene: take out who
is not, bring in who is, and press Done. By then the hem has usually finished, and it shows you the
summary it wrote and what it found to decide. Nothing is written until you start the next scene.
### A quicker hem
The summary shows as soon as Anansi has written it, once you have said who is in the next scene,
instead of waiting for the rest of the hem. Where the tale stands and where each person stands are
worked out at the same time now. What the hem found to decide arrives about half a minute sooner,
because the suggestions for Anyone new are worked out after it. And Set up the next scene takes you
straight to Anyone new, since the rest is already said.
### The hem's steps are in the order they happen
The next scene and who is in it are at the top of the list now, then the summary, then the rest.
### Where things stand follows how you said the next scene opens
Where the tale stands, and where each person stands, now wait until you have said how the next
scene starts. Anansi reads your opening as context: he writes where things stand at the end of this
scene so that your opening can follow it, and does not write it as having happened.
### Discard one pocket, not the whole thread
On a thread's card, each change and each pocket has a small ✕ that discards just that one. Sew it
in takes the rest.
### Anyone new has suggestions waiting
Once Anansi has named the next scene, he works out who or what it needs that the tale does not have
yet, from the summary, your opening and where the scene heads. They are waiting on Anyone new when
you get there.
### A new scene opens where you said, not where the last one stopped
The first passage of a new scene kept picking up the scene before it, even when you said it opens
somewhere else days later. Anansi is now told plainly that the scene before has ended, and to open
where and when you said.
### A hemmed scene gets a name
When the hem writes a scene's summary, Anansi also names the scene from it, if you have not named it
yourself. A name you gave is never changed. Rename it any time.
### New threads you ask for on Anyone new show there
Have Anansi write someone on Anyone new used to send the thread only to the Workbench. It now
shows on Anyone new, under New threads, ready to sew in.
### A finished hem leaves the Workbench
Once everything a hem found is decided, its card leaves the Workbench, instead of staying there for
the whole of the next scene.
### The hem no longer takes what people say as what happened
When a passage stopped in the middle of someone speaking, the hem could read the rest of the scene
inside out: the lines people spoke were taken as what happened, and what happened was skipped. It
now reads the scene correctly after a cut-off line.
### Where someone stands, scene after scene
If you hem a scene before you decide the last scene's cards, the new scene's change to where
someone stands now shows too. Before, it was dropped while the earlier one waited.
### Deleting the scene after a hem
If you delete the scene after one you hemmed and ask for the next scene again, Anansi now reads the
hemmed scene and names the one after it. Before, it left the hemmed scene out.

## 2026-10-30 · Hemming asks how the next scene starts

### Starting a new tale takes four steps, not eight
A new tale is now The tale, You, The threads and Begin. The tale shows only what every tale needs:
your idea, the title, genre and premise, each with Reweave, Reweave all from your idea, and the Voice.
The rest is folded away: Voice options holds your voice, Anansi's voice and the one he wrote for this
tale; More about the tale holds the story or game it is set in, the world or tale it follows, and the
genre flavour. The threads look and work as they do in a tale: tap one to open it, Always true
first, and its pockets open full screen to change, add or remove. Pasting threads and searching your
other tales are under Bring threads in. Begin puts Try it on at the top, then reads the tale back,
with Change to go back to the title, premise or voice, and asks the setting and how the first scene
opens there and nowhere else.
### Talking to Anansi while you set up a tale is full screen
The chat with Anansi while you spark a new tale used to open as a panel at the side. It now opens
full screen, the same as Talk inside a tale: the conversation above, your box and Send below, and
Past talks, New talk, Fill in the tale and the search switch in the row between. Back, Esc or your
browser's Back closes it and leaves you on the step you were on, with the talk kept for when you
open it again.

### Anansi changes your threads again when you ask
After tonight's change to make Talk more conversational, Anansi stopped making the changes you
asked for: he answered with a stray word like "changes" or "pocket" and nothing happened. That is
fixed, in Talk and in the chat beside a new tale.

### Fill in the tale from your talk with Anansi
When you set up a new tale, talk it through with Anansi in the chat beside the wizard, then press
Fill in the tale. He sets every box that is still empty (title, premise, genre, setting and voice)
from what you have said, and adds the threads the tale needs. What you have written yourself stays,
and each change has its Undo.
### Your talks with Anansi are kept
Every talk with Anansi is now kept as you go, in a tale and beside a new tale you are setting up, so
a reload no longer loses it. Press Past talks to see your earlier talks, newest first, each named by
how it began and when you last spoke. Open one to carry on where you left off. New talk starts a
fresh one and keeps the old. Delete takes two presses.

### Copy what Anansi was sent
Under each of Anansi's answers, Copy prompt copies exactly what he was sent for it: the notes on your
tale, the talk so far, and your last message, as plain text. Paste it into another model, or read it
to see what he knew.

### See each thread's pockets when you spark a tale
On the threads step of a new tale, each thread now shows the pockets Anansi wrote for it (how they
look, how they sound, what they hide), not only what is always true of them. You can rename and
change them right there.

### Talking to Anansi is a conversation
Anansi's chat now works like a conversation: he holds your tale in mind, and your messages and
his replies go back and forth as they were said, instead of being pasted together as one document.
He answers a little more freely and is steered away from saying the same thing twice. The chat
beside a new tale's setup works the same way.

### Talk answers what you said
Anansi's chat now treats something said to him, like "who are you?", as said to him: he answers as
himself, in his own voice, and leaves the story out of it. He no longer turns a reply into a speech
about your story that you did not ask for, or ends by handing the question back to you. He knows
your name from your account, and he no longer gives back an earlier answer word for word.

### A new scene opens the way you set it up
The first passage of a new scene now opens as its "Opens with" says. Before, your Continue asked
Anansi to start where the last line above ends, and the last line above was the end of the previous
scene, so he carried that scene on instead.

### Was and Now no longer open the editor
On a thread's card, pressing Was or Now switches the view again, as it should. On a phone the press
was landing on the text around them and opening it for editing.

### A quicker hem on Featherless
On a Featherless model, a hem now asks for its findings as plain lines of text and turns them into
suggestions afterwards, instead of asking for a structured answer the model could keep writing
inside for minutes. Every step also has a firm length limit there now. If an answer is cut short,
the suggestions it finished still arrive.

### Where the tale stands is quick
When a hem works out where the tale stands, Anansi now reads the scene's summary, which the hem has
just written, instead of the whole scene again, and writes his paragraph as plain text. Where each
promise and open question in play stands is read from the summary too, in one try, as plain lines. Before, he
could run on for minutes and be cut off, and then try again. It ends on a whole sentence.

### One card per thread
What a hem finds is now one card for each thread, instead of one long card with a Sew it in, a
Reject and an Edit on every change. Swipe a thread's card right to sew in all of it, left to reject
all of it, or use its two buttons. To change what it says first, tap the text: it opens for editing
right there, with Anansi edits under it. The scene keeps a small card of its own for its summary and
for anything the hem still needs from you.

### Where the tale stands is quicker
Anansi writes "where the tale stands" as one paragraph with a set length now, so he cannot run on
until he is cut off and has to start again. It ends on a whole sentence.

### Reopen the hem
On the Workbench, a hemmed scene's card now ends with "Reopen the hem", which takes you back to its
hem screen: the steps, what is left to decide, and the way on to setting up the next scene.

### The handle sits under the scene's numbers
When the scene's numbers under the header are open, their handle is now on its own line under them,
in the same place you opened them from.

### Hemming is its steps
The hem screen now always shows its steps at the top: Anansi's six, then yours, deciding what he
found and setting up the next scene. Each is coloured by where it is: grey waiting, pulsing while
Anansi works on it (with what he is doing and for how long), green done, red when it did not run,
and gold for the one that is waiting on you. Underneath, the screen only shows something when you
have something to do: the question about the next scene, a step to try again, the things he found
to sew in or reject (right there, and still on the Workbench too), then setting up the next scene.
Hem it again and Delete are folded under More. The steps stay on top while you set up the next scene.

### The model sits in the middle of the menu
The icon that switches between the main menu and the tale's menu is now on the left of the menu's
top row, with the model in the middle and the close on the right.

### Hemming and the next scene's setup are full screen
The hem screen and the next scene's setup now fill the screen, like the editor, instead of sitting
in the side drawer. While Anansi is still reading the scene you hemmed, the setup waits: its steps,
Skip and Start writing stay shut, with a line saying why, and open as soon as he is done.

### Talk opens full screen
Talking to Anansi now always opens full screen, with the conversation above the box. Full screen's
own button still makes it small, and going back to writing gives you the small box again.

### A handle instead of an arrow
The small arrow that showed the scene's numbers under the header, and the one on top of the box
that folds it away, are now a short handle, like the one on a phone's sheets. They do the same
things.

### Talking to Anansi reads what you ask about
When you talk to Anansi, he is now sent the threads your question names, the ones on the last page
or two, and anything you point at with @, rather than every thread that is always on. The others
are listed for him by name, so he knows they are there and can ask you for one. What he writes
for the story still reads every thread as before.
### One press between the main menu and the tale's menu
At the top of each menu, beside the close, there is now an icon for the other menu. In a tale's
menu, the three lines open the main menu. In the main menu, the web opens the menu of the tale you
are in, or of the tale you had open last. The menu changes where it is, and the page under it stays
as it was until you choose something. Before, getting from a tale's menu to the main menu meant
leaving the tale.

### A scene picked in the menu puts the menu away
On a phone or a tablet, pressing a scene in the tale's menu opens that scene and closes the menu, so
you land on the page and not on the menu still covering it.

### The menus' buttons are one size
The squares in both menus are now the same size, the Demo library one too, and every scene and tale
in the lists is at least as tall as a fingertip.

### Hemming asks you how the next scene should start
Press Hem this scene and the hem screen stays open. At the top it asks how the next scene should
start. While you write your answer, Anansi gets on with the rest: the summary, where the tale stands,
the changes to the people in it, new threads and the threads it is done with. When you press Ask
Anansi for the next scene, he names it and writes how it opens and where it heads from what you
said. Leave the box empty and he chooses. You can watch each step tick off as it finishes.

### The next scene gets what Anansi wrote for it
The name, Opens with and Heads toward that Anansi writes for the next scene now go into that scene
straight away, so they reach him when he writes its first passage. If you have already typed in one
of those boxes, he leaves it alone. Once you have started writing the scene, he does not change it.

### Asking again with a new direction changes the boxes
On the next scene's setup, asking Anansi again with a new direction now replaces what he wrote
before, including how it opens. Only what you typed yourself is kept.

### Anansi's ideas: one for each way to write
The bulb under the last passage now gives four ideas, one for each way you write: a line to Speak,
something to Act, a Direct for Anansi, and a passage to Narrate. Each is labelled with its mode and
edged in its colour. Pick one and it goes in the box in that mode, ready to send: a spoken line as
dialogue, an action or a passage as prose for the page, a direction as an instruction.

### One ＋ on the tale's Thread tab, and a tap opens what is there
The Thread tab under Tale no longer has a form for each thing you can add. One ＋ opens the same
screen a pocket opens in, where you pick what you are adding: a promise, an open question, a rule
or one of your own. Rules and your own are rows now, like promises and open questions: tap one to
change it, remove it or switch it off.

### Summaries and chapters open with a tap
Under This scene → Summaries, each scene summary and each chapter is now one row. Tap a scene
summary to open it on its own screen: change it, see how many words it is, summarise it again, or
pull the scene back so its prose is sent instead. Tap a chapter to change its title and summary, or
to remove it. Cancel and Save are at the foot of each. Gathering scenes into a chapter works as it
did.

### Over time: one ＋, and a tap opens a change
A thread's Over time tab no longer has a form under its list or a Save button on every change. The ＋
beside Over time opens a screen to add a change: the scene it starts from, whether it is hidden or
hinted before then, where the thread stands from that scene on and what changed. Tap a change to open
it on the same screen, change it, save it or remove it. Where the thread stands now is still written
on The thread tab.

### Clearer hem steps
A step that failed now says "Did not run" and why, in plain words, with its own Try again. Try again
says "Trying…" while it runs. Each step has one name everywhere, and "Hem it again" replaces the
separate block of re-run buttons. An answer from the model that came back broken now says so in
plain words.

### Start writing takes you to the page
On the next scene's setup, Start writing used to open the drawer of what Anansi reads, full of
numbers, over the scene you wanted to write. It now shuts the drawer and leaves you on the page.

### The door to the hem says where it goes
On This scene, the button that opens the hem had the same words as the gold button inside that
actually hems the scene. It now says "Hem this scene…" while the scene is open, and "See how it was
hemmed" once it is hemmed. Nothing is closed until you press the gold button inside.

### The box on Anyone new has a name
The box under Character, Place, Lore and Item starts with where your scene heads, and it looked as
if you had typed into the wrong place. It now has a label, "What Anansi writes them from", and a
line saying why it is already filled.

### Steadier screens on a phone
The scene's numbers under the header keep "what is in it" on one line. The Workbench stays one
height as you move from card to card, so Back and Next do not jump under your thumb.

### One gold button on a new scene
A blank new scene showed Full screen and Send both in gold, with a gold ring round the box. Send is
the only gold button now; Full screen is an outline, and the box turns gold only while you are
typing in it.

## 2026-10-29 · A tidier hem card, a Workbench that says what is new, and merging threads

### Small grey words are easier to read
The small grey words around the page ("hold to talk", "on this machine", the little web you press
to read what a setting does) are a shade brighter, in every theme, so they can be read on the page,
in a drawer and in the menu. The word Woven over a passage Anansi wrote is brighter too, in its own
colour.

### The menu on a phone has a cross to close it
On a phone the menu fills the screen, and the only way out was a small arrow beside the model that
looked like it opened the model list. It is a ✕ now. The menu's rows each have their own picture:
Report an issue is a beetle and the demo library is a shelf of books, so neither shares a picture
with another row.

### The model page shows a dot, not code
For the admin, the model page printed a scrap of code between the words and the tokens, where a
dot belongs. It shows the dot.
### The Workbench gives one number
The menu and the Workbench now count the same cards. Before, the Workbench could show one card
fewer until you opened it again, and the first time you opened a tale the header could call a card
new that had been there all along. The header's mark still counts what is new since you last
looked, and on a phone it now says "new" beside its number.

### One Sew it in on each Workbench card
A card with one thread on it has one Sew it in and one Reject, at its foot. The second pair inside
the card is gone. A card with several threads still lets you decide each one. Anansi edits is bigger
to press, and the box beside it says "What to change (optional)" so it fits on a phone.

### Strings is back in the tale's menu
Strings has its own tile again, beside Threads. A tale with no strings yet says what a string is
and where to press ＋ to add one.

### This scene: the name comes first
In This scene the name box is right under its label, with Have Anansi write these below it. The ✕
beside each scene in Scenes is gone, because it was easy to press by mistake. Delete a scene from
This scene; it still asks twice.

### Hemming shows its steps in order
The hem screen lists what hemming does as steps, in the order it does them: the summary, where the
tale stands, changes to the people in it, new threads, threads it is done with, and the next scene.
Each is marked done or not yet. Hem this scene is the one gold button there.
### Merge with another thread opens again
Pressing "Merge with another thread…" in a thread's menu did nothing: the merge screen shut the
moment it opened. It now opens, and stays open until you merge, press Cancel or go Back.

### The tale is no longer a card at the top of Threads
The tale's own thread (where it stands, its rules, its promises and open questions, your own
instructions) lives on the Tale panel's Thread tab, so the card that led there from Threads is gone.

### Storyteller says which settings are this tale's and which are yours
The Storyteller now opens on "This tale": the tale's model, Plans first, and how much he reads.
Below it, "Yours, on every tale" holds how he picks words, which you set once for every tale. The
warning at the top that said none of it was per tale is gone, since the model is. Your default
model is still changed from the model named in the menu, and Account → Model now says so plainly.

### No more Save on the Tale, This scene and Storyteller
What you type on the Tale and This scene saves itself, a moment after you stop typing and again
when you leave the box. The Save at the top of those panels, and of the Storyteller, is gone. Your
name on your account saves when you leave the box too. When Anansi writes the style note, or you
copy a voice in from your shelf, it is saved straight away, and a "Put back what was there" button
under the box brings back what you had before.

### Changes show as Was and Now
Wherever a change to a thread is shown (the Workbench, Alterations, Talk, Ask Anansi), you now see
the text as it will read, with the changed words underlined, and a Was / Now switch beside it. Press
Was to see how it read before, with the words that went marked. No more red and green crossed
through each other in one small line.

### Who is in it: one line each
On the next scene's setup, each thread in the scene is now one line: its name, what kind it is, and
one pill that says how it comes in. Press the pill to move it on: Always on, then This scene only,
then When it's named. Press the name to read the thread. ✕ still takes it out of the scene.

### Hemming on Featherless no longer stalls
A hem asks Anansi six things about the scene. On some Featherless models one of them could run on
for minutes before it gave up, so a hem took nine minutes and still missed "where the tale stands".
Each of those answers now has a generous length limit on Featherless, so one that runs away is cut
and asked again in seconds. Your passages still have no limit there.

### What Anansi writes is marked Woven
A passage Anansi wrote no longer wears the name or the colour of the action that asked for it.
It is marked Woven, with a line down its side in a colour of its own that none of the actions
use. Your own passages keep their action's name and colour, so reading back you can tell what you
did from what he wove. A line you speak is now shown in the same highlight as speech in the prose.

### The model you pick shows at once
Picking a model while you are in a tale now updates the model named at the foot of the menu
straight away, and the list lights the one that is writing. Before, it went on naming the old one
until the tale was opened again. A tale set to its own model in Storyteller still names that one,
because that is what writes it.

### Talk with Anansi in the composer, not a drawer
Talking to Anansi now happens in the box at the bottom of the tale: hold the quill, pick Talk on the
dial, or press Alt+T. The conversation sits above the box, and Full screen gives it the whole
screen. The Talk drawer is gone from a tale; anything that used to open it now turns the box to
Talk. "Anansi may search", Clear, and a directive he drafted for you are there too. The
conversation lasts until you leave the tale, as before. (While you set up a new tale, Talk is still
the drawer beside it.)

### Talk answers sooner on Featherless
Some Featherless models kept writing well past their answer, and Talk could sit for four minutes
before it replied. Talk's answers now have a length limit there, so a runaway answer is cut and
asked again, cooler, in seconds.

### Back after closing a drawer
Closing a drawer with its own ✕ and then pressing Back now goes back where you came from, instead
of stopping on the same tale a second time. A drawer opened over Reading mode no longer ends it.
### Ask Anansi to change your rules, your own instructions and your strings
In Talk, Anansi can now do more of what you ask in so many words. He can add a rule, change what it
says or its wake words, and switch it on or off. He can add one of your own instructions for the
whole tale, change it, and switch it on or off. He can put a string in play, set it aside, tie it
off, let it go, or reopen it. And he can change the tale's title, genre, voice and style note, as
well as its premise and setting. Each change shows in the conversation with Undo, and where text
was replaced you see the old and the new. He now sees every rule, instruction and string by name,
with whether it is on and where each string stands, so he can find the one you mean. He is not
shown the voice or the style note, so give him the whole of what either should say.

### Rules live on the tale's own thread
A rule of your tale is no longer a thread of its own. Rules are on the Tale panel's Thread tab, under
Rules: each has its name, what it says, and its wake words. With no wake words a rule is sent every
time; with them, when one comes up. Your existing rules moved there with everything they said, and
the update report on the tale says so. New tale and Read the scene no longer suggest rules as
threads. Anansi in Talk can add, change and switch them too (below).

### Tap the tale to carry on, and choose how much Anansi reads
The big card for the tale you were last writing no longer has a Carry on writing button: tap
anywhere on it to carry on. Its genre now sits on the left under the last line, and its word count
on the right. A dot in its corner still says the tale has something waiting for you.

In Storyteller, "How much he reads at once" sets how much of this tale Anansi reads before each
passage: all that the model holds, or a smaller amount. Less is faster and keeps him on the recent
pages.

### Instructions that no longer pull against each other
A few of the instructions Anansi is sent were telling the model two things at once, and they no
longer do. At the two gentlest spice levels, the scene is no longer told to end at the kiss or to
jump past the door mid-scene: the camera stops there, and time only skips at a scene break. Direct
and Continue no longer carry a length of their own beside the one you set. "How this book is
written" now describes the texture of the genre (what it notices, what it lingers on) and leaves
how the narration sounds to your voice, so the two cannot disagree. New tale no longer puts the
spice level into the voice it suggests. The shipped voice no longer overrides the spice level.

### ✦ tries once more on a Featherless model
When ✦ asks a Featherless model for ideas and the answer comes back cut off, Anansi now asks once
more before showing an error. On some models the second try can take as long as the first.

### A hem cut off by a restart no longer hems forever
If the app restarted while it was hemming a scene, that scene used to say it was still hemming, for
good. Now the card says the hem was stopped by the restart, and each step it did not finish has a
Try again beside it.

### Hemming reads what your pockets say
When a hem looks at what a scene changed for each thread, it now sees what each of the thread's
pockets says, not only their names. It is told never to offer back what a thread already says, and
now it can see what that is.

### The tale's own thread has its own tab
The tale's own thread now lives in the Tale panel, on a new Thread tab: where the tale stands, its
rules, its promises and open questions, and your own instructions for the whole tale. The first card
in Threads opens it. The setting and the voice stay on their own tabs.

### Passage length is a limit now
The length you set is now sent as a limit ("no more than"), not a rough aim, so passages should stop
closer to it. At the most explicit spice level, the instruction no longer tells the model to keep
going for as long as the scene runs; it says a scene can carry on in the next passage.

### New tale writes a voice Anansi can follow, and a sharper genre
When New tale suggests a voice for your book, it now writes it as a list of rules, one per line,
instead of a paragraph describing the prose: what the narration sounds like, what it never names,
which tired phrases it avoids, how dialogue and the slow build work in this genre, and what a passage
ends on. Rules on their own lines are the ones the model keeps to. The genre it suggests is now the
shelf a bookshop would use, not the broad category.

### Direct no longer asks for a rewrite
The instruction Direct sends now opens **Write what happens next, based on this:** instead of "Re
write what happens based on this:". Some Featherless models read "Re write" literally and gave back
the passage above almost word for word, with your instruction dropped into it. If you wrote your own
Direct prompt, it is used as written.

### A model's page says how much it reads and how fast, in words
Each model's page now says how much Anansi reads at once (the context) and how fast he writes, in
words. A Featherless model is no longer shared: it reads as much as the model holds, and its cost is
counted on your own plan.

### The glow at the top is bigger, and only for chalked threads
When a thread is chalked and waiting for you, the line at the top of the screen is now thicker and
glows further down. Strings in play no longer light it.

### Reading mode keeps the spacing you write with
In reading mode the passages sat closer together than while you write, because the label over each
passage was taken away with the space it used. The label is still hidden while you read, but its
space stays, so the page is spaced the same in both.

### Every passage is set in the same type
Lines of speech were set in a smaller size and a different font from the narration around them, and
a passage that opened on a quote changed font with it. Now every passage is set in your reading
font, at your reading size and line spacing, whichever button wrote it. The speaker's name still
sits above a spoken line, and the coloured line and the label still say which button wrote it. The
first passage of a scene now has its large first letter when you wrote it yourself, too.

### No box round the last passage
The newest passage, and the one being written, had a box round them in the colour of the press that
wrote them. The box is gone. Each one now has the same coloured line down its left side as every
other passage, so the page reads as one column of prose.

### Speech and emphasis stand out on the page
Words in quotation marks are shown in your theme's accent colour, and the quotation marks stay.
Words between single asterisks are shown in italics, in a softer tint of the accent. Words between
double asterisks are shown in bold, in the accent colour. You do not see the asterisks while you
read, and a passage that is being written looks the same as it does when it is finished: the
asterisks do not show and then go. This changes only how the
page looks: your text keeps its asterisks, and Alter, export and Anansi still see them. An
asterisk or a quotation mark with no partner stays as it is.

### Reweave tells Anansi what didn't work
When you reweave a passage, Anansi gets the passage's own instruction again. It does not see the
version you have now. For part of the day it did, and Anansi carried on from that version, or gave
the same version back word for word. So now, if you say what didn't work, Anansi gets your note
instead.

### Strings you have decided stay decided
The Workbench dealt every open string back to you on each visit, even after you put it in play. Now
a string is on the Workbench only while it waits for you: newly chalked, or a hem's update to it.
Put it in play, set it aside, tie it off or let it go on the Strings screen or the tale's page.

### Hold Reweave to change the instruction first
A tap on Reweave now reweaves at once, for every passage, with the passage's own instruction. To
change it first, hold Reweave (or Alt+click it at a desk). That opens the Reweave box, for any
passage. The box has two fields: the instruction, and What didn't work. The instruction holds the
direction you gave that passage, as you wrote it, so you can change it. A passage you gave no
direction opens with it empty, and empty runs the passage's own instruction again. What didn't
work is optional. If you fill it in, Anansi reads it after the passage's instruction. If you leave
it empty, the reweave asks exactly what the passage was first asked.

### A hemmed scene's card shows each thread once
The card now reads in this order: the scene summary, then the threads. Each
thread is one block with its name and kind. All of its changes are in that block: where it stands
now, each pocket, and a retirement. Each change shows the old text against the new text. You can
sew in or reject one change, or the whole thread at once. The tale's own thread is the first block.
It shows where the tale stands and where each string stands. Each new thread has its own block.

### You set up the next scene in one place
A hemmed scene's card ends with one button, Set up the next scene. It opens the next scene's setup
at The next scene, with Anansi's title, note and opening already in the boxes. The card no longer
has its own boxes for the next scene, Something else or Use these. What you saved for the next
scene shows in the boxes in place of Anansi's idea.

### Choose who is in the next scene on Anyone new
Anyone new is now the one place where you choose who is in the next scene. Each thread in it shows
as a block with its name, kind and pockets. Choose how each one comes in: This scene only, Always
on, or When it's named. Press ✕ to take a thread out of the scene. Type in the box to find another
thread and bring it in. A new thread that you sew in on this step gets the same choice. The new
threads from a hemmed scene are on Anyone new and not on What it left. What it left no longer shows
the scene summary, which stays on the Workbench. The tale's setting is behind the ⓘ mark.

### Merge two threads that are the same one
When one person has two threads, open either one and choose "Merge with another thread…" in its
menu. Pick the other thread, then pick which one stays. Anansi writes the one thread they make:
its Always true, where it stands now, and its pockets. You see each part beside what the thread
that stays has now, and you can change any of it. Merge keeps it, and the other thread is deleted.
Its wake words, scene pins, Over time, chalked changes and earlier versions move to the thread
that stays. Cancel changes nothing.

### The header tells you when the Workbench has something new
When Anansi adds something to the Workbench (a suggestion, a string, a summary that needs writing
again), a small Workbench mark with a number appears at the top of the screen, beside the menu
button. The number is how many things were added since you last opened the Workbench. Tap it to open
the Workbench, and the mark goes away. This device remembers what you have seen, tale by tale.

### The Workbench number in the tale's menu sits beside its icon
In the tale's menu, the Workbench number sat on its own line at the right edge, and made that row
taller than the others. It is now beside the Workbench icon, and the icons and names line up again.

### Write your own words around What didn't work
Account → Writing has a new box after the five modes: When you reweave. It holds the words a
reweave puts around your What didn't work note. It starts with Anansi's own wording, and you can
change it. {{whatfailed}} is where your note goes. If you leave What didn't work empty, nothing from
this box is sent. Reset puts Anansi's wording back. If what you saved here earlier today had
{{replaced}} in it, Anansi's wording is used in its place. If it had no {{whatfailed}}, it is kept,
after Anansi's wording. The heading above the modes now says only the five modes. Saving one of
these boxes also no longer empties the voice box above them.

## 2026-10-28 · A new tale starts at its opening

### The passage length stays where you set it
The Passage length slider (and Surprise and Focus) went back to "let him decide" whenever the server
restarted. They are kept now. Moving one slider no longer puts the others back where they were: the panel keeps
what you saved.

### A new passage starts at the top on a short page too
When you press Continue or Reweave, the new passage's label moves to the top of the screen so you
can read it as it is written. In a scene with only a little text, the label stopped lower down.
Now it goes to the top there too.

### Reweave keeps the old version hidden while it writes
While Reweave wrote a new version, the old one could come back on the page under it if anything
redrew the page. Now the old version stays hidden until the new one is in its place. If you stop
the Reweave, or it fails, the old version comes back.

### Change what a string is, and where it stands
Open a string and the box now shows what it is, a Promise or an Open question, and you can
change it: pick the other one and Save. It is the same string, and its history stays with it. An
open question is not owed by any scene, so a promise made a question loses the scene it was owed
by. Under that are four choices for where it stands: In play, Set aside, Tied off and Let go. Each
works at once, the same as the buttons on the Workbench, and Strings and the tale's page show
the change straight away. You can also ask Talk to make a string a promise or an open question,
and Undo puts it back the way it was.

### Your strings are on the tale's own page
Open the tale's own thread, the first card in Threads, and under Rules you now find its Promises
and its Open questions. Each is listed as it is under Strings: its name, a line of it, and its
On or Off switch. Tap one to open it. The ones still open come first, and the ones tied off or let
go come after them. Each list has its own Add button, which opens the box with that kind already
chosen. Strings still has the same lists, as a shortcut. The Chapter panel no longer says that
chalked strings wait under Strings: they wait on the Workbench.

### Add a string the way you add a pocket
The ＋ at the top of Strings opens the same full-screen box a pocket opens in. Choose a promise or
an open question, give it a name and say what it is; a promise can also say the scene it is owed
by. The small form under the list is gone. Ask Anansi works here too: he writes a new string for
you, or rewrites one you have, and you see what he changed before you press Use this. He keeps to
the kind's rule: a promise is something set up to be paid off, an open question stays open, and
neither says what happens next. Nothing is kept until you press Save.

### Ask Anansi in Talk for a string
Ask Anansi in Talk to add a promise or an open question, or to change one the tale has, and he
does it at once. A new string is in play straight away. The change shows in the conversation with
what it said before, and Undo puts it back. A string he notices without being asked is still a
card on the Workbench, and an open question he offers is sewn in as an open question, not as a
promise.

### Strings move with the tale
A string, a promise to pay off or an open question to keep open, now belongs to the tale's own
thread, and it changes as the tale does. When you hem a scene, Anansi also writes where each string
that is on stands now. It shows on the scene's card beside where the tale stands, with what changed
marked, and nothing changes until you sew it in. The old version is kept. A string Anansi offers
is a card on the Workbench, and Sew it in puts it in play at once. The Strings screen is now a list:
each string's name, its first line and its On or Off. Press one to change it, full screen, as you
change a pocket. Tied off and Let go switch a string off and mark it. Switch it on again and it is
open again. Anansi tells the model about a promise and an open question in different words: a
promise may be pressed toward payment, and a question is never answered. The next time Anansi
starts, the strings your tales already have move onto each tale's thread, and the tale's update
report names them.

### One place to add and change a pocket
A thread's Pockets tab is now a short list: each pocket's name, the first line of what it says, and
its On or Off. Press a pocket to open it full screen. There you write it yourself, or ask Anansi to
write it or look it up online. When he rewrites a pocket you already have, you see what he changed
before you press Use this, and nothing is kept until you press Save. The ＋ at the top of a thread
adds a new pocket the same way. Outfits are still worn and taken off from the list. Always true
stays on the thread's first tab, and a thread that has none now gets an empty box for it there.
Tidy has a broom for its icon.

### Always true saves again
Saving a thread's Always true said a pocket needs a name, and nothing was saved. Always true has no
name, so it now saves with what you wrote, and only refuses when the box is empty. The ✕ that removed Always true is gone too: every thread
keeps one, and you change it by editing the text.

### Knots are gone
Anansi no longer reads each passage for places where it disagrees with your threads. It marked a
tale's own version of its world as mistakes, and its Mend rewrote prose you had kept. The red knot
lines under passages, the knot cards on the Workbench, and Mend, Ignore and Watch it again are
gone with it. Your prose and your threads are not changed. The next time Anansi starts, the knots
it had already found are removed, and your tale's update report says how many.
### A new tale starts in your own Voice
A tale you start from an idea now begins with the Voice you set in your Account, or Anansi's own
when you have not set one. The Voice Anansi wrote for the idea is shown under yours, with what it
would change marked, and a Use this button. It is only used if you press it, and Undo puts yours
back.
### The setting holds the place, and the first scene holds the weather
New tale's setting now says only what stays true of the place for the whole tale. The weather,
the light and the time of day come back on their own, as how the first scene opens, in a box you
can edit on the preview. Anansi reads that until the first passage is written, so a tale that
opens on a rainy night does not stay on a rainy night forever.

### The premise is the opening, and the open questions are strings
New tale's premise is now one paragraph that opens the story: who we are with, where and when,
what they want now and what is in their way now. It never says how it ends, what it costs or what
anyone will do, so Anansi starts the story instead of steering to its end. Rewriting the premise,
or asking Talk to change it, keeps the same shape. The questions the story lives on come back on
their own, ticked, in the preview. Each one you keep ticked becomes a string from the first scene,
and Anansi is told not to answer it yet. Tales you already have are not changed.

### A Hands-off narrator gets one rule, not two
When the character you keep Hands off is also the one telling the story, in first or second person,
Anansi was told two things at once: to write what they decide, and never to write what they think
or decide. Now it is told one thing. It writes what they see, hear and remember, goes around what
you wrote for them, and stops where they would speak, act or choose. What they say, do and decide is
yours. This applies to the tales you already have.

### A new style note is about the sentences, not the story
When Anansi writes a style note for a new tale, it now says how the prose reads: how long the
sentences run, how close the telling sits, what it notices and leaves unsaid, and how much is
dialogue. It no longer says how chapters end or reuses the premise's images, which steered every
passage toward one ending. Style notes you already have are not changed.
### New tale's threads start where they stand, and Try it on finds what disagrees
Each thread New tale makes now says who or what it is in Always true, and keeps what they want and
what they hide in their inner life, so those can change as the tale goes on. Each one also says where
it stands as the tale opens, which you can read and change in the preview, and which becomes its
first entry in Over time. People are always on; places, lore and things come in when their name does.
Try it on now reads every thread whole, pockets included, and lists each place where two of them, or
a thread and the premise, disagree: both places, what each says, and a fix. Use this puts the fix in
the draft; Leave it keeps what you have. Nothing is saved until you start the tale.

### Anansi reads where the tale stands, not how it began
Each time you hem a scene, Anansi also writes one paragraph on where the tale stands now: the
situation and what is in play, never what comes next. It is on the scene's card on the Workbench,
with what changed from the last one marked word by word, and you sew it in or reject it. Once one
is sewn in, Anansi reads it in place of the premise for every scene after, and Talk does too. The
premise stays in the tale's settings as how the tale began, with where it stands now beneath it.
Tales you already have change at their next hem.

### Your promises are pressed, the tale's questions are kept open
A string is now one of two kinds. The open questions New tale makes are kept open: when Anansi
suggests a scene, he may complicate one but never answer it. The promises you set up yourself, and
the ones Anansi chalks, are pressed toward paying off again, as they were before. Every string you
already have is a promise.

### No more borrowed details in your characters
Anansi's own note on how to write a thread used to show one made-up character as its example, and
Anansi sometimes copied her into yours: charcoal on the fingertips, hair she cuts herself. The note
now shows only the form, so the details in a new thread come from your tale.

## 2026-10-28 · Tidy this thread, made safe to use on a whole library

### See exactly what changed, word by word
When a thread changes, you now see which words went and which came in. Words that were taken out
are struck through. Words that were put in are underlined. This shows in a thread's Earlier
versions, where each old version is set against the one that replaced it. It also shows on
Workbench cards, where what is there now is set against what Anansi chalked. And it shows under
each change Talk made, beside its Undo. It reads on a phone and in every theme.

### Tidy leaves "their lines are yours" alone
Tidying the character you play, or the one you keep Hands off, no longer touches the pocket that
says their lines are yours. Anansi does not read it and does not offer a new voice in its place.

### Where a thread stands is plain text now
The box that says where a thread stands (Info), and each Over time entry, now hold only the
description: no square brackets and no name in front, the same as pockets and Always true. Anansi
writes them that way, tidying and hemming included, and adds the thread's name when he reads them.
Ones you already have were cleaned once, after a backup, and the update report names each one.

### Tidy joins two pockets that say the same thing
When a thread has two pockets of one kind that overlap, such as two about the same person, Tidy
offers one pocket that holds both. The card says which other pocket it replaces, and sewing it in
leaves one pocket where there were two. The pocket that goes is kept in the thread's Alterations,
and putting it back from there makes it again, switched off.
Tidy's pockets now replace the thread's old pockets of the same kind, even when it does not name
them, so a tidied thread never keeps an old pocket beside its new one. Kinds Tidy does not answer
stay as they were, and so does every pocket you have switched off: Tidy does not read it, does not
change it, and does not switch it back on.

### Tidy changes where a thread stands now, not where it started
When a thread has an Over time entry for the scene you are on, Tidy's change to where it stands now
goes into that entry, under its own label. Before, it rewrote the thread's text from scene 1.

### A deleted pocket can be put back
In a thread's Alterations, an old version of a pocket that has since been deleted can now be put
back. The pocket comes back switched off, under its old name; one deleted before today comes back
named "Put back", for you to rename or move.

### Tidy settles Always true against where a thread stands
If Always true and where the thread stands disagree, such as an age of 34 in one and "in his 30s"
in the other, Tidy keeps the later or more exact one, offers the change to the other, and the card
says which it kept and why. That can mean a change to Always true, which you sew in or not.

## 2026-10-28 · Holding the one you play, in New tale

### Anansi writes pockets the way you would
When Anansi makes or tidies a pocket, he now writes a plain description ("short, clipped lines;
says aye for yes"), not an instruction to himself. The instruction is added when the scene is
written, so your boxes hold only what the thread is like.

### "Also keep … off the model" appears as soon as you name who you play
On the You step of New tale, typing who you play now shows the button that keeps them off the
model, and offers them under Hands off, as soon as you leave the box. Before, neither appeared
until you went to another step and came back.

## 2026-10-28 · Tales set in a story or game, through your Worlds

### Talk knows the story or game from your own version of it
In a tale that follows a World, ask Anansi in Talk to change someone, and he puts the change
where it belongs. A fact of the story or game itself goes to the World, so every tale that follows
it has it. Your own version goes to this tale only: the tale gets its own copy of that thread, and
the World keeps its version. Each change has Undo, as before. When he cannot tell which you mean,
he changes nothing and asks you in one line. Only you change your own Worlds; a writer you called
into a tale cannot change them through Talk.

### Name the story or game in Talk while you set up a tale
While you set up a new tale, tell Anansi in Talk that it is set in a story or game ("it's set in
Elden Ring"), and he fills in that box on the first step for you. Then it works as if you had typed
it: the tale follows your World of that name, or the story or game is looked up for a new World on
The threads. He does not make its people as threads himself; they come from the World. Undo takes
the name out again, and the tale follows no World.

### Name the IP, and the new tale follows your World
The first step of New tale now asks whether the tale is set in a story or game that already
exists. Name it. If you already have a World with that name (in any capitals), the new tale
follows it, and the preview lists that World's people coming in with it. They are the World's
threads, not copies: change one in the World and it changes in every tale that follows it. The
Begin step names the World the tale will follow, or says No World.

Nothing is made until you press Start writing, and if starting fails, nothing is left half made.
Only your own Worlds are found. Leave the box empty for a tale of your own, as before. A name you
have no World for is looked up, as the next entry says.

### A new story or game becomes a World of the people you choose
Name a story or game you have no World for, and Anansi looks it up. On The threads he lists about
twelve people and six places, one line each, all ticked. Untick who you do not want, ask for more,
or add someone by name. The preview shows who will come in.

When you press Start writing, Anansi makes a World with that name, writes each ticked person and
place as one of its threads (what they are, and how to write them), and your tale follows it.
Only the ticked ones are written, one at a time, so a long list takes a while. If any of it
fails, nothing is made, and your draft is still there to try again.

If the search is off, fails or finds nothing, the names come from what Anansi already knows. Each
one is marked "from memory, not looked up" in the list and the preview, so you know which to
check. The mark is never in the thread itself. If the lookup fails, or you would rather not, press
Go on with no World: the tale keeps the name and follows nothing.

### Mark who of the World is in the opening, and play one of them
In the preview, each person of the World has a box: In the opening. The people you mark are always
sent for the first scene, even when nobody names them, and after it they come in like everyone
else. They stay the World's threads, so a fix in the World still reaches the tale.

On You, the World's people are offered to play and to keep Hands off. When you play one, or keep
one Hands off, this tale gets its own thread for them, made from the World's. The one you keep
Hands off is written from the outside in this tale only. The World's thread does not change.

### Threads you bring in are part of starting the tale
The threads you pick from your other tales on New tale, and turning off "Anansi writes the first
passage", are now part of Start writing itself. If a picked thread cannot be brought over, the tale
is not made and your draft is still there; before, the tale was made without it. Start blank works
the same way now.

### A tale's universe always names the World it follows
When a tale follows a World, the universe or IP in its Tale settings is that World's name, so the
two never say different things. Rename the World, and every tale that follows it takes the new
name too.

### Bring in a thread of the World your tale follows
In a scene's setup, you can now tick a person or place from the World your tale follows, the same
way you tick one of the tale's own. Before, Anansi said "that scene or thread is not in this tale".
The thread is sent for that scene and stays the World's: a change to it in the World reaches the
scene. Your pins from before are all still there.
If the tale stops following that World, or follows another, its ticks on the old World's
threads come off. Its own threads stay ticked. If you make the tale's own copy of a World thread
you ticked, the tick moves to the copy, so the scene still gets that person. Give the copy back to
the World, and the tick moves back to the World's thread. Remove a World thread from the tale, and
its ticks in that tale come off.

### A thread's boxes hold only what it is
Always true and every pocket now hold a plain description, and nothing else: no square brackets,
and no thread name in front. That is true of what you type, and of what Anansi writes there when
he looks a thing up online, writes a new tale's people, makes a World, changes a thread in Talk,
or sews in a change from the end of a scene. While you set up a new tale, the box under each name
shows only the description. Anansi still tells the model how to use each one when he writes.

Threads you already have are cleaned once, when the update starts: the brackets and the name in
front come off, and nothing else in the text changes. A copy of your library is kept first, and
each tale's update report lists every box that was cleaned.

### Every change to Always true or a pocket can be put back
When Always true or a pocket changes, the text it had before is kept. That is true when you change
it, when Talk changes it, when Talk's Undo puts it back, and when you accept a change Anansi
offered. The earlier versions are with the thread's others: open the thread, choose Earlier
versions, and each one is named as you know it (Always true, or the pocket's name). Put this back
returns it, and the text it replaces is kept too. Talk's Undo still works as before, and what it
does shows here as well. A pocket you have deleted cannot be put back, and Anansi says so. A tale's
own pockets are not kept this way yet.

## 2026-10-28 · Anansi changes what you ask him to

### Ask in Talk, and it is done
Tell Anansi "make Talia thirty", "give Morgott a slow, formal voice" or "add the ferryman as a
character", and he does it at once. You no longer find a chalked card on the Workbench and sew it
in. Each change shows in the conversation, naming the thread and what changed, with Undo beside
it. Undo puts back exactly what was there, or takes away a thread he made. A thread you have
changed since he made it stays.

If he cannot do what you asked, because there is no thread by that name or that kind of thread
has no such pocket, his answer says so. What he suggests without being asked is still chalked, as
before. He never deletes a thread, and he never writes or changes prose.

### The tale, its scenes, and what changes over time
Talk can now change more when you ask:

- The tale's premise or setting: "make the premise darker".
- A scene's name, or where it heads: "call scene 3 The Ford".
- A thread's Over time: "from scene 4 Vel is blind in one eye" adds that change from scene 4, and
  the scenes before it stay as they were.
- When a thread reaches Anansi: "keep the letter always on", or "bring in Charon only when someone
  says ferryman".
- Retirement: "get rid of the letter" retires it from the next scene. It is not deleted, and you
  can bring it back.

Each one has Undo, which puts back what was there: the old premise, the old name, the Over time as
it was, the old wake words, or the thread back in the tale. If you name a scene the tale does not
have, he says so and changes nothing.

If you have changed something yourself since he changed it, its Undo says so and leaves your
change alone.

### Anansi chooses his own searches
The switch under Talk now reads **Anansi may search**, and it remembers what you set it to. With
it on, Anansi decides when a question needs the web, and writes the searches himself: a name, or a
name and your tale's world, which finds the wiki pages rather than essays. He searches at most
three times for one answer, and not at all when your tale already answers the question. With the
switch off, nothing goes to the web.

Every page he read is listed under his answer, with its link. When he makes or changes a thread
from a page, that page's link goes in the thread's notes, which only you see. It never goes in
the thread itself, so it never reaches the model. Undo takes the link out of the notes again.

If web search is not set up where Anansi runs, the switch says so. If a search fails, Anansi still answers,
without the web, and says the search failed.

### Talk while you set up a new tale
Every step of a new tale now has a **Talk** button. It opens the same Talk window your tales have,
and Anansi reads your whole draft, with the step you are on first. Ask him about the world, the
plot, the characters, or how to fill in the step. He says nothing until you ask.

Ask him to change the draft ("make the premise darker", "remove the innkeeper", "give Ilva a slow
voice") and it is done at once, with Undo beside it, and the step shows the change. What he
suggests without being asked has an **Add** button, and "add them" in your next message adds them
too. If you typed in a box, on any step, he does not change it unless you name it: "change the
premise" does.

He may search the web here too, when you let him. Nothing is saved until you start the tale, and
Discard throws the conversation away with the draft.

## 2026-10-28 · No blink when Anansi finishes

### The page holds still when a passage lands
When Anansi stopped writing, the header above the page faded in again and the prose slid up a
line. Now the header is left alone when nothing in it changed, the hint under the buttons keeps
its place while he writes, and the page stays where you were reading.

### The passage stays where it was written
The new passage still jumped up when it finished, by the height of the line under the passage
before it ("Tap a passage for its actions", and "written while you were away"). Those now go when
you press, so the passage lands exactly where you watched it written. It is boxed as the newest
passage from its first word, and keeps the box when it lands.

### Reweave without a blink
A new version from Reweave faded out and back in when it finished. Now it stays on the page as it
was written, the same as a passage from Continue. And the page no longer slides up a line under
the top bar when its first word arrives: it stays where it was put at the press.

## 2026-10-28 · The tale's menu, rearranged

### Model on top, scenes beside the menu
Inside a tale, the menu now shows the model at the top. Under it, the scenes run down the left,
newest first, and scroll on their own; beside them, two columns: Tale and Storyteller, then This
scene and Scenes, then Prose search, Threads and the Workbench. Strings, Talk to Anansi and What he
reads have left the menu: strings wait on the Workbench, Talk is the quill held down, and What he
reads is "what is in it" on the strip under the header.

Search is a bar across both columns: type and press Enter to search the tale. The Anansi name at the
top of the tale's menu is gone, and the button that closes the menu sits beside the model.

The main menu has the same shape: the model at the top, your tales down the left (most recent first),
and the menu as tiles beside them. The Workbench has its own icon, a bench, instead of sharing the
threads' rings.

A tale with a picture shows it behind its row in the main menu, and behind each of its scenes in
the tale's menu, under a dark wash and fainter the further down the list it is. The search bar sits
at the foot of the tale menu's two right-hand columns.

## 2026-10-27 · Steer the next scene, and ask for something else

### A direction for Anansi, and Something else
In This scene, and on a hemmed scene's card for the scene after it, there is a box for a direction
("she stays, he runs") and a Something else button. Anansi writes the title, opening and where the
scene is going again, following your direction and steering away from what is there now. On the
card the new version is saved straight into the next scene; in This scene it waits for Save.

## 2026-10-27 · No more contradiction check

### Anansi no longer checks each passage for contradictions
After each passage, Anansi used to read it against your threads and mark knots. It often marked a
tale's own take on its world as a mistake, and its result redrew the page a few seconds after every
passage. It is switched off. Knots it already found stay on the Workbench until you deal with them.

## 2026-10-27 · The Workbench, easier to move through

### A hem says what it is doing
While a scene is being hemmed, its card says which part Anansi is on and for how long, such as
"Writing the character memory… 3 min", so a slow model no longer looks stuck.

### Six new threads at most from one hem
A hem now chalks up to six new threads. Any more it found are named on the card, and Chalk these too
adds them without asking Anansi again.

### Change the next scene on the hem card
A hemmed scene's card now has boxes for the next scene's title, where it is going, and how it opens,
holding what it already has or Anansi's suggestion. Change any of them and it saves when you leave
the box.

### Back and Next under the cards
Moving between cards on the Workbench is now a Back and a Next button under the cards, big enough to
press, with where you are between them.

### Ignore sets aside one knot
Ignore on a knot used to stop every knot about that character for the rest of the scene. It now sets
aside only the knot in front of you. Ignoring every knot about someone is still there, as its own
button inside the card.

## 2026-10-27 · Remote models are not cut short

### Only the length slider shapes a remote passage
A model on Featherless is no longer given a word limit for anything: a passage, Talk, hemming, the
cast. The length slider is the one thing that asks for a length. If a remote model runs away, a
passage is stopped at three times the slider's length (or about 4,000 words with the slider off)
and marked as cut, and any other call is stopped after five minutes. The model on this computer
keeps its limits, which are what let two writers share it.

## 2026-10-27 · Anansi's words land as they were written

### No more reformatting when he finishes
While Anansi wrote, his passage showed as one block with blank lines, and the moment it finished it
was set again as indented paragraphs with each line of speech on its own. It is now set that way
from the first word, so nothing moves when it lands. The first passage of a scene gets its large
first letter while it is written, too.

### Hemming no longer opens a drawer
Pressing Hem this scene used to open What he reads over the new scene. It now leaves you in the new
scene.

### A softer fade, and the fade is optional
The fade from the picture into the page is softer, easing in and out instead of a straight line.
A new switch, Fade it into the page, turns it off, so a picture can be faded, blurred, or both.

## 2026-10-27 · Hemming no longer makes you wait

### Hemming chalks less
When you hem a scene, Anansi is now asked to offer a change only for a thread the scene acts on,
not for one it only mentions, and to leave alone pockets nothing in the scene touched. A change
that only says what the thread already says is dropped. Anansi is asked to see the character you
play and the Hands off character from the outside only, and nothing about what they think or feel
is offered. It offers changes for six threads at most, and names the rest. When a scene changes a person from
the World your tale follows, the change becomes that person's own thread in your tale, from the
next scene on, and the World stays as it was.

### The next scene opens as soon as you press Hem this scene
The next scene opens at once, blank, so you can start writing straight away. Anansi hems the scene
you left while you write: the summary, what changed for each thread, new threads, threads to
retire, and a title, note and opening for the next scene.

### One card on the Workbench for each scene you hem
Everything one hem finds now waits on one card, not a card for each thread. The summary comes
first, and you can change it there; it saves when you leave the box, and from then on it is yours
and a later hem keeps it. Each
thread that changed shows how it stands now and what it would become, with Sew it in and Reject
beside it, and Sew all and Reject all take the whole card at once. Each thread folds to its name
and one line until you open it, so the card reads on a phone. Threads past the six are named, with
a button to ask for them. Use these puts Anansi's title, note and opening into the next scene's
setup, and nothing is saved until you press Save.

The card says when Anansi is still hemming, and it fills in on its own when he is done. If a part
did not run, the card names it and Try again runs that part alone. If you change the scene after
it was hemmed, the card says it is out of date (it comes back if you had cleared it), and Hem again
reads it afresh; what you already
sewed in or rejected stays as you left it. Cards from before this change are as they were.
## 2026-10-27 · A new tale asks who you play first, and shows you everything before it is made

Once nothing on a scene's card is left to decide, Dismiss takes it off the Workbench for good. What
you sewed in stays, and Hem again brings the card back.

### You say who you play before the threads are written
When you start a tale from an idea, the You step now comes right after the tale and before the
threads. Pick one of the threads so far, or name someone new and say who they are in a line or two.
Anansi writes the threads with them in, and they get a thread of their own even if you skip the
threads.

### Your character is written from the outside
If you keep Anansi's hands off your character, their thread says only what others can see of
them: no voice and nothing from inside their head. It also gets a voice pocket that says their lines
are yours, so you do not have to add it to each tale.

### Threads say how to write, never what happens
The threads Anansi writes for a new tale, and the ones Try it on suggests, come with pockets that
tell him how to write each one, and he is told not to say in them what will happen next. Try it on's threads now
have pockets too. Anansi suggests a rule only when the idea needs one.

### A preview before the tale is made
After Try it on there is a preview of everything that will be made: the tale's own thread at the
top (premise, setting, Voice, rules and your own instructions for the whole tale), then every
thread, folded to its name. Open a thread to change, remove or add a pocket, or remove the thread.
The thread of the character you play stays while you play them. Undo takes back the last change.
Nothing is saved until you start the tale.

### A warning when the Voice and the point of view disagree
If your Voice says one person or tense and the point of view says another, the preview tells you,
and one press takes that sentence out of the Voice. You can still start the tale with the warning
showing.

## 2026-10-27 · Deleting a scene takes one press

### Delete a scene from the Scenes list
Every scene in Scenes has a ✕ beside it. Press it twice and the scene goes, with its prose.

### Deleting the scene you are writing in just works
Deleting the open scene used to be refused if the scene before it had been hemmed. Now the latest
scene left opens again so you can keep writing there, and the message says which. Only the very
last scene in a tale cannot be deleted.

## 2026-10-27 · The picture behind the prose

### Blur it, or put it on the right
With a tale's picture kept behind the prose, two new settings: a slider for how much it is blurred,
and a switch to show it on the right, fading to the left.

### How much of it shows now reaches further across
The slider used to change only how strong the picture was, so past a fifth of the way it seemed to
do nothing. It now also moves where the page takes over, so the picture reaches further across as
you raise it.

### The page stays put after Anansi finishes
A few seconds after a passage landed, the page jumped to the bottom, past the words you were
reading. A redraw that changes nothing now leaves the page exactly where you are. Only a new
passage arriving, or moving to another scene, moves it.

### The picture no longer blinks when Anansi finishes
The picture behind the prose was drawn again every time the page was, so it blinked when a passage
landed. It is now drawn again only when you change it.

### A bigger head on a scene with a picture
The picture at the head of each scene, and the scene's name on it, are a little bigger.

## 2026-10-27 · A character's voice no longer hides who they are

### Voice pockets that describe a whole person work again
Since yesterday, every voice pocket told Anansi to show it "only in what they say" and never in the
narration. Where a voice pocket also describes who the character is, that kept their personality
out of the narration entirely, and a tale told from their side went flat. It now only asks the
narration not to name how they sound, such as their accent.

## 2026-10-27 · A shorter tale menu

### The tale's menu fits in half the height
Inside a tale, the menu shows Tale across the top and the other nine as small tiles in two
columns, icon over name. Nothing left it, and the order is the same.

### No planning count above the middle button
The "Planning… 12s" count no longer sits above the middle button while Anansi plans a passage. It
still shows in the passage being written.

## 2026-10-27 · Your Account, and your own Featherless key

### Account
The menu has an Account row, with five pages. You: your name and a picture. Model: whether your
own Featherless key is in place, and the model that writes your tales. Look: theme, font and size.
Writing: your voice for new tales, how Anansi talks to you, and the five modes in your words, which
used to sit in the middle of the Storyteller. Your books: Import, Export and What you have written,
which have left the menu for here.

### Each writer has their own Featherless key
Remote models now run on your own Featherless plan. In a tale someone shares with you, they run on
the owner's. Without a key of your own you write on the local model.

## 2026-10-27 · Anansi is he, and the Rack is the Library

### The Rack is now the Library
The first screen, where your tales are kept, is called the Library everywhere: the menu, the way
back from a tale, and the demo.

### The tale's own thread is a banner
At the top of Threads, the tale's own thread now wears the tale's picture, or the colour its card
has in the Library, and its page opens under the same banner.

### Anansi's writing lands without a flash, and starts at the top
When Anansi finishes a passage, it no longer fades out and back in: it stays as it was written.
When you press, the new passage's label (Continue, Speak, Direct) moves to the top of the page,
just under the header, and Anansi writes down from there. You do not have to scroll to start
reading; whatever runs past the bottom of the screen is there when you scroll down. The label sits
below the chapter lines, and the space kept for it goes when you delete a passage.

### Anansi's answer to your line is set as his, in your font
In Speak, Anansi's answer to what your character said was filed as your character's own speech:
drawn as a speech bubble with their name on it, in the app's font instead of the book's. It is set
as narration now, in the font you chose, both while he writes it and after.

### Fifteen fonts: five serif, five sans, five easy to read
Look → Font now lists three groups of five. Serif: Instrument Serif, Literata, EB Garamond, Lora,
Spectral. Sans: IBM Plex Sans, Inter, Source Sans, Nunito Sans, System. Easy to read: Atkinson
Hyperlegible, Lexend, Andika, Inclusive Sans, Readex Pro. If you had picked Iowan, Garamond,
Cormorant, Crimson Pro or Monospace, your prose now shows the nearest of these.

### The tale's menu starts with Tale
Inside a tale the menu now reads Tale, This scene, Scenes, Prose search, Threads, Workbench, Strings,
Talk to Anansi, What he reads, Storyteller: the writing first, then what the tale remembers, then
Anansi and the model.

### A thread's menu is shorter, and Tidy has its own button
Open a thread and Tidy this thread is now an icon at the top, beside the menu button, which shows
sliders instead of three dots. Everything else is one list in that menu, with no folds inside it.

### Passages you ordered count as yours when you play a character
In a tale where you play someone, a passage Anansi wrote to your order is now marked as yours when
he reads it back. Before, an order like "he laughs and tells her his name" left a passage that
looked like Anansi writing your character, and he took it as leave to do it again. A pocket saying
your character's lines are yours is no longer framed as a way to write them.

### The default Voice no longer sets second person
A new tale's starting Voice no longer says "second person, present tense". The tale's own point of
view is the one place that decides it.

### Prompts to take elsewhere is now Export
The page of prompts you hand to another model, whose answers come back in whole, is called Export.

### Anansi is "he"
Every screen, tip and note now calls Anansi "he": What he reads, How he talks, Ask what he would
change.

## 2026-10-27 · Deeper blur, more fonts

### The full-screen boxes sit on a darker, softer page
Alter, Reweave and the full-screen writing box now darken the page behind them more and blur it
further, so the box you are typing in is the only thing that reads.

### Six more fonts for the prose
Look → Font now offers Literata, EB Garamond, Lora, Cormorant, Spectral and Crimson Pro beside the
six already there. They are fetched the first time you open the Font tab or pick one.
## 2026-10-27 · Small fixes

### The tap hint reads over a picture
"Tap a passage for its actions" now has a soft edge of the page colour behind it, so it can be read
over a tale's picture on the dark themes.

### Woven passages from a remote model keep to their length
When a remote model weaves and runs past its length, its plan now counts toward that length, as it
already did while a passage streams in. Before, a passage that arrived all at once could land
longer than the length it was given.

## 2026-10-26 · Fuller threads, and a deck that moves on

### Every card moves on
Ignoring a knot or summoning a string on the Workbench now moves on to the next card, as sewing in
and rejecting always did. A card you swipe flies off the side, and the note that follows names the
thread, so two cards in a row for one person no longer look like nothing happened.

### A new thread knows where it stands
A thread Anansi finds in a scene now arrives with where it stands as well as who it is and its
pockets. Sewing it in makes that its first entry in Over time.

### A new tale's cast arrives fleshed out
When you start a tale, each person and place Anansi offers comes with its pockets (how they talk,
what they wear, what they hide, what a place is like) written as instructions, and switched on from
the first scene.

### Pockets read as instructions
Every pocket Anansi writes now starts by telling the writer what to do, such as "Write her lines
short" or "Never let her say she is afraid", rather than listing traits for the prose to repeat.

## 2026-10-26 · Gold means press here

### One gold button on a screen
Gold now means one thing: the button to press. Each screen has one filled gold button for its main
action. The row you are on in a menu, the mode you have chosen, a picked chip and a tag are bright
ink instead. Labels are their own quiet colour. The light at the top when something is waiting, and
the Workbench row with something on it, are the warning colour, because they are notices.

## 2026-10-26 · The tale's own thread

### The tale is the first thread
Threads now starts with the tale itself. It holds the premise and the setting (what is always
true of the tale), the Voice, the tale's Rules, and instructions of your own for the whole tale,
such as "keep it a slow burn" or "the narrator never names him". Your own instructions are sent
to Anansi every time while they are switched on.

### Rules live on the tale
Rules are listed on the tale's own thread rather than as a group in Threads, and you add a new one
from there.

## 2026-10-26 · The Workbench is a deck

### One card at a time
The Workbench now shows one card at a time: everything Anansi chalked for one thread, a knot, or a
string. Swipe right, or press the right button, to say yes: sew it in, mend the line, or summon
the string. Swipe left to say no: reject, ignore, or let go. The arrow keys do the same. A card you
reject can be put back with Undo.

### Upkeep is on the deck too
Summaries that are out of date or missing, chapters that need writing again, scenes out of reach,
threads you ignored for a scene and threads you retired are cards on the deck as well. Swipe right
to fix it (write the summary, open Chapters, watch it again, bring it back) or left for not now.

### Edit, or have Anansi edit
Open a part of a card to change its words yourself, or press Anansi edits, with a few words about
what should change or none, and he writes that part again. It stays chalked until you sew it in.

### Chalked
What Anansi suggests and you have not decided is now called chalked, not basted.

### Hemming shows the same deck
The page after you hem a scene shows what it found as the same deck, and lists the threads that
are always sent but were not in the scene, so you can check them.

## 2026-10-26 · Hemming looks at every thread

### Hemming reads every thread the scene names
When you hem a scene, Anansi now looks at every thread its narration names, places, lore and items
as well as people, and offers what changed: where each one stands now, written out whole, and any
pocket the scene gave it something new for. Everything he offers for one thread comes together,
with the line of the scene it came from. A thread with no Always true yet gets one offered.

### Threads come out fully fleshed
When Anansi reads a scene and finds someone new, the thread arrives whole: who or what it is,
plus every pocket the scene gives him enough for (for a person: how they look, how they talk, what
they will not say, who they are to the others, what they wear). When you hem a scene he also
starts the pockets a thread it names does not have yet, if the scene shows enough for them. The
card shows the pockets a new thread arrives with before you sew it in.

### Pockets are instructions
Anansi now writes pockets as instructions for the next scene (how he talks, what he wears, what
to show when a place is in a scene) rather than descriptions for the prose to repeat. A voice
tells the model to show the voice only in what is said, never to describe it in the narration.

### Tidy this thread
A thread's ⋯ menu has Tidy this thread: Anansi sorts an old, mixed thread into who or what it is,
where it stands now, and pockets written as instructions. Nothing changes until you sew it in.

### A new thread starts with who it is
A thread Anansi finds in a scene now arrives with its text as Always true.

## 2026-10-26 · Over time

### Info is now where it stands
A thread's Info is now Where it stands now: what the model is told about where the thread is at
the scene you are writing. When a later scene has changed it, that later version is the one shown
and the one you edit, with the scene it is from beside it.

### Places
Places are their own kind of thread now, beside Characters, Lore and Items, with their own
pockets: how it looks, what it feels like, and who is there. Your Lore threads stay Lore: the
update's page in Tale settings → Keep lists them with a press that makes any one of them a place.

### What they wear, and when they were retired, by scene
Putting an outfit on or taking it off now counts from the scene the tale is open at, and so does
retiring a thread or bringing it back. Going back to revise scene 2 no longer dresses her in the
coat she put on in scene 5, and a thread retired in scene 4 and brought back in scene 6 is sent
again from there. Each of these is listed in Over time with its scene.

### Over time, from scene 1
Over time lists every version of where a thread stands, in scene order. The first one is where it
stands from scene 1, and each later one shows the scene it is from, a few words for what changed,
and the parts that are new since the one before.

## 2026-10-26 · Always true

### Facts is now Always true
What was called Facts on a thread is now Always true: who or what the thread is, for the whole
tale. It is shown first on the thread, above where it stands now, and it is always sent with the
thread, so it has no on or off switch. Anansi never changes it on a thread you already have; when
he finds something permanent about one, he offers it as a change to where it stands instead.

### Role, history, where it came from and what it covers moved too
These were pockets. They are now part of Always true, each under its own name, so they are sent
every time. A thread you paste in or look up online that has them gets them the same way.

### What the update moved, per tale
The update's page in Tale settings → Keep lists, for each tale, the Always true that were switched
off, the pockets that moved, the threads whose Always true and Info both say something (check that
they agree), and the threads that have no Always true yet.

## 2026-10-26 · What an update moved

### A page that says what an update moved
Tale settings → Keep has a new page, What the update moved. When an update to Anansi moves
something in a tale (for example, a thread's text into a new place), it says what moved, with a
link to the thread. For the first week it also says when the backup was taken and how to put
everything back. Until an update moves something, it says that nothing has moved.

## 2026-10-26 · The bar after you send

### The planning count is on the bar
In a tale that weaves, the "Planning… 12s" count now shows above the quill on the three buttons
while Anansi plans, since Send folds the box it used to sit beside.

### Send folds the box
When you press Send, the box folds away and the three buttons come back at once. While Anansi
writes, Stop is the button on the right, faded like the one on the left. What you typed waits in
the folded box until the passage lands, so if you stop him it is still there.

### The page holds still when he finishes
When Anansi stops writing, the page no longer drops and slides back, and the passage he just
wrote is not wiped in a second time.

### Alter and Reweave look like the box you write in
Cancel, Save and Reweave are ordinary-sized buttons again instead of running the height of the
screen, and the text has no frame round it.

### Messages at the top
Short messages now appear at the top of the screen with a shadow under them, instead of in the
middle of the page.

## 2026-10-26 · Altering a passage, full screen

### Alter opens the full-screen box
Alter on a passage now opens the same full-screen box you write in, with the passage's text in
it: Cancel on the left, Save on the right. Cancel, Esc and Back close it; if you changed
something, they ask first. A double tap in it selects a word and nothing else. When it closes,
the page is where you left it.

### The same type before and after
A passage Anansi is writing is now set in the same type it will have when it lands: a line of
speech arrives as speech, with the name above it, instead of changing font at the end. It
carries its label from the first word too, such as Speak · Aldis Fen or Continue. The Alter box
shows the passage in the same type as the page.

### The page stays still when a passage lands
When Anansi finishes writing, the page no longer jumps to the top or the bottom. It stays where
you were reading.

### The keyboard on an iPhone
With the keyboard up on an iPhone, the page now stops at the top of the keyboard: the header
stays where it is, and the box and the bar sit just above the keyboard instead of under it.
## 2026-10-26 · Deleting a branch, and the scenes behind you

### Delete a branch
This scene → Branches has a Delete button on every branch you are not on. Press it twice and that
branch goes, with every passage on it. The branch you are on, your threads and every other branch
stay. To delete the branch you are on, switch to another first.

### The scene lines under the header
The thin line under the header has a piece for each scene. The scenes before the one you are in
are dimmed now instead of nearly invisible, so you can see how far the tale has come.

## 2026-10-26 · A quieter header, and words out of a blur

### His web is the menu
In a tale, Anansi's web at the top right now opens the tale's menu, and the ⋯ beside it is gone.
Talk to Anansi is the last row of that menu.

### The numbers under the header are folded away
The row under the header with the scene, the words, how much of his room is used and What is in
it is a small ⌄ now. Tap it to show the numbers, and tap again to hide them. What is in it still
opens what he reads. Your device remembers which you chose.

### Writing
Each word Anansi writes comes up out of a blur. Stop is gold and holds still. A new version of a
passage no longer shows a message saying so; the new version on the page says it.

## 2026-10-25 · Your tale, big, on the rack

### The tale you were last in
The tale at the top of the rack now fills the screen, down to the words The rack at the bottom;
scroll down for your other tales. Its picture fills it; a tale with no picture gets your theme's colour, and
rings breathe slowly out behind the title either way. It says where you left off and how long ago,
the title, the scene you are in, a bar for each scene, and your last line in a glass card with the
genre and how many words. Carry on writing is the one button. It has a small gold dot when the
tale has threads basted or strings not tied off. Read from scene one, the room used and the two
owed buttons are gone from it: the Scenes list in the tale opens scene one.

## 2026-10-25 · Every model, for every writer

### Models that take the whole plan
Every writer can now find and add a Featherless model that takes three or all four of the plan's
units, not only the admin. Find a model shows them, and the units filter goes up to 4. While one
writer writes with a model like that, the other writer's passage waits, tries again for about
twenty seconds, and then says Featherless is busy.

## 2026-10-25 · A new thread in one box

### New thread
The + at the top of your Threads opens New thread. Type a name, or paste in a thread from Prompts,
in the one box at the top. Under Write it as, pick Character, Lore, Item or Rule (Character is
picked until you choose another), then press Write it: the thread is made with that name and opens
for you to write it. A pasted thread is read in as it is, pockets and all. Under Or let Anansi there
are three cards: Write one for me, from what you typed or his own idea; Look it up online, for the
name you typed; and Read the scene, for facts already on the page. All three use the kind you
picked. Back or Esc goes back to the list. Pockets are added from the thread itself now, on its
Pockets tab.

### Altering a thread, smaller fixes
With the keyboard up, the box for wake words now sits a little above the keyboard instead of
touching it. A thread you open from a passage now goes back to reading it when you press Back
while altering it, and asks first if you changed something, the same as in the Threads list. On
the Threads page for every tale, Esc now works as Cancel on a wide screen, and Cancel and Esc there
ask before they throw away what you changed.

## 2026-10-25 · The quill

### Three marks at the bottom
The three buttons at the bottom are marks now, with no words: ↻ Reweave, a quill in a circle, and
✦. Tap the quill and the box comes up, with everything around it, and nothing is written. While
the box is up the three buttons go away. To put the box away without sending, tap the small ⌄ on
its top edge, press Esc, or tap the page above it; what you typed stays in it. Hold the quill to
talk to Anansi, as you held Continue before; with the box up, Talk to Anansi is on the How you are
writing menu. ✦ is Continue now: Anansi writes the next passage, with no box needed, and while
he writes ✦ is Stop. Around the three buttons the bar is see-through, so a tale's picture
behind the page shows through it.

### Send with nothing in the box
With the box up, Send makes Anansi write. Leave the box empty and he just carries on. While he
writes, Send is the Stop, and there is only one Stop on screen.

### Ideas under the last passage
Anansi's three ideas for what comes next are behind a small bulb under the last passage now, beside
"Tap a passage for its actions". Tap it, pick one, and it goes in the box for you to change or send.

### The title opens your threads
Tap your tale's title at the top to open its Threads. The ⋯ at the top right opens the tale's menu,
as it did. The Threads menu above the box is gone: the title opens the list, and the + at the top
of the list adds a thread.

## 2026-10-25 · Three buttons at the bottom

### Altering a thread
Alter has Cancel and Save at the top. Save keeps your changes and goes back to reading the thread;
Cancel goes back without them, and if you changed something it asks first: press Cancel again to
throw the changes away. Back on your phone does the same. If a save is refused, it says so, and
what you typed stays. The tabs are as they were: The thread, Over time, Pockets and More. The
picture and the kind are under More now. Wake words are one chip each: tap × to take one off,
and type a word and press Enter or a comma to add one. A pasted list becomes chips. When the
keyboard opens on a phone, the box you are typing in stays above it.

### A thread, read
Open a thread from the list and it reads like a page. "‹ Threads" at the top goes back to the
list, and Back on your phone does the same. Under the name is one row: what kind of thread it is,
how it reaches Anansi (the same eye as the list, and a tap still switches it), and how many
pockets it has. Then what the thread says, and each pocket as its own card with On or Off on it.
Tap what the thread says to alter it. Everything else you could do with a thread is under the ⋯
at the top right: alter it, over time, stitched together, copy to another tale, earlier versions,
the thread as JSON, read the whole tale for it, retire it, and delete it.

### Reweave, Continue and Anansi's ideas
Once a passage has landed, the bottom of the screen is three buttons: ↻ Reweave, a big Continue,
and ✦. Tap Continue and Anansi writes the next passage straight away, and everything you had at
the bottom before (how you are writing, threads, the box and Send) comes up so you can steer the
one after. While he writes, Continue is Stop. When the passage lands, the bottom folds back to
the three buttons. To write your own line first, tap the short line above the buttons, or just
start typing on a keyboard.

### Hold Continue to talk to Anansi
Hold Continue and the same box and Send go to Talk instead, and his answer appears in the Talk
drawer. Back to writing turns the box back. You can also pick Talk to Anansi on the How you are
writing menu, or press Alt+T on a keyboard.

### Ideas for what comes next
Tap ✦ and Anansi offers three ideas for what could happen next, from your tale's own model. Tap
one and it goes in the box as a Direct instruction, for you to change or send. Nothing is asked
of him until you tap.

## 2026-10-25 · Doors you can see

### A shorter Threads list
The Threads drawer shows more of your tale at once. The title says how many threads there are,
and the + beside Close adds one. Search, Sent now and All sit in one row. Each kind says how many
threads it holds. A thread shows its name and two lines of what it says, with a tag if it has
pockets. The mark on each thread says how it reaches Anansi: an open eye is always on, an eye
with a speech mark is on a word and woken now, and a shut eye is on a word and asleep. Tap the
mark to switch a thread between always on and on a word. Sent now and the marks change as soon as you tap. Outfits are
still under the character who wears them, and "nothing" now takes the outfit off again.

### A Featherless tale that plans first keeps its length
When a tale on a Featherless model has Plans first on, the plan now counts toward the passage's
length limit, as it does on this machine's model. Before, the plan was free, and a passage could
run to several times the length you asked for before Anansi stopped it.

### Anansi writes into the page
While Anansi writes, his words now appear in the page under the last passage, and Stop stays on
the box where you type. The full-screen blur is gone. It is kept, so it can come back if you miss it.

### Old words, new words
If you wrote in Anansi before, here is where your old words went. Story is now Tale, and your
stories are on the Rack. A chapter you wrote in is a Scene; a Chapter is now a run of scenes
gathered under one summary. Regenerate is Reweave, and each try is a Version. Edit is Alter, and
History is Alterations. Remember this is Make a thread of this. End this chapter is Hem this scene.
A card is a Thread, and a room in it is a Pocket. Waiting is the Workbench, where a proposal is
Basted until you Sew it in or Reject it. A contradiction is a Knot. Context is What he reads. The
Web is Prompts to take elsewhere. Create a story is New tale. Speaking as is You play, and the
held-back character is Hands off. A paid string is Tied off, a dropped one Let go. Archived is
Folded. Back to the default is Reset.

### One tap on a passage shows what you can do with it
On a phone or a tablet, tap a passage to see Reweave, Alter, Make a thread and the rest. A line
under the newest passage says so. A double tap still works.

### Plainer when the model is not answering
When the model on this machine does not answer, the message says so in plain words. The dot in
the menu is no longer lit, and the line under it says "not answering". Hemming a scene with the
model down still closes it, but the screen no longer calls it hemmed in green: it says which parts
did not run, and each has its own button to run it again.

### Alter is safer
Alter puts the cursor at the end of the passage instead of selecting all of it, so one key can no
longer replace the whole passage. Save and Cancel sit under the passage while you alter it, and Esc
cancels.

### Plainer words
What he reads says why each thing is there in plain words: always on, a wake word, the Speak
mode, retired at scene 3. "Compact now" is "Summarise this scene now". The model page tells a
writer how much a model can read in words and how fast it writes, and has a button to choose another
model. Settings say "Anansi reads it every time he writes" instead of "sent on every call".
Pocket names start with a capital.

### The Workbench offers the fix
An out-of-date scene summary on the Workbench has a button that writes it again, and scenes that no
longer reach the model have a button to the place where you gather them into a chapter. "Not now"
is still there.

### The keyboard
Esc closes a passage's actions and the menu. Tab no longer walks through the menu or a drawer
while they are closed. The menu's rows wrap instead of cutting off their names.

### Plain words for the numbers
The band under the title says "room 40% used" and "3 scenes out of reach" instead of "40% full"
and "scenes not sent". What he reads says how much of his room the next passage uses, and
"roughly" when the model is not answering. Surprise and Focus say steady, balanced or adventurous,
and wide, medium or narrow, instead of numbers. The model list says how many words a model reads
and writes a second. Find a model searches tags across every model, not only the ones on screen.

### Back, and finding models
Back now closes the Look sheet, the full-screen box and Reading mode, the same as a drawer, instead
of leaving the tale. Find a model can filter by how many units of the plan a model takes, and by
tag: type one, or press any tag on a model to see the others that carry it.

### Smaller fixes
In a tale, the way back to the rack is a ‹ button like the others. On a thread, Over time sits next
to The thread. The This scene icon in the menu is turned the other way up. The steps of New tale open at the top, and "Start writing" before the last step is a small link
that says it skips the rest. You play and Hands off offer people only. New tale in the menu has a
plus instead of an X. Chapters says what a chapter is. A scene hemmed without a summary is listed
on the Workbench with a button to write it, and the message after such a hem is short. Alter no
longer puts a message over the words you are changing. When the model is not answering and
Featherless is set up, the model list offers Find a model.

### Branch asks twice, and small screens keep the writing
Branch now asks for a second press, like Delete, and then says where the later passages went. On a
short screen such as the Titan, the band of numbers under the title is hidden, and the row with
Speak and Threads shows only while you are typing, so more of the tale fits. The menu button on the
rack is the ☰ on its own.

### Fixed after a second look
On a phone, the top bar no longer runs off the screen on the menu's pages. Start blank no longer
waits for ever on your threads. A scene that is already hemmed no longer offers Hem this scene.
When you alter a passage on a small screen, Save and Cancel scroll into view.

### Small fixes
Best day on What you have written is the day you wrote, by your own clock, not the next day. All
threads stops saying "reading…" once it has read them. A link straight to Find a model now loads
your shortlist.

### Easier to hit with a finger
On a phone or a tablet every button now takes a press from a finger's width around it, even where
it looks small: Close, the ✕ on a list, the little ? marks, the tabs on the Look sheet. The mode and
threads switches above the box are taller to the finger and look the same.

### A Menu button, and a way back to the rack
The rack has a Menu button. Inside a tale, the ‹ button at the top left takes you back to the rack,
and ⋯ at the top right opens the tale's menu. The tale's name still opens it too.

### The phone's Back button closes a drawer
Back used to leave the tale when a drawer was open. Now Back closes the drawer and you stay in the
tale. From the tale, Back goes to the rack. Esc and a tap outside a drawer also close it for good:
a reload no longer opens it again.

## 2026-10-24 · Longer passages, and room for a big model to plan

### Plainer words after two reviews
Some of the new words were hard to guess, so they changed again. A run of scenes gathered under
one summary is a chapter, and its summary is a chapter summary. A bolt is a world. A fitting is a
version. A thread the tale is done with is retired; hemmed is only for scenes now. A string the
tale abandons is let go. You sew a basted thing in, and the message says "Sewn in." Measurements
is What he reads, the Pattern book is Prompts to take elsewhere, Cut a new tale is New tale, and
Back to the house cut is Reset. Spinning is Plans first. A stale summary is out of date, and the
screen says what that means: an out-of-date scene summary is not sent until it is written again,
and an out-of-date chapter summary is still sent. The composer says Speak and Act, and You play
beside the name, the same words as the tale's settings. The rack has one Carry on writing button
instead of two. Read, Look, Ask, Send, Stop and Full screen now show their names beside their
icons on a desk or a tablet. New tips say what a world, a chapter, a version, the rack and the Workbench
are.

### Anansi's own words, everywhere
Anansi is a spider and a tailor, and the screens now speak his trade. A story is a tale, and your
tales hang on the rack. A chapter is a scene; when a scene is done you hem it, and a run
of scenes rolled into one summary is a panel. A world book is a bolt: threads that tales are
cut from. Every fact is a thread, its sections are pockets, and the words that bring it in
are its wake words. What Anansi suggests is basted until you weave it in; a line that
contradicts a thread is a knot, and Mend asks him to fix it. Reweave makes a new
fitting of a passage, Alter changes it by hand, and Alterations keeps them all. His
unseen planning is Spinning, the character the model leaves alone is Hands off, what the
model reads is Measurements, the prompts for other models are the Pattern book, and the
Waiting list is the Workbench. Nothing you wrote changed, and nothing the model is told changed:
only the words on the buttons. A scene still named "Chapter 4" from before shows as "Scene 4".

### Plainer words, and the machine's numbers only for the admin
Notes written for the person who runs the machine are gone from the screens both writers see: the
search, What changed, Report an issue, web search and the model menu now say what they do in plain
words. The model menu says where a model runs instead of a slot size. The slot, the canon cap and
Snapshot now on What you have written show only for the admin. The Create page now calls Anansi
"her", as the rest of the app does, and two notes that pointed to a Preferences page that no longer
exists now say where to look.

### Paid in Waiting pays the promise
The Paid button beside a promise in Waiting only took it out of play; the promise stayed unpaid.
It now marks the promise paid, the same as Paid off in Strings.

### Passages up to 2,000 words
The Passage length slider now goes up to 2,000 words. It was 1,000. A longer passage leaves a
little less room for the rest of the book in what the model reads.

### A big model gets twice the room to weave
A Featherless model that holds more of a book than this machine does, like Kimi K2.5, now gets
10,000 tokens to plan in when the book weaves, not 5,000. Models that hold 32,768 tokens keep the
5,000.

### The admin can add a model that takes the whole plan
The admin can add a Featherless model that takes three or all four of the plan's units again.
While the admin writes with one, the other writer waits. Every other writer still sees only
models that take two units or fewer.

## 2026-10-23 · Featherless when it is full, and a chapter keeps its own name

### Summaries, cards and new books use your model
Chapter summaries, act roll-ups, the cards Anansi finds when a chapter closes, the changes it
notices in a character, the cards it marks as finished, the scan of a single card, and the ideas
when you start a new book were always written by the model on this machine. Now they use the
model you write with, so a book on Featherless gets them from Featherless too. That means more
of your book's text goes to Featherless. The check for lines that contradict your cards still
runs on this machine, and so does everything for a model that always weaves.

### No model that takes more than half the Featherless plan
Some Featherless models take three or all four of the plan's units, so while one writer used one,
the other could not write at all. Those models are now gone from every shortlist, and Find a
model no longer shows them to anyone. Every model you can pick now leaves room for the other
writer.
If one was your default, your books go back to the local model until you pick another.

### Contradictions are flagged again
Anansi is meant to read each new passage against your cards and flag a line that contradicts
them. Since the start of September it had stopped doing that for every passage you write, so no
flags appeared, even when a passage broke your canon. Now each passage is read again once it is
on the page, and a contradiction shows up as a flag, as it did before. You do not wait for it:
the passage arrives first and the flag follows. A re-roll is read once, and the take you moved
away from is not read again.

### A busy Featherless model is tried again
Sometimes a Featherless model starts a passage and then says it is full before it has written a
word. Before, the passage failed with "Featherless stopped mid-passage". Now Anansi waits and
tries again, the same way it does when Featherless says it is full at the start, and tells you
Featherless is busy if it is still full after about twenty seconds. Stop still ends it at once.
If the model has already written some of the passage, it fails as before, so a half-written
passage is never quietly started over.

### Every Featherless answer stops at its length
Yesterday a streamed Featherless passage learned to stop at its length. Now everything else does
too: a passage you wait for, a Talk answer, an invention and Anansi's other work. A passage that
runs long is trimmed back to its last finished sentence, and you are told it was trimmed. A Talk
answer or an invention that runs long is asked for again, the same as one that was cut off, so
you never get half of one. Nothing changes for this machine's models.

### The next chapter's name stays on the next chapter
When you closed a chapter, Anansi suggested a name for the next one. If you then looked back at
the chapter you had just closed and pressed Save there, the suggested name was saved onto the
closed chapter instead. Now a suggestion stays with the chapter it was made for, and waits there
until you save it. Pressing Start writing on the Anyone new step also no longer clears a
chapter's name and where it ends.

## 2026-10-22 · Find a model on Featherless

### A Featherless passage stops at its length
Some Featherless models, given a long book, kept writing well past the passage length you set:
twice as long or more. Anansi now stops reading such a passage once it reaches that length, and
tells Featherless to stop too. What lands is trimmed back to its last finished sentence, and you
are told it was trimmed, the same as any passage that reaches its length. A passage that ends on
its own is not touched, and nothing changes for this machine's models.

### Weaving, in one word
The model menu used to say "thinking" or "no thinking" beside some of this machine's models. It
now says "weaves" or "doesn't weave", the same word the Storyteller and Find a model use. The
buttons in the new-book wizard and the chapter naming now say Asking while they wait.

### Models that can't be asked to weave
A few models on Featherless refuse to be asked about weaving at all, and before, adding one to
your shortlist failed. Now Anansi finds this out once, when you add the model, and remembers it.
The model goes on your shortlist and writes passages, Talk answers and inventions like any other.
It never weaves, so a book written by it has no Weaving switch: the Storyteller panel says that
this book's model can't be asked to weave, and to pick a model that can if you want weaving.
If you move a book with Weaving on to one of these models, Anansi turns its Weaving off and tells
you so. A model that always weaves is the exception: the book goes on weaving, so nothing is
turned off.

### Models that always weave
Some models on Featherless weave whatever they are asked; your shortlist says "always weaves"
beside them. A book written by one of those now gets the same room as a book with Weaving on, so
the passage, the Talk answer and the invention still arrive. The Storyteller panel says "This
model always weaves" where the Weaving switch would be, because the switch cannot change what that
model does. The writing screen and the Talk window say Weaving while it waits. Most Featherless
models hold less of a book than this machine does, so weaving fits less often there. When it does
not fit, the message says that the model's own limit is the reason. It offers Write anyway and
Use another model for this book, which opens the book's model picker. It never offers to turn
weaving off. If the book would not fit at all, only Use another model for this book is offered.
The Talk window now says Asking while it waits in a book that does not weave.

### A full model on Featherless waits its turn
When a model on Featherless is full, Anansi now waits a few seconds and asks again, up to three
times, as he already does when Featherless is busy. If it is still full, he tells you
"Featherless is busy, try again". Before, you saw Featherless's own message after one try. Stop
still works while he waits. He never switches to another model on his own. Adding a model to
your shortlist waits the same way when that model is full.

### Let a book weave
A book's Storyteller panel has a new switch, Weaving, just under the book's model. When it is on,
Anansi weaves each passage in that book before he writes it: he works it out unseen, and then
the prose arrives as usual. You never see what he wove. A passage takes longer, often a minute
or more, and the book has less room for older chapters while he weaves. Weaving is off for every
book until you turn it on, and it changes nothing in your other books. While he weaves, the
writing screen says Weaving and counts the seconds, and Stop still works. The switch takes the
place of the old red note in that panel, which said this was not a setting.

### When weaving does not fit
Weaving sets aside room, and in a long book that room can push older passages, chapter summaries
or threads out of what Anansi reads. When it would, he does not write. A row above the writing box
says what would be left out and gives you two buttons. Write anyway writes the passage with
weaving, and the oldest passages drop out first, as they already do in a book that runs long. Turn
weaving off for this book turns the switch off and writes the passage as usual. The Context panel
tells you the same thing before you press anything. If the book would not fit at all beside the
room weaving needs, only Turn weaving off is offered.

### Talk and Invent weave too
In a book with Weaving on, Anansi also weaves before he answers you in Talk and before he
invents a thread or a room for a card. Both take longer while he does, and while he weaves the
Talk window, or the button you pressed to invent, says Weaving and counts the seconds, as the
writing screen does. An invention sets aside
more room than a passage or a Talk answer, because what he weaves for one runs longer. If the room he needs to
weave would push part of your book out of what he reads, he does not answer; he tells you what
would be left out, with the same two buttons a passage gets: Write anyway, or Turn weaving off for
this book. They appear in the Talk window, or in the place you asked for the invention. Summaries,
the canon check and Remember this never weave.

### Find a model on Featherless
The model menu at the foot of the rail has a new last row, Find a model. It opens a search over
the models Featherless runs. By default it shows only uncensored models; untick the box to see
all of them. You can search by part of a name, by size, and by whether a model weaves before it
writes. Models that never weave come first. Before you add a model, whether it
weaves is a guess from the family it belongs to. The big families, such as Kimi, DeepSeek,
MiniMax, GLM, Mistral Small and Llama, are guessed from what their makers publish. A family Anansi
has not met yet says "not tried yet", and comes last, instead of claiming it does not weave.
Adding a model still asks it. Each model shows how much of the shared plan it uses and how much
of a book it can hold. Models too small for a book are not shown.

Press Add and the model goes on your shortlist, at the top of the same panel and on your model
menu. Nobody else sees your shortlist. When you add a model, Anansi asks it one short question
to find out if it really weaves, so adding takes a moment. To take a model off your shortlist,
press Remove on the same panel.

### See where each model runs
Every model on the model menu, at the foot of the rail and in a book's Storyteller panel now has
a small circle and a sign beside its name. A spider means the model runs on this machine. A
feather means it runs on Featherless. The circle has one colour for each, in every theme. For a
model on this machine, a full circle means it is awake and ready, and an empty one means it is
asleep and its first passage will take longer. A Featherless model always shows a full circle.
In the Storyteller's list of models, each choice says the same thing in words. The model you are
writing with is still the highlighted row.

### What a remote model is for
Each model in Find a model now shows the tags its author gave it on Hugging Face, such as
roleplay or creative-writing. Press a model's name to see the model it was made from and the
first paragraph of its description. Banners and pictures are taken out, so you read only the
text. If the description has no paragraph, you see the base model and the tags. The model
information panel shows the same description for a model on your shortlist.

For a model on your shortlist, the model information panel also says that it runs on Featherless,
how much of a book Featherless lets it hold, and how much of the shared plan it uses. If this
server is not set up for Featherless, the panel says so and has no "Write with this one" button.

### When a Featherless model cannot write
If you take a model off your shortlist while it is your default, or while one of your books is set
to it, those books go back to the model on this machine. A message names each book, and says
"your default" if that changed too. A book never writes with a different model from the one its
panel shows.

If Featherless cannot be reached, the passage stops with a message that says so. Nothing about
your books changes, so you can try again when it is back.

If this server is not set up for Featherless, Find a model is not on the model menu. The models on
your shortlist still show, greyed, with the words "Featherless isn't set up", and you cannot pick
them. Books set to one of them write with the model on this machine until Featherless is set up
again, and the book's panel says so.

A passage that a Featherless model wrote no longer offers "Roll it again on this seed" in
History. Featherless does not give the same passage back for the same seed. Passages written on
this machine still offer it.

### The model at the foot of the rail is the one writing this book
In a book, the model named at the foot of the rail is now the one that writes that book, with its
spider or feather. If the book is set to its own model, that model is named, not your default. On
the shelf it still names your default. The model information panel marks the same model as
"writing now", and the name stays right after you change the book's look or anything else in it.

### A shared book set to a Featherless model
If the other writer sets a book you share to a model on their shortlist, you now see that model in
the book's Storyteller panel, and the book's card on your shelf no longer says "model missing". The
model is not added to your own shortlist. If Featherless is not set up, the panel says so, and the
book writes with the model on this machine.

Its model information panel shows how much of a book it can hold and how much of the shared plan it
uses. It has no "Write with this one" button, because the model is not on your shortlist. Add it
in Find a model if you want to write with it in your own books.

## 2026-10-18 · Delete after keeps the chapter you write in

### Delete after keeps the chapter you write in
If you closed a chapter and then deleted everything below its last passage, the empty chapter the
close had opened was deleted too. That left the book with no open chapter and nowhere to write.
Now the open chapter always stays, even when it is empty.

## 2026-10-14 · You can write a chapter's summary yourself

### You can write a chapter's summary yourself
Every summary in Chapter → Summaries can be edited, or written from scratch for a chapter that has
none. Anansi will not write over yours without asking twice — not when you press Summarise, and not
when the chapter closes. When a close keeps your summary, the closing note says so. Every card says
whose summary it is and how many words it is, and the count follows you as you type.

### Any chapter can be summarised again
Any chapter can be summarised again, not only the one you are in, so a stale summary is one press
from coming back.

### A stale summary stays out of everything Anansi is asked
Chapter proposals leave it out too, and when you name its chapter in a question, Anansi is told the
summary is stale instead of being sent it.

### Delete after names the summaries of yours it would clear
Deleting everything below a passage clears the summary of every chapter it cuts into. If any of
those summaries are yours, the first press names those chapters before you press again.

### Acts can be edited too
In Chapter → Acts, press Edit on an act to change what it says and what it is called; what you save
is what Anansi is sent for those chapters. A count of its words follows you as you type, and past
220 it says the act takes more room in every prompt — it still saves.

### An act now tells you when a chapter under it has changed since it was written
Its card names the chapter, and it joins the waiting list, where you can wave it away until the
next change. It still reaches Anansi. Saving the act yourself, or removing it and rolling the
chapters up again, clears it.

## 2026-09-18 · Regenerate gives you another take, not your own paragraph back

### Regenerate was rewriting the passage before the one you pressed it on
If you write a paragraph yourself, press Continue, and then press Regenerate on what came back,
you were handed a rewrite of **your** paragraph instead of a second try at the model's. Press it
again and the same thing happened again.

Why: a re-roll is written from everything up to the passage you pressed it on, and never the
passage itself — a new take must not know how the old one went. But the instruction that went with
it said "write this passage again", and the passage it meant had been left out. The last thing the
model could see was whatever came before, so that is what it wrote again. If you narrate and let
the model answer, what came before was always your own writing.

A re-roll now asks for exactly what was asked the first time. Press Regenerate on a passage the
model narrated and it narrates that moment again; press it on one you spoke as your character and
it answers the line again, still knowing who was talking; a passage written from an instruction
still re-runs that instruction, which has always worked.

**One thing is gone with it.** Regenerate had its own wording under Storyteller → Instructions,
separate from the five modes. That wording is what named the missing passage, and it has been
removed rather than reworded — there are five instructions now, and a re-roll uses the one the
passage was written with. If you had written your own re-roll wording, put what you want from it
into the mode it applies to.

### Regenerating over a paragraph you wrote asks first
Regenerate sits on the last passage whether the model wrote it or you did, and pressing it puts a
model take in that paragraph's place. Your words were never lost — they wait behind the ‹ › arrows
— but the page changed under you on one press, and you had already paid for the take by the time
you saw it.

On a passage of your own it now takes two presses, the same as deleting. The model's own passages
re-roll on one press, as before.

### Rewriting a card no longer stales half your chapters
Chapter summaries go stale when the prose under them changes, and also when a card stops saying
something a summary relies on — a stale summary is dropped from the prompt until you re-run it,
so the book does not go on being told something that is no longer true.

That second rule was reading one card at a time. Rewrite a character's card from a list of facts
into a description of who they are, and every other character's name that dropped out of it
counted as a fact the book had lost — even though each of those characters has a card of their
own, sitting there unchanged. One save could stale most of a book's summaries at once and quietly
take them out of the prompt.

Now a name that is still the name of a card in the book is not treated as lost. Rename that card
and the summaries naming it do still go stale, which is the case the rule is there for: the book
would otherwise be reading a name nothing in your ledger answers to.

If you already have chapters marked **Stale** from this, re-run those summaries once and they
will stay put.

## 2026-09-11 · Take a copy of a whole book

### In context now means what is actually in the prompt
The **In context** filter on a book's threads was working it out from how each thread is set to
fire, not from the prompt itself. So a thread that fires on a trigger word never appeared there
however clearly it had fired, and a book whose threads are all triggered read "In context 0" while
the Context panel sat beside it listing them. One book of 227 threads had thirty-three of them in
the prompt and none of them on that list.

It reads the assembled prompt now, so the two screens cannot disagree. A triggered thread appears
the moment its words do, and it leaves when they stop being recent. It also does the other half
honestly: an always-on thread that got pushed out to make room is no longer listed as being in
context, because the model did not see it.

Before you have written anything in a session there is no prompt to read, and the list says so.

### A search bar on a book's threads, and the one on every book's threads now finds more
Under a story's threads, above the list. It searches names, trigger words, what a thread says and
what is in its rooms — so you can find the card by something written inside it, not only by what
you called it. Typing narrows the list and nothing else on the panel moves.

The box on the wider **Threads** page, which searches every book at once, was looking at names,
trigger words and a thread's body — and almost nothing keeps its text in the body any more, so it
was really only searching names and trigger words. Both boxes look at the same words now.

### Being refused with "over budget" when nothing was wrong with the book
If the model happened to be asleep when the server started, the app never found out how much room
it actually had and spent the rest of the day assuming the smallest amount it knows how to assume:
about a seventh of the real figure. Everything worked until a book grew past that invisible line,
and then writing stopped with a message about the budget and the story's spine — neither of which
had anything to do with it. One server ran that way for thirty-three hours.

It now asks again until it gets an answer, instead of asking once and giving up. Nothing to do at
your end; a book that was refusing to continue will continue.

### Make a copy of this whole book
Under **Keep**, beside taking the book with you. It makes a second book holding everything this one
holds: the prose in its chapters, every path you have branched, the threads with their rooms, their
pictures and the connections between them, what the book still owes, and the world it is set in. It
opens on the same chapter you were writing.

Nothing you do in either one reaches the other after that. Rename somebody, burn a city down, take
the story somewhere you were not willing to risk it — the book you started from does not move.

**A branch could never do this.** Every path through one book shares its threads, so changing who
somebody is on one path changes them on all of them. That is what a branch is for, and it is why it
cannot give you a set of your own.

Flags, re-roll history and anybody you write the original with stay with the original.

## 2026-09-06 · Search finds the word you typed

### It stopped matching the middle of other words
Searching **ash** used to return eleven passages, and not one of them contained the word — they
were *washed*, *cash*, and a character called *Ashe*. **art** returned twenty-eight, none of them
the word *art*: they were *heart*, *part*, *started*. A short word gave you a screenful of things
you did not ask for, and you had no way to tell the real hits from the noise.

Now a word means that word. **ash** finds *ash*, and *Ashe* if you are still typing.

### And you can search for two words at once
Before, **rain water** looked for those two words stuck together in that order, so it almost always
found nothing even when both were right there in the chapter. Now it finds the passages that
contain both, wherever they sit.

### Best matches first
Results used to arrive in whatever order the database happened to hold them. They come back ranked
now, so the passage that actually uses your word is at the top rather than sixty rows down.

Prose, threads and chapter summaries are all searched, the way they always were.

## 2026-09-05 · The app opens about three times lighter

### Less to wait for, especially on a phone
Opening Anansi used to pull down just under a megabyte before it could draw anything, every single
time. It now sends about a third of that. On the desk you may not notice; on a phone, on the sofa,
on a slow connection, it is the difference between a pause and no pause.

Nothing about the app changed — the same page, the same everything. It is only packed smaller on
the way to you, and unpacked when it arrives. An edit still shows up the moment you reload, exactly
as before.

## 2026-09-03 · What the other writer does arrives on its own

### No more refreshing
When the other writer adds a passage in a book you share, it appears. When the move passes to you,
the light along the top comes on. When you are called into a book, it turns up on your shelf. None
of it waits for a reload any more.

The page reconnects by itself if the laptop sleeps, the network drops, or the server is restarted
mid-sentence — there is nothing to press and nothing to notice.

Two things it deliberately does not do. It never redraws for something **you** just did, because
your page already has it. And it never redraws **while Anansi is writing** — a passage arriving
under the veil is the one thing that would take a take off the screen before you had read it.

## 2026-09-03 · Writing a book with somebody else

### Call someone into a book
Under **Keep** on the Story screen: **Write it with someone**. Pick a name and they can write in
that book. They get everything in it — its threads, their rooms, and what changed about them over
time. They cannot delete it, and only you can call people in or take them out.

The control only appears if there is somebody else on this server to call.

### Co-op
With two of you in a book, **Co-op** appears on the composer's dial beside Speak, Act, Direct and
Narrate. In Co-op your part goes on the page and the move passes to the other writer — Anansi is
not asked at all.

When you are stuck, change the dial to **Direct** and ask for a beat as usual. The move stays with
you, because you have not written your part yet.

Passages the other writer adds get their own colour down the margin, so reading back tells you
whose hand wrote what.

### It says whose move it is; it never stops you writing
Nothing is locked. When it is your move, the light along the top of the screen says so and
**Waiting** carries it. If they are ignoring their turn, nothing nags you about it inside the book.

## 2026-09-03 · A light when something wants you, and the ring whenever Anansi is working

### The ring is up for everything Anansi does
The glowing border used to appear only while a passage was being written. It now appears whenever
the model is working at all — writing a card, pulling a thread off the web, closing a chapter,
naming one, re-rolling the house style, anything in the spark wizard. If it is glowing, something
is happening; if it is not, nothing is.

### A light along the top when something is waiting
When any book has threads proposed or promises unpaid, a band of the accent glows along the top
edge of the screen, wherever you are. **Waiting** in the menu wears the accent too, with the count
beside it. Press it and the light goes out when there is nothing left owed.

Flags do not light it. A contradiction is worth finding when you go looking; it is not worth a
light in the corner of your eye.

## 2026-09-03 · Panels you can read, and a fuller record of your writing

### The Chapter screen is four screens now
Chapter had grown into one long column doing five unrelated jobs, with the queue of proposed
threads four screens down where nobody found it. It splits into **This chapter**, **Proposed**,
**Summaries** and **Branches**, the same way the Story screen did. **Proposed** carries its count,
so a queue behind a tab still says how many are waiting. Save still commits the chapter's name and
its two boxes from whichever tab you are standing on.

### Explanations are behind a mark, above the thing they explain
On **Story**, **Chapter** and **Threads**, the paragraph explaining what a control does is folded
behind a small mark beside its name. Press it and it opens as a card **above** the box or the
button — an explanation you read after filling something in is one you read too late. Press it
again and it closes, and it stays as you left it.

Every one of them looks the same now, and reads the same way, whether it is one of the eight the
manual explains or a sentence written beside a single control. **Voice of the weave** had grown two
marks in two styles doing the same job; it has one, and it carries both explanations in the one
card. Nothing was rewritten and nothing was thrown out.

What has *not* been folded is anything telling you the state of things: an empty list still says it
is empty, a stale summary still says so on its face.

**Every panel** has it now — Story, Chapter, Threads, Storyteller, the thread card, the chapter
close, the next chapter, Context, Strings, Anansi, History, the picture finders and the trays. Around
eighty explanations, each behind its own mark, each above the thing it explains.

Two of them were saying the same thing twice: the paragraph at the top of **Strings** and of
**Anansi** repeated, in different words, what those panels' own marks already opened. The second
copy is gone and the one the manual holds stays.

The wizard that starts a book is deliberately left alone — the sentence under a field there is often
the only thing telling you what to type, and folding it away would make a first book harder, not
tidier. Anything reporting the state of things stays put too: an empty list still says it is empty,
a model that cannot be reached still says so, and the setting your book is actually set in is still
printed where you can see it.

### Labels are in capitals
Every label in the app — the headings, the chips, the buttons, the tags — was set in small capitals,
which at this size read as a mistake rather than as a style. They are in plain full capitals now,
including the two shapes that were never labelled as labels and so never got the treatment at all:
the headings you fold open on a thread card, and the three steps across the top of the next chapter.

Two places stay as they were, on purpose. The **menu** down the side reads as a list of places you
go, not as a row of labels. And the **explanation cards** behind each ⊹ are prose — a title in
capitals there is another label shouting from inside the thing you opened to stop the shouting.

### What you have written, in more detail
The writing record grew. The chart is **words a day for thirty days** rather than passages, and it
now draws the days you did *not* write instead of quietly closing the gap — so it reads as rhythm
rather than as an unbroken run. Under it: what you wrote **this week**, how many of the last thirty
days you wrote on, your **longest run**, and your **best day**.

Takes you did not choose are now given against the number you wrote, so "11" reads as "39% of the
28 written". Threads say what kind they are. And there is a new line for how long a call takes **in
the middle** — half faster, half slower — which is a truer number than the average, because one
cold model load drags an average and tells you nothing.

## 2026-09-03 · Small things that were in your way

### Ticking a box does something now
On the Story screen, the switches under the cover — **use it at the head of every chapter**, and
**keep it behind the prose while you read** — were already saving the moment you pressed them. The
screen just did not move, so there was no way to tell, and the second switch does not exist until
the first is on. It looked like it needed a Save press. It never did, and now it says so: the panel
redraws under your finger and whatever you had half-typed beside it stays where you left it.

### In context, first
On **Threads**, the two filters have swapped places. **In context** is the question you open that
panel to ask, so it is the one your eye lands on. Which filter is switched on has not changed.

### A book with no cover wears its own colours
The band above a book's threads was flat grey when there was no picture on the book. It now takes
the colours of your theme, so a shelf of books with no covers is not a column of identical grey.

## 2026-09-03 · Pull several threads out of a world at once

### See what is in a world, then pick
Under **The world** on the Story screen: **Pull threads out of a world**. It fills in this book's
world, or type a different one for one pull — a book set in Warhammer that wants one thing out of
Dune does not have to change what the book says it is.

Press **See what is in it** and Anansi searches and comes back with a list of names — the
load-bearing ones, what a scene in that world cannot avoid — with what kind of thread each would
be. Nothing is written yet. Tick what you want and press **Pull the ticked ones**, or press **Take
all**. Anything already in your ledger is shown greyed out rather than quietly dropped.

Each one is then looked up properly, one at a time, about eight seconds each, and lands in the
proposals queue under **Chapter** with the pages it read. Nothing is canon until you accept it.

### One thing about the searching
Every pull is a web search, so taking six at once is seven searches in a minute. Public search
engines start refusing that: DuckDuckGo answers with a CAPTCHA and Brave with a "too many requests"
after sustained use, and when they do, a pull comes back with nothing found and says so. Waiting a
few minutes is the whole fix.

## 2026-09-03 · A book can say which world it belongs to

### The world or IP, on the Story screen
Under **The world** there are two new boxes: the world or IP this book belongs to — Warhammer
40,000, Dune, Sunless Sea, or nothing at all for a world of your own — and what is true in it.

The name is sent with every call, beside the genre, so the model knows which world it is writing in
before it knows anything else. The paragraph goes with it, and is the first thing trimmed if a
prompt runs long, so anything that cannot be lost belongs in the premise instead.

### And it aims the web pull
Setting the world changes what a pulled thread finds. **Medusa** in a book with no world comes back
as the Greek Gorgon — Perseus, the sisters, the stone gaze. In a book set in Warhammer 40,000 the
same word comes back as *Medusa IV, the Iron Hands' feral homeworld, close to the Eye of Terror, the
birthplace of Ferrus Manus*. Nothing changed but the field.

This is not the same thing as **Part of a world** further down that screen, and you can use both.
That one follows another book's threads, live, and is the right tool when a world has a ledger of
its own. This is the light one: a name and a paragraph, with no second book to build.

## 2026-09-02 · Pull a thread off the web, in its own canon

### Look something up and get a card from it
On the **+ Thread** tray there is a new box: **Or pull one off the web**. Type a name — Paul
Atreides, Halsey the musician, a Necron Overlord, an author — and Anansi searches, reads what comes
back, and writes the card from that and nothing else. Every fact comes from a page it found; a gap
stays a gap rather than being filled in; it does not adapt the subject to your book.

It lands in the proposals queue under **Chapter** with the pages it read recorded beside it, so
nothing becomes canon until you accept it. Around six seconds.

**This is not the "Search before writing it" checkbox** further up that tray. That one asks Anansi
to invent something for *your* story and offers the search as flavour — asked for Halsey with it
ticked, it wrote a courier for the book it was in. The new box is the opposite: the subject's canon
outranks the book's.

It fills the rooms too — appearance, history, relationships, whatever the pages actually cover —
and accepting the proposal writes the card and its rooms in one press. A room the search could not
answer is left empty rather than filled with "no information given".

**Pull the things inside a world, not the world's name.** *Arrakis*, *the Fremen*, *Ferrus Manus*,
*Paul Atreides* come back in their own voice, from the canon wikis. *Sunless Sea* — the name of a
game — still drags some of the product in: the studio, the year, the art style. The body comes out
as the Unterzee, which is right, but a room or two will mention the game.

Two other things it will do. If what comes back is about something else entirely, it writes a card
about *that* rather than saying it found nothing — a truthful card about the wrong thing, sitting in
the queue where **Ignore** costs one press. And a room will sometimes say "in the Dune universe",
which is the one phrasing that keeps slipping past.

## 2026-09-02 · Chapters get a screen of their own, facts can be edited, and a card travels as a file

### Chapters is its own screen
The chapter list used to be a fold inside a paragraph's own menu, and it showed nothing but names.
It is a screen in the rail now, next to Chapter, and every chapter says what it is: its name, its
opening sentence, how many words and how many passages, whether it is closed, and what the model is
being sent for it. Press one to write in it.

### Facts can be edited again
The **facts** room — the one thing on a card that survives the chapter-end rewrite — was not drawn
anywhere. You could create it and never open it again. It sits in **The card** tab, above Info,
where the screen has claimed it was all along.

### A card goes out as a file and comes back
**More** on any card now shows that card as JSON, with every field its kind can hold, empty ones
included. Copy it, or save it as a file. Put it back — paste it or choose the file — and it writes
over that same card; delete the `id` line first and it makes a new one instead. It is the same
format the forge uses, so anything that works there works here.

### Smaller things
Checkboxes are drawn by the app now instead of by the browser, in the accent. Nothing opens a panel
for you when you open a book — the page is what you land on.

## 2026-09-02 · The composer's dial wears the colour of the press, and the wait is a ring around the screen

### Speak, Act, Direct and Narrate each have their own colour on the dial
The pill and its label are the same colour as the rule that runs down the margin of the passage
that press writes — so the colour tells you what you are about to do, and then tells you again on
the paragraph it produced. Each row in the open menu wears its own colour too.

One note: on the **Cyberpunk** theme, Speak and Narrate come out the same pink, because that theme
sets its speech colour and its warning colour to the same value. Say the word and one of them gets
its own.

### The waiting line became a ring around the screen
The thin line above the composer is gone. While Anansi is thinking — before any words arrive —
a soft gradient runs around the edge of the screen in the colour of the press you made. It goes as
soon as the first word appears, because from then on the words say it better. It also stays up if
you leave the waiting screen early, which the old line could not.

### Regenerate and Continue are on the waiting screen
When the passage finishes and the screen holds so you can read it, the two presses you would want
next are right there. Pressing either one puts the passage on the page first, then does what you
asked.

### The composer sits closer to the bottom
Another five pixels down.

## 2026-09-02 · One bad address could take the app down. It cannot now.

### A link to a file that is not there
Asking for a file the app does not have — an old bookmark, a link preview, anything that guesses a
filename — did not answer "not found". It ended the app, for you and for anyone else writing at the
time. It came back on its own within seconds, but any passage being written at that moment was
lost.

It answers "not found" now, and carries on.

## 2026-09-02 · A chapter says how it starts and where it ends, and Anansi will write both

### One box became two, and they reach the model differently
The chapter had one box, **This chapter must end with**, and that line was sent to the model beside
every single passage for the whole length of the chapter. That is why chapters kept trying to finish
early: the model was being told where to end, over and over, while it was still on the second page.

**How this chapter starts** is sent for the chapter's first passage and then never again — the
opening has happened, so it stops being an instruction.

**Where this chapter ends** is sent as the chapter's direction, every time, with the model told in
so many words not to steer toward it, close it out, or wrap the chapter up to reach it.

Whether that stops the early endings is not something we have measured yet. What is certain is that
the demand no longer arrives on every call.

### Anansi will write all three
**↻ Have Anansi write these** in the Chapter panel names the chapter, says how it opens and says
where it goes, in one press. Anything you have already typed is left exactly as it is — only empty
boxes get filled — and nothing is saved until you press **Save**. Press it again for another
suggestion.

Both boxes are on the screen you get when you close a chapter, too, which is where they matter
most: **Save and write** there writes the chapter's first passage, and that is the one passage the
opening is ever sent for.

## 2026-09-02 · The re-roll instruction opens in the middle of the screen

### Editing the instruction is a sheet, not a panel inside the paragraph
Pressing **Regenerate** on a passage you directed opens its instruction for editing. It used to
open inside the paragraph, which on a long passage put it below the fold of the very passage it
belongs to. It arrives in the middle of the screen now, over a dimmed page — press outside it, or
press Escape, to leave the passage as it was.

## 2026-09-02 · The menus match the app, the waiting screen says it is working, and Storyteller is four groups

### The dropdowns open in the app's own colours
They were opening as the browser's own white lists. They are the dark sheet the rest of the app is
made of now, with the accent on the row you are about to pick and on the one you are already on. The
word **Threads** has gone from the list it opens — it was the button's own name and picking it did
nothing.

### The waiting screen shows that it is working
A slim line above **Stop**, travelling, for the seconds when no word has landed yet. Stop itself is
quieter: an outline in the accent rather than a filled slab.

### Storyteller is four groups instead of one long scroll
**Voice** — the voice of the weave, how this book is written, and the spice. **The book** — the
cover, the title, the genre, the premise. **The world** — the setting, the point of view, who you
are, who the model may not write, and the world this book follows. **Keep** — the exports, the
archive, the delete.

Save stays at the top of all four, and moving between them never loses anything you have typed and
not yet saved.

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

## 2026-09-02 · The words arrive while he writes them, and The Anagram is quick again

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

**Stop** stays for the whole time he is writing and goes when he finishes, because by then there
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
A card he wrote with help from a search used to carry the URL in its own text, which then rode into
every prompt that thread fired. The links under his replies are gone too. He still looks things up;
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
Open a red contradiction line and there is a third press: **Let Anansi correct it**. He rewrites
only the sentences that break canon, then **checks his own work** and tells you what actually
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

### Anansi can finally name the room, and he has to
Ask him in the chat to pad out a card and he used to have no way of saying which part of it he
meant — so accepting the offer rewrote the card's whole description and everything else you had
written there went with it. He now names the room, the same as the passes that run when a chapter
closes: appearance, voice, interiority, one relationship, history, role. The change lands in that
one room and the rest of the card is left exactly as it is.

He is also told outright that **What is always true** is not the answer for most changes. It is for
what never changes.

### And if he picks the wrong one, you move it
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

### He can search, and it is one switch everywhere
Anansi's **Search before responding** box is live now that the server has a search endpoint. The same
switch appears wherever he can look something up — asking him a question, or having him write a
thread — and it is one preference: tick it once and it stays ticked in both.

Asked a question with it on, he reads what came back and answers from it, with the sources.

### Find a cover instead of drawing one
The cover section has **Find one on the web** beside **Have one drawn**. Type a phrase, get a wall of
thumbnails, press one, and it becomes the cover — shrunk to 900px like every other cover.

The box starts filled in from the book's own setting and genre, so there is something to press rather
than an empty field.

Where the picture comes from is worth knowing, because it is different from the drawn one: the words
go to your own search endpoint, and the picture itself comes back **through Anansi** rather than from
your browser. Nothing about the book is sent — not the premise, not a word of the prose.

## 2026-09-01 · Anansi remembers whether he looks things up

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
The steer box moved below the list, because that is when you have something to say. Read what he
proposed, untick what you do not want, then tell him what the book actually needs.

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
threads — which matters, because one of the things he offers is threads the book implies and the
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

### Tell him what the cast should be, and re-roll them one at a time
There is a box on the cast step for what this book needs from its people: nobody over thirty, a
rival who is family, a city that is a character. Whatever you write there reaches every ask on the
step.

Each proposed card now has its own re-roll. Asking for a different cast replaces all of them, which
is the wrong thing when four are right and one is not — so re-roll the one, and the others stay
exactly where they are, along with the name in "You are". He is told who is staying, so he will
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

## 2026-08-30 · Anansi has a voice of his own again, and it is yours to change

### He stopped answering in your book's voice
Ask Anansi a question and he was answering in the register your book is written in. A book
written in short flat sentences got a short flat Anansi; a cold, restrained book got a cold,
restrained one. Your book's voice was reaching him as an instruction, and it was drowning his own.
He reads your book exactly as much as he did before — the canon, the chapter summaries, the
recent passages, who is telling the story — but how it is WRITTEN no longer decides how he talks.

### How Anansi talks is now a box in Preferences
Under your own default voice, there is a second box: his register. Change it and he answers you
like that, on every book, from your next question. Empty it and his shipped voice comes back.

What he may offer you is not in that box and cannot be edited away — he still cites what he
drew on, still says "the story does not say" instead of inventing one, and still keeps his
suggestions to what you asked for. You are changing how he sounds, not what he is allowed to do.

### Asking him to write a card no longer hands him your prose
Have Anansi write a character, a place or a room and he writes it as notes for you, not as a
page of your book. Your book's finished prose used to be sitting in that request, and lines from
it came back inside the card.

## 2026-08-30 · Passage length is something you ask for, not somewhere he gets cut off

### Passages stop ending mid-word
Passage length used to be a hard stop. When a passage reached it, it ended — mid-sentence,
mid-word, wherever the count ran out, and nothing on the page said that was what had happened.
Nearly a quarter of the passages written since the 26th ended that way. They don't any more.

### The slider is a target now, and you can leave it to him
Drag it and you are telling Anansi roughly how long you want a passage to run. He aims for it
and is allowed to come in under it — a beat that wants three sentences still gets three
sentences. All the way to the left leaves the length to him entirely, which is how every book
here was written until today, and it is where the slider starts.

### And if a passage ever does run long, he says so
There is still a ceiling, far above where he normally writes, so a runaway cannot eat the whole
page. If a passage reaches it, what lands is trimmed back to its last finished sentence and you
get told it was trimmed — instead of a paragraph that stops for no reason you can see.

## 2026-08-30 · Ending a chapter is three steps, in the order you do them

### What the chapter left comes first
Closing a chapter now opens on the cards it proposed, on their own, with nothing else on the page.
Decide them, or leave them — what you leave stays in Waiting. If it proposed nothing the step is
skipped rather than shown empty.

### Then the next chapter, title and beat together
Its own page: what it is called and where it has to end up, side by side, with a box to steer what
Anansi suggests before he suggests it. Save and write is right there — you never have to go
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
If you have him opening your chapters, he quietly stopped after the first one — every chapter
after that opened on a blank page. He does it again. He also waits until you have said what the
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
appearance, a relationship — he was writing you a whole character every time. Three or four
hundred characters of it, for one room, on a card that has eight of them. Cards were coming
back three or four times longer than they should be, and the same person was being described
over and over in rooms that were supposed to be about one thing each.

He now writes a room the length of a room: forty to eighty words, on that room's own subject,
and he is told outright that the rest of the card already exists so he does not repeat it.
Outfits already worked this way and were the only ones that did.

Asking him for a whole new thread is unchanged — that is still the fuller answer you asked for
back in August, and it should be.

**Cards you already have are untouched.** This only changes what he writes from now on. If a
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

### Anansi speaks like himself now
The voice in the chat panel — the one you get from the button that summons him — is older
and more formal than it was. He is a scholar who has watched things rise and fall from the
corner of the room, dry, quietly amused, and he implies rather than boasts. No gestures, no
leaning, no enthusiasm with an exclamation mark behind it.

Three things he still will not do, because a voice is not worth losing a tool over. He
answers first and he lands — no trailing off, no *"but that is only one weaving"*. He does
not borrow the words Thread, String or weave as figures of speech, because those are things
on your screen and it would read as him filing something. And he does not open with an
anecdote about someone he knew, because he never knew them.

This voice is in chat and nowhere else. When he names a chapter, writes a thread, or sums up
a scene, he writes plainly — that text is stored and read back to the writing model on every
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

### Anansi will read your skeleton back and say what he would change
A new fifth step. It is the first moment the book can be read as a whole — your premise was
written before the cast existed, and the cast from a premise you may have rewritten since.
He proposes a replacement for a title, premise, setting or direction, and threads the
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
