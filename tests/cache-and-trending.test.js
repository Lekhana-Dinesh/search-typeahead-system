import assert from "node:assert/strict";
import test from "node:test";
import { DistributedCache } from "../src/services/distributedCache.js";
import { TrendingService } from "../src/services/trendingService.js";
import { buildTestServices } from "./helpers.js";

test("consistent hashing routes the same prefix to the same node", () => {
  const cache = new DistributedCache();
  const first = cache.debug("iph");
  const second = cache.debug("iph");

  assert.equal(first.assignedNode, second.assignedNode);
  assert.equal(first.hash, second.hash);
});

test("trending score boosts recently searched queries above higher all-time counts when the boost is large enough", () => {
  const trendingService = new TrendingService({
    windowMs: 60 * 60 * 1000,
    trendingBoost: 50
  });

  for (let index = 0; index < 5; index += 1) {
    trendingService.record("iphone repairs");
  }

  const ranked = trendingService.rank([
    { normalizedQuery: "iphone", displayQuery: "iphone", count: 300 },
    { normalizedQuery: "iphone repairs", displayQuery: "iphone repairs", count: 60 }
  ]);

  assert.equal(ranked[0].normalizedQuery, "iphone repairs");
  assert.equal(ranked[0].score, 310);
});

test("suggestion service includes pending batch increments before flush", () => {
  const services = buildTestServices({
    rows: [
      { query: "react hooks", count: 100 },
      { query: "react router", count: 90 }
    ]
  });

  try {
    services.searchService.recordSearch("react hooks");
    services.searchService.recordSearch("react hooks");
    services.searchService.recordSearch("react testing");

    const payload = services.suggestionService.getSuggestions("rea", "trending");
    const hooks = payload.suggestions.find((item) => item.normalizedQuery === "react hooks");
    const testing = payload.suggestions.find((item) => item.normalizedQuery === "react testing");

    assert.equal(hooks.count, 102);
    assert.equal(testing.count, 1);
  } finally {
    services.batchWriter.stop();
    services.database.close();
  }
});
