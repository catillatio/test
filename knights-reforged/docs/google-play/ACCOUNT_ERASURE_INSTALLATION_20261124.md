# Private account erasure installation and rehearsal

This checklist prepares a disabled installation. The owner reviews the exact
Railway patch separately before any apply. The game and recovery worker receive
only journal-reader settings. The operator acts on an individually signed permit
inside the existing protected GitHub **Production** window.

## Verified starting point

- PR #103 merge `b4b66871d9f1448450f6087712cbcd243975c4dd` passed
  [application CI (10/10)](https://github.com/catillatio/test/actions/runs/45514450662)
  and [Android readiness (3/3)](https://github.com/catillatio/test/actions/runs/45514450598).
  Production has one required reviewer, `catillatio`, no admin bypass and an exact
  `release/production` branch policy. Use the existing environment.
- [Build-only preparation 45519420657](https://github.com/catillatio/test/actions/runs/45519420657)
  has promotion and registry credential installation disabled. After owner approval,
  verify its successful source SHA, platform manifest digest, pulled image identity
  and candidate digest. The local build of this exact tree produced candidate
  `7afc47e86ebd70088010563ca582a2403aaa75c2e875fa33ca201e371f2ee118`.
  Use the protected run's verified artifact for registry delivery. A change to the
  production HEAD requires a fresh exact-source check before an operator window.
- Railway patch `972c520d-689f-46c7-829e-451dba529016`, revision
  `2026-11-25T00:14:53.047Z`, contains 13 changes. Its only targets are
  `KingdomAccountErasure` (`830a5fe7-7c83-481a-87b8-7e31a3a4bf83`) and
  `kingdom-account-erasure-journal` (`1fb009b6-2ebb-4146-a49d-3bd1bf1579e9`).
  The staged service is one `iad` replica. Its 512 MB `iad` volume mounts at
  `/run/kingdom-erasure`. Its source is empty, and its staged steady-state command
  starts a journal relay that requires an installation marker.
- The authenticated Railway view lists only the three staged variable names.
  Verify their exact values against the approved patch before applying it.
  `KINGDOM_ACCOUNT_ERASURE_ENABLED` and `KINGDOM_GRAVEYARD_CONSTRUCTION_ENABLED`
  must both be `0`. `KINGDOM_ERASURE_JOURNAL_PATH` must be
  `/run/kingdom-erasure/private/journal`. Check that the candidate remains
  private, with no domain, TCP proxy, git trigger or unrelated changes.

## Owner signing custody and bootstrap

1. Select an existing authorized erasure-specific Ed25519 key in owner custody.
   Key creation, if needed, requires explicit authorization. The private key
   stays in the owner's secure store and is used in a private signing session.
   Supply the canonical public PEM and its SHA-256 fingerprint to the installer.
   Keep the signing key out of Railway, GitHub Actions, game settings and logs.
   Keep the Android upload key and other production signing keys separate.
2. Confirm the live database name and cluster fingerprint in an authorized private,
   read-only session. Bind those exact facts and the existing project, environment
   and game-service IDs in the approved v7 policy. Preserve decisions A/B/D and
   conditional C. The retained backup target is not an enforced expiry.
3. In an owner-private session in the compiled `knights-reforged` checkout, use
   the existing policy contract, signer and exclusive file writer for the
   policy-only installation packet. Both inputs and the output directory must
   grant access to the owner only. This uses an existing key and writes no
   account-specific intent or permit.

   ```sh
   node --input-type=module - /private/policy.json /private/existing-erasure.pem /private/install.json <<'NODE'
   import assert from 'node:assert/strict';
   import { createPrivateKey, createPublicKey } from 'node:crypto';
   import { constants } from 'node:fs';
   import { open } from 'node:fs/promises';
   import { policyContract, authenticate, sha256 } from './dist/privacy/authorization.js';
   import { signProof } from './deployment/release/proof.mjs';
   import { writeBaseline } from './deployment/release/retention/journal.mjs';
   const [, , policyPath, keyPath, packetPath] = process.argv;
   async function readPrivate(path, maxBytes) {
     const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
     try {
       const info = await file.stat();
       assert.ok(info.isFile() && info.uid === process.getuid() && (info.mode & 0o077) === 0);
       assert.ok(info.size > 0 && info.size <= maxBytes);
       return await file.readFile();
     } finally { await file.close(); }
   }
   try {
     const policyPayload = policyContract.parse(JSON.parse(await readPrivate(policyPath, 16000)));
     assert.ok(Date.parse(policyPayload.approvedAt) <= Date.now());
     assert.equal(policyPayload.scope.projectId, '41a664f1-06bb-492e-90ef-cfd9635fc67f');
     assert.equal(policyPayload.scope.environmentId, '8ced8aef-352e-4ea9-931d-8963ff352c1c');
     assert.equal(policyPayload.scope.gameServiceId, '47a56e8e-aa72-40df-a5c4-0e5feb0f5cdd');
     const key = createPrivateKey(await readPrivate(keyPath, 2000));
     assert.equal(key.asymmetricKeyType, 'ed25519');
     const publicKey = createPublicKey(key).export({ format: 'pem', type: 'spki' }).toString();
     const policy = JSON.parse(Buffer.from(signProof(policyPayload, key), 'base64url').toString());
     const verified = authenticate(policy, publicKey, policyContract);
     await writeBaseline(packetPath, {
       publicKey, policy, codeSha: 'b4b66871d9f1448450f6087712cbcd243975c4dd',
       journalPath: '/run/kingdom-erasure/private/journal',
     });
     console.log('ERASURE_KEY_SHA256 ' + sha256(publicKey));
     console.log('ERASURE_SCOPE_SHA256 ' + sha256(JSON.stringify(verified.scope)));
   } catch {
     console.error('ERASURE_INSTALL_PACKET: STOP');
     process.exitCode = 1;
   }
   NODE
   ```

4. Once the image, scope, signed packet and private registry access are verified,
   request approval of the exact **disabled bootstrap** patch. An empty or missing
   mount makes the steady-state relay fail closed. Start the pinned image with a
   short-lived private bootstrap command that exposes a health response only.
   Leave the source game, readers and all database credentials out of this patch.

   ```sh
   node -e '
   const env = process.env;
   if (process.getuid() === 0 ||
       env.RAILWAY_PROJECT_ID !== "41a664f1-06bb-492e-90ef-cfd9635fc67f" ||
       env.RAILWAY_ENVIRONMENT_ID !== "8ced8aef-352e-4ea9-931d-8963ff352c1c" ||
       env.RAILWAY_SERVICE_ID !== "830a5fe7-7c83-481a-87b8-7e31a3a4bf83" ||
       env.KINGDOM_ACCOUNT_ERASURE_ENABLED !== "0" ||
       env.KINGDOM_GRAVEYARD_CONSTRUCTION_ENABLED !== "0" ||
       env.KINGDOM_ERASURE_JOURNAL_PATH !== "/run/kingdom-erasure/private/journal" ||
       env.DATABASE_URL || env.KINGDOM_ACCOUNT_ERASURE_DATABASE_URL ||
       env.KINGDOM_GRAVEYARD_DATABASE_URL || env.KINGDOM_ERASURE_COORDINATOR_TOKEN) {
     process.exit(1);
   }
   const port = Number(env.PORT || 8080);
   if (!Number.isInteger(port) || port < 1 || port > 65535) process.exit(1);
   const server = require("node:http").createServer((req, res) => {
     const health = req.method === "GET" && req.url === "/healthz";
     res.writeHead(health ? 200 : 404, { "Cache-Control": "no-store" });
     res.end(health ? "journal-bootstrap-only" : "");
   });
   server.listen(port, "::");
   setTimeout(() => process.exit(0), 600000).unref();
   '
   ```

   Run `deployment/privacy/initialize-journal.mjs` once following
   [the existing initializer instructions](ACCOUNT_DELETION.md#independent-journal--one-private-operator-service--dedicated-volume).
   Verify the exact mounted volume, the image's non-root user and private
   permissions. If the volume is unwritable or the initializer stops, preserve
   the state for investigation. Avoid retrying a partial installation.
5. After the initializer reports `INSTALLED_EMPTY`, start the steady-state
   `node deployment/privacy/journal-server.mjs` on the same pinned image and
   volume. Set the public PEM, scope digest and private read token in the relay.
   Confirm unauthorized requests fail and an authorized GET verifies the empty
   signed chain. Check the journal actually survives an authorized restart before
   binding the game and recovery readers. Keep operator SQL and Actions read
   credentials out of the relay's service-wide variables.

## Restricted role and synthetic acceptance

Use the exact [reviewed SQL](../../deployment/privacy/ROLE_REVIEW.sql) and
`assertErasureOperator` for a separately approved role installation. The
credential must belong to `kc_account_eraser` and remain scoped to the confirmed
database. It has neither elevated flags, memberships, object ownership nor
access to password hashes. Database credentials enter only the private operator
invocation, after the journal is initialized. The existing GitHub read token
must be scoped to repository Actions read access and able to read the approval
evidence. A missing or rejected credential stops the operation.

The exact reviewed grants were exercised on a disposable PostgreSQL cluster.
The operator validator passed, and PostgreSQL denied access to hashes, deletion
of wallet/ledger rows and truncation of erasure receipts.
The bootstrap was exercised over loopback. It refused enabled execution flags,
writer credentials and an incorrect service ID. It served health only. A relay
fixture using an existing public test vector refused a missing marker and
unauthorized reads, and verified the initialized empty journal. No private key
was created or used in these local checks.

1. Rehearse with two synthetic accounts, one request and an independent disposable
   database and journal. Capture an actual pre-erasure dump plus independently
   verified restore. Capture the second account's financial and shared-gameplay
   witnesses. Keep production connections out of the rehearsal.
2. Bind the exact request, source, fresh verified backup, current journal head and
   owner window to the signed test permit. The operational window uses the
   protected **Production** environment and its release mutex. GitHub gets only
   the operation digest. Compiled source tests simulate the GitHub API with
   synthetic evidence. Any real protected workflow rehearsal requires its own
   approved installation and owner gate.
3. Verify physical removal of the synthetic account, sessions and personal data,
   with preserved financial records and the second account's witnesses. Record
   the authenticated journal head and SQL receipt. Test that losing the window
   rolls back SQL and preserves durable intent.
4. Restore the older disposable dump. The reader must fence it until the signed
   intent is replayed and checkpointed. Verify the erased account stays gone,
   the second account's witnesses match and the fence now passes. Test an
   unavailable journal and confirm promotion refuses to proceed.

The merged source CI already exercises synthetic fulfillment and actual
dump/restore. Those results and the local role rehearsal do not prove Railway
volume startup, private registry access for the new service, or a live
reconciliation reader. Keep real erasure disabled through deployment and
operational verification.
