# Character↔Campaign Association Design

## Requirement (user, 2026-07-03)

Characters — local or cloud — need full association control: transfer between campaigns, and remove from a campaign without deleting.

## Gaps being closed

- Cloud characters in a campaign had no transfer path and no non-destructive removal.
- The ✕ on campaign cards said "Remove from campaign" but permanently deleted the character.
- RLS let a GM transfer a player's character between campaigns they GM, but not unassign it (the update policy had no explicit `WITH CHECK`, and the implicit fallback rejects a null-campaign new row for non-owners).

## Design

**One generalized move modal** (`openMoveModal`) used by local cards, orphan cards, and now campaign cards (shown when `canEditCharacter` allows — owner anywhere, GM within their campaigns):
- Lists all campaigns except the character's current one → transfer.
- For cloud characters in a campaign, adds "⊘ Remove from campaign" → `campaign_id = null` → lands in the existing "Not in a campaign" block.
- Ownership is preserved on cloud moves (`owner_id` unchanged — a GM re-homing a player's character must not steal it). Local uploads still set the uploader as owner.
- On failure the previous association is restored and nothing is re-rendered.

**Honest ✕**: campaign-card delete button tooltip/confirm now say "Delete permanently", pointing at the move modal for non-destructive removal.

**Migration** (`campaigns-unassign.sql`): recreate the characters update policy with an explicit `WITH CHECK (owner = caller OR new campaign_id IS NULL OR caller GMs the new campaign)`. This enables GM-kick while keeping owner powers unchanged; canonical `campaigns-setup.sql` updated to match.

## Verification

`node --test` (existing 12), headless boot, then live walkthrough: transfer own, unassign own, GM-transfer, GM-unassign (the last requires the migration). Policy verified via a pg_policies paste in the SQL editor.
