# Original iMobsters walkthrough — inspected video reference

Source supplied by owner: https://drive.google.com/file/d/19pvEbynDLR-KAXJQ4K9eQJMT4B5zAhx_/view?usp=sharing
Original video reference: https://www.youtube.com/watch?v=ouiMPIf51l0&t=85s
File: videoplayback.mp4; runtime 449.33 seconds (~7m29s), 28,394,739 bytes.
Inspection: sample frames every 15 seconds (30 frames) from the actual MP4 on 2026-10-29. This is a sampled visual review, not a complete narrated transcript or verification of underlying formulas.

## Directly visible workflows
- Persistent compact top header showing money, level / XP progress, health, energy and stamina.
- Compact bottom navigation remains available on many screens.
- Equipment rows with item icons, buy/sell controls and ownership/stats details; visible at ~30-60s, 120s, 210s, 420s.
- Real estate/property lists with image thumbnails and Buy/Sell actions; visible around ~45s and ~330s.
- Missions/jobs show actionable entries, progress and completion/success feedback at ~60s, 195s, 240s and 420s.
- Attack target listing and attack action at ~135s, ~285s and ~405s; combat result panels around ~60s, 195s and ~420s.
- Bank/deposit panel at ~105s.
- Daily bonus / reward overlay ~180s and ~270s.
- Invite / code and acceptance screen ~300-360s.
- Hospital/healing view ~345s.
- Home panel with character illustration and direct primary navigation around ~390-405s.

## Conversion decisions / implications
1. Initial isolated fork keeps Kingdom Come's existing tabs, positions, navigation and screen organization. Do NOT replicate an alternate casino-grid variant as default.
2. Keep compact menu-driven action flow and clear top resources. Retheme names/content/artwork without first redesigning navigation.
3. Use recorded screens to define end-to-end test scenarios for equipment purchase/sale, job completion, property purchase, cash movement, attack results, recruitment and healing.
4. Historic visuals are research material only: create independently branded original UI artwork/icons and prose.
5. Do not infer original economy formulas, universal property payout cadence, combat odds or purchase-cost scaling from these sampled frames; research each separately.
6. Actual video is in owner's Google Drive, not in the GitHub repository. This note is a reference/index, not a commit of the 28MB video.

## Suggested detailed follow-up inspection
Extract higher-resolution frames at key transitions and transcribe observed values with timecodes. Compare each screen with Kingdom Come's current implementation before specification changes. Record differences as **confirmed observation**, **version-dependent variant**, or **hypothesis needing tests**.

No gameplay code, environment variables, infrastructure, database or production deployments changed by this reference.
