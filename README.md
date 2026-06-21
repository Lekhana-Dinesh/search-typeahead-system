# SearchIQ Typeahead System

SearchIQ is a locally reproducible search typeahead system that combines fast prefix suggestions, cache-aside reads, recency-aware ranking, and write coalescing in a compact Node.js and React codebase. The project uses a deterministic 100,000-row dataset, SQLite as the local source of truth, logical cache nodes with consistent hashing, and batched write flushes to demonstrate core system-design ideas without changing the underlying API into a production-only architecture.

## Feature Checklist

- Deterministic 100,000-row `query,count` dataset with fast local seeding
- `GET /suggest?q=<prefix>` with case-insensitive prefix matching and a maximum of 10 results
- Basic ranking by `count DESC`
- `GET /suggest?q=<prefix>&ranking=trending` with a rolling one-hour trending window
- `POST /search` returning `{ "message": "Searched" }`
- Cache-aside read flow with prefix-level cache entries
- Three logical cache nodes with consistent hashing
- TTL-based expiry and prefix invalidation on search submission
- `GET /cache/debug?prefix=<prefix>` for cache ownership and TTL inspection
- Write coalescing through aggregated batch writes and SQLite transaction flushes
- Metrics and benchmark support for cache hit rate, latency, and write reduction
- React UI with debounce, suggestion dropdown, ranking toggle, and request insights

## Architecture Summary

The system has four main layers:

- A React frontend issues debounced prefix lookups and search submissions.
- An Express API coordinates suggestion ranking, cache inspection, metrics, and the batched write path.
- SQLite stores the deterministic dataset and remains the local source of truth.
- In-memory `Map` instances simulate logical cache nodes, while a consistent-hash ring assigns prefix keys to cache owners.

The read path follows a cache-aside pattern: the API checks the prefix-level cache first, falls back to SQLite on miss, and stores the ranked response back in the owning logical cache node. The write path uses an in-memory aggregation buffer so repeated searches can be coalesced and flushed in a single SQLite transaction.

## Setup

Node.js `24+` is required because the project uses the built-in `node:sqlite` module.

```powershell
npm install --cache .npm-cache
```

## Commands

| Task | Command | Notes |
| --- | --- | --- |
| Install dependencies | `npm install --cache .npm-cache` | Uses a local npm cache directory |
| Seed small dataset | `npm run seed:small` | Generates and ingests 5,000 rows |
| Seed full dataset | `npm run seed` | Generates and ingests the deterministic 100,000-row dataset |
| Run API and UI | `npm run dev` | API on `http://localhost:3001`, UI on `http://localhost:5173` |
| Run API only | `npm start` | Starts the Express server |
| Preview built UI | `npm run preview` | Serves the built frontend through Express |
| Run tests | `npm test` | Node test runner |
| Build frontend | `npm run build` | Vite production build |
| Run benchmark | `npm run benchmark` | Requires the API to already be running |

## Seed Notes

Both seed commands:

- generate a deterministic CSV in `query,count` format
- initialize the SQLite schema
- ingest rows in bulk inside SQLite transactions
- log progress and total duration

Generated files such as SQLite databases, generated CSVs, `dist`, `.npm-cache`, and `node_modules` are local artifacts and should not be included in a submission archive.

## API Summary

- `GET /suggest?q=<prefix>` returns up to 10 prefix-matching suggestions using basic ranking.
- `GET /suggest?q=<prefix>&ranking=trending` applies the recency-aware ranking formula.
- `POST /search` records recent activity, invalidates affected prefixes, and queues batched count updates.
- `GET /cache/debug?prefix=<prefix>` shows the owning logical cache node, key, TTL, and cache state.
- `GET /trending?limit=<n>` returns the current recency-aware trending list.
- `GET /metrics` exposes cache, batch-write, and database counters.

Detailed request and response examples are documented in [docs/api.md](docs/api.md).

## Documentation

- Architecture: [docs/architecture.md](docs/architecture.md)
- API reference: [docs/api.md](docs/api.md)
- Performance notes: [docs/performance-report.md](docs/performance-report.md)
- Screenshot index: [docs/screenshots/README.md](docs/screenshots/README.md)
- Final report: [docs/Project_Report.pdf](docs/Project_Report.pdf)

All screenshots used in the repository are stored under [docs/screenshots/](docs/screenshots/).

## Production Trade-offs

- SQLite keeps the project easy to run locally, but it is not horizontally scalable like a managed distributed datastore.
- Logical cache nodes implemented with `Map` objects demonstrate prefix ownership and cache-aside behavior, but they are a local simulation rather than Redis Cluster or Memcached.
- The rolling one-hour trending window is intentionally simple and transparent rather than personalized or ML-driven.
- The in-memory batch buffer improves write reduction locally, but pending increments can be lost on crash before flush.
- For larger-scale deployments, reasonable alternatives would include Redis Cluster for caching, a trie or search index for larger prefix workloads, and Kafka, Redis Streams, SQS, or a database-backed queue for durable write buffering.
