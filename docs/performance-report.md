# Performance Report

This document records measured local results from the current implementation. The goal is to show that the deterministic dataset can be loaded quickly, repeated prefix reads benefit from the cache-aside path, and write coalescing reduces database write pressure.

## Seed Performance

### Measured results

| Command | Rows inserted | CSV generation | Ingestion | Total duration |
| --- | --- | --- | --- | --- |
| `npm run seed:small` | `5,000` | `55ms` | `870ms` | `975ms` |
| `npm run seed` | `100,000` | `546ms` | `4323ms` | `4879ms` |

### Interpretation

- Dataset generation is deterministic and bounded
- Schema setup and ingestion complete well within the local performance target
- The ingestion path uses SQLite transactions rather than per-row writes outside a transaction
- Progress logging and total-duration logging are included in the seed flow

## Cache Behavior

Suggested local verification flow:

1. Call `GET /suggest?q=iph`
2. Observe `source: "database"` and `cacheStatus: "miss"`
3. Call the same request again
4. Observe `source: "cache"` and `cacheStatus: "hit"`
5. Open `GET /cache/debug?prefix=iph` to inspect TTL and node-local hit rate

Why this matters:

- repeated typeahead prefixes are a strong fit for prefix-level caching
- cache hits reduce SQLite read pressure
- consistent hashing keeps prefix ownership stable across logical cache nodes

## Database Read and Write Behavior

### Reads

- On cache miss, `/suggest` reads from SQLite
- On cache hit, the SQLite read is avoided
- `/metrics` exposes database read-operation counts for validation

### Writes

- `/search` does not synchronously write every submission to SQLite
- Repeated searches are coalesced in memory
- Flushes persist aggregated increments inside a SQLite transaction
- `/metrics` exposes flush count, pending entries, and write-reduction counters

## Write Reduction Example

If the same query is submitted 10 times before a flush:

- search submissions recorded: `10`
- aggregated database rows written: `1`
- database writes avoided: `9`

This keeps the write path compact while preserving the final count update after flush.

Trade-off:

- Pending increments in the in-memory batch buffer can be lost if the process crashes before the next flush

Production alternatives:

- Kafka
- Redis Streams
- SQS
- database-backed queue

## Local Latency Measurements

Measured locally with `npm run benchmark` against a running API on `http://localhost:3001`:

| Scenario | Measured value |
| --- | --- |
| Cold `/suggest?q=iph` | `10.94ms` wall-clock, `6.25ms` API-reported latency |
| Warm `/suggest?q=iph` p95 over 25 requests | `3.28ms` wall-clock, `0.22ms` API-reported latency |
| Warm `/suggest?q=iph&ranking=trending` p95 over 25 requests | `2.05ms` wall-clock, `0.18ms` API-reported latency |
| Cache hit rate after warm-up | `0.96` |

## Benchmark Notes

The benchmark script:

- calls the running API rather than importing backend internals
- measures a cold suggestion request
- measures warm p95 latency for basic and trending ranking
- reads cache hit rate from `/metrics`

Command:

```powershell
npm run benchmark
```

## Validation Commands

```powershell
npm run seed:small
npm run seed
npm test
npm run build
```

These commands validate the local seed path, API behavior, and production build output without changing the system design or runtime behavior.
