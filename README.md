# Character Vault

A browser-based TTRPG character sheet with D&D 5e support and Roll20 integration.

## Using it

Open the hosted URL: `https://dolltj.github.io/NNG/`

Your characters are saved in your own browser only (not shared with other players). Use the Export/Import buttons in the top bar to back up a character or move it to another device/browser.

## Sending rolls to Roll20 (optional)

By default, clicking "Send to Roll20" on a roll copies a `/roll` command to your clipboard, which you paste into Roll20's chat manually.

To send rolls automatically instead:

1. Install the [Beyond20](https://beyond20.here-for-more.info/) browser extension.
2. Open the extension's options page → Advanced → add this site's domain (`dolltj.github.io`) to the Custom Sites list.
3. Open your Roll20 game in another tab. Beyond20 needs an active Roll20 tab to relay rolls into.
4. Click a roll button on a sheet, then "Send to Roll20" — it should now appear directly in Roll20 chat instead of being copied to your clipboard.

Note: Roll20 rolls the dice itself from the formula you send — the number shown in this sheet's own roll popup and the number that lands in Roll20 chat are two independent rolls, the same way Beyond20 behaves with D&D Beyond.
