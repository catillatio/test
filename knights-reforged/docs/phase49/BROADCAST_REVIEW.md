# Historical broadcast investigation — CLOSED, do not execute

**Superseded by [owner comment 6303697572](https://github.com/catillatio/test/pull/12#issuecomment-6303697572): Gray removed his own message. No Gray inspection, hide or restoration is requested or authorized for this release. Development Knight remains excluded.** No production action was performed here. The notes/commands below preserve the earlier investigation only; they are not current execution instructions. PR #13 stays draft/inactive.

## Current authorization and status

The owner reports that **Development Knight was already removed through the existing UI**. Do not target it again, and do not run the old two-record `hide-broadcasts` procedure. This update supersedes the earlier Gray / Development Night two-message plan. The owner's removal report is recorded; this workspace has not independently inspected the live feed.

Only Gray's reported broadcast remains authorized for hiding: exact three-character content quoted by the owner on October 20, approximately two days old. For precise comparison without repeating the text in a public document, its UTF-8 SHA-256 is **`c4cb23c808234a16c1c32862e0128b875635eeb3d704c764767d9fd1d2e6f5ba`**. Do not trim, normalize, select by approximate age alone, or target another message by Gray.

**Live message UUID: not obtained. No production action has been executed.** The workspace has no authenticated Railway credentials or game session, and the owner has confirmed there is no trusted game-service operator shell available. The precise blocker is an authorized execution channel, not a missing moderation function. No new confirmation is required for the exact message once conclusively verified; the owner has already authorized that one hide.

## Why the UI shows Reported for review

`views/partials/activity-feed.ejs` displays Remove only when the viewer is the author (or Hide from profile when they own a comment's profile). Broadcasts have no profile owner. Other players can Report; after their report exists, the UI replaces Report with **Reported for review**.

`src/community.ts` `reportMessage` inserts a report; it does not hide the message or promote the reporter to moderator. A realm-owner player account is not automatically a web moderator. `removeMessage` enforces author/profile-owner authorization server-side. Do not manipulate HTML or account permissions to bypass it.

The already deployed CLI supports **one-record reversible operator hiding** with an audit record: `deployment/moderate.mjs hide MESSAGE_ID REASON`. No new endpoint or release change is needed if a trusted operator execution context is available.

## Optional identification from an already open feed

If a browser developer console is available on the **already loaded** game page, this snippet reads only rendered Gray broadcast elements. It performs no network request, storage/cookie access, click or form submission. It can supply the missing immutable ID without an operator shell; it cannot hide the message or bypass authorization.

```javascript
const grayRecords = [...document.querySelectorAll('article.activity-broadcast')]
  .filter(entry => entry.querySelector('.player-link')?.textContent.trim() === 'Gray')
  .map(entry => ({
    id: entry.id.replace(/^activity-/, ''),
    authorName: entry.querySelector('.player-link').textContent.trim(),
    authorId: new URL(entry.querySelector('.player-link').href).pathname.split('/').pop(),
    createdAt: entry.querySelector('time')?.dateTime,
    body: entry.querySelector('.message-text')?.textContent
  }));
console.log(JSON.stringify(grayRecords, null, 2));
```

Review only the exact owner-described message. A missing result may mean it is not currently rendered; do not guess an ID. Share only the record fields above, never browser storage, cookies, page source or credentials. The normal feed JSON API is another existing source, but unlike this DOM-only read its request can perform ordinary player-state settlement; it is not a strictly database-read-only inspection.

## Shortest safe operator procedure

Run inside an **already authenticated trusted execution context for the currently deployed game service**, from its application directory. Use the deployed CLI, not a Phase 4.9 checkout against a database that has not installed those definitions. Keep credentials inside the existing private Railway environment. Do not change pre-deploy/start commands or stage variables to create an ad-hoc shell.

First inspect the reported queue and, if needed, the visible broadcast list. Both commands issue SELECTs only:

```bash
ALLOW_REALM_MODERATION=1 node deployment/moderate.mjs queue
ALLOW_REALM_MODERATION=1 node deployment/moderate.mjs broadcasts
```

Identify **one unique** record with channel `broadcast`, visible status, author Gray, the exact owner-quoted content (hash above), matching immutable author ID across both outputs, and a credible creation timestamp. Record the immutable message UUID, author UUID/name, full text and timestamp for the owner. If multiple candidates or author ambiguity exist, stop. Never substitute Development Knight/Night or another Gray message.

After identity is conclusively verified, the existing authorization permits exactly one hide:

```bash
gray_broadcast_id='REPLACE_WITH_CONCLUSIVELY_VERIFIED_GRAY_MESSAGE_UUID'
ALLOW_REALM_MODERATION=1 REALM_MODERATOR_LABEL='realm-owner' node deployment/moderate.mjs hide "$gray_broadcast_id"   'Owner-authorized hide of exact reported Gray broadcast; Phase 4.9'
```

This sets only that message to `hidden` and inserts an `operator_hide` audit entry. It does not remove accounts, reports, comments or battle records. The generic one-record CLI is not receipt-idempotent: **do not blindly retry an ambiguous result**, because another invocation can add another audit entry. Inspect status/audit before deciding whether any retry is needed.

## Required verification

1. Read the reported queue again; the exact message should be `hidden`. Record its audit entry through the trusted operator's existing audit access.
2. Read `broadcasts` again: the exact UUID is absent; unrelated visible records remain.
3. On the existing game domain, verify both **Recent Activity → All** and **Broadcasts**, including relevant older pages. Preserve evidence of absence and unrelated activity. These normal player views may perform ordinary session/income updates; they are not hidden database-administration operations.
4. Do not close this requirement until the live hide and both-feed verification exist. Current status: **blocked / unexecuted**, immutable ID still unknown.

The action is reversible through `restore MESSAGE_ID REASON` if the owner later requests reversal. Do not restore anything now.

If no trusted operator channel exists, [the separate operator-only inspection proposal](OPERATOR_INSPECTION_OPTIONS.md) remains an unimplemented option requiring separate authorization. Do not dispatch a release or alter release infrastructure to improvise moderation.
