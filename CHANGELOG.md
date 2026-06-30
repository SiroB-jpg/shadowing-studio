# Changelog

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
