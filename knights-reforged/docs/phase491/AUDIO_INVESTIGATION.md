# Navigation sound investigation

## Confirmed source paths

The inspected base is the merged Phase 4.9 production branch **793f747a7920a7b1dc000230a3050482e98393f2**. No live URL, account, service, record or Railway credential was accessed.

There is one runtime audio player: `public/sound.js`, loaded by `views/layout.ejs`. It decodes the original, approved `phase49-orchestral-1` AAC sprite and uses `AudioBufferSourceNode.start()` offsets from `public/audio/index.js`. No other runtime Audio/oscillator player, background music or navigation sound injection was found in the inspected application source.

In this base, neither `click` nor `navigate` is in the playback allowlist. Their old segments still exist in the historical sprite/index, but ordinary navigation cannot select them through the current player. The older Phase 4.8 navigation handler is not present. The approved orchestral victory/defeat/quest/level segments, hashes, licenses and volume are untouched.

Two residual routine paths were confirmed:

1. Every pointer/key gesture ran `unlock()` → create/resume AudioContext → preload sprite. A saved prior interaction also preloaded an AudioContext on each new page. A real enabled-preference sequence Home → Quests → Battle → Armory → Recruit → Home, twice, followed by back/forward/reload recorded **24 context/resume operations but zero source starts or played cues**. This is unnecessary audio-engine activity, **not proof of the reported live honk's origin**.
2. A successful zero-missing-Health response emitted a `click` fallback in `status.js`, although the central allowlist currently rejected it. That fallback is now removed at its source; a no-charge/no-heal result emits no sound event.

Meaningful paths remain: committed receipt/battle hint matched to a fresh pending command, an explicit successful heal, a newly observed committed Land-income journal, explicit Settings preview, or a failed gameplay request's error cue. Realm resource polling and navigation do not themselves submit audio events. Saved/historical report receipts need the matching fresh pending action before playing. No reward is inferred from animations or current equipment.

## Changes and evidence

- Routine gestures now record the browser interaction gate **without creating/resuming audio or loading a sprite**. Decode/resume occurs only for a confirmed meaningful event or explicit preview.
- New sound/status module revision prevents reuse of the previous URL's cached module. The approved audio asset URL/content remains unchanged.
- Departure and hidden-page events invalidate pending resume/decode attempts. Audio stops on departure. Mute/zero volume are checked again **after** asynchronous decode; no late sound or automatic retry button can appear after leaving the page.
- Existing saved settings remain authoritative. New human registration no longer creates the enabled preference; the existing false/55 fallback applies without a migration or rewriting old preferences.
- All-cue browser instrumentation records **every AudioBufferSource start**, not only a cue called `navigate`. The corrected same full-page/tab/history/reload sequence has **zero contexts, zero resumes and zero starts**. Legacy click/navigation event injection cannot play. Preview and approved victory still play; duplicates, refresh, delayed decode followed by mute, navigation during decode, and simulated persisted-page restoration are tested.
- The retained Phase 4.9 orchestral test plays all four approved cues through their complete tails, verifies one sprite per document, gesture protections, muted settings, saved volume, hidden-page suppression and explicit interrupted-fetch recovery. Routine keyboard focus no longer preloads sound.

## Remaining uncertainty

The reported live honk was **not reproduced in the allowed local Phase 4.9 baseline**; its exact audible production source therefore remains unconfirmed. There is no evidence here that the stored navigation segment actually played live. A stale deployed bundle, a restored older browser document, an independent income/error event or device/browser feedback requires evidence from the owner's device; these are possibilities, not diagnoses.

After owner review and a separately authorized release, verify an ordinary five-tab/back/forward sequence on physical Android Chrome and iPhone Safari with the saved enabled preference. Confirm the new module URL is present and the sound remains absent. No production inspection, reload instruction that loses account data, key rotation or release was performed for this investigation. Headless Chromium's gesture/visibility tests do not certify physical Safari, hardware mute or OS suspension.
