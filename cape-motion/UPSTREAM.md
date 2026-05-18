# MotionPNGTuber Player Upstream

The files in this directory are based on the browser playback package from:

- Repository: https://github.com/rotejin/MotionPNGTuber_Player
- Commit: `27c9e3563738b375a88727b8f653e41f34a5188a`
- Commit date: 2026-01-15 21:49:04 +0900
- License: MIT, copied as `LICENSE`

The CAPE live prototype uses the upstream `LipsyncEngine`, `AudioCapture`,
and `audio-worklet.js` as its MotionPNGTuber-compatible playback base.

Local adaptation:

- `audio-capture.js` accepts `workletUrl` so it can load the worklet from
  `cape-motion/audio-worklet.js` when embedded from `cape-live.html`.
