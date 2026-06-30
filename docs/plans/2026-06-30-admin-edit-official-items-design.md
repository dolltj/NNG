# Edit Official Weapons/Attachments in admin.html — Design

## Context

`admin.html` currently only lists and edits *custom* weapons/attachments (player-authored items stored in `localStorage` via `weapon-store.js`). The official dictionary (`config/weapons.json`) is fetched read-only, used only for id-collision checks and the compatible-weapons multi-select. There's no way to see or edit official items from the admin screen. This adds that — letting an official item be "updated" the same way custom items already work: a local override, usable immediately in-game, exportable for the repo owner to merge later.

## 1. Merge semantics

`getMergedConfig(baseConfig)` in `weapon-store.js` currently does plain concatenation of official + custom arrays, with no id-based dedup (a deliberate prior design, since until now all custom ids were guaranteed unique via `uniqueId()`). This changes to an id-keyed merge: start from the official list, then for each custom-store entry, either **replace** the official entry with the same id (an override of an existing item) or **append** it (a genuinely new item, no matching official id).

Overrides are stored exactly like any custom item — `WeaponStore.saveCustomWeapon({id: 'monodagger', ...edited fields})` — no new storage shape. Deleting an override (`deleteCustomWeapon('monodagger')`) removes the localStorage entry; the next merge falls back to the official definition automatically. So "revert to original" needs no new logic — it's just Delete on an overridden item.

## 2. Tagging: `_custom` vs `_overridden`

`index.html`'s in-game dropdowns prefix `🔧 ` onto items flagged `_custom: true`, meaning "homebrew, not in the official rulebook." An edited official weapon is still nominally that same official weapon, just locally tweaked, so it should NOT get that prefix. `getMergedConfig` tags genuinely-new custom items (no matching official id) with `_custom: true` as before; items that override a matching official id get `_overridden: true` instead. `index.html`/`app.js` never reads `_overridden` — it's admin-UI-only, used for the badge described below. This keeps the player-facing in-game experience for an edited official item completely unchanged in presentation (same name, same position in the dropdown, no special marker) — just with updated stats.

## 3. Admin UI — combined lists with badges

`renderCustomWeaponsList`/`renderCustomAttachmentsList` are replaced with `renderWeaponsList`/`renderAttachmentsList`, iterating the full merged list (official + custom, the same shape `getMergedConfig` already produces) instead of `WeaponStore.getCustomWeapons()`/`getCustomAttachments()` alone. Each row gets a small badge reflecting its state:
- **Official** — plain/gray, no `_custom`/`_overridden` flag.
- **Edited** — `_overridden: true`, amber/highlighted.
- **Custom** — `_custom: true`, the existing 🔧-style treatment.

Edit opens the same weapon/attachment form, pre-filled, for all three states. Delete only appears on Edited/Custom rows — an Official row has no Delete button (there's nothing to revert; editing an Official row and saving is what creates the Edited state, and editing again is just Edit again). Deleting an Edited row reverts it to Official per the merge semantics in #1; deleting a Custom row removes it entirely, as today.

## 4. Export — unchanged

`WeaponStore.exportAll()` already returns the full custom-store content, which already includes override entries (since they're saved via the same `saveCustomWeapon`/`saveCustomAttachment` calls as brand-new items) — no change needed. An exported file may now contain entries whose `id` matches an official dictionary entry; when handed to the repo owner for a future merge into `config/weapons.json`, those should be treated as **replacements** of the matching official entry rather than additions, which is the natural and expected interpretation given the id match.
