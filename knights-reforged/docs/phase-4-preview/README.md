# Phase 4 mobile interface captures

Actual server-rendered Kingdom Come pages captured by local Chromium through a real HTTPS reverse-proxy fixture. Width: 390 CSS pixels; touch/mobile emulation. The fixture also tested 320, 360, 412 and 1366px layouts. These are browser screenshots, not Android APK/device verification.

| Interface | Screenshot |
| --- | --- |
| Home navigation and combined activity | [Home](390-home.png) |
| Initiated battles feed | [Battles](390-battles.png) |
| Persistent report, linked names and defeated-target Attack Again | [Battle report](390-battle-report.png) |
| Character, income, illustrated holdings and equipment | [Profile](390-profile.png) |
| Profile Comments with a persistent plain-text message | [Comments](390-comments.png) |
| Public realm message board | [Broadcasts](390-broadcasts.png) |
| Persistent invitation code and militia recruitment | [Recruit](390-recruit.png) |
| Accepted ally, pending invitations and army activity | [Army Dashboard](390-army-dashboard.png) |

The gallery uses isolated test accounts. Large fixture balances and late-game equipment are explicit test preparation, not normal rewards or a grant endpoint in the application. Comments were also verified with HTML-looking text rendered literally; the gallery uses a normal message for readability.

Images are full-page captures, so fixed bottom navigation appears at the captured viewport edge within a tall image. In the running app it stays at the device screen edge while content scrolls. `manifest.json` records file sizes, dimensions and hashes.

Recovered Kingdoms Live tab icons/backgrounds and the existing fantasy equipment/property sheets are reused. No new paintings or Zombies Live branding were introduced in this milestone. See [the implementation report](../../PHASE_4.md) and [APK assessment](../../APK_READINESS.md).
