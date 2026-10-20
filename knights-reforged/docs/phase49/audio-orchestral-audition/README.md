# Phase 4.9 orchestral reward audition — owner approval pending

**None of these recordings are approved or adopted.** They are new purpose-made musical arrangements, separate from the rejected four-clip SFX audition. Ordinary buttons and navigation remain silent; the runtime reward audio remains unchanged.

[Listen to all four cues](audition.mp3), in order **Victory → Defeat → Quest → Level-up**, with 0.8-second pauses. GitHub on Android may require **View raw / Download**. Individual MP3s below are volume matched. For an offline player, download this folder and open [index.html](index.html); tap to play, no autoplay. Lossless FLAC masters are included for close listening.

| Audition | Duration | Integrated LUFS (decoded MP3) | True peak dBTP |
|---|---:|---:|---:|
| [victory](victory.mp3) | 3.9s | -19.99 | -9.70 |
| [defeat](defeat.mp3) | 3.9s | -20.00 | -10.19 |
| [quest](quest.mp3) | 4.0s | -19.98 | -4.33 |
| [level](level.mp3) | 5.3s | -19.99 | -9.19 |

- **Victory — The standard is raised:** three/four-part French horn support, articulated trumpet call, and a D-major resolution with cello support.
- **Defeat — The lowered banner:** soft, low French horn and bowed cello, resolving through G minor and A to D minor. No comic fall or harsh impact.
- **Quest — A deed written in starlight:** a recorded concert-harp arpeggio with soft bowed strings and three lightly mixed glockenspiel bell notes. No metallic-impact/notification-sample bed.
- **Level-up — The kingdom ascends:** a longer G/A/D orchestral ascent with an independent trumpet melody, four-part horns, violin/cello support and rising harp. A different arrangement from Victory, with a broader finish.

## Provenance and redistribution

**Source recordings:** [VS Chamber Orchestra 2 Community Edition, Versilian Studios](https://versilian-studios.com/vsco-community/). The publisher explicitly releases the sample recordings under **CC0** and provides raw WAVs for building instruments and music. Recording credit: **Sam Gossner and Simon Dalzell; sample cutting by Elan Hickler / Soundemote**. These are individually recorded acoustic instruments assembled into new short arrangements, not a recording of a live ensemble performing these cues.

The pinned [source repository](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e) and its [CC0 licence](https://github.com/sgossner/VSCO-2-CE/blob/440300901dfe9275fd84e0b7763af1f8443ae62e/LICENSE) permit modification and redistribution, including game assets and public-source distribution. The [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/) describes the permissions and limits; it is not a warranty or endorsement. [The complete source licence is retained](LICENSE-VSCO-CC0.txt). Original project arrangements/mix are also dedicated CC0 to the extent applicable; no exclusive copyright or human authorship is asserted.

[sources.json](sources.json) pins both sample and publisher SFZ-mapping commits (the eight original mapping files are retained losslessly as `.sfz.gz` in `source-mappings/`, preserving the publisher bytes/hashes), exact filenames, original Git blob identifiers, SHA-256 hashes, recording sizes and note/velocity mappings. Fifty source mappings (83.3 MB, cached outside the repository) cover horn/trumpet sustained/staccato articulations, harp, violin, cello and glockenspiel. Only the small mixed cues and lossless masters are committed. No APK/Storm8 recording, copyrighted melody, Kenney impact/chime edit or General MIDI oscillator is used.

## Musical preparation and checks

[score.json](score.json) records the original note events, timings, voices, dynamics and stereo positions. `python3 scripts/preview-orchestral-phase49.py` verifies every cached/downloaded sample checksum, maps pitches and dynamics using the publisher's SFZ regions, retains natural recorded attacks, and renders the arrangements with a short chamber reverb, gentle EQ and two-pass loudness matching. Requirements: Python, NumPy, SciPy and FFmpeg; tested with NumPy 2.3.5 / SciPy 1.17.0 / FFmpeg 7.1.5 on this workspace. The script writes only this documentation folder and a temporary public-sample cache. It never imports the game, reads game credentials or connects to a database.

The target is **−20 LUFS**, true peak no higher than **−2 dBTP**; decoded MP3 measurements are above. No limiter was needed to force all cues to the same peak: their natural dynamics differ. Clips have click-safe edges and a short decaying tail. [inventory.json](inventory.json) records output hashes, source hashes, note counts and measurements. Tests verify mapping coverage, distinct outputs, licensing checksums, rejection status of the old set and the unchanged runtime audio version.

**Quality acceptance remains open.** These are sampled orchestral arrangements with real-instrument timbres, not a claim of a professionally commissioned orchestral session. Numerical matching cannot establish musical taste, emotional impact or physical-device quality. Please audition on phone speakers and headphones; naturalness of the horn phrase, balance of harp/bells, and the distinct fuller level-up are the owner decision. No audio enters `public/audio/` before explicit approval.

## Research decisions

- VSCO CE was selected because the primary publisher documents recorded acoustic instruments and grants unrestricted CC0 sample reuse; it supports one coherent four-cue set and exact short cadences.
- [Spring/Spring Enterprises, Fanfares](https://opengameart.org/content/fanfares) offers existing orchestral jingles under CC-BY options. It remains a reference candidate, not an imported asset. Purpose-made cues give tighter control over the separate harp quest and low defeat.
- [10 Fanfares](https://opengameart.org/content/10-fanfares) is explicitly Chinese-inspired, so it was not selected for this medieval direction.
- The rejected impact/chime audition is archived with **REJECTED** status and cannot be adopted. No purchase, subscription, author contact or permission request was made.
