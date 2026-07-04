# Admin Dictionary Deletion Design & Plan

## Requirement (user, 2026-07-03)

The admin page must allow deleting official dictionary entries (weapons, attachments, perks), not just custom ones.

## Design

**Staged tombstones, published like every other draft.** A new localStorage key (`ttrpg_deleted_config_ids`: `{weapons:[], attachments:[], perks:[]}`) records deleted ids. The merge functions filter tombstoned base items out by default — the admin's own sheet reflects deletions immediately, and Publish (which uploads the default merge) excludes them with no changes to the publish code. `clearAllCustom` (called after Publish) clears tombstones too.

Admin needs to *see* tombstoned rows to offer Restore, so the merge functions accept `{ includeDeleted: true }`, which marks such items `_deleted: true` instead of dropping them (admin-only; app callers stay unchanged).

**Row actions become:**
- Official: Edit · Delete (tombstone, confirm)
- Edited: Edit · Revert (the old ✕, now labeled) · Delete (drops the override AND tombstones)
- Custom: Edit · Delete (hard delete, unchanged)
- Deleted: greyed row, "Deleted — removed for everyone on Publish" badge, Restore

**Player impact (existing behaviors, stated in the confirm dialogs):** perks already on sheets are copies — unaffected; deleted weapons vanish from sheets that reference them (existing orphan handling).

**Trust model unchanged:** anyone can stage deletions locally; only the signed-in GM can publish them.

## Plan

1. weapon-store.js: tombstone storage + `markDeleted`/`restoreDeleted`/`getDeletedIds`; `_mergeList` gains deleted-ids param + includeDeleted mode; `clearAllCustom` clears tombstones; make the module node-requirable (window/module export guard like util.js) for testing.
2. TDD: `tests/weapon-store.test.js` with a localStorage stub — filtering, includeDeleted marking, restore, clearAllCustom.
3. admin.js: three renderers get the new action set; `getAllWeapons`/`getAllAttachments`/`getAllPerks` pass `includeDeleted: true`; deleted rows render badge + Restore. (Known debt: the three renderers remain triplicated; not refactoring here.)
4. style.css: `.admin-item-deleted` greyed/struck styling.
5. Verify: node tests, headless boot of admin.html, live publish check (delete an official item, publish, second browser no longer sees it; restore path before publish).
