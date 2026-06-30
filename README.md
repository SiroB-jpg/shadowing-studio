# Italian Shadowing Studio v1.0.2

A browser/PWA shadowing tool for Italian sentence practice and subjunctive drilling.

## v1.0.2 notes

Playback now separates repeat count from loop mode again.

- **Repeat each sentence** controls how many times each sentence is spoken before moving on.
- **Playback mode** controls the range and whether it loops.

The default mode is hands-free progression through the current group, with 1.0× speed and a short pause.

ElevenLabs requests now have a timeout. If ElevenLabs stalls or fails, the app falls back to the system voice instead of hanging indefinitely.

## Deployment

Replace the existing GitHub Pages files as a set, commit to `main`, push to GitHub, then allow GitHub Pages time to redeploy.

If the old version remains visible, unregister/clear the service worker or remove website data for the app, especially on iPad/iPhone.
