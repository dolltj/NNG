# Hosting & Roll20 Integration Design

## Context

The Character Vault sheet (`index.html`, `app.js`, `dice.js`, `roll20-bridge.js`, `style.css`) is a pure static, client-only app. Character data lives in each browser's `localStorage`; there is no backend. The project currently has no git repository.

Goal: host this for a small remote group, and make the in-sheet roll buttons actually land rolls in Roll20.

## Hosting

- Plain static hosting — no backend, no build step.
- `git init` the project, push to a new GitHub repo, enable GitHub Pages (deploy from branch).
- Each player keeps their own character in their own browser's `localStorage`, same as today. Existing Export/Import JSON buttons cover backups / moving devices.
- Pushing to the deployed branch auto-redeploys via GitHub Pages.

## Roll20 integration

Roll20 has no inbound API for external sites to post into chat. The only live bridge is the **Beyond20** browser extension, which listens for a DOM `CustomEvent` on the page.

Research findings (verified against Beyond20's own API docs, not assumed):

- The current `roll20-bridge.js` dispatches the wrong event entirely: `beyond20-roll` / `Beyond20_Roll`. Beyond20 actually listens for **`Beyond20_SendMessage`**, with `detail` being a one-element array containing a request object. This bridge currently does nothing even with Beyond20 installed — it silently falls through to the clipboard fallback.
- Detection via `Beyond20_Loaded` (already implemented) is correct and unchanged.
- Beyond20 supports many structured roll `type`s (`attack`, `skill`, `saving-throw`, etc.) modeled on D&D Beyond's own data, each requiring its own field set. For a homebrew sheet, replicating these is high effort for little payoff. Decision: use **`type: "custom"`** uniformly for every roll category (attack, damage, skill, save, initiative, hit dice) — one code path, just a formula + label.
- `action: "roll"` makes **Roll20 roll the dice itself** from the formula — it does not echo a pre-computed number from the sheet. This means the number shown in the sheet's own roll popup and the number that lands in Roll20 chat are two independent rolls of the same formula. This matches how D&D Beyond + Beyond20 already behaves for its whole userbase, and was confirmed acceptable. The alternative (`action: "rendered-roll"`, which forces an exact pre-rolled number into chat) requires building Beyond20's internal HTML roll-render format — fragile and undocumented for third parties — and was rejected.
- Beyond20 requires the page's domain to be on an allowlist. Each player who wants live auto-send installs Beyond20 and adds the GitHub Pages domain under the extension's Settings → Advanced → Custom Sites. Anyone who skips this still gets the existing clipboard fallback (already correctly implemented, unchanged).

### New `Beyond20_SendMessage` request shape

```js
{
  action: 'roll',
  type: 'custom',
  character: { name: rollData.characterName, source: 'Character Vault', type: 'Custom', url: location.href },
  roll: rollData.formula,
  name: rollData.label,
  description: rollData.damageType ? `Damage type: ${rollData.damageType}` : undefined
}
```

## Testing

- A manual test page/console snippet that listens for `Beyond20_SendMessage` and logs the dispatched payload, to confirm the event contract before testing against a live Roll20 game.
- Real end-to-end confirmation (click roll button → see it in actual Roll20 chat) is a manual check once Beyond20 is installed and the domain is allowlisted — not automatable.
