# Changelog

## v1.10.2 — pronunciation-free stabilization

The pronunciation preview and all associated controls, renderer code, styles, and tests have been removed. No pronunciation corpus or derived pronunciation data is included. The feature is deferred until source-data licensing and linguistic validation are complete.

### Security

Premium ElevenLabs speech now uses the same authenticated Cloudflare relay as sentence generation, so the provider key is no longer entered or stored in the browser. Relay passphrases are session-only and legacy persistent values are migrated once and deleted. The relay now validates exact request schemas, types, target text, count, tense, register, avoid lists, body sizes, output sizes, origins, approved premium voices and models, and provider responses. It supports Cloudflare native rate limiting plus independent generation and speech kill switches. CSV exports neutralize spreadsheet formulas, and the static app includes a restrictive Content Security Policy and deployment-ready security headers.

### Accessibility and interaction

Sentence selection and every library hierarchy item are native buttons. Desktop tabs implement arrow, Home, and End navigation. Dialogs expose names, trap focus, close with Escape, make the background inert, and return focus to their launcher. Visible form labels are programmatically associated, status changes use live regions, focus indicators and contrast are corrected, and repeated touch controls meet a 44-pixel minimum target. The original sentence remains ordinary text for assistive technology.

### Reliability and recovery

Media Session play, pause, and stop now follow one explicit active-player owner across Study, Verb Drill, and Generate. A versioned complete JSON backup preserves sentences, bookmarks, difficulty flags, notes, hierarchy titles, and non-secret preferences; restore validates all data and replaces the sentence store atomically. Provider secrets, session passphrases, cached audio, and pronunciation data are excluded. Clearing the device now requires typing `DELETE ALL`.

The service worker pre-caches the complete shell, uses network-first navigation with offline fallback, and waits for the learner to approve a ready update. The first installation no longer causes an unsolicited reload. A single version command synchronizes HTML, JavaScript, CSS, service-worker, and package markers.

### Repository and verification

Pinned development dependencies, a lockfile, CI workflow, `.gitignore`, security policy, relay configuration example, and expanded documentation have been added. Nine automated suites pass **352 checks**. Final mobile Lighthouse scores are **97 Performance, 100 Accessibility, 100 Best Practices, and 100 SEO**; measured cumulative layout shift is effectively zero.

## v1.10.1

Four changes to the pronunciation preview, all from Siro's reading of it.

### Words Italian already accents
**è, perché, già, città and their kind are now marked** — coloured, but never re-spelt. Under the open-and-closed notation a bare stressed vowel means *not in the lexicon*, so leaving *è* uncoloured made the commonest word in the corpus look unknown.

The rule is now absolute and applies in every notation, IPA included: **if ordinary spelling already carries the accent, the letter keeps its shape.** Two earlier attempts got this wrong in ways the preview exposed — IPA notation turned *città* into *citta* and *perché* into *perche*, throwing away the stress the accent was carrying. Marking is not transcription; the app must not re-spell a word the language already spells.

### Capital IPA
Siro asked whether the IPA symbols can be capitalised. **IPA itself has no capitals** — case is contrastive in the alphabet, so there is no uppercase ɛ. Unicode does carry look-alike capitals borrowed from African orthographies, **Ɛ (U+0190)** and **Ɔ (U+0186)**, and they render correctly in every serif the app uses. A sentence opening on a stressed open vowel — *Ecco* — therefore reads **ˈƐcco** in IPA notation and **Ècco** in the two spelling notations.

### Irregular stress
Now shown, in both mechanisms:
- **Spelling notations**: a grave accent on the stressed vowel — *mèdico*, *àbita*. Where the vowel is e or o the aperture mark already does this work, so no second cue is added.
- **IPA notation**: the primary-stress bar **ˈ**, placed **before the syllable**, not before the vowel — *ˈmɛdico*, *Teˈlɛfono*. Placing it before the vowel would be wrong IPA and would teach the wrong habit. Correct placement needs syllable boundaries, which both candidate lexicons supply.

### Both notations stay
Open-and-closed and IPA both remain, switchable. No decision forced.

### Notes
457 checks pass, 18 of them on the pronunciation preview. The demo sentences are now addressed in tests by their opening words rather than their position, so inserting one cannot silently re-point a check — which it did, twice, while this was being written.

## v1.10.0

### Added — Pronunciation help, as a preview only
A panel at the top of **Settings** showing how pronunciation marks would look in the app's own typeface, on your own screen. It changes nothing about study, playback or the corpus; it exists to answer questions that cannot be answered from a screenshot.

- **Three notations to compare**: open vowels only (è ò), open and closed (è é ò ó), and IPA vowels (ɛ e ɔ o). Voiced s and z are marked ṡ and ż in all three.
- **Two mark colours**: terracotta and the app's red.
- **The whole marked letter takes the colour**, per Siro's decision. That is also the simpler engineering: a diacritic cannot be coloured apart from its letter — proved by prototype — but an ordinary è can be coloured entire, with no overlay and no dependence on font metrics.
- **The data model from the handover, in miniature.** Canonical text is stored untouched; marks live in separate metadata addressed by word and character; the renderer combines them at display time. Switching notation or colour alters no stored text. Tests assert that rendering never changes a sentence's length and never alters an unmarked character.

### On the demo sentences
Every mark was placed by hand and checked one word at a time. This is not incidental: writing the first set of examples freehand, I marked the *e* in *spettacolo* (stressed on -ta-), accented the wrong *e* in *vedere*, called *questo* open when it is closed, and marked the double *s* in *rilassato* as voiced when a double s is always voiceless. Four errors in two lines. Italian stress and vowel aperture are lexical, not derivable from spelling, and that is the whole argument for a lexicon rather than rules or a language model.

### Noted for decision
In IPA notation a closed vowel renders as a plain **e** or **o** — the same glyph as an unmarked letter, distinguished only by colour. The handover was right to say the feature must not rely on colour alone for meaning, and this is the one notation where it does.

### Fixed
- `Build.VERSION` was left at 1.9.2 while the other three files moved to 1.10.0. The version check added in v1.9.2 caught it on its first real outing, which is what it was for.

### Notes
449 checks pass, 12 of them new. Nothing in the study path, the playback engine or the CSV round-trip was touched.

## v1.9.2

### Fixed — the service worker never invalidated, so no device could get a new version
`sw.js` carries a cache name that must change every release; changing it is what tells a device its stored copy is out of date. It is edited by hand, and **it sat at `v1-8-6` through the v1.9.0 and v1.9.1 releases**. Both of those shipped a service worker announcing itself as v1.8.6, so every device kept serving the files it already had and quietly ignored the new ones.

No browser test could see this. The test suite serves the files directly and never registers a service worker, so the suite passed while the thing that delivers the app to a real device was broken. There is now a check that reads the four files straight from disk and requires app.js, index.html, styles.css, sw.js and the visible title to name the same version. That check fails loudly if any of them drifts again.

### Fixed — a mismatched set of files now says so
The live site was serving `index.html` and `styles.css` from v1.9.1 alongside `app.js` from v1.8.2. Markup and code from different versions do not fit together, and nothing on screen explained why the app misbehaved.

Every file now carries its version, and the app compares them the moment it starts. If they disagree it puts a red band across the top naming the offending file and its version: *"These files are from different versions. app.js is v1.9.2, but index.html is v1.8.2. Upload all six files again from the same folder."* A service worker a single patch version behind is normal for a moment after an update and is not reported.

### On the cause
Every release put a new folder of six identically-named files into the same Downloads folder. By this release there were 78 of them, sorted so that v1.8.2, v1.8.6 and v1.9.1 sat side by side. Dragging the wrong `app.js` was not carelessness — it was close to inevitable, and the delivery method made it so. The old folders have been moved into `_shadowing-studio-old-versions/`; nothing was deleted.

### Notes
437 checks pass, 15 of them new.

## v1.9.1

### Fixed — the Tense buttons
v1.9.0 replaced the two buttons reading "← Tense" and "Tense →" with bare skip icons, identical to the ones Study uses to move between sentences. Nothing on the screen said what they moved. Siro reported them as having disappeared, and that is the right description: a control you cannot identify is not there.

They read **‹ Tense** and **Tense ›** again. Study's arrows can be wordless because they move between sentences you can see on the same screen; nothing on the verb drill tells you a bare arrow changes the tense.

This was my error in scope. The handover's section 05 asks for icons in place of the three full-width buttons repeated in every sentence row — a list of repeated controls, where the words are noise. It does not ask for the transport to lose its labels.

### Fixed — the same sentence filed under two group numbers
On Siro's iPhone, every chapter listed its groups twice: once numbered 1–5 and again numbered 11–15. The cause is two imports whose `Group` columns are numbered differently — one running on across the book, one restarting at 1 in each chapter — so each sentence is stored twice at different positions.

The tidy-up could not see it. It keyed on book, chapter, **position** and text, and position is precisely what differs. It now also catches the same words in the same chapter at a different position, names that case in the confirmation rather than lumping it in, keeps the copy in the earlier position, and carries across any bookmark, difficulty mark or note from the copy being removed rather than losing it.

**Manage library → Remove duplicated sentences** will clear it.

### Checked and found innocent
Exporting and re-importing was the obvious suspect and is not the cause: the round trip preserves group numbers exactly. Recorded here so it is not suspected again.

### Notes
422 checks pass, 10 of them new — including one that requires the tense controls to carry the word "Tense" on the button, which is the check that would have caught this.

## v1.9.0

Release 5 — the verb drill. The last release in the handover's plan, and the one it marked optional.

### Changed — the verb drill screen
- **Eight standalone fields become one compact bar.** Verb source, verb, mode, repeat, speed, pause, Start and the two tense buttons filled two rows of large controls above the conjugations. Start, the tense buttons and the four settings now sit in a bar at the foot, built from the same rules as Study's rather than a copy of them, so the two cannot drift apart. The verb and its source stay at the top, because choosing what to drill is not a playback setting.
- **The heading says what you are drilling.** It read "Verb drill" and a line of explanation. It now reads *Verb drill › avere — to have › congiuntivo presente*, and follows as you move through the tenses.
- **The detected line names the scope it searched.** It said "Detected verbs (81 of 112 in the table)" without saying where it had looked, so the same number could mean a book or the whole library. It now reads *Detected in Chapter 4 · Impersonal expressions — 9 of the 112 verbs the table holds*. Siro asked for this some time ago and it was deferred; this was the release for it.
- **Pre-download moved into the overflow menu**, as an exceptional action. It was a full-width green button sitting on the screen at all times. The two overflow menus now share one behaviour rather than two copies, and opening either closes the other.
- **One box fewer.** The reference form was a shaded panel repeating the verb name and its gloss, both of which are now in the heading. It is a line of small print.
- **The active tense card carries a green left rule**, the same mark the active sentence carries, rather than a background tint alone.
- On a phone the conjugation cards stack one per row instead of squeezing into two columns.

### Fixed
- **Grid slots in the playback bar are named by class, not by id.** v1.7.0 shipped a control with no slot, which put it in an invisible third row. A second bar with different ids would have walked into the same trap; it now cannot, and the test checks every bar in the document rather than only Study's.
- **The phone heading rule missed the verb drill.** It was written for `#crumb` and the new heading is `#verbCrumb`, so the verb heading sat on the illustration at 2.16:1. Now written for any heading. The current step is marked by weight rather than colour there — amber on a pale watercolour measured 2.27:1.
- **The clear zone at the top of the phone screen is now as deep as that screen's heading and no deeper.** The verb drill packs a heading, two selectors and a reference line into the space Study gives to a heading alone, and the deeper zone put all of it on the picture. Study keeps the depth Siro approved.

### Notes
- The verb drill keeps its own repeat, speed and pause. "Repeat each tense" is not "repeat each sentence"; that separation was deliberate in v1.6.0 and is still tested.
- The contrast measurement now covers the verb drill as well: worst case **5.42:1 light, 4.94:1 dark**.
- 412 checks pass, 22 of them new.
- This completes the release plan in the Rev 2 handover.

## v1.8.6

### Fixed — the phone backdrop was invisible, and Siro was right about why
v1.8.5 put the villa behind the phone heading, passed every check I had written, and showed nothing on the actual phone. The cause was geometry, not opacity.

The picture is square. Sized to cover a tall phone screen it scales until only a narrow vertical strip shows — and the one band where the panel is translucent sits at the top of that strip, which is **sky**. Pale cream sky, over a pale cream panel, is nothing. The villa and the cypresses were there the whole time, behind the opaque part of the panel, a couple of hundred pixels further down.

It is now a band across the top of the screen rather than a full-screen cover, positioned so the villa and the cypresses fall where you can see through. Measured against the previous build, the heading band now differs by 27 of 255 per channel in the light theme and 30 in the dark. Before, it was under 2.

### Added — a test for whether you can see it
Every check in v1.8.5 passed on a screen showing nothing. Contrast tests cannot catch an invisible image; they are happiest when there is no image at all. So the suite now takes two screenshots — one with the backdrop, one without — and requires a minimum measurable difference across the heading band, in both themes. That is the check that would have caught this, and it is the one I should have written first.

### Changed
- The voice chip on the phone now has the ground a chip ought to have. It sits over the illustration, and at 2.87:1 it was the least readable thing on the screen; as a pill with a solid background it clears AA comfortably.
- No mask on the backdrop any more. The panel gradient does the fading on its own, and one fewer exotic CSS property is one fewer thing to behave differently in Safari.

### Notes
- Worst contrast behind text: **5.24:1 light, 4.82:1 dark**, both above the 4.5:1 bar.
- 391 checks pass, 2 of them new.

## v1.8.5

### Added — the villa behind the phone screen
A phone has no room for the illustration beside the text, so on a phone it now sits behind it — but not behind the sentences. The panel surface is nearly clear at the top of the screen, where only the heading sits, and is solid paper again by the time the first sentence arrives. The villa reads plainly where there is nothing to read, and fades out where there is.

This deliberately relaxes the handover's *never behind text* rule, at Siro's request, and only for the heading. What that rule protects is contrast, so contrast is now measured rather than assumed.

### Fixed — a contrast failure that predates all of this
Measuring for the backdrop turned up something that had nothing to do with it. **The English translation under each sentence had never met WCAG AA**, on any screen, in any version: 3.46:1 on a light phone and 2.71:1 on a dark one, against a 4.5:1 requirement. The muted colour was too pale in the light theme and too dim in the dark one.

- `--muted` is now `#546953` in the light theme (was `#748a74`) and `#968f85` in the dark (was `#6b6660`). Both clear AA with headroom on every ground the app uses, including the pale active row.
- **This is visible everywhere, not just on phones** — the English translations, small print and field labels are all a little stronger now. It is a change nobody asked for, and it is here because granting the request safely required fixing it first.
- On a phone the breadcrumb is now ink rather than grey. Strengthening that text is what buys the picture its visibility; without it the wash has to stay so faint it is not worth having.

### How the contrast is now held
The tests hide the text, photograph the ground underneath it, and check the worst single pixel behind every heading, Italian and English line against the colour that text is actually drawn in. Current worst case: **5.53:1 light, 4.82:1 dark**, both above the 4.5:1 bar, and light is now better than it was before the backdrop existed. Push the wash too far and the suite fails. The screenshot is decoded inside the browser, so the tests still need nothing but Playwright.

### Notes
- Dark mode gets a hint rather than a picture, and that is the honest ceiling: a visible image and readable light text pull in opposite directions there. The image is held dark so the text stays legible.
- The playback bar stays opaque. It is sticky, and anything translucent there shows the list sliding underneath it, which reads as a fault rather than a wash.
- Nothing changes on iPad or desktop except the muted colour.
- 389 checks pass, 8 of them new.

## v1.8.4

### Fixed
- **A collapsed library could only be reopened from Study.** The Show library button lived inside the Study panel, so putting the library away and then switching to Verb drill, Generate or Settings left no way back — you had to work out for yourself that returning to Study was the route. It now sits in the tab row, which is on screen whichever panel is open. Reported by Siro; it had been there since v1.5.0.

### Changed
- **The illustration follows the library.** With the library open it stays where it was, above the tree. Collapse the library and it moves into the top-left corner of Study, Verb drill and Settings — the corner Generate already uses — rather than disappearing. Open the library again and it hands the picture back. Generate keeps the arcade throughout.
- All nine combinations of panel and library state are now tested, and every one of them shows exactly one illustration.

### Notes
381 checks pass, 17 of them new.

## v1.8.3

Rolled into v1.8.4 before delivery. Listed for continuity only.

## v1.8.2

### Changed — the artwork is now Siro's, not mine
v1.8.0 shipped four architectural motifs and an arch mark that I drew. That was the wrong call: Siro had said he wanted to keep the logo and illustrations from the mockups, and I substituted my own work without putting the choice to him. I also justified it partly on file size, having guessed at the numbers rather than measured them — the guess was out by an order of magnitude.

- **The logo is now the Ionic capital with its olive branch**, taken from Siro's iPad mockup. Embedded at 140 × 164 so it stays crisp on a retina screen. About 10 KB.
- **The library illustration is now the watercolour villa.** About 13 KB as a JPEG. It is one image rather than one per book, which is what having a real illustration costs, and it is the right trade.
- **Generate has its own picture** — the cypresses seen through the arcade, from the Reader mockup — so the tab that invents new material does not look like the library. The library's image steps aside while Generate is open, keeping one illustration on screen at a time. About 7 KB.
- All three are embedded as data rather than kept as separate files. Nothing extra to upload, nothing that can 404, and no way for a missing file to make the service worker fail to install — which on iOS would have left the app stuck on an old version. The app still makes no third-party requests and still works offline. Total cost about 30 KB against 159 KB of code.
- The pale watercolour is dimmed and desaturated in the dark theme rather than held as a second image.
- On a phone both illustrations are hidden; the logo stays.

### On the handover
Section 07 asked for architectural and typographic motifs and warned off hills and cypresses as reading like stock imagery. Siro has chosen this image. It is his application and his taste governs; the document was written to serve the work, not the other way round. The rules that still hold, and are still tested, are the ones about placement: one image at a time, never behind text, decorative to assistive technology.

### Notes
364 checks pass. The illustration tests were rewritten: they now check that both images load rather than 404, that they are embedded rather than fetched, that each tab shows exactly one, and that the page requests nothing from anywhere else.

## v1.8.1

Superseded within the hour by v1.8.2, which adds the Generate illustration. Listed for continuity only.

## v1.8.0

Release 4 of the interface redesign — pedagogical enrichment — plus the speed ladder Siro asked for.

### Changed — playback speed
- **The speed control now runs 0.5×, 0.6×, 0.7×, 0.8×, 0.9×, 1.0×**, replacing 0.4×/0.6×/0.8×/1.0×. 0.4× was too slow to shadow against, and the coarse steps left nothing usable between 0.6× and 0.8×. Applied to all three speed controls — the playback bar, Focus mode and the verb drill — so they stay in step. Normal speed remains the default. This is only worth doing now that v1.7.2 made the control actually reach the ElevenLabs voice.

### Added — the book illustration
Release 4 in the handover reads: *importer keeps ChapterTitle; book-level titles added; corpus re-imported; ContextHeader shows the full hierarchy; book-level illustration introduced.* The first four shipped in v1.5.0 and were verified against the real corpus. The illustration is what was left.

- **Each book now has an architectural motif** — an arcade, a colonnade, a pedimented facade or an arched portal — chosen from the book's own identifier, so a book always wears the same face. It appears in the library above the tree, for the book you are currently in.
- **The empty library carries one too**, and the application header carries a small mark drawn by the same hand. That mark is the app's identity; the handover asked for one logo treatment rather than the two different ones in the mockups.
- **The rules from section 07 are honoured and tested**: one image visible at a time, never behind text, marked decorative so screen readers skip them, desaturated and inside the palette, with terracotta only as a single small detail. Architectural and typographic motifs rather than hills and cypresses, which the handover rejects as stock imagery.
- The drawings follow the theme: olive line work on ivory, amber on charcoal in dark mode, from the same source rather than a second set of files.
- On a phone the library motif is hidden. A narrow screen has better uses for 110 pixels.

### Notes on how they are made
- **Drawn in the files, not fetched.** The app makes no third-party requests and must work offline — the CDN icon font was removed in v1.5.0 for exactly this reason — so an illustration has to travel inside the six files. Line art costs two or three kilobytes where a painted image would cost several hundred, and scales to any screen without a second asset.
- **This is a different aesthetic from the mockups**, which showed a painterly arch vignette. That difference is deliberate and is the one judgement here worth disagreeing with: if the painterly treatment matters more than offline weight, say so and it can be embedded instead, at a cost of roughly 200–400 KB per book.

### Not done, and why
- The editorial header treatment from Reference C was left alone. The breadcrumb already delivers the readable hierarchy Release 4 asks for, it has been in use since v1.5.0, and restyling something that works to match a mockup is not a good trade this late in the sequence.

### Notes
362 checks pass, 16 of them new.

## v1.7.2

### Fixed
- **Changing the speed had no effect on the ElevenLabs voice.** It never had, on any platform, in any version. The system voice was fine because its rate is set on the utterance itself; the ElevenLabs voice plays a downloaded clip through an `<audio>` element, and the app set `playbackRate` on that element *before* assigning its `src`. Loading a clip resets `playbackRate` to `defaultPlaybackRate`, so the rate was thrown away every time and every clip played at 1.0×. The app now sets `defaultPlaybackRate`, which the load preserves, and reasserts the rate once the clip is loaded.
- **Pitch preservation is now explicit.** Slowing a voice down without correcting the pitch drops it by the same factor, which is no use for shadowing. Browsers do this by default now, but older WebKit does not, and saying so costs nothing.

### Notes
- Recordings are still cached by voice and text only. Speed is applied on the way out, so changing it costs neither a new ElevenLabs request nor a cache miss.
- 346 checks pass, 6 of them new. The important one times real audio rather than reading the property back: a one-second clip takes about 1.13 seconds at 1.0× and about 2.59 seconds at 0.4×. Reading `playbackRate` back would not have caught the original bug, because the app was setting it — the browser was discarding it afterwards.
- Not verified on Safari. Chromium honours 0.4× on audio; some browsers mute playback outside a range they consider useful (Firefox's is 0.25×–4.0×) and WebKit's threshold is not documented. If 0.4× turns out to be silent on the iPhone or iPad while 0.6× is fine, that is what is happening, and the fix is to time-stretch through the Web Audio API instead.

## v1.7.1

Two defects found on Siro's iPhone after v1.7.0, and a third that was waiting to happen.

### Fixed
- **The Focus button did not appear on a phone.** At 480px and below the playback bar becomes a CSS grid with named areas, and v1.7.0 added `#openFocus` to the bar without giving it one. An unplaced grid child is auto-placed into a new implicit row, so the button was laid out full-width in a *third* row beneath the settings, pushing the bar from 175px to 227px tall and putting the button off the foot of the screen. It now has its own area beside Start. Measured at 390px and at 320px: bar back to two rows, button 44 × 44.
- **Importing a corpus twice silently doubled it.** Every sentence appeared twice and playback spoke both. The importer added whatever it was given, with no idea what the library already held. It now compares each incoming sentence against the library before adding anything, and says what it will do before it does it: *"Detected 760 sentences. 758 are already in your library, word for word, and will be skipped. 2 have changed since you imported them and will be updated in place. Nothing new will be added."*
- **A corrected sentence was added beside the old one rather than replacing it.** Found while writing the test for the above. A sentence's place in the corpus — book, chapter, position — is its identity: same place and same words is a duplicate and is skipped; same place, different words is a correction and is written into that slot, keeping any bookmark, difficulty mark or note you had put on it. This matters ahead of the pronunciation column, where re-importing a revised corpus will be routine.

### Added
- **Manage library → Remove duplicated sentences**, for a library that was doubled before the guard existed. It keeps one copy of each sentence, says how many it will remove, and asks first.

### Notes
340 automated checks pass, 35 of them new. Eight of the new ones are a layout check on the phone playback bar — that it lays out in two rows, that every control in it has a place in the grid, that none sits outside the bar or overlaps another, and that the Focus button is on screen and at least 40 × 40. That class of defect had no test at all before.

## v1.7.0

Release 3 of the interface redesign: Focus mode.

### Added — Focus mode
- **A full-screen shadowing view.** The playback bar gains a *Focus* button. It clears everything away — library, tabs, rows, buttons — and leaves one sentence in large type, its translation beneath, and the transport. It is the screen you want on a music stand or in your hand while you are actually speaking.
- **It shows you where you are in the repetition, which nothing did before.** Under the sentence it reads *Repetition 2 of 5* with one dot per repetition, filling as they go. Until now the app repeated a sentence five times and gave you no way of knowing which one you were hearing. Before playback starts it reads *5 repetitions each*, so the setting is legible at a glance.
- **It opens from Study and from a generated set**, and it does not care which: it drives whichever player is already in charge, so a generated set behaves in Focus exactly as an imported chapter does.
- **The settings are the same settings.** Speed, pause, repeat and translation appear along the foot, prefilled from the playback bar. Change one in Focus and the bar has it too — there is no second copy to fall out of step.
- **Keyboard**: Space plays and pauses, ← and → move between sentences, Escape leaves. On the way out the app returns to where Focus finished, not where it started.
- On a phone the heading drops the book name and wraps, so the chapter title survives rather than being cut to *Book 1 · Present Subj…*.

### Changed
- **`PlaybackEngine` gained two lines**, and only two: `if(item.onRepeat)item.onRepeat(...)` in each of its two repetition loops. This is the one place that knows which repetition is playing, so it is the only place the count can come from. Nothing existing was altered, and an item that carries no `onRepeat` runs exactly as before — there is a test for precisely that.
- **The Italian is now set in a serif face** (Iowan Old Style, Palatino, Georgia) in Study as well as in Focus. This is a visible change beyond Focus mode itself, and part of the visual direction in the handover rather than something asked for separately. Reverting it is a one-line change to `.italian` in `styles.css` if it is not wanted.
- Switching tabs now closes Focus mode, and stops whatever it was playing.

### Notes
305 automated checks pass, 53 of them new and specific to Focus mode. `Speech`, `WakeLock`, `MediaSessionMgr` and the CSV template round-trip are byte-identical to v1.6.0.

## v1.6.0

Release 2 of the interface redesign, plus a rebuilt verb table.

### Changed — one playback bar
- **Study and Generate now share a single playback bar.** It is built once and moves to whichever tab is on screen, so there is one set of controls with one appearance rather than two that could drift apart. Generate keeps its generation form, Drop, Save to library and Download CSV.
- Generate's own `#genRepeat`, `#genRate`, `#genPause`, `#genPlayMode` and transport buttons are gone. `PlaybackControls` no longer has a `gen` branch; only the verb drill keeps separate settings, because it drills conjugations rather than sentences.
- Three consequences, each deliberate: Generate now inherits Study's default mode ("this group" rather than the whole set); Generate's repeat loses its ∞ option, since Study's has not carried one since v1.0.2 and the loop scopes cover it; and the display-mode setting hides while the bar is on Generate, being a Study-viewer setting.
- Translation visibility is now shared too. The Generate form's own "English translations" choice still governs whether translations were requested at all.
- The playback scopes map onto a generated set as: this sentence → the selected one, this group → the current ten, this chapter → the whole set.

### Changed — the verb table
- **46 verbs became 112.** Measured against the corpus, the old table found no verb at all in 491 of 2,460 sentences — one in five — and missed 70 infinitives including *restare*, *decidere*, *cominciare*, *scegliere* and *ascoltare*. Hand-writing tables was the wrong approach; the new table is generated by a rule-based conjugator, kept in `tools/conjugator/`, which reproduces all 46 original tables exactly (644 of 644 forms) before being trusted with anything new.
- **Participles now agree.** Compound tenses with *essere* show gender and number: *sia andato/a*, *siamo andati/e*. With *avere* the participle stays invariable. The old code pluralised from an eleven-entry lookup with no feminine forms at all, so it could not have expressed this even for the verbs it knew.
- **Verbs that take both auxiliaries show both**: *abbia cominciato / sia cominciato/a*. This applies to *cominciare*, *ricominciare*, *continuare*, *cambiare*, *aumentare*, and also corrects *finire* and *vivere*, which were previously stored as *avere* only.
- **Reflexives are handled properly**: the clitic sits before the auxiliary and the participle agrees — *ci siamo fermati/e*, not the *ci siamo fermato* the old code would have produced.
- **What is displayed and what is spoken are now separated.** The screen shows *sia andato/a*; the voice is given *sia andato*, because "andato slash a" is not a sentence. Dual-auxiliary verbs are spoken with the first auxiliary only.

### Changed — other
- The empty library message now says that a library belongs to the device it was imported on, and how to move one across.

### Added
- `tools/conjugator/` — the generator, its validation test against the original 46 tables, and a report listing the judgements a human Italian speaker should check.

### Notes
252 automated checks pass. `PlaybackEngine`, `Speech`, `WakeLock`, `MediaSessionMgr` and the CSV template round-trip are byte-identical to v1.5.2.

## v1.5.2

### Fixed
- **The playback bar was unusable on a phone.** At 390px the Start button, two transport buttons, four settings and the overflow button were all competing for one flex line, so the four selects collapsed to about 30px each — no value visible, and the "Repeat"/"Speed" and "Pause"/"Mode" labels printed on top of one another. The bar is now a grid at phone width: transport across the top, settings in two columns beneath. Fields go from roughly 30px to 168px. iPad and desktop are unaffected — measured at 1024px, the fields were already 107px and are unchanged.

## v1.5.1

### Fixed
- **`riuscire` was never detected by the verb drill.** It was simply absent from the conjugation table, so a chapter built around *riuscire a* would list every verb in the sentences except the one being studied. Added, with the correct present and imperfect subjunctive, `essere` as its auxiliary and plural participle agreement.
- **`sapere` was declared twice in the verb table.** Harmless in effect, since the second entry was identical and silently replaced the first, but it meant the table reported one fewer verb than it held.
- Also added `rimanere`, `tenere`, `sembrare` and `piacere`, which the corpus uses and the table did not hold. The table now covers 46 verbs.

### Changed
- **The verb drill now says when a verb in view is outside its table.** The detected line reads "Detected verbs (10 of 46 in the table)", and where an infinitive appears that cannot be conjugated it is named: "Possibly also here, but not in the 46-verb conjugation table: *viaggiare*." Previously such verbs were dropped in silence, which is how `riuscire` went unnoticed.
- Cache name updated to `v1-5-1`.

## v1.5.0

Release 1 of the interface redesign. The study screen is quieter, the heading finally says what you are studying, and the library gets out of the way.

### Added
- **A readable heading.** "1 — 4 — Group 16" is now "Book 1 · Present Subjunctive › Chapter 4 · Impersonal expressions › Group 16". Chapter names come from the `ChapterTitle` column your corpus files already carry; book names are yours to set under Manage library.
- **Titles are kept, at the level they belong to.** New `Titles` module holding book and chapter names outside the sentence records, since a chapter name describes a chapter and not 2,460 rows.
- **Update chapter names only** in the import screen. Reads `BookTitle` and `ChapterTitle` from a CSV and applies them to sentences you already have — no additions, no duplicates, bookmarks untouched.
- **Manage library**, a screen of its own for importing, exporting, naming books and clearing everything.
- **A collapsible library.** Hide the sidebar to give the sentences the full width; the choice is remembered.
- **A shared `SentenceRow`** used by both Study and Generate, so the two lists can no longer drift apart.

### Changed
- **Playback settings collapsed into one persistent bar** at the foot of the study screen, which stays put while the sentence list scrolls.
- **Reset audio demoted** out of the main control row into an overflow menu, along with display mode and translation visibility.
- **Per-sentence actions are now compact icons** — play, bookmark, edit — instead of three full-width buttons in every card. A dedicated edit icon is used rather than burying it behind a second menu, since a menu holding one item is only an extra tap.
- **Fewer boxes.** Sentences are rows separated by dividers rather than cards inside cards.
- **The active sentence is unmistakable**: a green left rule, a pale background, heavier text, `aria-current`, and a speaker mark while it is playing. Never colour alone.
- **The duplicated Book / Chapter / Group dropdown stack is gone.** The tree and the breadcrumb do that job.
- **Search moved into the library panel** and now looks across the whole library rather than the current group, showing each match with its location. Selecting one opens its group.
- Cache name updated to `v1-5-0`.

### Fixed
- **Icon-only buttons were invisible offline.** The interface icons came from a CDN stylesheet the service worker does not cache, so with no connection every icon-only control rendered as a blank square. This did not matter while the buttons carried text; it would have mattered a great deal now that they do not. All icons are inline SVG, the external font is gone, and the app no longer makes any third-party request.
- Mobile-only controls leaked onto the desktop layout because a later, more specific rule overrode `.mobile-only`.

### Playback
Untouched, as required. The engine, the scopes, the iOS audio handling, the wake lock and the media session are all unchanged — the 209 automated checks confirm the scopes still yield exactly the same sentences in the same order.

## v1.4.1

### Fixed
- **A refused sentence edit corrupted the sentence in memory.** `Editor.save()` wrote the form's contents onto the sentence object *before* checking that the Italian was non-empty, so clearing the Italian and pressing Save left the in-memory sentence blank even though the save was rejected and nothing reached storage. Bookmarking that sentence afterwards would then have written the empty text to the database permanently. Validation now happens before anything is assigned. Found by the new regression suite.

### Added
- **`tests/` — a regression net covering the app as it behaves today.** 182 automated checks across three suites, run against a real browser: 98 for the library, Study and Verb drill, 59 for Generate and the relay client, 25 for the relay worker. `node tests/run-all.mjs` runs the lot and gives one verdict. This is Release 0 of the UI redesign plan: nothing user-visible changes, but every later release now has something to fail against.

### Changed
- Cache name updated to `v1-4-1`.

## v1.4.0

### Added
- **Shadow generated sentences without leaving the Generate tab.** The set now appears as cards with the full Study control set: repeat count, speed, pause, playback mode (current sentence / group of ten / whole set, each with a loop variant), Start-Pause, previous and next sentence, and tap-a-sentence-to-jump. No import step, no switching tabs.
- **✕ Drop** on each card removes a sentence from the set before saving. The CSV template rows renumber immediately, so groups stay tidy.
- Per-card **Play** for auditioning a single sentence.

### Changed
- **Save to library no longer clears the set.** Sentences stay on screen and keep playing; the button changes to "Saved ✓" and disables until you drop a sentence or generate again.
- **A failed generation no longer discards the set you were working on.** The previous sentences remain until new ones actually arrive.
- The Generate tab has its own repeat, speed and pause controls, independent of Study's. `PlaybackControls` now resolves by playback context, so the three engines never read each other's settings.
- Only one of the three players can run at a time; leaving the Generate tab stops its playback, as Study and Verb drill already did for each other.
- When no sentence contains the target expression verbatim, the wording now explains that this is expected for pronominal and idiomatic forms rather than implying a fault.
- Cache name updated to `v1-4-0`.

## v1.3.0

### Changed
- **Sentence generation now runs through your own relay rather than calling a provider directly.** The app sends a target word, count, tense and register to a small Cloudflare Worker you host; the Worker builds the prompt, calls Google's Gemini API, and returns clean sentences. See `SETUP-GENERATOR.md`.
- **No API key is stored in the browser any more.** Settings now takes a generator address and a passphrase instead of a provider key. The Google key lives only on the Worker.
- **The prompt moved server-side.** A leaked passphrase now yields Italian practice sentences and nothing else, rather than general-purpose access to a language model.
- Failure messages rewritten in plain language: wrong passphrase, wrong web address, exhausted free quota, missing Worker settings, unreachable generator, and Google being down are each explained distinctly.
- The model that produced a set is recorded in the CSV `SourceFile` column.
- Service worker no longer intercepts relay traffic. Cache name updated to `v1-3-0`.

### Added
- `worker.js` — the relay. Checks the passphrase, restricts calls to your own web address, caps the number of sentences per request, and never echoes Google's error text (which can contain the key) back to the browser.
- `SETUP-GENERATOR.md` — non-technical, browser-only setup instructions.

### Notes
Choice of provider followed a comparison of thirty Italian generation tasks covering pronominal verbs, all four subjunctive tenses, tense control, discourse markers and clitic agreement. Gemini handled participle and clitic agreement correctly throughout and was adopted on that basis.

## v1.2.0

### Added
- **Generate tab — AI shadowing sentences from any target word.** Enter a word or expression (`farcela`, `magari`, `riuscire a`), choose how many sentences (10 / 20 / 30 / 50), the tense or mood, the register, and whether English translations are included. The sentences are generated, previewed in a table, and saved to the library ready to play.
- **The corpus CSV template is now internal.** `CSVTemplate` holds the canonical column set used by the Italian Subjunctive and Pronominal Verbs corpora — `ID, Book, Chapter, ChapterTitle, Group, Item, Italian, English, AudioText, TranslationStatus, SourceFile, Notes`. Generated sentences are written into that template and then read back through the ordinary CSV importer, so nothing about them is special-cased: verb drill, pre-download, export and playback all work on them unchanged.
- **Download CSV** on the Generate tab, so a generated set can be kept, edited in a spreadsheet, or re-imported elsewhere.
- **OpenAI settings** (API key, model, save-locally) in Settings, following the same pattern as the ElevenLabs panel. The key is stored in this browser only.
- Generated sets are saved to the book **Generated**, one chapter per target word, in groups of ten. Generating the same word again continues the numbering instead of colliding — a second run of ten lands as Group 3.

### Fixed
- **CSV `Group` and `Item` columns were ignored on import.** The importer only looked for an `order` column, so master-corpus files fell back to the row's position in the whole file and chapter 2's groups were numbered as though they continued chapter 1. `Group` and `Item` are now read when present and resolved to a per-chapter order, giving correct group numbers. Files without those columns are unaffected.

### Changed
- Requests to OpenAI are batched at fifteen sentences per call, with earlier sentences passed back to the model to avoid repetition, and duplicates dropped locally.
- If a model rejects `temperature` or JSON response mode, the request is retried progressively plainer rather than failing outright. Timeouts (90s), cancellation, and 401/429 responses are reported in plain language.
- The service worker no longer intercepts OpenAI traffic or any non-GET request. Cache name updated to `v1-2-0`.

## v1.0.6

### Fixed
- **Verb detection was incomplete**: the drill now checks infinitives, past participles (to catch compound tenses), and all subjunctive forms for every verb in the list — so verbs like *avuto*, *fatto*, *detto*, *venuto* found in the corpus are correctly identified.
- **Only 15 verbs in the library**: the built-in verb dictionary has been expanded from 15 to 40 verbs, covering the most common Italian verbs. New additions include: sapere, conoscere, partire, arrivare, uscire, chiedere, rispondere, dare, stare, mettere, prendere, portare, trovare, aprire, vedere, sentire, leggere, scrivere, vivere, dormire, lavorare, aspettare, amare, mangiare, chiamare, guardare.
- **Past participle plural forms**: the `part()` function now handles plural agreement for all irregular past participles (messo, preso, detto, letto, scritto, aperto, visto, ecc.), not just stato/andato/venuto.
- **Verb scope defaulted to "group" (10 sentences)**: with only 10 sentences per group, most groups contain no recognisable verbs. Default scope is now "chapter" for a much richer detection pool.
- **No feedback when falling back to full verb list**: the detected-verbs label now clearly distinguishes between "verbs detected in this scope" (green) and "no verbs detected — showing all available" (amber).

### Added
- **Verb audio pre-download**: a "⬇ Pre-download verb audio" button in the Verb Drill tab fetches and caches the ElevenLabs audio for every conjugation of every detected verb before playback. Same Cancel button and status feedback as the sentence pre-download.
- Pre-download buttons (sentences and verbs) are mutually disabled while the other is running, preventing conflicts.

### Changed
- Updated service-worker cache name to `v1-0-6` to force browsers to fetch new files.

## v1.0.5

### Added
- **Pre-download audio**: added bulk ElevenLabs pre-download so all sentences in the chosen scope (group / chapter / book / all) are fetched and cached before playback begins. This fixes skipping when ElevenLabs is slow.
- Pre-download scope selector (group / chapter / book / whole library), progress status, and Cancel button in the ElevenLabs settings panel.
- `Speech.prefetch()` method for non-blocking, cancellable pre-fetch of a single sentence.

### Changed
- Updated service-worker cache name to `v1-0-5`.

## v1.0.4

### Fixed
- **Ghost playback after Stop**: stopping during an ElevenLabs fetch now aborts the in-flight request via `AbortController`. Audio no longer plays unexpectedly after pressing Stop or Reset.
- **∞ verb repeat broken**: `PlaybackControls.repeat()` was converting the string `"infinite"` to `NaN` and falling back to `1`. The ∞ option now correctly triggers infinite looping in the playback engine.
- **Group navigation during playback**: clicking ← Group / Group → while playing now restarts playback on the new group instead of leaving audio on the old group while the display shows the new one.
- **Both players running simultaneously**: switching from Study to Verb Drill now stops the sentence player, and switching back stops the verb player. Audio conflicts between the two engines are no longer possible.
- **ElevenLabs cache key included playback rate**: rate is applied locally (not by ElevenLabs), so the same audio was being fetched and cached multiple times at different speeds. Removed rate from the cache key.
- **Silent "Save settings" button**: clicking Save with "do not save" selected now shows a clear status message instead of doing nothing silently.

### Changed
- Updated service-worker cache name to `v1-0-4` to force browsers to fetch new files.

## v1.0.3

### Fixed
- Reworked ElevenLabs/audio playback cleanup so the player does not leave a stale audio object after the first sentence.
- Added faster detection when browser audio fails to start, stalls, times out, or receives empty ElevenLabs audio.
- Updated service-worker cache name to force browsers to fetch the new app files.
- Updated visible version text to v1.0.3.

### Changed
- ElevenLabs fetch timeout increased slightly to 15 seconds, but playback start is now separately guarded.

## v1.0.2

### Fixed
- Added a timeout to ElevenLabs requests so playback no longer waits indefinitely when the ElevenLabs connection stalls.
- If ElevenLabs times out, fails, or returns an error, the app now falls back to the system voice and continues playback.
- Added a timeout guard around system speech so the playback engine is less likely to hang on a single sentence.

### Changed
- Restored loop modes to the playback mode menu.
- Removed the ∞ option from the repeat menu.
- Repeat count and loop mode are now independent again.
- Default remains hands-free progression through the current group, with 1.0× speed and a short pause.

## v1.0.1

### Changed
- Temporarily moved looping into the repeat menu using ∞.

## v1.0

### Added
- Edit button and sentence editor.
- Verb drill control parity.
- App icons and changelog.

### Changed
- Removed Whole Book from sentence playback.
- Renamed playback options for clearer current-scope wording.
