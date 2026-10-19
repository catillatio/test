# Read-only release configuration diagnostic

This is separate from `production-release.yml`, which is unchanged. Neither new workflow has a push, PR, schedule or deployment trigger. The reusable helper exists only to pass repository configuration as typed secret inputs, so GitHub masks the public PEM and backup settings in runner log headers. No extra stored secret or credential is needed.

After owner review and merge into the default `release/production` branch, the owner can choose **Actions → Release configuration diagnostic → Run workflow → release/production**. The existing **production** environment and its required owner approval protect the helper job. Do not dispatch the production release to run this diagnostic. This change does not merge or execute either workflow.

The diagnostic uses the existing repository variables `KINGDOM_RELEASE_VERIFY_KEY`, `KINGDOM_BACKUP_ENDPOINT`, `KINGDOM_BACKUP_BUCKET`, `KINGDOM_BACKUP_REGION`, and `KINGDOM_BACKUP_PATH_STYLE`. The protected environment supplies `KINGDOM_RELEASE_SIGNING_KEY`, `KINGDOM_BACKUP_ACCESS_KEY_ID`, and `KINGDOM_BACKUP_SECRET_ACCESS_KEY`. It never receives a Railway token, database URL, backup age identity, or initialization credential. Dependencies install from the locked controller package with lifecycle scripts disabled, before credential injection.

The diagnostic runs in an isolated Linux network namespace on the Ubuntu hosted runner. It cannot reach Railway, S3, PostgreSQL, or any other external network. The existing `recoveryStore()` constructs a client and signs one synthetic conditional-upload URL locally; it never sends an API request or uploads an object. No application startup, migrations, provisioning, backup, or release controller runs.

The only diagnostic results are:

```text
SIGNING_KEY_ED25519: PASS
SIGNING_KEY_MATCH: PASS
BACKUP_STORE_PRESIGN: PASS
```

Each result may instead be `FAIL`, and any failure makes the job fail. A failed private-key check also makes correspondence fail. Key mismatch alone identifies a different or unparseable verification key. Backup failure identifies local configuration/signing failure; **PASS does not verify bucket existence, credential permissions, object retention, network access, owner-key recovery, or deployment readiness**. Those remain protected release/rehearsal requirements.

The wrapper captures all child output and permits only the three fixed labels with `PASS`/`FAIL`. It discards exception text, warnings, unexpected output, credentials, and URLs. Missing namespace support or another launch failure produces three `FAIL` results and a failed job; never remove network isolation to work around that failure. Ordinary checkout/setup/dependency step metadata still appears in Actions.

For local synthetic verification, from `knights-reforged`:

```sh
npm ci --ignore-scripts --no-audit --no-fund --prefix deployment/release
node --test tests/release-diagnostic.test.mjs
```

Fixtures generate temporary keys and invented credentials, install network/subprocess tripwires, and verify negative cases and output filtering. A separate synthetic test exercises the real `sudo unshare --net` wrapper when running on GitHub's Ubuntu runner. No production diagnostic is dispatched by these tests or by opening its PR.
