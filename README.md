# Italian Shadowing Studio v1.9.0

## v1.9.0 notes — the verb drill, made calm

The verb drill had the same problem Study had before the redesign: eight large
control fields stacked above the thing you actually came to read. They are now
one compact bar at the foot, the same bar Study uses.

The heading tells you what you are drilling — *Verb drill › avere — to have ›
congiuntivo presente* — and follows you through the tenses. The detected-verbs
line now says which sentences it searched, so "9 of 112" no longer leaves you
guessing whether that was the chapter or the whole library.

Pre-downloading the verb audio has moved into the **⋯** menu on the bar, since
it is something you do rarely.

This completes the redesign plan.

## v1.8.6 notes — the villa, this time actually visible

The picture is square and a phone screen is tall, so sizing it to cover the
screen blew it up until only a strip of empty sky showed in the one place you
could see through. The villa was there all along, hidden behind the solid part
of the page. It is now a band across the top, placed so the house and the
cypresses land where you can see them.

The voice chip has been given a proper pill background, since it now sits over
the picture.

## v1.8.5 notes — the villa behind the phone screen

On a phone the villa now sits behind the heading at the top of the screen and
fades out before the sentences begin, so you get the picture without it ever
competing with the Italian. The heading is printed in ink rather than grey to
carry it.

**Along the way I found and fixed a real readability problem.** The English
translation under each sentence had never met the accessibility standard for
contrast — it was too pale in the light theme and too dim in the dark one. Both
are corrected. You will notice the English, the small print and the field labels
are a little stronger everywhere now, not only on the phone.

Dark mode gets a suggestion of the villa rather than the villa itself. A picture
you can see and light text you can read pull against each other on a dark
screen, and the text wins.

## v1.8.4 notes — the illustration follows the library

Collapsing the library used to take the picture with it. Now the picture moves
into the top-left of Study, Verb drill and Settings — the same corner Generate
uses — and moves back to the library when you open it again. You never see two
at once.

**Also fixed: a collapsed library could only be reopened from the Study tab.**
The Show library button now sits in the tab row, so it is there whichever tab
you are on.

## v1.8.2 notes — your own artwork

The logo is now the Ionic column with the olive branch from your mockup, and the
library carries your watercolour of the villa. The Generate tab has the arcade
with the cypresses, so it reads differently from the library — and the library's
picture steps aside while you are on Generate, so you only ever see one at a
time.

All three travel inside the app's own files rather than being fetched, so there
is nothing extra to upload and nothing that can go missing offline. Together
they add about 30 KB.

The watercolour is dimmed a little in dark mode so it does not glare.

## v1.8.0 notes — a finer speed ladder

**The speed control goes 0.5× to 1.0× in tenths.** 0.4× has gone — it was slower
than anything you could actually shadow against — and there are now usable steps
between 0.6× and 0.8×. The same ladder appears on the playback bar, in Focus mode
and in the verb drill.

## v1.7.2 notes — the speed control now works on the ElevenLabs voice

Changing the speed only ever affected the system voice. The ElevenLabs voice
plays a downloaded recording, and the app was setting the speed on that
recording a moment too early — loading the audio wiped it, so every clip played
at full speed. It is now set at the right moment and checked once the audio has
loaded.

Slowing down also keeps the pitch where it belongs, so a voice at 0.4× sounds
like the same person speaking slowly rather than dropping an octave.

Recordings are still cached by voice and sentence, not by speed, so changing the
speed costs you nothing in ElevenLabs credits.


## v1.7.1 notes — two phone fixes

The **Focus** button now appears on a phone. In v1.7.0 it was being laid out in
a hidden third row of the playback bar, below the bottom of the screen.

**Importing the same corpus file twice no longer doubles your library.** Before
it adds anything, the import screen now tells you what it found — how many
sentences are already there word for word, how many have changed since you
imported them, and how many are genuinely new. Sentences already there are
skipped; sentences that have changed are updated in place, keeping any bookmark
or note you had put on them.

If your library is *already* doubled, open **Manage library → Remove duplicated
sentences**. It keeps one copy of each and tells you how many it removed.


## v1.7.0 notes — Focus mode

There is now a **Focus** button on the playback bar. It gives you the whole
screen for one sentence: large Italian, the English underneath if you want it,
and nothing else. Use it when you are actually shadowing rather than browsing.

Underneath the sentence it counts the repetitions — *Repetition 2 of 5*, with a
dot for each one — so you always know where you are in the five. Speed, pause,
repeat and translation sit along the bottom and are the same settings as on the
main bar, not a second copy.

It works the same from Study and from a set you have just generated. Space plays
and pauses, the arrow keys move between sentences, and Escape leaves.

The Italian is now set in a serif face throughout, not just in Focus mode.


## v1.6.0 notes — one playback bar, and a verb table that covers the corpus

Study and Generate now share one playback bar, so the controls look and behave
the same wherever you are, and the speed you set in one place is the speed you
get in the other.

The verb drill's table has gone from 46 verbs to 112. It is now generated by a
rule-based conjugator (`tools/conjugator/`) rather than written by hand, and it
was validated by reproducing all 46 of the original tables exactly before being
trusted with anything new. Participles agree with essere (*siamo andati/e*),
verbs taking both auxiliaries show both (*abbia cominciato / sia cominciato/a*),
and reflexives place their clitic correctly (*ci siamo fermati/e*).

## v1.5.0 notes — a calmer study screen

The heading now reads "Book 1 · Present Subjunctive › Chapter 4 · Impersonal
expressions › Group 16" instead of bare numbers. Chapter names come from the
`ChapterTitle` column in your corpus CSVs; book names you set yourself under
**Manage library**.

If your sentences are already imported, open **Manage library → Import CSV**,
choose your corpus file and press **Update chapter names only**. It reads the
titles and applies them without adding or duplicating anything.

Playback settings now live in one bar at the foot of the screen, per-sentence
actions are compact icons, Import/Export/Clear all have moved into Manage
library, and the library sidebar can be collapsed.

Icons are now drawn inline rather than fetched from a CDN, so the app makes no
third-party requests and works fully offline.

## v1.4.0 notes — shadow straight from the Generate tab

Generated sentences are now playable where they appear. The set shows as cards
with the same controls as Study — repeat, speed, pause, playback mode with loops,
Start/Pause, sentence navigation and tap-to-jump — so you can shadow a set the
moment it arrives.

Use **✕ Drop** to remove any sentence you do not want, then **Save to library**
to file the rest. Saving leaves the set on screen and playing.

## v1.3.0 notes — private sentence generator

The Generate tab now works through a small relay you host yourself on
Cloudflare, rather than calling an AI provider straight from the browser.
Google does not accept requests made directly by a web page, and this also
keeps your API key out of the browser entirely.

**Setting it up is a one-off, browser-only job — see `SETUP-GENERATOR.md`.**

In Settings you enter two things: your generator's address and a passphrase
you invent. No provider key is stored in the app.

## v1.2.0 notes — Generate tab

A new **Generate** tab writes fresh shadowing sentences around any word or expression you want to drill.

Enter the target expression, pick the number of sentences, the tense or mood, and the register. The sentences are written into the standard corpus template — the same twelve columns as the Italian Subjunctive and Pronominal Verbs CSVs — and then read back through the ordinary CSV importer, so a generated set behaves exactly like a hand-made one.

Saved sets go into the book **Generated**, one chapter per target word, in groups of ten. Generating the same word twice continues the numbering rather than overwriting. **Download CSV** saves the set as a file if you would rather edit it in a spreadsheet first.

### Setup

Settings → *AI sentence generation (OpenAI)*: paste an OpenAI API key, adjust the model name if needed, and set *Save locally* to keep it on this browser.

The key is held in this browser only and sent directly to OpenAI. Note that a key saved into a publicly deployed copy of the app is readable by anyone who opens that copy — for a public or paid release, move the call behind a small server-side proxy instead.

Generated Italian is usually sound but is not guaranteed. Read a set through before drilling it.

## v1.0.3 notes

This build keeps the v1.0.2 loop controls, but fixes a playback issue where the first sentence could speak and later sentences could advance visually without speaking. It also updates the service-worker cache name so GitHub Pages/iPad browsers are more likely to fetch the new code after deployment.


## v1.0.2 notes

Playback now separates repeat count from loop mode again.

- **Repeat each sentence** controls how many times each sentence is spoken before moving on.
- **Playback mode** controls the range and whether it loops.

The default mode is hands-free progression through the current group, with 1.0× speed and a short pause.

ElevenLabs requests now have a timeout. If ElevenLabs stalls or fails, the app falls back to the system voice instead of hanging indefinitely.

## Deployment

Replace the existing GitHub Pages files as a set, commit to `main`, push to GitHub, then allow GitHub Pages time to redeploy.

If the old version remains visible, unregister/clear the service worker or remove website data for the app, especially on iPad/iPhone.
