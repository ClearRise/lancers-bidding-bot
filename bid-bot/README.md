# lancers-bid-bot

Playwright + Node.js scaffold for building a lancers.jp bidding bot.

## Flow

1. Load config from `.env`
2. Receive task notifications via `POST /notify` and enqueue to `bid-queue.json`
3. Open browser with existing login session (`storage-state.json`)
4. Dequeue task links in FIFO order
5. Open each task detail page, scrape required detail fields, and submit proposal (or dry-run log only)
6. Persist bid history and queue state

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
- Set `ENABLE_MONITOR=true` to run queue consumer in same process.
