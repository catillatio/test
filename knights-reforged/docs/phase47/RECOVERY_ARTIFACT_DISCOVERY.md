# Recovery artifact discovery correction

Release run #7 on `5af637f` completed prepare successfully, then failed its
required recovery-artifact upload. Both uploads logged
`include-hidden-files: false` and found no files under `.release-artifacts/`.

The files were produced at the intended location. The controller awaits the
verified ciphertext download and manifest write before printing its successful
prepare message. The upload action's path resolves to that same workspace
directory. The pinned `actions/upload-artifact` implementation excludes hidden
directory inputs by default, so it skipped the directory rather than retaining
the two files. No output-directory or `RUNNER_TEMP` mismatch caused this failure.

| Location | Purpose |
| --- | --- |
| `$GITHUB_WORKSPACE/.release-artifacts/realm.dump.age` | Independently downloaded, checksum-verified encrypted backup. |
| `$GITHUB_WORKSPACE/.release-artifacts/backup-manifest.json` | Successful job evidence and public request fields, with upload grants removed. |
| `$GITHUB_WORKSPACE/.release-artifacts/post-deploy.json` | Existing verification evidence written only after successful promotion. |
| `$RUNNER_TEMP/kingdom-worker-*` | Temporary source bundle, removed after worker upload; separate from recovery files. |
| `$RUNNER_TEMP/verified-backup` | The independent Actions artifact download, read by the recovery checker and promotion controller. |

## Minimal correction

Both upload steps now name their finalized files explicitly. The required
recovery artifact selects only the ciphertext and manifest. The existing
verification artifact selects those files plus `post-deploy.json`, when present.
There is no wildcard or directory upload and no hidden-file opt-in. The default
hidden-file exclusion remains enabled.

The exact pinned action can discover explicitly named, non-hidden files within
the hidden directory. Its least-common-ancestor root is `.release-artifacts`,
so the retained archive still has flat filenames, as the existing independent
download and verification code require. Unexpected files, environment files,
plaintext dumps and keys are not selected.

The controller, worker, recovery checker, action SHAs, retention period,
`if-no-files-found: error`, manual trigger, owner approval, exact-commit checks,
independent download, ciphertext verification, signing and promotion requirements
are unchanged. An empty or incomplete backup still cannot authorize promotion.

## Verification

Nine automated offline tests execute the real controller with mocked provider
and worker boundaries but real ciphertext-stream download and manifest writes.
They verify workspace output from repository and application working directories,
the two exact upload allowlists and unchanged retention policy, and a flat local
retention round trip through the real independent recovery checker. Missing
files, modified ciphertext, a wrong commit and an empty independent download all
fail closed. Fake unrelated files placed next to recovery files are not selected.
No live credentials, database, provider operation or release is used.

Local validation passed all nine new cases and the complete automated command
(249 passed, zero failed, 113 existing PostgreSQL/hosted-runner cases skipped
without those facilities). actionlint 1.7.12, TypeScript, production build,
JavaScript syntax and all 91 static checks including 73 EJS fixture cases passed.
A parsed YAML comparison with `5af637f` confirmed that only the two upload `path`
fields changed; all other workflow values are identical.

An additional offline conformance check uses `src/shared/search.ts` and locked
production dependencies from the exact upload action commit
`ea165f8d65b6e75b540449e92b4886f43607fa02` (`@actions/glob` 0.5.0). With network
calls blocked, it reproduces zero files for the old hidden-directory input,
finds exactly two and three files for the corrected recovery and verification
allowlists with hidden-file exclusion still enabled, and confirms the unchanged
flat archive root. All four conformance checks passed with zero network calls.

These checks validate discovery and local retention/verification behavior. They
do not upload a GitHub recovery artifact or rerun the Railway release. The next
separately owner-approved execution must still pass real artifact upload,
independent download and every existing release gate. No automatic merge or
deployment is enabled by this correction.
