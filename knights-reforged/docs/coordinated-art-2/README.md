# Complete coordinated artwork release — 52/52

The owner's final five independent weapon images complete the coordinated set. This supersedes the incomplete `coordinated-art-1` candidate without rewriting it. All **15 weapons, 15 armor, 16 spells and six Land properties** have explicit stable-ID mappings, distinct runtime paths/hashes and validated production-format images.

[Exact 52-target inventory](INVENTORY.md) · [full filenames, hashes, dimensions and processing](inventory.json) · [immutable registry](../../rulesets/coordinated-art-2/rules.json) · [preservation evidence](preservation.json).

Registry canonical digest: `de7b86048f4af97e53924d342c26489cc44afe9236db34c1a766a9d53e92f4ff`.

## Artwork and provenance

The five new independent sources are archived byte-for-byte under [owner-upload/](owner-upload/), with the owner's manifest and README. Their actual decoded dimensions and manifest agree on **1254×1254**; the supplied README's 1024×1024 description is inaccurate. The original PNG filenames/hashes are provenance metadata; the received files are WebPs. Runtime derivatives are proportional 512×512 WebPs, quality91/method6, without cropping, recoloring, generation or creative alteration.

| Stable ID | Current displayed name | Level | Source WebP SHA-256 |
|---|---|---:|---|
| `royal-warblade` | Sunscar Officer’s Saber | 60 | `00994dcf07ba4839d4c422df7ad2752c60fb98236af220a00906f058b2b1f295` |
| `march-wardens-poleaxe` | Frontier Marshal’s Poleaxe | 70 | `944921b6019eca35c784652c8f1f861c1c5976cd62e5ba80fdcf562f049e0f06` |
| `sovereigns-zweihander` | Mountain Warden’s Zweihander | 70 | `b28bbf028c03f75ba7f75ea1a060e90e9059dfa82c1dabe3765674bc8c8fad6d` |
| `throneguard-polehammer` | Imperial Thronehammer | 90 | `f33f8f876f8a098a88624516cc56e52516f860cbea7e5d96f7f7842dfbce0f6d` |
| `eclipse-gatehammer` | Eclipse Gatehammer | 100 | `1e8887ae301a15eb1096e67d54f262f9b54a99fe89b6f15309c5f673745e8d4b` |

**248,264** additional runtime image bytes. All 46 selected equipment images total **2,902,058** bytes; the six reused property images total **1,119,934** bytes. Complete selected payload: **4,021,992 bytes**. Raw sources, concepts, screenshots and manifests documenting original sources remain outside the production upload/container allowlists.

All earlier **47 complete manifest entries** and asset bytes are unchanged, including the ten weapons, fifteen armor, sixteen spells and six original PR #37 Land references. King Hudson’s Sword, its source and separate framing-review status are unchanged. Crown Harbour, other approved artwork, all older candidate registries, numerical catalogs, ownership, receipts, battle records, 900-bot definitions and all release/recovery files are preserved. The rejected concept crops remain historical documentation only.

Source rights basis remains owner-supplied original generated illustrations and existing original project Land artwork. No historical copyrighted artwork, third-party stock, new generation or screenshot-montage substitution was introduced.

## Visual evidence

Actual rendered frames plus 76px, 60px and 64×72 crops: [weapons](comparison-weapon.webp) · [armor](comparison-armor.webp) · [spells](comparison-spell.webp) · [Land](comparison-property.webp).

390px viewport comparisons: [weapons](screenshots/compare-390-weapon.webp) · [armor](screenshots/compare-390-armor.webp) · [spells](screenshots/compare-390-spell.webp) · [Land](screenshots/compare-390-property.webp).

[Full four-width game captures](screenshots/) and [browser verification](screenshots/verification.json) cover **320, 390, 430 and 1024px**, all 52 marketplace slots, all 52 decoded images, **266 supported full-bleed crops**, self/public Profiles, equipment/weapon/Land receipts, quest requirements and saved battle equipment. No missing assets, horizontal overflow or artificial matte bands were found. These are local synthetic adoption rehearsals, not claims of live production adoption.

## Installation and adoption are separate

This PR **installs the complete collection with the compiled selector null**. Startup independently verifies all 52 asset files even while inactive. Missing, tampered, escaped, unknown or partial manifests cannot pass. The renderer checks stable ID, exact current name, level, category and the current presentation marker. Old unmarked historical identities retain their original rendering.

The owner's authorization is recorded as `owner-coordinated-artwork-release-final-five-2026-10-25`; this label is not a credential or a substitute for GitHub approval. Actual deployment and adoption still require the protected exact-commit workflow and owner environment approval.

The existing design adopts artwork through a **second protected code release**, after the complete assets are installed. The supplied [adoption-selection.patch](adoption-selection.patch) changes exactly one compiled selector from null to the reviewed, digest-pinned `approvedCoordinatedSelection`. This selects all 52 entries together. It does not change the registry, workflow, database, game mechanics or existing expansion activation record. There is no public administrative endpoint, live variable toggle, new key or new infrastructure.

Installation first also ensures old serving instances already have the exact asset paths before a rolling adoption release emits references to them. A rolling request can see the complete old presentation or the complete new presentation; categories are never toggled independently.

## Exact protected operational sequence

1. Finish PR #37’s exact-head normal CI, including the existing schema-025, populated preservation, container and independently encrypted 900-bot recovery tests. Mark the PR ready and merge through GitHub only when its protected checks permit it. No administrator override or synthetic review approval.
2. Wait for the **new production merge commit's own successful push-triggered `checks` run**. The protected preflight expressly requires that exact SHA; the feature PR’s successful check cannot replace it.
3. Owner: open **Actions → Owner approved Railway release → Run workflow** ([workflow page](https://github.com/catillatio/test/actions/workflows/production-release.yml)). Choose **release/production**, set **Deploy after all gates? = true**, and run. When the protected job waits, use **Review deployments → production → Approve and deploy**. Do not modify secrets, variables or protections. One environment approval is required for each release run.
4. The existing workflow performs a fresh encrypted backup, isolated independent restore, preservation/migration checks, retained artifact upload/download, exact-candidate proof signing, private game upload, deployment identity and health/private status verification. If any guard fails, stop. Never direct-redeploy Railway or reuse expired proof.
5. Verify complete installation using the read-only public checker below with the successful production commit and stage `installed`. Its health evidence must report `adoptedId: null`, and every one of the 52 public image hashes must match. This stage does not replace placeholders in the UI yet.
6. From that successfully installed production revision, prepare the separate adoption code change:

   ```sh
   git switch -c feature/kingdom-come-coordinated-artwork-adoption release/production
   git apply knights-reforged/docs/coordinated-art-2/adoption-selection.patch
   ```

   Commit only that selector change, open its review PR targeting `release/production`, run the normal exact-head CI, and merge only when the owner/protected checks permit. The focused tests support both install and adopted states, test the actual runtime pin and ensure this patch touches only that pin. No database operation or expansion cutover is part of adoption.
7. Wait again for the adoption merge commit’s successful exact push CI, then repeat the existing protected workflow and its **separate owner production environment approval**. All backup/recovery/signature/identity/schema safeguards run again. This is the protected artwork-adoption procedure, not an unguarded Console toggle.
8. Verify stage `adopted` using the public checker and the adoption release commit. Then use an existing authorized game session to check Armory’s three categories and Land at 320/390/430/1024px, plus owned/public Profile, receipts and a saved report. All 52 selected targets must use the inventory paths; unselected art and Hudson remain unchanged. Only then record **live UI verified**. Do not create a production test account or mutate player records to gain verification access.

No step implies permission to self-approve the GitHub production environment. If the connector cannot dispatch the workflow, the exact owner action is step3, followed by its environment approval. No alternative release route is authorized.

## Read-only post-deployment verification

The existing public `/healthz` now adds non-secret `artwork` metadata: installed registry ID/digest, target count, and adopted ID/digest (null before adoption). It exposes no account/DB records and cannot change artwork. Existing health fields and protected checks remain intact.

From a trusted checkout with its existing development dependencies installed:

```sh
node --import tsx knights-reforged/scripts/verify-coordinated-live.ts \
  https://test-production-995c.up.railway.app EXACT_SUCCESSFUL_PRODUCTION_COMMIT installed
```

Use stage `adopted` only after the separate adoption release. The commit must be the full 40-character SHA. The checker sends **GETs only**, no credentials/cookies, rejects redirects and unexpected stages/commits, and verifies all 52 public image sizes/hashes. It intentionally reports authenticated Armory/Land UI verification as false; public file/health checks do not impersonate a signed-in game session. Public verification is read-only and distinct from recovery verification.

## Failure and recovery

- Installation failure: leave the previous game running; correct the failed prerequisite and rerun a fresh owner-approved protected release. Do not adopt a partial or unverified installation.
- Adoption failure: leave the previous complete presentation in place. No inventory or activation state has changed. A reviewed forward-recovery commit setting the selector back to null can restore beta presentation while retaining every image, record and migration. Run its own exact CI and protected recovery release; do not manually redeploy an old image or disable pre-deploy guards.
- Missing public assets or a mismatch between health stage and UI paths: do not mark live-verified. Preserve evidence and correct code through the protected process. Never edit cached records, images or manifests in place.
- No schema migration is introduced; strict `025` and existing signed independently encrypted recovery remain unchanged. No bot provisioning, Hudson grant or live game-data mutation is needed.

The PR description records the exact candidate commit, current CI run, merge/deployment/adoption status and the next actual approval boundary. CI recovery rehearsals are never described as new production backups.
