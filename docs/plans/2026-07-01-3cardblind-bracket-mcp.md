# 3CardBlind Bracket MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone Node.js MCP server that scrapes match history from 3cardblind.com using Playwright and manages a personal round-robin bracket stored in bracket.json, accessible via Claude conversation.

**Architecture:** MCP server exposes 5 tools (lookup_matchup, add_to_bracket, set_deck_alias, get_standings, list_decks). Decks are identified by a sorted card-name key (`card1|card2|card3`). Playwright handles JS-rendered scraping; bracket.json is read/written on every tool call.

**Tech Stack:** Node.js (ESM), @modelcontextprotocol/sdk, playwright, node:test (built-in test runner)

---

## Setup

All files go in a new repo — **not** the Character Sheet NNG repo.

Create the repo directory first:
```
mkdir d:\Code\3cardblind-bracket
cd d:\Code\3cardblind-bracket
git init
```

---

### Task 1: Scaffold the repo

**Files:**
- Create: `package.json`
- Create: `src/bracket.js`
- Create: `src/scraper.js`
- Create: `src/server.js`
- Create: `tests/bracket.test.js`
- Create: `.gitignore`

**Step 1: Init npm with ESM**

```bash
npm init -y
```

Then open `package.json` and add `"type": "module"` and update the main field:

```json
{
  "name": "3cardblind-bracket",
  "version": "1.0.0",
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test tests/bracket.test.js"
  }
}
```

**Step 2: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk playwright
npx playwright install chromium
```

**Step 3: Create .gitignore**

```
node_modules/
bracket.json
```

**Step 4: Create empty source files**

```bash
mkdir src tests
```

Create `src/bracket.js`, `src/scraper.js`, `src/server.js`, and `tests/bracket.test.js` as empty files.

**Step 5: Initial commit**

```bash
git add package.json package-lock.json .gitignore src/ tests/
git commit -m "chore: scaffold 3cardblind bracket MCP server"
```

---

### Task 2: bracket.js — deck ID generation

**Files:**
- Modify: `src/bracket.js`
- Modify: `tests/bracket.test.js`

The deck ID is 3 card names sorted alphabetically, lowercased, joined with `|`. This ensures the same deck resolves to the same key regardless of input order.

**Step 1: Write the failing test**

```js
// tests/bracket.test.js
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { deckId } from '../src/bracket.js';

test('deckId sorts cards and joins with pipe', () => {
  assert.equal(deckId(['Zap', 'Arrow', 'Moon']), 'arrow|moon|zap');
});

test('deckId is order-independent', () => {
  assert.equal(
    deckId(['Moon', 'Arrow', 'Zap']),
    deckId(['Zap', 'Moon', 'Arrow'])
  );
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — `deckId is not a function`

**Step 3: Write minimal implementation**

```js
// src/bracket.js
export function deckId(cards) {
  return cards.map(c => c.toLowerCase()).sort().join('|');
}
```

**Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/bracket.js tests/bracket.test.js
git commit -m "feat: add deckId function with tests"
```

---

### Task 3: bracket.js — JSON load/save

**Files:**
- Modify: `src/bracket.js`
- Modify: `tests/bracket.test.js`

**Step 1: Write the failing tests**

```js
// add to tests/bracket.test.js
import { loadBracket, saveBracket } from '../src/bracket.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('loadBracket returns empty structure if file missing', () => {
  const result = loadBracket('/nonexistent/path/bracket.json');
  assert.deepEqual(result, { decks: {}, matchups: [] });
});

test('saveBracket then loadBracket round-trips data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bracket-test-'));
  const path = join(dir, 'bracket.json');
  const data = { decks: { 'a|b|c': { alias: 'Test', cards: ['A', 'B', 'C'] } }, matchups: [] };
  saveBracket(path, data);
  const loaded = loadBracket(path);
  assert.deepEqual(loaded, data);
  rmSync(dir, { recursive: true });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — `loadBracket is not a function`

**Step 3: Write minimal implementation**

```js
// add to src/bracket.js
import { readFileSync, writeFileSync } from 'node:fs';

const EMPTY = () => ({ decks: {}, matchups: [] });

export function loadBracket(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return EMPTY();
  }
}

export function saveBracket(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}
```

**Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add src/bracket.js tests/bracket.test.js
git commit -m "feat: add bracket JSON load/save with tests"
```

---

### Task 4: bracket.js — add matchup

**Files:**
- Modify: `src/bracket.js`
- Modify: `tests/bracket.test.js`

**Step 1: Write the failing test**

```js
// add to tests/bracket.test.js
import { addMatchup } from '../src/bracket.js';

test('addMatchup inserts new matchup and deck entries', () => {
  const bracket = { decks: {}, matchups: [] };
  addMatchup(bracket, ['A', 'B', 'C'], ['D', 'E', 'F'], 2, 1);
  assert.equal(bracket.matchups.length, 1);
  assert.equal(bracket.matchups[0].deck1_wins, 2);
  assert.equal(bracket.matchups[0].deck2_wins, 1);
  assert.ok(bracket.decks['a|b|c']);
  assert.ok(bracket.decks['d|e|f']);
});

test('addMatchup updates existing matchup', () => {
  const bracket = { decks: {}, matchups: [] };
  addMatchup(bracket, ['A', 'B', 'C'], ['D', 'E', 'F'], 2, 1);
  addMatchup(bracket, ['A', 'B', 'C'], ['D', 'E', 'F'], 1, 2);
  assert.equal(bracket.matchups.length, 1);
  assert.equal(bracket.matchups[0].deck1_wins, 1);
  assert.equal(bracket.matchups[0].deck2_wins, 2);
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — `addMatchup is not a function`

**Step 3: Write minimal implementation**

```js
// add to src/bracket.js
export function addMatchup(bracket, deck1Cards, deck2Cards, deck1Wins, deck2Wins) {
  const id1 = deckId(deck1Cards);
  const id2 = deckId(deck2Cards);

  if (!bracket.decks[id1]) bracket.decks[id1] = { alias: null, cards: deck1Cards };
  if (!bracket.decks[id2]) bracket.decks[id2] = { alias: null, cards: deck2Cards };

  const existing = bracket.matchups.find(
    m => (m.deck1 === id1 && m.deck2 === id2) || (m.deck1 === id2 && m.deck2 === id1)
  );

  if (existing) {
    if (existing.deck1 === id1) {
      existing.deck1_wins = deck1Wins;
      existing.deck2_wins = deck2Wins;
    } else {
      existing.deck1_wins = deck2Wins;
      existing.deck2_wins = deck1Wins;
    }
  } else {
    bracket.matchups.push({ deck1: id1, deck2: id2, deck1_wins: deck1Wins, deck2_wins: deck2Wins });
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add src/bracket.js tests/bracket.test.js
git commit -m "feat: add matchup insertion and update with tests"
```

---

### Task 5: bracket.js — set alias + get standings

**Files:**
- Modify: `src/bracket.js`
- Modify: `tests/bracket.test.js`

**Step 1: Write the failing tests**

```js
// add to tests/bracket.test.js
import { setAlias, getStandings } from '../src/bracket.js';

test('setAlias assigns shorthand name to deck', () => {
  const bracket = { decks: { 'a|b|c': { alias: null, cards: ['A','B','C'] } }, matchups: [] };
  setAlias(bracket, ['A', 'B', 'C'], 'Aggro Red');
  assert.equal(bracket.decks['a|b|c'].alias, 'Aggro Red');
});

test('getStandings returns wins losses and win pct', () => {
  const bracket = { decks: {}, matchups: [] };
  addMatchup(bracket, ['A','B','C'], ['D','E','F'], 2, 0);
  addMatchup(bracket, ['A','B','C'], ['G','H','I'], 0, 2);
  const standings = getStandings(bracket);
  const abc = standings.find(s => s.id === 'a|b|c');
  assert.equal(abc.wins, 1);
  assert.equal(abc.losses, 1);
  assert.equal(abc.winPct, '50.0%');
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL

**Step 3: Write minimal implementation**

```js
// add to src/bracket.js
export function setAlias(bracket, cards, alias) {
  const id = deckId(cards);
  if (!bracket.decks[id]) bracket.decks[id] = { alias: null, cards };
  bracket.decks[id].alias = alias;
}

export function getStandings(bracket) {
  const record = {};
  for (const id of Object.keys(bracket.decks)) {
    record[id] = { wins: 0, losses: 0 };
  }
  for (const m of bracket.matchups) {
    if (!record[m.deck1]) record[m.deck1] = { wins: 0, losses: 0 };
    if (!record[m.deck2]) record[m.deck2] = { wins: 0, losses: 0 };
    if (m.deck1_wins > m.deck2_wins) {
      record[m.deck1].wins++;
      record[m.deck2].losses++;
    } else if (m.deck2_wins > m.deck1_wins) {
      record[m.deck2].wins++;
      record[m.deck1].losses++;
    }
  }
  return Object.entries(record).map(([id, rec]) => {
    const total = rec.wins + rec.losses;
    const deck = bracket.decks[id];
    return {
      id,
      alias: deck?.alias ?? null,
      cards: deck?.cards ?? [],
      wins: rec.wins,
      losses: rec.losses,
      winPct: total === 0 ? 'N/A' : `${((rec.wins / total) * 100).toFixed(1)}%`,
    };
  }).sort((a, b) => b.wins - a.wins);
}
```

**Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/bracket.js tests/bracket.test.js
git commit -m "feat: add setAlias and getStandings with tests"
```

---

### Task 6: scraper.js — load match history page

**Files:**
- Modify: `src/scraper.js`

No unit test here — this requires a live browser. Manual smoke test at end.

**Step 1: Write the scraper skeleton**

```js
// src/scraper.js
import { chromium } from 'playwright';

const MATCH_HISTORY_URL = 'https://www.3cardblind.com/statistics/match-history';

export async function fetchMatchHistory() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(MATCH_HISTORY_URL, { waitUntil: 'networkidle' });

  // TODO: replace selector with actual table selector from the site
  // Run `page.content()` and inspect to find the right selectors
  const html = await page.content();

  await browser.close();
  return html;
}
```

**Step 2: Manual smoke test**

Create a temp file `scratch.js`:
```js
import { fetchMatchHistory } from './src/scraper.js';
const html = await fetchMatchHistory();
console.log(html.slice(0, 2000)); // inspect what the page returns
```

Run it:
```bash
node scratch.js
```

Look for the match table in the output. Identify:
- The CSS selector for the table or row container
- How deck/card names appear in each row
- How win/loss is indicated

**Step 3: Update the selector constants at top of scraper.js once identified**

```js
// Update with actual values found in Step 2
const ROW_SELECTOR = '.match-row'; // <-- replace with real selector
```

**Step 4: Commit scaffold**

```bash
rm scratch.js
git add src/scraper.js
git commit -m "feat: add scraper skeleton with Playwright"
```

---

### Task 7: scraper.js — parse matchups for two decks

**Files:**
- Modify: `src/scraper.js`

**Step 1: Add the lookup function**

After inspecting the page HTML in Task 6, implement `lookupMatchup`. The exact parsing depends on the DOM — adapt the selectors:

```js
// add to src/scraper.js
import { deckId } from './bracket.js';

export async function lookupMatchup(deck1Cards, deck2Cards) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(MATCH_HISTORY_URL, { waitUntil: 'networkidle' });

  // Wait for rows to appear
  await page.waitForSelector(ROW_SELECTOR, { timeout: 10000 });

  const rows = await page.$$(ROW_SELECTOR);
  const id1 = deckId(deck1Cards);
  const id2 = deckId(deck2Cards);

  let deck1Wins = 0;
  let deck2Wins = 0;

  for (const row of rows) {
    // Adapt these selectors based on your HTML inspection
    const winnerText = await row.$eval('.winner-cards', el => el.textContent.trim().toLowerCase()).catch(() => '');
    const loserText  = await row.$eval('.loser-cards',  el => el.textContent.trim().toLowerCase()).catch(() => '');

    // Parse card names from the row text (site-specific — adjust as needed)
    const winnerCards = winnerText.split(',').map(s => s.trim());
    const loserCards  = loserText.split(',').map(s => s.trim());

    const winnerId = deckId(winnerCards);
    const loserId  = deckId(loserCards);

    if (winnerId === id1 && loserId === id2) deck1Wins++;
    else if (winnerId === id2 && loserId === id1) deck2Wins++;
  }

  await browser.close();
  return { deck1Wins, deck2Wins, found: deck1Wins + deck2Wins > 0 };
}
```

> **Note:** The selectors (`.winner-cards`, `.loser-cards`) are placeholders. Replace them after inspecting the actual HTML in Task 6 Step 2.

**Step 2: Manual smoke test**

Create `scratch.js`:
```js
import { lookupMatchup } from './src/scraper.js';
const result = await lookupMatchup(['CardA', 'CardB', 'CardC'], ['CardD', 'CardE', 'CardF']);
console.log(result);
```

Run and verify it returns a result object (even `{ deck1Wins: 0, deck2Wins: 0, found: false }` means the scraper ran successfully).

**Step 3: Commit**

```bash
rm scratch.js
git add src/scraper.js
git commit -m "feat: add lookupMatchup scraper with Playwright"
```

---

### Task 8: server.js — MCP server with list_decks and set_deck_alias

**Files:**
- Modify: `src/server.js`

**Step 1: Write the MCP server skeleton**

```js
// src/server.js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { resolve } from 'node:path';
import { loadBracket, saveBracket, deckId, setAlias, getStandings, addMatchup } from './bracket.js';
import { lookupMatchup } from './scraper.js';

const BRACKET_PATH = resolve(process.cwd(), 'bracket.json');

const server = new Server(
  { name: '3cardblind-bracket', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_decks',
      description: 'List all decks in the bracket with their cards and alias',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'set_deck_alias',
      description: 'Assign a shorthand name to a deck identified by its 3 card names',
      inputSchema: {
        type: 'object',
        properties: {
          cards: { type: 'array', items: { type: 'string' }, description: '3 card names' },
          alias: { type: 'string', description: 'Shorthand name' },
        },
        required: ['cards', 'alias'],
      },
    },
    {
      name: 'get_standings',
      description: 'Get the current round-robin standings',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'add_to_bracket',
      description: 'Add or update a matchup result in the bracket',
      inputSchema: {
        type: 'object',
        properties: {
          deck1_cards: { type: 'array', items: { type: 'string' } },
          deck2_cards: { type: 'array', items: { type: 'string' } },
          deck1_wins: { type: 'number' },
          deck2_wins: { type: 'number' },
        },
        required: ['deck1_cards', 'deck2_cards', 'deck1_wins', 'deck2_wins'],
      },
    },
    {
      name: 'lookup_matchup',
      description: 'Scrape 3cardblind.com for match history between two 3-card decks',
      inputSchema: {
        type: 'object',
        properties: {
          deck1_cards: { type: 'array', items: { type: 'string' } },
          deck2_cards: { type: 'array', items: { type: 'string' } },
        },
        required: ['deck1_cards', 'deck2_cards'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const bracket = loadBracket(BRACKET_PATH);

  switch (name) {
    case 'list_decks': {
      const decks = Object.entries(bracket.decks).map(([id, d]) => ({
        id, alias: d.alias, cards: d.cards,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(decks, null, 2) }] };
    }

    case 'set_deck_alias': {
      setAlias(bracket, args.cards, args.alias);
      saveBracket(BRACKET_PATH, bracket);
      return { content: [{ type: 'text', text: `Alias "${args.alias}" set.` }] };
    }

    case 'get_standings': {
      const standings = getStandings(bracket);
      return { content: [{ type: 'text', text: JSON.stringify(standings, null, 2) }] };
    }

    case 'add_to_bracket': {
      addMatchup(bracket, args.deck1_cards, args.deck2_cards, args.deck1_wins, args.deck2_wins);
      saveBracket(BRACKET_PATH, bracket);
      return { content: [{ type: 'text', text: 'Matchup saved.' }] };
    }

    case 'lookup_matchup': {
      const result = await lookupMatchup(args.deck1_cards, args.deck2_cards);
      if (!result.found) {
        return { content: [{ type: 'text', text: 'No matches found between those decks on 3cardblind.com.' }] };
      }
      return {
        content: [{
          type: 'text',
          text: `Found: ${result.deck1Wins} wins for deck1, ${result.deck2Wins} wins for deck2.\nUse add_to_bracket to save this result.`,
        }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 2: Run to verify it starts without error**

```bash
node src/server.js
```
Expected: No crash, process hangs waiting for MCP input (that's correct — Ctrl+C to stop).

**Step 3: Commit**

```bash
git add src/server.js
git commit -m "feat: add MCP server with all 5 tools"
```

---

### Task 9: Register MCP server in Claude Code

**Files:**
- Modify: `~/.claude/settings.json` (user-level Claude Code settings)

**Step 1: Find your settings file**

```bash
cat ~/.claude/settings.json
```

**Step 2: Add the MCP server entry**

Add under the `"mcpServers"` key (create it if missing):

```json
{
  "mcpServers": {
    "3cardblind-bracket": {
      "command": "node",
      "args": ["d:\\Code\\3cardblind-bracket\\src\\server.js"]
    }
  }
}
```

> Use the absolute path to `server.js` on your machine.

**Step 3: Restart Claude Code**

Close and reopen the Claude Code window. The MCP server connects on startup.

**Step 4: Verify tools are available**

In a new Claude conversation, type:
> "What MCP tools do you have available?"

You should see `list_decks`, `set_deck_alias`, `get_standings`, `add_to_bracket`, `lookup_matchup` listed.

---

### Task 10: End-to-end smoke test

In a Claude conversation, run through this sequence:

1. "Look up the matchup between [Card1, Card2, Card3] and [Card4, Card5, Card6]"
   - Claude should call `lookup_matchup` and return a win/loss count (or "no matches found")

2. "Add that to the bracket as 2 wins for deck1, 1 win for deck2"
   - Claude should call `add_to_bracket`

3. "Name the first deck 'Aggro Red'"
   - Claude should call `set_deck_alias`

4. "Show me the standings"
   - Claude should call `get_standings` and display a ranked table

5. "What decks are in my bracket?"
   - Claude should call `list_decks`

If all 5 steps work, the implementation is complete.

**Final commit:**

```bash
git add .
git commit -m "chore: add README with usage instructions"
```

(Write a brief README covering: install, MCP registration, and the 5 tools.)
