# Perks Dictionary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dictionary of 15 named perks that can be picked onto a character alongside the existing free-form perk entry, with a level-based visibility filter.

**Architecture:** A new static `config/perks.json` array, fetched at bootstrap into a `PERKS_CONFIG` global (same pattern as `CONFIG`/`WEAPON_CONFIG`). The existing Perks section's rendering (currently the shared `buildTextEntryList` helper) is replaced with a dedicated `buildPerksList` function that renders both free-form and dictionary-sourced perk entries, plus two add mechanisms: the unchanged free-form add row, and a new level-filtered dictionary dropdown+button. `buildTextEntryList` itself is untouched — its other four call sites (Psycasts, Injuries, Critical Injuries, Equipment) are unaffected.

**Tech Stack:** Plain JS/HTML/CSS, no framework, no build step, no permanent test suite (this project's established convention — verification is via throwaway Node scripts, deleted after passing).

Execution happens in a dedicated worktree (`.worktrees/perks-dictionary`, branch `perks-dictionary`), set up by the controlling session before Task 1 is dispatched, per `superpowers:using-git-worktrees`. All file paths below are relative to that worktree root.

---

### Task 1: Create `config/perks.json`

**Files:**
- Create: `config/perks.json`

**Step 1: Write the file**

```json
[
  {
    "id": "adrenaline_rush",
    "name": "Adrenaline Rush",
    "level": 1,
    "prerequisite": "Level 1",
    "effect": "You gain the Adrenaline Rush Action",
    "action": { "type": "Action", "label": "Adrenaline Rush", "text": "You can place yourself at the top of the Initiative order." }
  },
  {
    "id": "battlefield_medic",
    "name": "Battlefield Medic",
    "level": 1,
    "prerequisite": "Level 1",
    "effect": "You gain the Tend Action.",
    "action": { "type": "Action", "label": "Tend (requires Med Kit)", "text": "Remove the bleeding condition from one character within Range 1. In addition, the target regains Hit Points equal to 1d10 + your Willpower score." }
  },
  {
    "id": "tough_as_nails",
    "name": "Tough as Nails",
    "level": 1,
    "prerequisite": "Level 1",
    "effect": "Your Injury Threshold increases by 25% (round up).",
    "action": null
  },
  {
    "id": "interceptor",
    "name": "Interceptor",
    "level": 2,
    "prerequisite": "Level 2",
    "effect": "You gain the Interceptor Reaction.",
    "action": { "type": "Reaction", "label": "Interceptor", "text": "When a character you can see hits another character within Range 1 of you with an attack, you can take a reaction to take the resulting damage from that attack instead of the original target." }
  },
  {
    "id": "speed_freak",
    "name": "Speed Freak",
    "level": 2,
    "prerequisite": "Level 2",
    "effect": "Your Speed increases by 2. In addition, your movement ignores the movement penalty of difficult terrain when you take the Hustle action.",
    "action": null
  },
  {
    "id": "tactician",
    "name": "Tactician",
    "level": 2,
    "prerequisite": "Level 2",
    "effect": "You gain the Tactician Reaction.",
    "action": { "type": "Reaction", "label": "Tactician", "text": "Whenever an ally character in line of sight misses with an attack, you may add 1 to the attack roll. This may cause the attack to hit." }
  },
  {
    "id": "inspiring_leader",
    "name": "Inspiring Leader",
    "level": 3,
    "prerequisite": "Level 3",
    "effect": "You gain a number of Leadership Dice equal to your Willpower score, which are d6s, and gain the Issue Order Quick Action. If you run out of Leadership Dice, you regain 1 when you roll Initiative or regain all when you take a Long Rest.",
    "action": { "type": "Quick Action", "label": "Issue Order", "text": "You may give one ally character a Leadership Die. They may expend the Leadership Die to add +1d6 to any Test, or they may return it to you as a Free Action on their turn. An ally character can have one Leadership Die at a time, which lasts until they take a Short or Long Rest." }
  },
  {
    "id": "rotation",
    "name": "Rotation",
    "level": 3,
    "prerequisite": "Level 3",
    "effect": "You gain the Rotation Action.",
    "action": { "type": "Action", "label": "Rotation", "text": "You and one other willing target within Range 2 swap places as long as no obstacles are between the two of you. In addition, you and the target gain the benefit of Soft Cover until the start of your next turn." }
  },
  {
    "id": "through_the_gaps",
    "name": "Through the Gaps",
    "level": 3,
    "prerequisite": "Level 3",
    "effect": "Attacks with melee weapons that deal piercing damage deal additional damage to Hit Points equal to your Agility score.",
    "action": null
  },
  {
    "id": "pack_tactics",
    "name": "Pack Tactics",
    "level": 4,
    "prerequisite": "Level 4",
    "effect": "Gain Advantage to attack rolls with melee weapons if you have an ally next to your target.",
    "action": null
  },
  {
    "id": "shield_expert",
    "name": "Shield Expert",
    "level": 4,
    "prerequisite": "Level 4",
    "effect": "When you take the Shield Wall Action, all incoming physical damage dealt to your shield is reduced by twice your Fortitude score.",
    "action": null
  },
  {
    "id": "underdog",
    "name": "Underdog",
    "level": 4,
    "prerequisite": "Level 4",
    "effect": "You ignore the penalties imposed by the Flanked condition.",
    "action": null
  },
  {
    "id": "durable",
    "name": "Durable",
    "level": 5,
    "prerequisite": "Level 5",
    "effect": "When you're hit by an attack while wearing heavy armor, any physical damage dealt to your armor is reduced by an amount equal to your Fortitude score.",
    "action": null
  },
  {
    "id": "force_multiplier",
    "name": "Force Multiplier",
    "level": 5,
    "prerequisite": "Level 5",
    "effect": "Gain the Force Multiplier Quick Action.",
    "action": { "type": "Quick Action", "label": "Force Multiplier", "text": "Choose an ally character within line of sight that can hear you. They can immediately spend their Reaction to make an attack against a character within Range. This attack deals additional damage equal to your Willpower Score." }
  },
  {
    "id": "nimble",
    "name": "Nimble",
    "level": 5,
    "prerequisite": "Level 5",
    "effect": "When you're hit by an attack while wearing light armor, any physical damage dealt to your Hit Points is reduced by an amount equal to your Agility score.",
    "action": null
  }
]
```

**Step 2: Verify**

```bash
node -e "JSON.parse(require('fs').readFileSync('config/perks.json')); console.log('valid, ' + JSON.parse(require('fs').readFileSync('config/perks.json')).length + ' perks')"
```
Expected output: `valid, 15 perks`

**Step 3: Commit**

```bash
git add config/perks.json
git commit -m "feat: add perks dictionary data file"
```

---

### Task 2: Load `PERKS_CONFIG` at bootstrap

**Files:**
- Modify: `app.js:10-30`

**Step 1: Add the global and URL constant**

In the STATE block (`app.js:10-19`), add a new global next to `WEAPON_CONFIG` and a new URL constant next to `WEAPONS_CONFIG_URL`:

```js
let CONFIG        = null;   // loaded from nng.json
let WEAPON_CONFIG  = null;  // loaded from weapons.json — { weapons: [], attachments: [] }
let PERKS_CONFIG  = null;   // loaded from perks.json — array of perk dictionary entries
let CHARACTERS    = {};     // { [id]: characterObject }
let ACTIVE_ID     = null;   // currently open character id
let SAVE_TIMER    = null;   // debounce handle for autosave

const STORAGE_CHARS_KEY  = 'ttrpg_characters';
const STORAGE_ACTIVE_KEY = 'ttrpg_active_id';
const CONFIG_URL         = 'config/nng.json';
const WEAPONS_CONFIG_URL  = 'config/weapons.json';
const PERKS_CONFIG_URL    = 'config/perks.json';
```

**Step 2: Fetch it in the bootstrap handler**

Change `app.js:24-30` from:

```js
window.addEventListener('DOMContentLoaded', async () => {
  CONFIG = await loadConfig(CONFIG_URL);
  WEAPON_CONFIG = await loadConfig(WEAPONS_CONFIG_URL);
  WEAPON_CONFIG = window.WeaponStore.getMergedConfig(WEAPON_CONFIG);
  loadAllCharacters();
  renderRoster();
});
```

to:

```js
window.addEventListener('DOMContentLoaded', async () => {
  CONFIG = await loadConfig(CONFIG_URL);
  WEAPON_CONFIG = await loadConfig(WEAPONS_CONFIG_URL);
  WEAPON_CONFIG = window.WeaponStore.getMergedConfig(WEAPON_CONFIG);
  PERKS_CONFIG = await loadConfig(PERKS_CONFIG_URL);
  loadAllCharacters();
  renderRoster();
});
```

No new script tag is needed in `index.html` — `PERKS_CONFIG` is fetched the same way `CONFIG`/`WEAPON_CONFIG` already are, via the existing `loadConfig` helper. There's no custom-item/admin layer for perks (out of scope per the design — this is a static, developer-maintained dictionary only).

**Step 3: Verify**

Throwaway Node check (no browser needed for this step — just confirms the bootstrap function references the right URL/global names and that `loadConfig`'s error-surfacing behavior, which already throws on a non-OK response, will naturally cover a missing/malformed `perks.json` the same way it already covers `weapons.json`):

```bash
node --check app.js
grep -n "PERKS_CONFIG" app.js
```
Expected: syntax check passes; grep shows the 3 new references (declaration, URL const, bootstrap assignment).

**Step 4: Commit**

```bash
git add app.js
git commit -m "feat: load perks dictionary config at bootstrap"
```

---

### Task 3: Replace the Perks section's renderer with `buildPerksList`

**Files:**
- Modify: `app.js:104-125` (createCharacter — add `show_all_perks` default)
- Modify: `app.js:351-357` (renderTabInfo — swap the `buildTextEntryList` call for `buildPerksList`)
- Modify: `app.js:1252` (insert new `buildPerksList` function after `buildTextEntryList`, before the UTILITY section comment)

**Step 1: Add the `show_all_perks` default to `createCharacter`**

In `app.js`, find:

```js
    perks:        [],
    origin_perk:  { name: '', description: '' },
```

Change to:

```js
    perks:        [],
    show_all_perks: false,
    origin_perk:  { name: '', description: '' },
```

(Existing saved characters predating this field simply have `show_all_perks === undefined`, which the rendering code below treats as falsy — no migration needed, consistent with this project's established no-migration convention.)

**Step 2: Swap the Perks section's render call**

In `renderTabInfo` (`app.js:351-357`), change:

```js
  buildTextEntryList(document.getElementById('perks-list'), char.perks, {
    maxCount: 10,
    secondFieldLabel: 'Description',
    secondFieldType: 'text',
    addButtonLabel: '+ Add Perk',
    onChange: () => renderTabInfo(getChar())
  });
}
```

to:

```js
  buildPerksList(document.getElementById('perks-list'), char);
}
```

**Step 3: Add the `buildPerksList` function**

Insert this new function immediately after the closing `}` of `buildTextEntryList` (`app.js:1252`), before the `// UTILITY` section comment:

```js
// -----------------------------------------------
// PERKS LIST (dedicated renderer — NOT buildTextEntryList)
// Renders both free-form {name, description} perks and
// dictionary-sourced {name, prerequisite, effect, action} perks.
// All mutation handlers re-fetch via getChar() rather than closing
// over the `char` param, to avoid the stale-character-reference bug
// class found in the weapon-attachment-config work.
// -----------------------------------------------
function buildPerksList(container, char) {
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'perks-item-list';
  (char.perks || []).forEach((perk, i) => {
    const row = document.createElement('div');
    row.className = 'perk-item';

    let detailHtml = '';
    if (perk.prerequisite || perk.effect || perk.action) {
      const parts = [];
      if (perk.prerequisite) parts.push(`<strong>Prerequisite.</strong> ${escHtml(perk.prerequisite)}`);
      if (perk.effect) parts.push(`<strong>Effect.</strong> ${escHtml(perk.effect)}`);
      if (perk.action) parts.push(`<strong>${escHtml(perk.action.type)}: ${escHtml(perk.action.label)}.</strong> ${escHtml(perk.action.text)}`);
      detailHtml = `<div class="perk-detail">${parts.join('<br>')}</div>`;
    } else if (perk.description) {
      detailHtml = `<div class="perk-detail">${escHtml(perk.description)}</div>`;
    }

    row.innerHTML = `
      <div class="perk-item-row">
        <span class="perk-item-name">${escHtml(perk.name)}</span>
        <button class="delete-item-btn" title="Remove">✕</button>
      </div>
      ${detailHtml}
    `;
    row.querySelector('.delete-item-btn').addEventListener('click', () => {
      getChar().perks.splice(i, 1);
      scheduleSave();
      renderTabInfo(getChar());
    });
    list.appendChild(row);
  });
  container.appendChild(list);

  if ((char.perks || []).length >= 10) return; // at cap, no add forms

  // Free-form add row (same behavior as the old buildTextEntryList call)
  const freeForm = document.createElement('div');
  freeForm.className = 'flex gap-sm mt-md flex-wrap';
  freeForm.innerHTML = `
    <input class="field-input" placeholder="Name" id="perk-ff-name" style="flex:2">
    <input class="field-input" placeholder="Description" id="perk-ff-desc" style="flex:2">
    <button class="btn btn-secondary" id="perk-ff-add">+ Add Perk</button>
  `;
  container.appendChild(freeForm);

  document.getElementById('perk-ff-add').addEventListener('click', () => {
    const name = document.getElementById('perk-ff-name').value.trim();
    if (!name) return;
    const description = document.getElementById('perk-ff-desc').value.trim();
    getChar().perks.push({ name, description });
    scheduleSave();
    renderTabInfo(getChar());
  });

  // Dictionary add row
  const eligiblePerks = (PERKS_CONFIG || []).filter(p => char.show_all_perks || p.level <= (char.level || 1));
  const dictWrap = document.createElement('div');
  dictWrap.className = 'flex gap-sm mt-sm flex-wrap';
  dictWrap.innerHTML = `
    <label class="flex gap-xs" style="align-items:center;font-size:0.8rem;color:var(--text-muted)">
      <input type="checkbox" id="perk-show-all" ${char.show_all_perks ? 'checked' : ''}>
      Show perks above my level
    </label>
    <select class="field-input" id="perk-dict-select" style="flex:1">
      <option value="">+ Add from Dictionary…</option>
      ${eligiblePerks.map(p => `<option value="${p.id}">Lv ${p.level} — ${escHtml(p.name)}</option>`).join('')}
    </select>
    <button class="btn btn-primary" id="perk-dict-add">Add</button>
  `;
  container.appendChild(dictWrap);

  document.getElementById('perk-show-all').addEventListener('change', (e) => {
    getChar().show_all_perks = e.target.checked;
    scheduleSave();
    renderTabInfo(getChar());
  });

  document.getElementById('perk-dict-add').addEventListener('click', () => {
    const select = document.getElementById('perk-dict-select');
    const perkId = select.value;
    if (!perkId) return;
    const def = (PERKS_CONFIG || []).find(p => p.id === perkId);
    if (!def) return;
    getChar().perks.push({
      name: def.name,
      description: '',
      prerequisite: def.prerequisite,
      effect: def.effect,
      action: def.action
    });
    scheduleSave();
    renderTabInfo(getChar());
  });
}
```

**Step 4: Verify with a throwaway Node script**

Use the same `vm`-based DOM-shim approach established in the `weapon-config-admin-ui` plan (real `app.js` loaded into a sandboxed context with a minimal `document`/`localStorage`/`fetch` shim; remember `vm.createContext`'s sandbox needs `sandbox.window = sandbox` and stubbed `addEventListener`s). Exercise:

- A fresh character has `show_all_perks === false` and `perks === []`.
- Adding a free-form perk via the `#perk-ff-name`/`#perk-ff-desc`/`#perk-ff-add` flow produces a perk with only `{name, description}` — no `prerequisite`/`effect`/`action` keys.
- With `char.level === 1` and `show_all_perks` unchecked, `#perk-dict-select`'s options include only the 3 level-1 perks (Adrenaline Rush, Battlefield Medic, Tough as Nails) — NOT Interceptor (level 2) or higher.
- Checking `#perk-show-all` and re-rendering: the dropdown now includes all 15 perks, and `getChar().show_all_perks === true` persists across a `renderTabInfo` re-render.
- Picking "Adrenaline Rush" from the dictionary and clicking `#perk-dict-add` produces a perk with `name: 'Adrenaline Rush'`, `description: ''`, `prerequisite: 'Level 1'`, `effect`, and `action: {type:'Action', label:'Adrenaline Rush', text:...}` matching `config/perks.json`'s entry exactly.
- Picking "Tough as Nails" (an `action: null` perk) and adding it — confirm the resulting perk object has `action: null` and that rendering it back out via `buildPerksList` doesn't throw (the `if (perk.action)` guard in the render path must skip cleanly).
- Deleting a perk (free-form or dictionary-sourced) via its ✕ button removes exactly that entry from `char.perks` by index, leaving others intact.
- Adding perks up to the 10-cap: at 10 perks, both add rows (free-form and dictionary) disappear; the list of 10 perk rows still renders.
- Confirm `buildTextEntryList` (used by Psycasts/Injuries/Critical Injuries/Equipment) is untouched — its function body should be byte-identical to before this task (diff it against the pre-task version).

Delete the script after it passes.

**Step 5: Commit**

```bash
git add app.js
git commit -m "feat: add dictionary-backed perk picker alongside free-form entry"
```

---

### Task 4: CSS for perk rows

**Files:**
- Modify: `style.css`

**Step 1: Add new rules**

Add a new section near the existing `.equipment-item`/`.equipment-list` rules (around `style.css:1092-1122`), or anywhere else a new component section reasonably fits the file's existing organization:

```css
/* =============================================
   PERKS LIST
   ============================================= */
.perks-item-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.perk-item {
  padding: var(--space-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.perk-item:hover { border-color: var(--border-mid); }

.perk-item-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.perk-item-name { flex: 1; font-weight: 600; color: var(--text-primary); }

.perk-item:hover .delete-item-btn { opacity: 1; }

.perk-detail {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: var(--space-xs);
  line-height: 1.4;
}
```

This is strictly additive — no existing rule is modified. `.delete-item-btn`'s base style (opacity 0 until hover) already exists from the Equipment section; `.perk-item:hover .delete-item-btn` just adds the same hover-reveal behavior for this new row type.

**Step 2: Verify**

```bash
node -e "const css=require('fs').readFileSync('style.css','utf8'); const o=(css.match(/\{/g)||[]).length, c=(css.match(/\}/g)||[]).length; console.log(o, c, o===c ? 'balanced' : 'MISMATCH')"
```
Expected: equal open/close counts, "balanced".

Also grep to confirm every class used in `buildPerksList`'s templates (`perks-item-list`, `perk-item`, `perk-item-row`, `perk-item-name`, `perk-detail`) now has a matching rule, with no typos.

If a browser is available, open the app, go to the Character tab, add a free-form perk and a dictionary perk, confirm both render legibly with the hover-reveal delete button working, and that the dictionary perk's structured detail block (Prerequisite/Effect/Action lines) wraps and reads cleanly at both desktop and a narrow (375px) viewport.

**Step 3: Commit**

```bash
git add style.css
git commit -m "style: add perk row CSS"
```

---

### Task 5: Full regression smoke test (verification only, no code changes)

**Step 1: Real-browser end-to-end pass (if a browser is available)**

1. Open the app, create a character, set Level to 1.
2. Go to the Character tab. Confirm the dictionary dropdown shows only the 3 level-1 perks.
3. Add "Adrenaline Rush" from the dictionary. Confirm it renders with its structured Prerequisite/Effect/Action block.
4. Add a free-form perk ("Lucky", description "reroll one die per session"). Confirm it renders as before (name + plain description, no structured block).
5. Check "Show perks above my level". Confirm the dropdown now lists all 15. Add "Durable" (a level-5, no-action perk). Confirm it renders with Prerequisite/Effect only, no Action line, and doesn't throw/break layout.
6. Uncheck the box, reload the page (full reload, not SPA nav). Confirm: the character, its 3 perks, and the `show_all_perks` checkbox state (should still be checked, since it was true when last set — reload should NOT silently reset it) all persisted via `ttrpg_characters` localStorage.
7. Delete one perk via ✕. Confirm only that one is removed.
8. Add perks (mix of free-form/dictionary) up until the character has exactly 10. Confirm both add rows disappear at 10, and reappear after deleting one (back to 9).

**Step 2: Regression check on unrelated, pre-existing functionality**

Confirm these still work with no regressions (this task only touched `renderTabInfo`'s Perks section, `createCharacter`, bootstrap, and CSS — nothing in Combat/Abilities/Psycasts/Equipment tabs should be affected, but verify directly since `buildTextEntryList` is shared infrastructure):
- Psycasts tab: add/delete a psycast via its existing free-form add row — confirm `buildTextEntryList` (untouched by this plan) still works exactly as before.
- Equipment tab: add/delete an equipment item.
- Abilities tab: roll an Ability check and a Skill check.
- Combat tab: add an official weapon, fire an attack roll, confirm nothing here changed.
- Origin Perk fields (`origin_perk.name`/`.description`, a separate feature from the Perks list, also on the Character tab) still save/load correctly — these are handled by the unrelated `infoField`/`infoTextarea` code path in `renderTabInfo`, not touched by this plan, but verify since they're visually adjacent.

**Step 3: Static checks (always do this regardless of browser availability)**

```bash
node --check app.js
node -e "JSON.parse(require('fs').readFileSync('config/perks.json')); console.log('perks.json OK')"
node -e "JSON.parse(require('fs').readFileSync('config/nng.json')); console.log('nng.json OK')"
node -e "JSON.parse(require('fs').readFileSync('config/weapons.json')); console.log('weapons.json OK')"
```

This is verification only — if a real bug is found, stop and report it in detail rather than attempting a fix.

---

## After all tasks: final review and merge

Per `superpowers:subagent-driven-development`, after Task 5 passes, dispatch one final whole-branch code reviewer covering the complete diff (Tasks 1-4) before using `superpowers:finishing-a-development-branch` to merge.
