# Perks in admin.html — Design

## Context

`admin.html` currently manages weapons and attachments (show official + custom/overridden, Edit, Delete/Revert). Perks live in `config/perks.json` (15 named perks, `{id, name, level, prerequisite, effect, action}`), loaded into `PERKS_CONFIG` in `app.js` at bootstrap, and presented to the player via a level-filtered dictionary dropdown in `buildPerksList`. There is no way to see, edit, or create custom perks from the admin page. This adds a Perks section to `admin.html` that mirrors the weapon/attachment management UX, with the same Official/Edited/Custom badge system and the same override-via-edit mechanism.

## 1. Storage — extend `weapon-store.js`

A new private `ttrpg_custom_perk_config` localStorage key (a JSON array of perk objects in the same shape as `config/perks.json` entries), alongside the existing `ttrpg_custom_weapon_config` key. Stored and read by the same `weapon-store.js` module already loaded by both `index.html` and `admin.html`.

New functions added to `window.WeaponStore`:
- `getCustomPerks()` — returns the stored array.
- `saveCustomPerk(perk)` — upsert by id.
- `deleteCustomPerk(id)` — filter by id, save.
- `getPerksMergedConfig(basePerks)` — same id-keyed merge as `_mergeList` for weapons/attachments: official perks pass through unflagged, a custom-store perk whose id matches an official one replaces it in place (`_overridden: true`), a custom-store perk with a novel id is appended (`_custom: true`). Deep-cloned (JSON round-trip), same as the weapon merge.

`exportAll()` extended to include perks: export shape becomes `{weapons:[...], attachments:[...], perks:[...]}`. Backward compatible — the existing two keys are unchanged.

## 2. admin.html + admin.js — Perks section

A new "Perks" section added at the bottom of `admin.html`'s `<main>`, after the existing Attachments section, with the same markup pattern:
```html
<div class="section-header mt-lg">Perks</div>
<div id="perks-list"></div>
<button class="btn btn-primary mt-md" id="new-perk-btn">＋ New Perk</button>
<div id="perk-form-container"></div>
```

`admin.js` gets:
- `getAllPerks()` — routes through `WeaponStore.getPerksMergedConfig(BASE_WEAPON_CONFIG_perks)` where `BASE_PERK_CONFIG` (fetched separately at bootstrap alongside `BASE_WEAPON_CONFIG`) is the raw official array from `config/perks.json`. Actually: `admin.js` already fetches `config/weapons.json` into `BASE_WEAPON_CONFIG` — it does NOT currently fetch `config/perks.json`. This task adds a fetch of `config/perks.json` into a new `BASE_PERK_CONFIG` variable in `admin.js`'s `DOMContentLoaded` handler.
- `renderPerksList()` — same Official/Edited/Custom badge + Edit/Delete-or-Revert pattern as `renderWeaponsList`/`renderAttachmentsList`.
- `renderPerkForm(existingPerk)` — builder form with fields matching the perk schema: **Name**, **Level** (number, 1–99), **Prerequisite** (text, e.g. "Level 1"), **Effect** (textarea), and an optional **Granted Action** block: type selector (Action / Reaction / Quick Action / None, defaulting to None), revealed label + description text fields when not None. Simpler than the weapon form — no repeatable sub-rows.
- Id generation: same `slugify + uniqueId` collision-avoidance against `BASE_PERK_CONFIG` + existing custom perk ids, for genuinely new perks. Editing reuses `existingPerk.id`, triggering the override path — same mechanism as weapons, documented with the same code comment convention established for weapons.
- `slugify` and `uniqueId` already exist in `admin.js` — reused unchanged.

The bootstrap block in `admin.js` adds:
```js
const perkResp = await fetch('config/perks.json');
if (!perkResp.ok) throw new Error(`Failed to load config/perks.json: ${perkResp.status}`);
BASE_PERK_CONFIG = await perkResp.json();
```
and wires the `#new-perk-btn` click → `renderPerkForm(null)`.

## 3. app.js — bootstrap merge + dictionary dropdown update

One new line in the `DOMContentLoaded` bootstrap, after `PERKS_CONFIG = await loadConfig(PERKS_CONFIG_URL)`:
```js
PERKS_CONFIG = window.WeaponStore.getPerksMergedConfig(PERKS_CONFIG);
```
This makes custom/overridden perks immediately available in the in-game dictionary dropdown (index.html's Character tab) without any other change to `buildPerksList`.

In `buildPerksList`'s dictionary dropdown option template, custom perks (`p._custom`) get a `🔧 ` prefix, consistent with how custom weapons appear in the Combat tab's Add Weapon dropdown:
```js
`<option value="${p.id}">Lv ${p.level} — ${p._custom ? '🔧 ' : ''}${escHtml(p.name)}</option>`
```
Overridden official perks appear unchanged in the dropdown (no prefix) — same as edited weapons.
