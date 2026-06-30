# Changelog

## v1.0.2

### Fixed
- Added a timeout to ElevenLabs requests so playback no longer waits indefinitely when the ElevenLabs connection stalls.
- If ElevenLabs times out, fails, or returns an error, the app now falls back to the system voice and continues playback.
- Added a timeout guard around system speech so the playback engine is less likely to hang on a single sentence.

### Changed
- Restored loop modes to the playback mode menu.
- Removed the ∞ option from the repeat menu.
- Repeat count and loop mode are now independent again: for example, repeat each sentence 5 times while looping the current group.
- Default remains hands-free progression through the current group, with 1.0× speed and a short pause.

### Known issues
- ElevenLabs reliability still depends on the API key, voice ID, network connection, browser permissions, and ElevenLabs service availability.
- Device-specific testing on Mac, iPhone, and iPad still needs confirmation.

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
