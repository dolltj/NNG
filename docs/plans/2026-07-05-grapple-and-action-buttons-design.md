# Grapple Section & Action Buttons Design

## Requirement (user, 2026-07-05)

Complete grapple rules provided (supersede the NNGRules.txt draft: Pin may also knock Prone, Toss treats dead targets as objects, Choke is a Fortitude Save DV 13). Every action card in the Actions tab gets buttons: roll to Roll20 when dice are involved, otherwise send a notification to Roll20.

## Design

- **Action roll schema** (`config/nng.json` `common_actions` entries, optional): `rolls: [{ label, kind: 'test'|'dice', stat?, formula? }]`. `test` = 2d10 + a core stat (shift-click opens the advantage modal); `stat: 'best_str_agi'` uses the higher of STR/AGI (the rules let the roller choose, and higher is strictly better — the tooltip names the choice). `dice` = a fixed formula (e.g. Choke's 2d6). Cards without `rolls` get an Announce button.
- **Announcements** (`Roll20Bridge.sendAnnouncement`): Beyond20 path sends a custom "roll" with formula `0` (Beyond20's API only speaks rolls; a 0 reads as a pure notification); clipboard fallback copies `/em Name — uses X`, which is a true no-dice emote. Perk-action cards announce too.
- **Grappling section**: new `Grapple` group rendered after Reactions. Entries: Initiate Grapple, Contest Control (Grapple Test each); Choke (Grapple Test + 2d6); Drag, Human Shield, Pin (Grapple Test — the rules require winning one for every grapple action); Toss (Grapple Test + STR Attack + 2d6). The old one-line Grapple card leaves the Actions group (Shove stays). Rules text on each card is the user-provided wording, condensed.

## Testing

`node --test` (config validity is exercised by JSON require), headless boot, live click-through of a roll button, a grapple test, and an announcement in both Beyond20 and clipboard modes.
