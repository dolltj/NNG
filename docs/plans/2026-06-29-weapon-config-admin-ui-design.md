# Weapon/Attachment Config Admin UI Design

## Context

`config/weapons.json` is currently hand-edited JSON, maintained by whoever has GitHub/Claude Code access. At least one player using this site has no GitHub account, so they can't contribute new weapons/attachments by editing the file or opening a PR. This design adds a builder UI for creating custom weapons/attachments without hand-writing JSON, makes those custom items immediately usable in that browser's own games, and provides an export so a non-GitHub player can hand their creation to the repo owner to merge into the shared dictionary.

This only adds new files/UI — it does not change the Combat tab's existing weapon-card rendering, rolling, or attachment-equip logic from the prior `weapon-attachment-config` work. Those consume `WEAPON_CONFIG` exactly as before; this work only changes what `WEAPON_CONFIG` contains by the time they read it.

## 1. Where it lives

A separate static page, `admin.html`, not a tab inside the per-character sheet (this tool isn't tied to a character). A new shared file, `weapon-store.js`, holds all custom-item storage/merge/export logic, loaded by both `index.html` (so the main app can merge customs into `WEAPON_CONFIG` at bootstrap) and `admin.html` (so the builder can read/write the same store) — one source of truth, no duplicated logic between the two pages.

A small link on the character-roster screen ("⚙ Manage Weapons") opens `admin.html`; a link back returns to `index.html`.

## 2. Storage & runtime merge

New localStorage key, e.g. `ttrpg_custom_weapon_config`, browser-global (not tied to a character — matches how `config/weapons.json` itself is global), storing `{ weapons: [...], attachments: [...] }` in the exact same shape as `config/weapons.json`.

`weapon-store.js` exposes:
```js
window.WeaponStore = {
  getCustomWeapons(),
  getCustomAttachments(),
  saveCustomWeapon(weapon),       // upsert by id
  saveCustomAttachment(attachment), // upsert by id
  deleteCustomWeapon(id),
  deleteCustomAttachment(id),
  getMergedConfig(baseConfig),    // { weapons: [...base, ...custom], attachments: [...base, ...custom] }
  exportAll()                     // returns the custom-only { weapons, attachments } object
};
```

In `app.js`'s bootstrap, immediately after `WEAPON_CONFIG = await loadConfig(WEAPONS_CONFIG_URL);`, add `WEAPON_CONFIG = window.WeaponStore.getMergedConfig(WEAPON_CONFIG);`. Every existing consumer (`findWeaponDef`, `resolveWeapon`, the Add Weapon dropdown, the Add Attachment picker in `buildAttachmentsSection`) needs zero changes — they already just read whatever `WEAPON_CONFIG.weapons`/`.attachments` contains. This is the only change to `app.js`; `index.html` gets one new `<script src="weapon-store.js">` tag, loaded before `app.js`.

Custom items get a visual tag ("🔧 ") prefixed onto their label specifically in the in-game Add Weapon/Add Attachment dropdowns (not in `weapon-store.js` itself, which stores the clean label) so players can tell homebrew apart from official content.

## 3. The builder forms (`admin.html` + new `admin.js`)

Loads `weapon-store.js` and fetches the base `config/weapons.json` directly (read-only — to know what's "official" for id-collision checks and for populating the compatible-weapons multi-select with the full official+custom list).

**Weapon builder:** label, category (free text), tags (comma-separated), description, magazine size (number, or a checkbox/blank for "no magazine" → melee-style), and a repeatable **Actions** list. Each action row has a type selector that reveals only the relevant fields:
- **Normal** — label, range, damage, optional damage_type, optional ammo_cost.
- **Burst Fire** — adds attack_count (and implies ammo_cost is meaningful).
- **Area Effect** — adds area_of_effect, save_dv.
- **Reload** — label only, no other fields (`is_reload: true`).

**Attachment builder:** label, category, a multi-select of compatible weapons (from the merged official+custom weapon list), description, a repeatable **Effects** list typed as: set magazine size (value, optional weapon-scope), add tag, remove tag, action hit bonus (action id + value), action save-DV bonus (action id + value), remove burst disadvantage. Plus a free-text repeatable **Notes** list for narrative-only effects (no structured automation).

Both sections show a list of already-saved custom items with Edit (reopens the form pre-filled) and Delete.

## 4. Validation

Light-touch, just enough to prevent saving something that would break the renderer:
- Label required.
- Id auto-slugified from the label (lowercase, spaces→underscores), checked for collision against both the official dictionary and other saved custom items of the same kind; auto-suffixed (`_2`, `_3`, ...) on collision rather than blocking the save.
- Numeric fields coerced via `parseInt`/`parseFloat`, defaulting to 0 if unparseable (consistent with how the rest of this app already handles numeric inputs).
- A weapon needs at least one action before it can be saved.
- No deep schema validation beyond this (e.g. not verifying `damage` is syntactically valid dice notation) — kept intentionally simple, matching this project's established "don't over-engineer validation" approach.

## 5. Export / the non-GitHub workflow

An "Export" button on `admin.html` calls `WeaponStore.exportAll()` and downloads it as a `.json` file (standard `Blob` + temporary `<a download>` link, no new dependency). The friend builds a weapon, it's immediately usable in their own characters via the runtime merge, and when ready to share, they export and send the file out-of-band (Discord/email/etc.) to the repo owner, who brings it into a Claude Code session to be merged into the real `config/weapons.json` and committed/pushed. No in-app import UI — explicitly out of scope per this design.
