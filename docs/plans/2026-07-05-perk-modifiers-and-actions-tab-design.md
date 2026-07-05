# Perk Modifiers & Actions Tab Design

## Requirement (user, 2026-07-05)

Perks must be able to (a) adjust calculated stats automatically (e.g. Tough as Nails raising Injury Threshold) and (b) grant actions that surface, together with weapon actions and the rulebook's common actions, in a single new "Actions" tab — the player's it's-my-turn pane.

## Grounding in the real perk list

Only two dictionary perks passively change sheet numbers, and they need different math: Tough as Nails ("Injury Threshold increases by 25% (round up)") and Speed Freak ("Speed increases by 2"). Everything else grants actions/reactions — which the Actions tab covers.

## Design

### Perk modifiers

- Schema: optional `modifiers: [{ target, type: 'add'|'pct', value }]` on perk defs, mirroring attachments' structured `effects`. Targets: `max_hp`, `injury_threshold`, `recovery`, `carrying_capacity`, `speed`, `initiative`.
- Math (dice.js `applyPerkModifiers(character, target, base)`, pure, unit-tested): base + all flat adds, then each pct increase applied with `Math.ceil` (matches "round up").
- Applied in `deriveMaxHP`, `deriveInjuryThreshold`, `deriveRecoveryModifier`, `deriveCarryingCapacity`; the Initiative roll adds `initiative` mods; the Speed chip keeps the editable base and shows `→ effective` beside it when modified (perks never overwrite typed values).
- Character copies: dictionary-add now copies `id` and `modifiers` onto the sheet's perk; `backfillPerkModifiers` (on character open, which import also flows through) fills missing `modifiers` by matching name against the current perk dictionary — nobody re-adds perks.
- Admin perk form gains a Modifiers editor (target dropdown, add/% toggle, value; same row pattern as effects).
- Bundled `config/perks.json` gets the two perks' modifiers; the live canon updates when the GM re-publishes (doubles as the live test).

### Actions tab

- New tab between Combat and Psycasts. Sections:
  1. **Weapon Attacks** — per equipped weapon: name, ammo count, and the same rollable action rows as the Combat tab (`buildActionRow` reused; management chrome — add/remove/attachments — stays on Combat).
  2. **Actions / Quick Actions / Reactions** — perk-granted actions (name, source perk, rules text; informational — the schema has no dice on perk actions), followed by the rulebook's common actions rendered as muted reference cards.
- Common actions are data, not code: new `common_actions` list in `config/nng.json` (from NNGRules: Attack, Hustle, Charge, Dodge, Defensive Stance, Shield Wall, Help, Activate, Ready, Interact, Grapple, Shove; Quick: Take Cover, Tactical Shift, Stand Up; Reaction: Opportunity Attack).
- Freshness: `switchTab` re-renders the Actions tab on entry; ammo changes triggered from either tab re-render both (`refreshWeaponViews` = combat list + actions tab when active).
- View-only mode: the existing post-render disable pass covers the new tab automatically (re-applied after tab-entry re-render).

## Testing

TDD on `applyPerkModifiers` (flat, pct round-up, add-then-pct ordering, no-perks passthrough, per-target isolation). Headless boot for the new tab. Live: GM adds modifiers to the two perks, publishes, checks IT/Speed on a sheet with Tough as Nails / Speed Freak.
