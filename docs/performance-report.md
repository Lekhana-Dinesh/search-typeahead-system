# Performance Report

## Seed Performance

Measured on this local Windows setup using the current implementation:

### `npm run seed:small`

- rows inserted: `5,000`
- CSV generation: `159ms`
- ingestion: `1085ms`
- total duration: `1254ms`

### `npm run seed`

- rows inserted: `100,000`
- CSV generation: `1097ms`
- ingestion: `7695ms`
- total duration: `8806ms`

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

## Sample Latency Measurements

Measured locally against the final implementation:

- cold `/suggest?q=iph`: `3.35ms`
- warm `/suggest?q=iph` p95: `0.26ms`
- cold `/suggest?q=iph&ranking=trending`: `7.83ms`
- warm `/suggest?q=iph&ranking=trending` p95: `0.22ms`
- sample cache hit rate after warm-up: `0.98`
- sample database read operations: `2`
- sample database write operations during read-only latency run: `0`

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
