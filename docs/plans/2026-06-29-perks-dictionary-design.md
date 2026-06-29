# Perks Dictionary Design

## Context

Perks are currently a free-form `{name, description}` list on the Character tab (`char.perks`, capped at 10, rendered/edited via the shared `buildTextEntryList` helper also used by Psycasts/Injuries/Critical Injuries/Equipment). This adds a dictionary of ~15 named perks (provided by the user) that can be picked instead of hand-typing one, while leaving free-form entry exactly as it is today.

## 1. Data — `config/perks.json`

A new dictionary file, fetched at bootstrap the same way `config/weapons.json` already is. Each entry:

```json
{
  "id": "adrenaline_rush",
  "name": "Adrenaline Rush",
  "level": 1,
  "prerequisite": "Level 1",
  "effect": "You gain the Adrenaline Rush Action",
  "action": { "type": "Action", "label": "Adrenaline Rush", "text": "You can place yourself at the top of the Initiative order." }
}
```

`action` is `null` for perks with no granted Action/Reaction/Quick Action. `action.type` is one of `"Action"`, `"Reaction"`, `"Quick Action"`. These are descriptive only — no dice-rolling automation tied to a perk's granted action, matching how weapon-attachment Notes are narrative-only.

All 15 perks the user supplied are transcribed into this file (full list below), with two transcription typos normalized: "Effect.:" → "Effect." (Through the Gaps), and "Prerequisite, Level 2" → "Prerequisite. Level 2" (Tactician).

| id | name | level | action type |
|---|---|---|---|
| adrenaline_rush | Adrenaline Rush | 1 | Action |
| battlefield_medic | Battlefield Medic | 1 | Action (requires Med Kit) |
| tough_as_nails | Tough as Nails | 1 | — |
| interceptor | Interceptor | 2 | Reaction |
| speed_freak | Speed Freak | 2 | — |
| tactician | Tactician | 2 | Reaction |
| inspiring_leader | Inspiring Leader | 3 | Quick Action |
| rotation | Rotation | 3 | Action |
| through_the_gaps | Through the Gaps | 3 | — |
| pack_tactics | Pack Tactics | 4 | — |
| shield_expert | Shield Expert | 4 | — |
| underdog | Underdog | 4 | — |
| durable | Durable | 5 | — |
| force_multiplier | Force Multiplier | 5 | Quick Action |
| nimble | Nimble | 5 | — |

## 2. Character data & level filter

A perk entry in `char.perks` gets two optional new fields, leaving the existing shape backward compatible:

```js
{ name, description,            // unchanged — always present; description stays '' for dictionary picks
  prerequisite, effect, action } // only present when added from the dictionary
```

Free-form "+ Add Perk" entries never populate `prerequisite`/`effect`/`action` — they render exactly as today.

A new boolean on the character, `char.show_all_perks` (default `false`), drives a "Show perks above my level" toggle next to the dictionary picker. When off, the dropdown only lists perks where `perk.level <= char.level`. Pure display filter on the dropdown — no enforcement elsewhere (light-touch validation, consistent with the rest of this app).

The existing 10-perk cap applies to the combined total of free-form + dictionary perks.

## 3. UI — rendering & the picker

The Perks section gets its own renderer, `buildPerksList`, separate from `buildTextEntryList` (which stays untouched for its other 4 call sites — Psycasts/Injuries/Critical Injuries/Equipment — no risk of regression there).

Each perk row:
- Free-form entries render exactly as today: name + description text.
- Dictionary entries render name, then a structured block: *Prerequisite: Level N · Effect: ... · Action/Reaction/Quick Action: Label — text*.
- Both kinds share the same delete (✕) button.

Below the list, two add mechanisms side by side:
- The existing free-form Name + Description + "+ Add Perk" inputs, unchanged.
- A new "Show perks above my level" checkbox, a dropdown of dictionary perks (filtered by level unless checked, labeled `"Lv N — Perk Name"`), and a "+ Add from Dictionary" button that appends the full structured entry immediately on click (mirrors the Combat tab's Add Weapon dropdown+button pattern).

Both add mechanisms respect the existing 10-perk cap and disappear once it's hit, same as today.
