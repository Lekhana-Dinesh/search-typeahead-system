import assert from "node:assert/strict";
import test from "node:test";
import { startTestServer } from "./helpers.js";

const rows = [
  { query: "iphone", count: 300 },
  { query: "iphone 15", count: 290 },
  { query: "iphone case", count: 240 },
  { query: "iphone charger", count: 230 },
  { query: "iphone pro max", count: 220 },
  { query: "iphone wallpaper", count: 210 },
  { query: "iphone repairs", count: 200 },
  { query: "iphone settings", count: 190 },
  { query: "iphone screen guard", count: 180 },
  { query: "iphone trade in", count: 170 },
  { query: "iphone update", count: 160 },
  { query: "ipad", count: 500 }
];

test("GET /suggest returns only prefix matches, sorted by count, and max 10 results", async () => {
  const app = await startTestServer({ rows });

  try {
    const response = await fetch(`${app.baseUrl}/suggest?q=iph`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.suggestions.length, 10);
    assert.deepEqual(
      payload.suggestions.map((item) => item.query),
      [
        "iphone",
        "iphone 15",
        "iphone case",
        "iphone charger",
        "iphone pro max",
        "iphone wallpaper",
        "iphone repairs",
        "iphone settings",
        "iphone screen guard",
        "iphone trade in"
      ]
    );
    assert.ok(payload.suggestions.every((item) => item.normalizedQuery.startsWith("iph")));
    assert.equal(payload.source, "database");
  } finally {
    await app.close();
  }
});

test("GET /suggest hits the cache on the second request", async () => {
  const app = await startTestServer({ rows });

  try {
    const firstResponse = await fetch(`${app.baseUrl}/suggest?q=iph`);
    const firstPayload = await firstResponse.json();
    const secondResponse = await fetch(`${app.baseUrl}/suggest?q=iph`);
    const secondPayload = await secondResponse.json();

    assert.equal(firstPayload.source, "database");
    assert.equal(secondPayload.source, "cache");

    const debugResponse = await fetch(`${app.baseUrl}/cache/debug?prefix=iph`);
    const debugPayload = await debugResponse.json();

    assert.equal(debugPayload.cacheStatus, "hit");
    assert.equal(debugPayload.key, "basic:iph");
    assert.equal(debugPayload.assignedNode, secondPayload.cacheNode);
    assert.ok(debugPayload.ttlSecondsRemaining >= 0);
    assert.equal(debugPayload.stats.hits, 1);
  } finally {
    await app.close();
  }
});

test("GET /cache/debug normalizes prefix casing to the same cache key as /suggest", async () => {
  const app = await startTestServer({ rows });

  try {
    await fetch(`${app.baseUrl}/suggest?q=iph`);

    const response = await fetch(`${app.baseUrl}/cache/debug?prefix=IPH`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.prefix, "iph");
    assert.equal(payload.key, "basic:iph");
    assert.equal(payload.cacheStatus, "hit");
  } finally {
    await app.close();
  }
});

test("GET /suggest handles empty prefixes gracefully and matches case-insensitively", async () => {
  const app = await startTestServer({ rows });

  try {
    const emptyResponse = await fetch(`${app.baseUrl}/suggest?q=`);
    const emptyPayload = await emptyResponse.json();

    assert.equal(emptyResponse.status, 200);
    assert.equal(emptyPayload.source, "none");
    assert.equal(emptyPayload.cacheStatus, "skipped");
    assert.equal(emptyPayload.suggestions.length, 0);

    const uppercaseResponse = await fetch(`${app.baseUrl}/suggest?q=IPH`);
    const uppercasePayload = await uppercaseResponse.json();

    assert.equal(uppercaseResponse.status, 200);
    assert.equal(uppercasePayload.query, "iph");
    assert.equal(uppercasePayload.suggestions[0].query, "iphone");
  } finally {
    await app.close();
  }
});

test("GET /suggest supports trending ranking and boosts recent searches", async () => {
  const app = await startTestServer({ rows });

  try {
    for (let index = 0; index < 3; index += 1) {
      await fetch(`${app.baseUrl}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "iphone update" })
      });
    }

    const response = await fetch(`${app.baseUrl}/suggest?q=iph&ranking=trending`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ranking, "trending");
    assert.equal(payload.suggestions[0].query, "iphone update");
    assert.equal(payload.suggestions[0].count, 163);
    assert.equal(payload.suggestions[0].recentCount, 3);
    assert.equal(payload.suggestions[0].score, 313);
  } finally {
    await app.close();
  }
});

test("GET /suggest trending can surface a recent low-count query after the batch buffer flushes", async () => {
  const largeRows = [];
  for (let index = 0; index < 300; index += 1) {
    largeRows.push({
      query: `iphone popular ${index}`,
      count: 1000 - index
    });
  }

  largeRows.push({ query: "iphone zero hero", count: 1 });

  const app = await startTestServer({ rows: largeRows });

  try {
    for (let index = 0; index < 25; index += 1) {
      await fetch(`${app.baseUrl}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "iphone zero hero" })
      });
    }

    app.services.batchWriter.flush();

    const response = await fetch(`${app.baseUrl}/suggest?q=iph&ranking=trending`);
    const payload = await response.json();
    const surfaced = payload.suggestions.find((item) => item.query === "iphone zero hero");

    assert.equal(response.status, 200);
    assert.ok(surfaced);
    assert.equal(surfaced.count, 26);
    assert.equal(surfaced.recentCount, 25);
    assert.equal(surfaced.score, 1276);
  } finally {
    await app.close();
  }
});

test("POST /search rejects empty queries and accepts valid ones", async () => {
  const app = await startTestServer({ rows });

  try {
    const badResponse = await fetch(`${app.baseUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "   " })
    });

    assert.equal(badResponse.status, 400);

    const goodResponse = await fetch(`${app.baseUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "iphone 15" })
    });
    const payload = await goodResponse.json();

    assert.equal(goodResponse.status, 200);
    assert.equal(payload.message, "Searched");
  } finally {
    await app.close();
  }
});

test("POST /search returns JSON 400 for invalid JSON bodies", async () => {
  const app = await startTestServer({ rows });

  try {
    const response = await fetch(`${app.baseUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{"
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.message, "Invalid JSON body.");
  } finally {
    await app.close();
  }
});
