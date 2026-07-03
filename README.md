# Character Vault

A browser-based character sheet for the NNG system with a multi-character roster, weapon/attachment/perk dictionaries, and Roll20 integration.

## Using it

Open the hosted URL: `https://dolltj.github.io/NNG/`

Your characters are saved in your own browser only (not shared with other players). Use the Export/Import buttons in the top bar to back up a character or move it to another device/browser.

## Shared configs (weapons, attachments, perks)

The official weapon/attachment/perk lists live in a central Supabase table, not in this repo. Every player's sheet fetches them on load (and falls back to the JSON files bundled here if the service is unreachable).

**For the GM:** open [admin.html](https://dolltj.github.io/NNG/admin.html), sign in (top-right), make your edits — they stage as local drafts marked 🔧/Edited — then click **⬆ Publish to Everyone**. Players receive the change the next time they load the sheet.

**For players:** nothing to do. You can also add personal homebrew via your own browser's admin page without signing in; unpublished items stay local to your browser.

## Campaigns

Signed-in players can put characters into shared campaigns. Everyone with an account sees every campaign's sheets; only the owning player (and the campaign's GM) can edit a sheet — others get a read-only view with a Refresh button.

- Accounts are created by the GM in the Supabase dashboard (there is no self-signup).
- Sign in from the roster screen's Campaigns section.
- "Move to campaign…" on a local character uploads it; it then lives in the cloud and autosaves there. Export/Import still works for backups.
- Characters not in a campaign stay local to your browser, as always.

## Development

No build step — plain HTML/JS/CSS. Run the unit tests with `node --test` (Node 18+) from the repo root.

## Sending rolls to Roll20 (optional)

By default, clicking "Send to Roll20" on a roll copies a `/roll` command to your clipboard, which you paste into Roll20's chat manually.

To send rolls automatically instead:

1. Install the [Beyond20](https://beyond20.here-for-more.info/) browser extension.
2. Open the extension's options page → Advanced → add this site's domain (`dolltj.github.io`) to the Custom Sites list.
3. Open your Roll20 game in another tab. Beyond20 needs an active Roll20 tab to relay rolls into.
4. Click a roll button on a sheet, then "Send to Roll20" — it should now appear directly in Roll20 chat instead of being copied to your clipboard.

Note: Roll20 rolls the dice itself from the formula you send — the number shown in this sheet's own roll popup and the number that lands in Roll20 chat are two independent rolls, the same way Beyond20 behaves with D&D Beyond.
