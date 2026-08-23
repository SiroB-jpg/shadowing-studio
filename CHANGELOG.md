# Changelog

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
