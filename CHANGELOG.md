# v1.0.1

## Changed
- Simplified sentence playback to two controls: repetitions and playback range.
- Removed separate “loop current …” sentence modes.
- Added ∞ as the repetition option for looping the selected range.
- Set sentence and verb drill defaults to 1.0× speed and short pause.
- Default sentence playback range is now the current group, so Start progresses hands-free from sentence to sentence.

## Known issues
- Device-specific behaviour still needs user testing on Mac, iPhone and iPad.

# Changelog

## v1.0

### Fixed
- Removed the visible `Whole book` playback mode from the Study mode menu.
- Updated the service-worker cache name to v1.0.
- Included app icon files so PWA installation/cache setup does not reference missing files.

### Added
- Added an Edit button on each sentence card.
- Added an edit modal for changing the Italian sentence and/or English translation.
- Added verb-drill controls for repeat count, speed and pause length.
- Added this changelog for release tracking.

### Changed
- Replaced the old Difficult button with Edit.
- Renamed playback modes: current sentence only, current group only and current chapter only.
- Verb drill playback now uses its own repeat/speed/pause controls while still using the shared playback engine.
- Review lists now show Bookmarked and All; Difficult is no longer part of the visible workflow.

### Known issues
- Browser speech voices still depend on the operating system voices installed on the device.
- ElevenLabs playback still requires a valid API key, voice ID and internet access.
- This package has been syntax-checked, but I cannot confirm behaviour on your Mac/iPhone/iPad without running it on those devices.
