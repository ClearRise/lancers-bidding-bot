# lancers-bid-bot

Playwright + Node.js scaffold for building a lancers.jp bidding bot.

## Flow

1. Load config from `.env`
2. Open browser with existing login session (`storage-state.json`)
3. Scrape candidate tasks from dashboard/search page
4. Filter by strategy rules (budget/seen/history)
5. Open each task detail and submit proposal (or dry-run log only)
6. Persist bid history

## Setup

```bash
npm install
cp .env.example .env
```

Save logged-in session state first:

```bash
npm run session:save
```

Run bot:

```bash
npm start
```

## Notes

- Keep `DRY_RUN=true` until selectors and form fields are verified.
- `src/lancers/selectors.ts` is intentionally centralized for easy maintenance.
