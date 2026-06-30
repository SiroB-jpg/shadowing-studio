# Italian Shadowing Studio v1.0.1

Offline-capable browser/PWA app for Italian sentence shadowing and subjunctive verb drill practice.

## Run

Open `index.html` in a browser, or serve the folder from a local web server for service-worker/PWA behaviour.

## Notes

- Existing browser data from v0.8 is intentionally preserved by keeping the same IndexedDB/localStorage keys.
- ElevenLabs settings remain local to the browser if saved.
- System voice fallback uses an Italian system voice where available, with Alice preferred on Apple systems.


## v1.0.1 playback logic

The default sentence playback now progresses hands-free through the current group at 1.0× speed with a short pause. The old separate “loop current …” modes have been removed. To loop, choose ∞ in the repetitions menu and select the playback range: current sentence, current group, or current chapter.
