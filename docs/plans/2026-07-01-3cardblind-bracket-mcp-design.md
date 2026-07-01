# Design: 3CardBlind Bracket MCP Server

**Date:** 2026-07-01  
**Status:** Approved

## Overview

A standalone Node.js MCP server that scrapes match history from 3cardblind.com using Playwright and manages a personal round-robin bracket stored in a local JSON file. The user interacts with it through a Claude conversation window.

## Architecture

- **Runtime:** Node.js
- **Scraping:** Playwright (headless Chromium) — required because the site is JS-rendered
- **Storage:** Local `bracket.json` flat file
- **Interface:** MCP server registered in Claude Code config (`~/.claude/settings.json`)
- **Repo:** Separate standalone repo (not part of Character Sheet NNG)

## MCP Tools

| Tool | Inputs | Purpose |
|---|---|---|
| `lookup_matchup` | `deck1_cards: string[]`, `deck2_cards: string[]` | Scrapes 3cardblind.com match history for games between the two 3-card decks, returns win/loss record |
| `add_to_bracket` | `deck1_cards`, `deck2_cards`, `deck1_wins`, `deck2_wins` | Saves a matchup result into bracket.json, creating deck entries if new |
| `set_deck_alias` | `cards: string[]`, `alias: string` | Assigns a shorthand name to a deck identified by its 3 card names |
| `get_standings` | _(none)_ | Returns full round-robin table: wins, losses, win % per deck |
| `list_decks` | _(none)_ | Lists all decks in the bracket with their cards and current alias |

## Data Shape (`bracket.json`)

```json
{
  "decks": {
    "card1|card2|card3": {
      "alias": "Aggro Red",
      "cards": ["Card1", "Card2", "Card3"]
    }
  },
  "matchups": [
    {
      "deck1": "card1|card2|card3",
      "deck2": "card4|card5|card6",
      "deck1_wins": 2,
      "deck2_wins": 1
    }
  ]
}
```

Deck IDs are the 3 card names sorted alphabetically and joined with `|`, ensuring the same deck resolves to the same ID regardless of input order.

## Scraping Strategy

1. Navigate to `https://www.3cardblind.com/statistics/match-history` with Playwright
2. Wait for the match table to render
3. Filter/search for rows containing all 3 cards from each deck
4. Aggregate win/loss counts across matching rows
5. Return the result to the caller

## Error Handling

- No match found on site → return empty result, user decides whether to skip or manually enter
- Site unreachable → surface clear error message, do not corrupt bracket.json
- Ambiguous card name → return candidate matches for user to confirm

## File Structure

```
3cardblind-bracket/
├── src/
│   ├── server.js       # MCP server entry point, tool registration
│   ├── scraper.js      # Playwright scraping logic
│   └── bracket.js      # bracket.json read/write and standings math
├── bracket.json        # persisted bracket data (gitignored)
├── package.json
└── README.md
```
