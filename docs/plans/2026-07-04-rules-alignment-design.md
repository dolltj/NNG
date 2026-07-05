# Rules Alignment: Injury Threshold, Recovery, Defense Rolls, Rests

## Source

`NNGRules.txt` (added to repo 2026-07-04). Scope approved by user: items 1, 2, 3, 5 from the gap analysis. Deferred: armor durability, attack ability-modifiers, conditions tracker, Major Injury rename/roll, action-economy tracker, Morale/Evasion (rules incomplete).

## Changes

1. **Injury Threshold** (rules line 440): `10 + STR + FOR`. The sheet's `deriveInjuryThreshold` used `10 + FOR`. Fixed in dice.js, unit-tested.

2. **Recovery is a roll, not a stat** (line 518): `deriveRecoveryRate` (`10 + FOR + WIL`, wrong) is replaced by `deriveRecoveryModifier` (`FOR + WIL`); the Abilities-tab chip shows `1d10 + N`. The actual rolling happens in the Short Rest button.

3. **Defense Rolls** (lines 127–133): a "Defense Rolls" chip in the Combat tab's stats row with Evade (2d10+AGI), Block (2d10+FOR), Parry (2d10+WIL) buttons — same send-to-Roll20 pattern as ability tests, shift-click opens the advantage modal. Block/Parry requirements (shield / melee weapon) are stated in tooltips, not enforced — the sheet doesn't track equipped-shield state (armor durability is deferred).

4. **Rest buttons** (lines 511–546): in the Abilities tab's Recovery row.
   - **Short Rest**: requires ≥1 HP; rolls 1d10 locally (`Math.random` — this roll mutates sheet state, so it can't be delegated to Roll20, whose bridge rolls independently), heals `die + FOR + WIL` capped at max HP, toast shows the breakdown, reminds to remove one Minor Injury if any exist (choosing which one is the player's call — not automated).
   - **Long Rest**: requires ≥1 HP; confirm → full HP, clears all Minor Injuries (the `injuries` list; Critical/Major injuries and Fatigue untouched — rules for those aren't sheet-mechanical yet), toast summary.
   - Both re-render, autosave through the normal path, and are inert in view-only mode (the disable pass covers them).

## Testing

TDD on the two dice.js formulas; rest/defense wiring verified by headless boot + live click-through.
