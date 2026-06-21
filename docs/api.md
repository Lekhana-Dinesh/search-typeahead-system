# API Documentation

## `GET /suggest?q=<prefix>`

Purpose:
Returns up to 10 prefix suggestions using basic ranking.

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

Important fields:

- `source`: `database`, `cache`, or `none`
- `cacheStatus`: `miss`, `hit`, `expired`, or `skipped`
- `cacheNode`: logical cache node that owns the prefix
- `suggestions`: up to 10 prefix matches sorted by all-time count in basic mode

Edge cases:

- empty prefix returns `200` with an empty suggestion list
- invalid `ranking` defaults to `basic`

## `GET /suggest?q=<prefix>&ranking=basic`

Purpose:
Explicit version of the basic ranking flow.

Example:

```http
GET /suggest?q=iph&ranking=basic
```

Behavior:

- same prefix matching logic
- sorted by all-time count descending
- cached using key format `basic:<prefix>`

## `GET /suggest?q=<prefix>&ranking=trending`

Purpose:
Returns up to 10 suggestions using the recency-aware trending formula.

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

Formula:

```text
score = allTimeCount + recentCountLastHour * 50
```

## `POST /search`

Purpose:
Records a submitted query, updates recent activity, adds the query to the batch-write buffer, and invalidates affected cached prefixes.

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

- does not synchronously update SQLite on every request
- aggregates repeated queries in memory
- influences trending ranking immediately

Error cases:

- empty or whitespace-only query returns `400`
- malformed JSON body returns `400` with `{"message":"Invalid JSON body."}`

## `GET /cache/debug?prefix=<prefix>`

Purpose:
Shows which logical cache node owns a prefix and whether the cached entry exists.

Example:

```http
GET /cache/debug?prefix=iph
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

- `assignedNode`: cache owner chosen by consistent hashing
- `cacheStatus`: `hit`, `miss`, or `expired`
- `ttlSecondsRemaining`: remaining TTL if present
- `stats`: node-local cache hit/miss information

## `GET /trending?limit=<n>`

Purpose:
Returns the current trending queries used by the UI signals section.

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

Purpose:
Returns cache, batch-writer, and database metrics useful for demo and debugging.

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
