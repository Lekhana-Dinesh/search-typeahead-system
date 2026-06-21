# API Documentation

This API is designed for a locally reproducible typeahead system. The read path uses a cache-aside flow with prefix-level cache entries, and the write path uses coalesced batch updates instead of synchronous per-request database writes.

## Endpoint Summary

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/suggest?q=<prefix>` | Return up to 10 prefix suggestions using basic ranking |
| `GET` | `/suggest?q=<prefix>&ranking=trending` | Return up to 10 suggestions using recency-aware ranking |
| `POST` | `/search` | Record a search submission and queue count updates |
| `GET` | `/cache/debug?prefix=<prefix>` | Inspect cache ownership, key normalization, and TTL |
| `GET` | `/trending?limit=<n>` | Return the current trending list used by the UI |
| `GET` | `/metrics` | Return cache, batch-write, and database metrics |

## `GET /suggest?q=<prefix>`

Returns up to 10 case-insensitive prefix matches using basic ranking.

Example:

```http
GET /suggest?q=iph
```

Example response:

```json
{
  "query": "iph",
  "ranking": "basic",
  "suggestions": [
    {
      "query": "iphone 15 pro max price",
      "normalizedQuery": "iphone 15 pro max price",
      "count": 950000,
      "recentCount": 0,
      "score": 950000
    }
  ],
  "source": "database",
  "cacheStatus": "miss",
  "cacheNode": "cache-node-2",
  "latencyMs": 3.42
}
```

Important behavior:

- Basic ranking sorts by all-time `count DESC`
- Empty prefixes return `200` with an empty suggestion list
- Invalid `ranking` values fall back to `basic`
- The cache key format is `basic:<prefix>`

Important fields:

- `source`: `database`, `cache`, or `none`
- `cacheStatus`: `miss`, `hit`, `expired`, or `skipped`
- `cacheNode`: logical cache node selected by consistent hashing
- `suggestions`: up to 10 ranked prefix matches

## `GET /suggest?q=<prefix>&ranking=trending`

Returns up to 10 suggestions using a rolling one-hour trending window.

Example:

```http
GET /suggest?q=iph&ranking=trending
```

Example response:

```json
{
  "query": "iph",
  "ranking": "trending",
  "suggestions": [
    {
      "query": "iphone update",
      "normalizedQuery": "iphone update",
      "count": 163,
      "recentCount": 3,
      "score": 313
    }
  ],
  "source": "database",
  "cacheStatus": "miss",
  "cacheNode": "cache-node-3",
  "latencyMs": 4.11
}
```

Trending formula:

```text
score = allTimeCount + recentCountLastHour * 50
```

Important behavior:

- Ranking merges historical counts with recent activity
- The cache key format is `trending:<prefix>`
- Recently searched low-count queries can surface even after the batch buffer flushes

## `POST /search`

Records a submitted query, updates the recent-activity window immediately, invalidates affected prefix keys, and adds the query to the batch buffer for later SQLite persistence.

Example:

```http
POST /search
Content-Type: application/json

{
  "query": "iphone update"
}
```

Example response:

```json
{
  "message": "Searched"
}
```

Important behavior:

- Does not synchronously update SQLite on every request
- Coalesces repeated queries in memory
- Influences trending ranking before the next database flush

Error cases:

- Empty or whitespace-only queries return `400`
- Malformed JSON returns `400` with `{"message":"Invalid JSON body."}`

## `GET /cache/debug?prefix=<prefix>`

Shows which logical cache node owns a normalized prefix key and whether a cached entry exists.

Example:

```http
GET /cache/debug?prefix=IPH
```

Example response:

```json
{
  "prefix": "iph",
  "ranking": "basic",
  "key": "basic:iph",
  "assignedNode": "cache-node-3",
  "hash": 108704718179841,
  "cacheStatus": "hit",
  "ttlSecondsRemaining": 58,
  "stats": {
    "hits": 1,
    "misses": 1,
    "hitRate": 0.5,
    "keys": 1
  }
}
```

Important fields:

- `prefix`: normalized lowercase prefix
- `assignedNode`: cache owner selected by consistent hashing
- `cacheStatus`: `hit`, `miss`, or `expired`
- `ttlSecondsRemaining`: remaining TTL for the cached entry
- `stats`: node-local cache hit, miss, and key counts

## `GET /trending?limit=<n>`

Returns the current trending list used by the UI signals panel.

Example:

```http
GET /trending?limit=8
```

Example response:

```json
{
  "windowMinutes": 60,
  "boost": 50,
  "suggestions": [
    {
      "query": "iphone update",
      "normalizedQuery": "iphone update",
      "count": 163,
      "recentCount": 3,
      "score": 313
    }
  ]
}
```

## `GET /metrics`

Returns counters for cache usage, batch writes, and database operations.

Example:

```http
GET /metrics
```

Example response:

```json
{
  "cache": {
    "hits": 5,
    "misses": 3,
    "hitRate": 0.63,
    "nodes": [
      {
        "nodeName": "cache-node-1",
        "hits": 1,
        "misses": 1,
        "hitRate": 0.5,
        "keys": 1
      }
    ]
  },
  "batchWriter": {
    "totalSearchSubmissions": 7,
    "totalRowsWritten": 3,
    "flushCount": 1,
    "pendingEntries": 2,
    "pendingSearches": 4,
    "pendingBufferedWrites": 4,
    "databaseWritesAvoided": 4,
    "writeReduction": 0.57
  },
  "database": {
    "readOperations": 8,
    "writeOperations": 1,
    "rowsWritten": 3
  },
  "indexedQueries": 100000
}
```

Useful metrics:

- Cache hit rate across all logical nodes
- Pending versus flushed batch entries
- Database writes avoided through write coalescing
- Total indexed dataset size
