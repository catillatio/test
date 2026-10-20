# Required two-record broadcast cleanup — owner review pending

This is **not completed**. The exact two records requested are from **Gray** and **Development Night**. The earlier “Development Knight” spelling is not authorization to select a similarly named account. Do not infer identities from display names alone.

The current workspace has no configured Railway credentials or operator channel. The owner has confirmed there is no trusted game-service operator shell available. Read-only identification is authorized, but cannot be performed here. No live records, message contents, IDs or timestamps have been obtained. No write is authorized until the owner explicitly approves the identified pair. This remains a required Phase 4.9 release item, not optional polish.

[Existing workflow investigation and minimal operator-only proposal](OPERATOR_INSPECTION_OPTIONS.md): no current protected workflow returns message records. The authenticated feed API exposes the necessary public fields but has normal game-state side effects, so it is not strictly database-read-only. No infrastructure was changed to add an operator job.

## Read-only operator steps now

Use an **already authenticated, trusted operator shell inside the existing game-service environment**, running the deployed application with its existing private database connection. Do not paste credentials in chat, expose PostgreSQL publicly, create a deployment, change service variables, or use unattended SSH with unverified host keys. If no trusted operator channel exists, stop: establishing a separately reviewed operator channel is an access prerequisite, not something this combat update creates or bypasses. The protected release worker is not an arbitrary moderation shell.

From the deployed application directory, with no persisted environment changes:

```bash
ALLOW_REALM_MODERATION=1 node deployment/moderate.mjs broadcasts
```

This existing command makes SELECT queries only. It lists up to 50 visible broadcasts with immutable ID, author ID/name, full body, status and timestamp. Share only the two intended public-message records for review; never paste environment values, database URLs or raw provider diagnostics. If either record is absent or the author identity is ambiguous, stop and report it. Do not choose a newer message, a comment, an alternative spelling or a similarly named account.

Set non-secret local variables to the **actual reviewed UUIDs**, then perform the second read-only review:

```bash
broadcast_gray='REPLACE_WITH_REVIEWED_GRAY_BROADCAST_UUID'
broadcast_development_night='REPLACE_WITH_REVIEWED_DEVELOPMENT_NIGHT_BROADCAST_UUID'
ALLOW_REALM_MODERATION=1 node deployment/moderate.mjs \
  review-broadcasts "$broadcast_gray" "$broadcast_development_night"
```

That returns the two exact records and `reviewSha256`, binding immutable author IDs, timestamps and full contents. It does not hide anything. **Stop and obtain explicit owner approval of both exact records and the digest.** Neither general requests to clean the feed nor deployment approval substitutes for this record-level approval.

| Required evidence | Gray | Development Night |
|---|---|---|
| Broadcast immutable ID | Not obtained | Not obtained |
| Immutable author ID and displayed name | Not obtained | Not obtained |
| Creation timestamp | Not obtained | Not obtained |
| Full message | Not obtained | Not obtained |
| Digest and explicit owner approval | Pending | Pending |
| Reversible hide audit ID | Not executed | Not executed |
| Absent from All and Broadcasts | Not verified | Not verified |

## Only after exact-record approval

Do not run this step now. The existing mechanism requires both reviewed UUIDs, the unmodified digest, a named operator, and the explicit confirmation flag. In the same trusted operator environment after approval:

```bash
review_sha='REPLACE_WITH_OWNER_APPROVED_REVIEW_SHA256'
ALLOW_REALM_MODERATION=1 \
REALM_MODERATOR_LABEL='realm-owner' \
KINGDOM_BROADCAST_REVIEW="$review_sha" \
KINGDOM_BROADCAST_CONFIRM=HIDE_REVIEWED_BROADCASTS \
node deployment/moderate.mjs hide-broadcasts \
  "$broadcast_gray" "$broadcast_development_night"
```

It locks the two records, rechecks the digest, applies reversible `hidden` status through existing moderation, and records two operator audit entries. A replay does not add duplicate hides. No records are deleted; other activity, accounts and tables are untouched. Its existing audit reason says Phase 4.6 because that is the mechanism's original version; it does not rerun Phase 4.6 or reset anything.

## Required verification before closing this item

1. Repeat the read-only `review-broadcasts` command: both exact records must be `hidden`, with unchanged author/content/timestamp/digest.
2. Repeat `broadcasts`: both IDs must be absent and unrelated visible broadcasts must remain.
3. As a normal signed-in player, inspect `/game/home?feed=all` and `/game/home?feed=broadcasts`. Verify the exact two messages are absent across the relevant feed pages, not just the first page; retain screenshots or sanitized owner confirmation. Confirm unrelated comments/battles and broadcasts remain and future posting is available.
4. Preserve the two audit records and owner approval evidence. Record actual verification here; until then this remains open.

If deliberate reversal is later authorized, restore **only the affected ID(s)** with the existing CLI, e.g. `ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL='realm-owner' node deployment/moderate.mjs restore "$broadcast_gray" 'Owner-approved reversal of targeted broadcast moderation'`. Do not use broad SQL deletion, migration hooks, initialization, or startup cleanup.
