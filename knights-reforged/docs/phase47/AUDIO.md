# Original audio inventory

All nineteen cues are original deterministic synthesis from [create-audio.py](../../scripts/create-audio.py). No recordings, borrowed game audio, sampled instruments, copyrighted melodies or external audio services are used. Assets are dedicated under [CC0-1.0](../../public/audio/LICENSE.txt); numerical timbre/envelope definitions and the seeded generator are included for reproducibility. Rebuilding needs Python/numpy and ffmpeg, neither of which is required by the game server.

The sound palette uses damped wood/noise transients, plucked harmonic partials, inharmonic metal bells, breath-shaped horns and soft filtered magical textures. Short early reflections give the cues a shared space. No background music or looping audio is included.

| Cue | Confirmed interaction | Voice | Duration (seconds) | Individual AAC bytes |
| --- | --- | --- | ---: | ---: |
| `click` | Standard press | wood | 0.26 | 3,072 |
| `navigate` | Navigation | pluck | 0.36 | 3,829 |
| `coins` | Gold earned / Vault withdrawal | bell | 0.68 | 6,157 |
| `spend` | Gold spent / bounty listing | bell | 0.52 | 5,169 |
| `equipment` | Equipment or missing equipment acquired | bell | 0.72 | 6,793 |
| `sale` | Equipment or Land sold | pluck | 0.56 | 5,386 |
| `land` | Land purchased | horn | 0.81 | 7,532 |
| `income` | Committed Land income | bell | 0.81 | 7,573 |
| `quest` | Quest completed | pluck | 0.99 | 8,990 |
| `victory` | Battle victory | horn | 1.11 | 9,966 |
| `decisive` | Decisive victory presentation | horn | 1.24 | 10,942 |
| `defeat` | Battle defeat | horn | 0.81 | 7,326 |
| `level` | Level-up | horn | 1.51 | 13,193 |
| `achievement` | Achievement | bell | 1.18 | 10,591 |
| `healing` | Gold healing completed | air | 0.96 | 8,871 |
| `bounty` | Bounty claimed | horn | 1.28 | 11,254 |
| `alliance` | Army invitation accepted | pluck | 0.88 | 8,086 |
| `error` | Invalid action / failed request | wood | 0.37 | 3,920 |
| `tutorial` | Tutorial completed | bell | 1.34 | 11,933 |

The browser fetches **one 151,519-byte AAC/M4A sprite** rather than nineteen requests. [index.js](../../public/audio/index.js) defines non-overlapping offsets. Individual files support auditing/preview and are not all downloaded by the client. The decoded mono buffer is reused for low-latency playback. Original source peaks are below 0.68 full scale; the player applies its volume and a further 0.74 master gain. Asset tests check uniqueness, duration, format, nonzero RMS and peak bounds; Chromium decodes and starts every segment.

Sound begins muted. Settings → Sounds of the Realm saves enabled/volume to the existing character through authenticated idempotent commands. It never changes Calling keys, resources or rewards. Playback unlocks on a real pointer/keyboard gesture; a blocked result offers **Play result sound**. Prior enabled preferences permit buffer preloading, not unsolicited rewards. Navigation uses a 55 ms sound lead-in only when enabled; it does not delay battle/quest commands or introduce a combat cooldown. Back/forward restoration clears that pending navigation timer.

Routine clicks cannot interrupt a reward cue. Success cues interrupt a routine press, while burst guards and a bounded character-scoped local receipt cache suppress duplicates. A receipt chooses one priority cue: level-up, bounty, tutorial completion, achievement, then the resolved outcome/transaction. That avoids simultaneous defeat/victory/coin sounds. Income sound requires a newly observed committed income journal after page opening; initial/historical balances do not trigger it. Failed requests have a quiet error cue; they never receive success audio. Refreshing a historical receipt has no matching fresh submission marker and remains silent.

Navigation closes the old audio context and releases its decoded buffer; back/forward restoration unlocks a fresh context on the next gesture. A character-scoped cache of server-saved preferences keeps restored pages consistent with a later mute or volume change. The database remains authoritative for preferences across logins and devices.

Reduced-motion users retain static reward information and all controls. Sound is separately opt-in and can be muted or set to zero; enabling audio does not enable visual motion. No microphone, push-notification, storage permission or third-party tracking is requested.

Physical Android/iPhone speakers, silent-mode behavior, Safari's current activation rules and subjective extended-play comfort still require owner listening. Automated Chromium playback proves codec/gesture/duplicate behavior, not a professional listener's device acceptance.

CI explicitly selects the Ubuntu runner's installed Google Chrome. Its separately installed unbranded Chromium snapshot can have a different codec build; downloading Playwright does not change the script's system-browser fallback. `scripts/check-browser-audio.mjs` reports both candidates and requires the selected browser to decode the real sprite before the complete interaction tests. It never substitutes silent audio or skips an unsupported-codec failure.
