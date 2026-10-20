# Phase 4.8 sound audition

**Preview only; not used by the game.** These replace the synthetic horn/beep direction with short recorded metal, coins, book, wood and bell sounds. Start listening at low volume. Owner approval is required before runtime adoption.

[Listen to the complete audition](audition.mp3) (about 27 seconds). Order: click, navigation, gold earned, gold spent, equipment purchase, sale, Land purchase, income, quest, victory, decisive victory, defeat, level-up, achievement, healing, bounty, alliance, error, tutorial completion. Each sample is separated by 0.75 seconds.

Individual cues: [button](click.mp3), [coins](coins.mp3), [equipment](equipment.mp3), [Land](land.mp3), [quest](quest.mp3), [victory](victory.mp3), [defeat](defeat.mp3), [level-up](level.mp3), [tutorial](tutorial.mp3). Downloading this folder and opening `index.html` gives individual playback controls. Nothing autoplays.

All source recordings come from **Kenney**, under **CC0 1.0**. The official source pages, download URLs, archive SHA-256 hashes, selected filenames, pitch/gain/offset edits and output checksums are recorded in [inventory.json](inventory.json). Original license files are retained alongside it. They permit commercial redistribution; no Storm8 audio or third-party compositions are included. New layering and editing are also CC0.

Reproduce using `python scripts/preview-audio-phase48.py` after downloading the three manifest-listed archives, verifying their SHA-256 checksums and extracting them into `/tmp/phase48-audio-sources/{interface,rpg,impact}`. This script writes only this documentation folder. It never writes `public/audio`, connects to a database, or changes playback logic.

The runtime sound audit retains one highest-priority cue per confirmed action, gesture unlocking, saved mute/volume, receipt-based duplicate suppression, short effect durations and no background music. New signup preferences enable sound after interaction; existing saved preferences and the legacy muted fallback remain unchanged. Physical Android/iPhone listening and Safari behavior still need device review.
