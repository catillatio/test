# Game upload investigation and minimal packaging correction

## Confirmed evidence

[Protected release 40053999331](https://github.com/catillatio/test/actions/runs/40053999331) used `304b1c8c2968a2a37f86315b6ec936b3d5b2b842`. Safety, worker upload/completion, encrypted export, isolated restore, independent retained recovery verification, signed-proof preparation and game-variable staging completed. The controller emitted `GAME_UPLOAD: FAIL` about 4.07 seconds after promotion started. The owner independently confirms that no game deployment was queued, no staged changes remain, and the existing game/database are healthy. No Railway query, upload or production connection was made for this investigation.

The suppressed CLI exception/HTTP status cannot be recovered from the existing category-only log. No HTTP 413, token-revocation error or service-root mismatch is claimed as the confirmed production cause.

## Worker versus game

| Boundary | Successful worker upload | Failed game upload |
|---|---|---|
| CLI | Same checksum-pinned v5.70.0 | Same binary |
| Authentication | Existing project/environment `RAILWAY_TOKEN` | Same workflow binding and controller authentication path |
| Source | Temporary allowlisted app sources and worker Dockerfile | Entire repository root |
| Archive prefix | `--path-as-root`, worker Dockerfile at root | Repository prefix retained, app under `knights-reforged/` |
| Service root contract | `/` | `/knights-reforged`, config `/knights-reforged/railway.json` |
| Source bytes, excluding archive headers | 6,908,641 | 225,700,851 before this correction |

The service-root settings above are the existing documented contract in [OPERATIONS.md](OPERATIONS.md); current live settings were not independently queried. The correction preserves the original archive paths, so it requires no root-directory/config-path change. Uploading only the bare app with `--path-as-root` would risk conflicting with that existing monorepo configuration and is not done.

The tagged CLI source shows that both uploads use the same project/environment API and authentication mechanism. Service selection and archive contents differ. Worker upload and game-variable staging success demonstrate useful token access at the time of this run, but do not prove every game-upload permission or the token's creation date.

## Reproducible excess packaging

[v5.70.0 `upload.rs`](https://github.com/railwayapp/cli/blob/v5.70.0/src/controllers/upload.rs) uses `ignore::WalkBuilder`, reads `.gitignore` and `.railwayignore`, excludes `.git` and `node_modules`, creates a gzip tar archive and posts it to the upload API. It does **not** use `.dockerignore`. [CLI path handling](https://github.com/railwayapp/cli/blob/v5.70.0/src/commands/up.rs) preserves the repository prefix for the existing game command. The version was released October 16, 2026; its published asset digest matches the workflow's existing SHA-256 pin.

The repository had no `.railwayignore`. Its Docker allowlist only applies after upload. Consequently, approximately 201 MB of review documents/screenshots and 15 MB of historical references were eligible for the game upload despite never being Docker inputs.

Offline measurements on the failed candidate, using Git-compatible ignore matching and a gzip-level-6 tar model:

| Source selection | Files | Source bytes | Gzip tar model bytes |
|---|---:|---:|---:|
| Original repository selection | 1,791 | 225,700,851 | 210,191,286 |
| New root `.railwayignore` selection | 303 | 6,954,386 | 6,025,090 |

These are reproducible **local archive-model measurements**, not captured provider request sizes. The real CLI uses Rust tar/gzp; metadata and compressor output can differ slightly. No authenticated `railway up` was executed. The compressed model shrinks about **97.1%**. No authoritative source located in this investigation establishes the production upload-size limit, so excess packaging is confirmed while an actual size-limit rejection remains unproven.

The only deployment-affecting change is a root `.railwayignore` allowlist. It retains the entire `knights-reforged/` prefix and original Dockerfile, Docker ignore file, Railway configuration, locked build inputs, all source/views/public assets/rulesets/migrations, and required deployment modules. It excludes recovery artifacts, secrets, dependencies, compiled local output, documentation, references, tests, Android and unrelated tools. The release controller, CLI pin/arguments, Docker build, runtime assets, exact-commit/digest/signature checks, schema pin, encrypted recovery/restore/preservation gates and owner approval are unchanged. Worker bundles are outside the repository and remain unaffected.

## Required owner credential check

Railway's official **October 23, 2026** [Recover Failing Deploys](https://blog.railway.com/p/security-disclosure-recommendation-recover-failing-deploys) guidance states that pre-incident API tokens and CLI sessions were revoked and CI credentials must be recreated with the same scope.

The current token's minting/revocation history is **unverified**; this workspace could not read its GitHub secret metadata, and an update timestamp alone would not prove a new token was minted. Do not inspect or share the secret value. Successful worker upload is not proof that the required post-incident credential replacement was performed.

Before separately authorizing a future release:

1. Confirm whether the current CI project token was **newly created after the incident's credential revocation**. If already recreated, no additional rotation is prescribed by this patch.
2. If it predates revocation, or its provenance cannot be established, the owner should use Railway project **Settings → Tokens** to create a replacement for the **same project and production environment**. Do not substitute an account/workspace token or broaden scope.
3. In GitHub **Settings → Environments → production → Environment secrets**, replace only the existing `RAILWAY_TOKEN` binding through the secret editor. Never paste it into chat, issues, logs or a PR.
4. Keep autodeploy disabled and all existing owner approvals/recovery checks intact. Do not follow generic manual-redeploy/reconnect instructions that bypass this repository's protected release process. No release retry is authorized by this document; obtain separate owner authorization after review and required checks.

No credential, variable, permission, source connection or production setting was changed. Token replacement is a separate owner action and is not asserted to be the cause or a guaranteed cure for the selective game-upload failure.

## Verification and remaining uncertainty

`tests/release-upload-packaging.test.mjs` checks the complete allowed source set, excluded secrets/recovery/reference paths, bounded size, retained monorepo layout, byte-identical extraction and every original Docker `COPY` input. The local Git matcher exercises standard ignore/negation rules without invoking the Railway CLI. Existing release regressions verify the unchanged proof, category, identity and fail-closed behavior. The final normal exact-head CI result is recorded on the draft PR.

This patch removes a demonstrated upload liability with one ignore file; it cannot retrospectively recover the provider's hidden rejection. A future owner-approved release is still needed to establish the production outcome. If upload fails after minimal packaging and confirmed post-incident credentials, stop and obtain a narrowly scoped, fixed-category transport diagnosis or Railway support review; do not expose provider bodies, weaken guards or repeat deployments blindly.
