# Performance Report

## Seed Performance

Measured on this local Windows setup using the current implementation:

### `npm run seed:small`

- rows inserted: `5,000`
- CSV generation: `55ms`
- ingestion: `870ms`
- total duration: `975ms`

### `npm run seed`

- rows inserted: `100,000`
- CSV generation: `546ms`
- ingestion: `4323ms`
- total duration: `4879ms`

Interpretation:

- the old slow path was removed
- CSV generation is deterministic and bounded
- ingestion uses SQLite transactions and batched writes
- the seed now completes far below the assignment's 1 to 2 minute requirement

## Cache Hit / Miss Example

Suggested demo:

1. Call `GET /suggest?q=iph`
2. Observe `source: "database"` and `cacheStatus: "miss"`
3. Call the same request again
4. Observe `source: "cache"` and `cacheStatus: "hit"`
5. Open `GET /cache/debug?prefix=iph` to show TTL and node-local hit rate

Why hit rate matters:

- a higher hit rate means fewer database reads
- autocomplete prefixes repeat frequently, so prefix-level caching is effective

## Database Read / Write Explanation

### Reads

- on cache miss, `/suggest` reads from SQLite
- on cache hit, SQLite read is avoided
- `/metrics` exposes database read operation counts for demo reporting

### Writes

- `/search` does not write synchronously to SQLite
- repeated queries are aggregated in memory
- flush writes update multiple increments in one transaction
- `/metrics` exposes write operation counts and written-row totals

## Batch Write Reduction

Example:

- 10 search submissions for the same query
- 1 aggregated row written during flush
- 9 writes avoided

Why this helps:

- fewer SQLite writes
- lower write amplification
- simpler demonstration of write buffering

Trade-off:

- if the process crashes before flush, buffered increments can be lost

Production alternative:

- Kafka
- Redis Streams
- SQS
- database-backed queue

## Latency Tracking Template

Use this table during a demo:

| Scenario | Example request | Expected source | Sample observation |
| --- | --- | --- | --- |
| cold prefix | `/suggest?q=iph` | database | slightly higher latency |
| warm prefix | `/suggest?q=iph` again | cache | lower latency |
| trending mode | `/suggest?q=iph&ranking=trending` | database/cache | similar, with extra scoring work |

## Local Latency Measurements

Measured locally against the final implementation using `npm run benchmark` with the API running on `http://localhost:3001`:

- cold `/suggest?q=iph`: `10.94ms` wall-clock, `6.25ms` API-reported latency
- warm `/suggest?q=iph` p95 over 25 requests: `3.28ms` wall-clock, `0.22ms` API-reported latency
- warm `/suggest?q=iph&ranking=trending` p95 over 25 requests: `2.05ms` wall-clock, `0.18ms` API-reported latency
- measured cache hit rate after warm-up: `0.96`

## p95 Latency Template

If you want to repeat the measurement on another laptop, run the same request many times and compute the 95th percentile.

Suggested commands to test manually after starting the app:

```powershell
Invoke-RestMethod "http://localhost:3001/suggest?q=iph"
Invoke-RestMethod "http://localhost:3001/cache/debug?prefix=iph"
Invoke-RestMethod "http://localhost:3001/metrics"
```

Sample reporting format:

| Endpoint | Cache state | p95 latency |
| --- | --- | --- |
| `/suggest?q=iph` | cold | measure locally |
| `/suggest?q=iph` | warm | measure locally |
| `/suggest?q=iph&ranking=trending` | warm | measure locally |

## How to Demo Performance

1. Run `npm run seed` and show the total duration.
2. Start the app and query `iph`.
3. Query `iph` again and point out the cache hit.
4. Open `/metrics` and show hit rate plus write-reduction metrics.
5. Submit the same search several times and show batch aggregation behavior.
