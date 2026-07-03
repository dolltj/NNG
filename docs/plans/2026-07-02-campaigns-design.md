# Campaigns Design

## Context

The NNG sheet is a static app on GitHub Pages. Characters live in per-browser localStorage; weapon/perk configs are centralized in a Supabase project (`configs` table, RLS public-read/authenticated-write, public signups disabled, GM publishes from admin.html). The only existing account is the GM's.

Goal: campaigns that players can join, where everyone in the group can see every sheet, but only the assigned player (or the campaign's GM) can modify a given sheet.

## Decisions (settled with the user)

- **Player identity:** GM-created email/password accounts in the Supabase dashboard (signups stay disabled). RLS enforces ownership server-side.
- **Data model:** campaign characters are cloud-owned — the owner's existing debounced autosave writes to Supabase; viewers see the latest save on open/refresh. No realtime.
- **Multiple campaigns, visible to all accounts:** campaigns are organizational folders, not walls. Every signed-in account sees every campaign and its sheets ("Approach A"). The trust boundary is the GM-controlled account list. No membership table, no join codes; "joining" is moving/creating a character in a campaign. Membership can be added later without schema pain.

## Data model

```sql
create table public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  gm_id      uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.characters (
  id          text primary key,            -- reuses the app's 'char_...' ids
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id    uuid not null references auth.users(id),
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
```

RLS (both tables `to authenticated` only — nothing readable anonymously):
- `campaigns`: select for all authenticated; insert with check `gm_id = auth.uid()`; update/delete only by the GM (`gm_id = auth.uid()`).
- `characters`: select for all authenticated; insert with check `owner_id = auth.uid()`; update/delete when `owner_id = auth.uid()` **or** the caller is the campaign's GM (`exists (select 1 from campaigns c where c.id = campaign_id and c.gm_id = auth.uid())`).

Display names for owners come from a `display_name` in the character's jsonb (`player_name` already exists on the sheet) — no profile table.

## App changes (index.html / app.js)

- **Sign-in:** supabase-js CDN + email/password sign-in in the top bar (same pattern as admin.html, including the CDN-unreachable guard). Signed out, the app behaves exactly as today.
- **Roster:** two sections. "My Characters (this device)" — the existing local roster, unchanged. "Campaigns" (signed-in only) — all campaigns, each with a party grid (character name, level, owning player), a per-campaign "New Character here", and a New Campaign button. Local character cards gain "Move to campaign…" which inserts the character row (owner = you) and deletes the local copy. Moving back out = existing Export/Import; deliberately not a feature.
- **Character tagging & save routing:** in-memory model unchanged; each loaded character carries a source tag (local vs `{campaign_id, owner_id}`). `scheduleSave`/`saveAllCharacters` route by tag: localStorage as today, or debounced upsert of `{id, data, updated_at}` to Supabase. Cloud save failures reuse the existing red "Save FAILED" indicator.
- **View-only mode:** opening a sheet you don't own and don't GM renders normally, then a post-render pass disables every input/button/select in the sheet except tab navigation (rolls disabled too — it's not your character), shows a Refresh button that re-fetches the row, and a guard makes save a no-op in view mode (defense in depth on top of RLS).
- **GM powers:** sheets in campaigns you GM open fully editable.

## Failure modes

- Supabase unreachable → campaigns section shows a "couldn't load campaigns" note; local roster unaffected.
- Cloud save fails (offline, session expired) → red "Save FAILED" indicator; supabase-js auto-refreshes sessions, and a 401 on write also surfaces the indicator.
- Account deleted / RLS rejection → save indicator error; the sheet data is still exportable locally.

## Testing

- Node tests for pure helpers (save routing decision, character tagging/serialization).
- curl RLS verification: anonymous read must fail; cross-user character write must fail; owner write must succeed.
- Headless Edge boot of both pages (established check).
- Final manual test: two accounts, one campaign — player A edits own sheet, player B sees the update on refresh and cannot edit A's sheet; GM can edit both.
