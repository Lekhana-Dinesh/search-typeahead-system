# Search Typeahead System

A locally runnable search typeahead/autocomplete assignment project built for system-design evaluation. It demonstrates prefix suggestions, a distributed cache simulation using consistent hashing, trending ranking, and batched database writes without over-engineering the solution.

## Assignment Goal

The project models how a search box can return fast prefix suggestions while still handling changing popularity and reducing database write pressure. It is intentionally student-friendly:

- SQLite is the local source of truth.
- In-memory `Map` objects simulate multiple cache nodes.
- Consistent hashing shows how prefixes map to cache owners.
- Batch writes show how search submissions can be buffered and flushed efficiently.

## Features Implemented

- `GET /suggest?q=<prefix>` with case-insensitive prefix matching
- `GET /suggest?q=<prefix>&ranking=basic|trending`
- `POST /search` with in-memory batch buffering instead of synchronous DB writes
- `GET /cache/debug?prefix=<prefix>` for cache ownership, TTL, and node stats
- `GET /trending` for the UI signals view
- `GET /metrics` for cache and batch-writer metrics
- 100,000-row CSV generation plus fast SQLite ingestion
- React UI with debounce, keyboard navigation, loading, errors, trending mode, and request insights metadata
- Tests for API behavior, consistent hashing, trending boost, batching, and empty-query handling

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite via Node's built-in `node:sqlite`
- Cache simulation: in-memory `Map` objects across logical cache nodes
- Tests: Node test runner

## Folder Structure

```text
search-typeahead-system/
|-- docs/
|-- public/
|-- src/
|   |-- api/
|   |-- db/
|   |-- scripts/
|   |-- services/
|   |-- styles/
|   `-- utils/
|-- tests/
|-- package.json
|-- server.js
`-- vite.config.js
```

## Setup

Windows PowerShell commands:

```powershell
npm install --cache .npm-cache
```

Node.js note:

- Node.js `24+` is required because this project uses the built-in `node:sqlite` module.

## Seed Commands

Fast development seed:

```powershell
npm run seed:small
```

Full assignment seed:

```powershell
npm run seed
```

What these do:

- generate a CSV with `query,count`
- initialize the SQLite schema
- ingest rows in bulk transactions
- print progress every 10,000 rows for the full seed

Generated-data note:

- The SQLite database and generated CSV files are created by `npm run seed` or `npm run seed:small`.
- Do not include `node_modules`, `.npm-cache`, `dist`, `data/*.db`, `data/*.db-*`, or generated CSV files in the final submission ZIP.

## Run Commands

Run API + frontend in development:

```powershell
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

API URL:

```text
http://localhost:3001
```

Run the API only:

```powershell
npm start
```

Build the frontend:

```powershell
npm run build
```

Serve the built frontend through the Express server:

```powershell
npm run preview
```

Preview URL:

```text
http://localhost:3001
```

## Test Commands

```powershell
npm test
```

## Exact Local Run Sequence

```powershell
npm install --cache .npm-cache
npm run seed
npm run dev
```

Then open `http://localhost:5173`.

## Submission Screenshots

The submission screenshots are stored in `docs/screenshots/`:

- `home.png` - home screen with the SearchIQ UI, indexed dataset summary, and evidence section
- `suggestions.png` - prefix suggestions for `iph`, showing matching queries and counts
- `cache-hit.png` - repeated prefix lookup showing cache hit, cache node, latency, and TTL
- `trending.png` - trending ranking mode with score-based ordering
- `batch-metrics.png` - write optimization metrics showing submissions, flushes, writes avoided, and reduction

## Demo Flow

1. Run `npm run seed` and point out the 100,000-row generation and ingestion logs.
2. Start the app with `npm run dev`.
3. Type `iph` and show the first `/suggest` response comes from the database.
4. Type `iph` again and show the source changes to `cache`.
5. Open the Request insights section and explain cache node assignment, cache status, TTL, and latency.
6. Switch to trending mode.
7. Submit `iphone update` a few times and show it rise because `score = allTimeCount + recentCountLastHour * 50`.
8. Point to batch-writer metrics: submissions, pending searches, flushes, writes avoided.
9. Call out that SQLite and cache nodes are local simulations chosen for assignment clarity.

## Design Explanation Note

- The submission is designed to be easy to explain: data storage, cache ownership, trending scoring, and batch-write trade-offs are documented in the main assignment-facing docs.

## Troubleshooting

- If the UI is empty on first load, make sure `npm run seed` completed successfully before `npm run dev`.
- If port `3001` or `5173` is already in use, stop the existing process and rerun `npm run dev`.
- The `ExperimentalWarning` for `node:sqlite` is expected on current Node versions and does not block the app.
- If you want a quicker local reset while iterating, use `npm run seed:small`.

## Marking / Evaluation Mapping

### Basic Implementation

- 100,000-row CSV generation and ingestion are implemented.
- Prefix suggestions are case-insensitive, capped at 10, and sorted by all-time count in basic mode.
- Cache is checked before the database and the response reports `source` and `cacheNode`.
- The UI supports debounce, keyboard navigation, submit-on-Enter, and graceful empty results.

### Trending Searches

- `POST /search` records recent activity in a rolling window.
- `GET /suggest?...&ranking=trending` uses `score = allTimeCount + recentCountLastHour * 50`.
- The UI signals section and tests make the ranking change visible and easy to explain.

### Batch Writes

- Search submissions go into an in-memory aggregation buffer instead of synchronously updating SQLite.
- Flushes happen periodically and can also happen when the configured batch size is reached.
- Metrics expose submissions, pending buffered writes, flush count, writes avoided, and write reduction.

### Cache / Consistent Hashing

- Three logical cache nodes are simulated with `Map` objects.
- Consistent hashing routes the same prefix to the same node.
- TTL-based cache expiry and explicit prefix invalidation are both supported.

### Documentation / Explanation

- `docs/architecture.md` explains flows and trade-offs.
- `docs/api.md` documents every API with examples.
- `docs/performance-report.md` captures seed timings and demo-ready performance notes.

## Assignment-Level Trade-offs

- SQLite is used because it keeps setup simple and fully local.
- Cache nodes are simulated in-memory, not with Redis or real networked services.
- Batch writes are not durable before flush; this is documented as an intentional assignment trade-off.
- Prefix lookup uses a SQL range query, which is fine for 100k local records and easy to explain.
