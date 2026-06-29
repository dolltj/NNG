# Weapon & Attachment Config Dictionary Design

## Context

Weapons currently live entirely in character data — free-form `{label, damage, range, bonus, ammo}` entries typed in by the player. The user wants weapons (and their attachments) pulled from a shared config dictionary instead, so a weapon like "Machine Pistol" carries its real set of named Actions (Single-Shot, Three-Round Burst, Full-Auto, Reload), each with its own range/damage/ammo cost, and attachments that modify how the weapon behaves (magazine size, hit bonuses, tag changes, Burst Fire Disadvantage removal).

This only replaces the **Weapons** system (Combat tab). The Equipment tab (slot-based gear list) is untouched.

## 1. Config data — `config/weapons.json` (new file)

Two top-level dictionaries: `weapons[]` and `attachments[]`.

**Weapon action shapes:**
- **Normal action** (Slash, Stab, Throw, Single-Shot): `{id, label, range, damage, damage_type?, ammo_cost?}`. Gets an Attack-roll button (`2d10 + weapon.bonus + resolved hit_bonus`) and a Damage-roll button (raw `damage` dice). Consumes `ammo_cost` from the magazine if present.
- **Burst Fire action** (Three-Round Burst): adds `burst_fire: true, attack_count: N`. A plain click automatically applies Disadvantage and fires `attack_count` separate attack rolls to Roll20 (ammo is still only deducted once, by `ammo_cost`, not once per sub-attack).
- **Area-effect action** (Full-Auto): adds `area_of_effect: N, save_dv: N`. This is **not** a Burst Fire action — it's a single roll like a normal action; `area_of_effect`/`save_dv` are shown as descriptive notes only (the target's save is the GM/other player's roll, not something this sheet automates).
- **Reload action**: `{id: "reload", label: "Reload", is_reload: true}`. No range/damage, no roll sent — clicking it just sets `ammo.current` back to the weapon's resolved magazine size.

**Attachment shape:** `{id, label, category, compatible_weapons: [weapon ids], description, effects: [...], notes?: [...]}`. `effects` is structured and drives the automated v1 effect types:
- `{type: "set_magazine_size", value, weapon?}` — `weapon` scopes the effect when one attachment fits multiple weapons with different results (e.g. Extended Magazine).
- `{type: "add_tag"/"remove_tag", tag}`
- `{type: "action_hit_bonus", action, value}` — adds to a specific action's attack-roll modifier.
- `{type: "action_save_dv_bonus", action, value}` — adds to a specific action's displayed `save_dv`.
- `{type: "remove_burst_disadvantage"}` — cancels the automatic Disadvantage on this weapon's Burst Fire action(s).

`notes` is free text for effects that aren't automated (e.g. "Requires the Interact quick action to engage or disengage").

### Full example data (from the user's provided weapons/attachments)

```json
{
  "weapons": [
    {
      "id": "monodagger",
      "label": "Monodagger",
      "category": "Modern Melee Weapon",
      "tags": ["light", "finesse", "concealable"],
      "description": "A crystal-metallic dagger infused with mechanites that maintain a mono-molecular cutting edge.",
      "magazine_size": null,
      "actions": [
        { "id": "slash", "label": "Slash", "range": 1, "damage": "3d6" },
        { "id": "stab", "label": "Stab", "range": 1, "damage": "2d6", "damage_type": "piercing" },
        { "id": "throw", "label": "Throw", "range": 6, "damage": "2d6" }
      ]
    },
    {
      "id": "machine_pistol",
      "label": "Machine Pistol",
      "category": "Modern Ranged Weapon",
      "tags": ["light", "concealable"],
      "description": "A fully automatic handgun designed primarily for close-quarters combat.",
      "magazine_size": 20,
      "actions": [
        { "id": "single_shot", "label": "Single-Shot", "range": 30, "damage": "2d6", "ammo_cost": 1 },
        { "id": "three_round_burst", "label": "Three-Round Burst", "range": 30, "damage": "2d6", "ammo_cost": 3, "burst_fire": true, "attack_count": 3 },
        { "id": "full_auto", "label": "Full-Auto", "range": 30, "damage": "2d6", "ammo_cost": 10, "area_of_effect": 3, "save_dv": 11 },
        { "id": "reload", "label": "Reload", "is_reload": true }
      ]
    },
    {
      "id": "submachine_gun",
      "label": "Submachine Gun",
      "category": "Modern Ranged Weapon",
      "tags": [],
      "description": "A compact, lightweight, fully automatic weapon designed to be fired from the shoulder or hip.",
      "magazine_size": 30,
      "actions": [
        { "id": "single_shot", "label": "Single-Shot", "range": 50, "damage": "3d6", "ammo_cost": 1 },
        { "id": "three_round_burst", "label": "Three-Round Burst", "range": 50, "damage": "3d6", "ammo_cost": 3, "burst_fire": true, "attack_count": 3 },
        { "id": "full_auto", "label": "Full-Auto", "range": 50, "damage": "3d6", "ammo_cost": 10, "area_of_effect": 3, "save_dv": 13 },
        { "id": "reload", "label": "Reload", "is_reload": true }
      ]
    }
  ],
  "attachments": [
    {
      "id": "extended_magazine",
      "label": "Extended Magazine",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["machine_pistol", "submachine_gun"],
      "description": "Increases magazine capacity so the weapon does not run empty in a single, 6-second burst.",
      "effects": [
        { "type": "set_magazine_size", "weapon": "machine_pistol", "value": 30 },
        { "type": "set_magazine_size", "weapon": "submachine_gun", "value": 50 }
      ]
    },
    {
      "id": "drum_magazine",
      "label": "Drum Magazine",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["machine_pistol", "submachine_gun"],
      "description": "Useful for maximum capacity if the user is stationary or defending a fixed point, despite the added weight.",
      "effects": [
        { "type": "set_magazine_size", "value": 100 },
        { "type": "remove_tag", "tag": "light" },
        { "type": "remove_tag", "tag": "concealable" }
      ]
    },
    {
      "id": "single_point_sling",
      "label": "Single-Point Sling",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["submachine_gun"],
      "description": "A specialized sling that allows the operator to drop the weapon to transition to a sidearm without losing their primary weapon.",
      "effects": [],
      "notes": ["Can drop the weapon for free without losing it."]
    },
    {
      "id": "detachable_shoulder_stock",
      "label": "Detachable Shoulder Stock",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["machine_pistol"],
      "description": "Transforms the weapon into a steady platform. This is the single most important attachment for controlling full-auto muzzle rise.",
      "effects": [
        { "type": "action_save_dv_bonus", "action": "full_auto", "value": 2 },
        { "type": "remove_tag", "tag": "concealable" }
      ],
      "notes": ["Requires the Interact quick action to engage or disengage the shoulder stock."]
    },
    {
      "id": "forward_grip",
      "label": "Forward Grip",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["machine_pistol"],
      "description": "A secondary grip placed under the barrel to allow a two-handed stance, keeping the muzzle downward during sustained fire.",
      "effects": [
        { "type": "add_tag", "tag": "two-handed" },
        { "type": "remove_burst_disadvantage" }
      ]
    },
    {
      "id": "mrds",
      "label": "Micro Red Dot Sight (MRDS)",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["machine_pistol", "submachine_gun"],
      "description": "A lightweight, low-profile optic that allows for rapid target tracking with both eyes open in close-quarters combat.",
      "effects": [
        { "type": "action_hit_bonus", "action": "single_shot", "value": 1 }
      ]
    }
  ]
}
```

`ammo_cost: 10` for Full-Auto is a placeholder (the source rule text didn't specify a number) — easy to adjust directly in the JSON later.

## 2. Character data model

A weapon instance on a character becomes:
```js
{ id: 'weapon_inst_...', weapon_id: 'machine_pistol', bonus: 0, attachments: ['mrds'], ammo: { current: 20 } }
```
`ammo.max` is never stored — it's always recomputed live from the base weapon's `magazine_size` plus any `set_magazine_size` effects from currently-equipped attachments, so attaching/detaching something updates the displayed max immediately. Melee weapons keep `ammo: null`. Existing free-form weapon entries on already-saved characters become orphaned (no matching `weapon_id`) — consistent with this project's established no-migration precedent; the UI should skip/ignore entries whose `weapon_id` doesn't resolve rather than crash.

## 3. Resolving a weapon instance

A pure function `resolveWeapon(weaponInstance)` merges the base weapon definition with all equipped attachments' effects:
- Adjusted `tags` (add/remove applied in attachment order)
- Adjusted `magazine_size` (last `set_magazine_size` wins, scoped or unscoped)
- Per-action `hit_bonus` and `save_dv` adjustments
- `burst_disadvantage_removed: true/false`
- Collected `notes[]` from all attachments

This is the single place every automated effect type lives, fully testable with plain Node scripts (no DOM).

## 4. Rolling

Per action, the attack modifier = `weapon.bonus + resolvedAction.hit_bonus`.

- **Normal action:** plain click → existing `buildTestFormula`/direct-send behavior (unchanged). Shift-click → existing Advantage modal.
- **Burst Fire action:** plain click → if not cancelled by an attachment, automatically sends `attack_count` separate rolls, each via `buildAdvantageFormula(2, modifier, 0, 1)` (net Disadvantage 1), labeled e.g. "Three-Round Burst (1/3)". Shift-click → opens the same Advantage modal, pre-seeded with Disadvantage = 1, so the player can stack more circumstances on top; confirming sends `attack_count` rolls at whatever net the player settles on.
- **Area-effect action (Full-Auto):** behaves like a normal action (single roll, no auto-disadvantage); `area_of_effect`/`save_dv` are shown as text only.
- **Reload:** no roll. Sets `ammo.current` to the resolved magazine size and saves.
- **Damage roll:** unchanged — single roll of the action's `damage`, regardless of burst/AoE. Multi-hit damage adjudication is left to the GM.
- Ammo is deducted once per click by the action's `ammo_cost` (not per sub-attack within a burst), clamped at 0; firing with insufficient ammo is blocked (button disabled or a no-op) rather than going negative.

## 5. UI (Combat tab "Weapons" section)

Replaces the flat one-row-per-weapon table with a card per equipped weapon (visual language matching the existing resource/ability cards):
- **Header:** label, tags, ammo current/max (if any), the editable flat Bonus input, delete button.
- **Action rows:** one per resolved action — range, damage, any AoE/DV notes — with an Attack 🎲 button and Damage ⚔ button (Reload gets a single refill button instead).
- **Attachments area:** lists equipped attachments with remove buttons, plus an "+ Add Attachment" picker filtered to attachments whose `compatible_weapons` includes this weapon and that aren't already equipped.

"+ Add Weapon" becomes a `<select>` populated from `config/weapons.json` instead of the current free-text name/damage/range/ammo fields.
