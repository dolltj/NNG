# Campaign Deletion (Character-Preserving) Design & Plan

## Context

GMs currently have no way to delete a campaign. Worse, the shipped schema has `characters.campaign_id uuid NOT NULL ... ON DELETE CASCADE`, so a raw campaign delete would destroy every character in it. Requirement (user, 2026-07-03): GMs can delete campaigns; characters must survive, losing only their campaign association.

## Decisions (settled with the user)

Orphaned characters stay cloud-owned in a new "Not in a campaign" block in the Campaigns area — visible to everyone like all sheets, editable only by their owner, re-homeable via the existing "Move to campaign…" modal.

## Design

**Migration** (`campaigns-orphans.sql`, run once in the SQL Editor — MUST run before the UI ships, or the delete button would cascade-delete characters):

```sql
alter table public.characters alter column campaign_id drop not null;
alter table public.characters drop constraint characters_campaign_id_fkey;
alter table public.characters
  add constraint characters_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id) on delete set null;
```

**RLS: no changes needed.** With `campaign_id` null, the "is campaign GM" clause in the write policies is false, so orphans are writable only by their owner — the ex-GM correctly loses power over them. `canEditCharacter` already mirrors this client-side (campaign lookup misses → owner only); a unit test pins it.

**Store:** `CampaignStore.deleteCampaign(id)` — the only new method. `upsertCharacter`/`cloudRowToChar` already tolerate a null campaign id.

**UI:**
- GM-only ✕ button on the campaign block header → confirm ("characters are kept and become Not in a campaign") → `deleteCampaign` → re-render. RLS rejects non-GMs server-side regardless.
- "Not in a campaign" block after the campaign blocks, built from rows with null `campaign_id`: owner cards editable with delete (permanent, confirm suggests exporting first) and "Move to campaign…" (loads the char into `CHARACTERS` then reuses `openMoveModal`, which already does the right write); others' cards view-only.

**Failure modes:** delete rejected (not GM / offline) → alert, nothing re-rendered. Campaign deletion itself is irreversible; character preservation is guaranteed by the FK action, not by app code.

## Plan

1. `campaigns-orphans.sql` (untracked artifact) + fix canonical `campaigns-setup.sql` (nullable column, `on delete set null`).
2. TDD: unit test pinning `canEditCharacter` owner-only behavior for null-campaign orphans.
3. `CampaignStore.deleteCampaign`.
4. app.js: delete button in `buildCampaignBlock`; `buildOrphanBlock` + orphan rows wired into `renderCampaignArea`.
5. Verify: `node --check`, `node --test`, headless boot; USER runs migration; confirm via PostgREST OpenAPI that `campaign_id` is no longer required; deploy; live test (delete a scratch campaign, confirm characters survive as unassigned).
