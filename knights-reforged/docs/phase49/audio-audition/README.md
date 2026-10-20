# Phase 4.9 medieval reward audio audition

**Owner audition only; not adopted into runtime.** Ordinary buttons/navigation are silent in the new UI. No background music is included.

[Listen to the short four-cue reel](audition.mp3): victory, defeat, quest completion, level-up, with 0.8-second gaps. Start at low volume. Alternatively download the individual MP3s or this folder and open `index.html`; nothing autoplays. GitHub may require tapping **View raw / Download** to listen on Android.

These are new recorded-sound edits, distinct from the unchanged Phase 4.7 runtime effects and the broader Phase 4.8 preview. Victory uses a brief shield/metal accent and rising bell cadence; defeat is lower and quieter; quest completion combines a page/coin texture and a higher two-note chime; level-up has the longest ascending celebratory sequence. They are deliberately short and restrained. Sound quality and medieval fit require owner audition, not merely numerical validation.

| Clip | Duration | Decoded peak | Decoded RMS |
|---|---:|---:|---:|
| [victory](victory.mp3) | 1.25s | 0.531 | 0.073 |
| [defeat](defeat.mp3) | 0.85s | 0.500 | 0.041 |
| [quest](quest.mp3) | 0.95s | 0.543 | 0.042 |
| [level](level.mp3) | 1.75s | 0.543 | 0.068 |

All source recordings are **Kenney CC0 1.0**, from the official RPG Audio and Impact Sounds packs. Source archives were downloaded from the manifest-listed official URLs and SHA-256 verified before use. Source filenames/hashes, pitch, gain, timing, output checksums and measured levels are in [inventory.json](inventory.json). Original license files are included. Project layering/editing is also CC0. No Storm8 recording, copied composition or synthetic horn oscillator is used.

Reproduce with `python scripts/preview-audio-phase49.py` (NumPy and FFmpeg required). It downloads verified public archives into `/tmp/phase49-audition-sources` and writes only this documentation directory. It never imports game/server code, connects to a database or changes `public/audio`.

Runtime adoption is a separate step after explicit approval. Retain gesture unlocking, saved mute/volume, confirmed-success-only triggers, duplicate-receipt suppression and reduced-motion behavior. Physical Android/iPhone listening and Safari playback remain owner/device acceptance checks.
