import { performance } from "node:perf_hooks";

const BASE_URL = process.env.BENCHMARK_BASE_URL ?? "http://localhost:3001";
const WARM_REQUESTS = Number(process.env.BENCHMARK_WARM_REQUESTS ?? 25);
const PREFIX_CANDIDATES = ["iph", "mac", "rea", "tra", "sam", "app", "you"];

async function readJson(response) {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || `Request failed with status ${response.status}`);
  }

  return payload;
}

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      await readJson(await fetch(`${BASE_URL}/metrics`));
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Server did not become ready at ${BASE_URL} within 20 seconds.`);
}

async function getCacheDebug(prefix, ranking = "basic") {
  const params = new URLSearchParams({ prefix, ranking });
  return readJson(await fetch(`${BASE_URL}/cache/debug?${params.toString()}`));
}

async function chooseColdPrefix(ranking = "basic") {
  for (const prefix of PREFIX_CANDIDATES) {
    const debug = await getCacheDebug(prefix, ranking);
    if (debug.cacheStatus !== "hit") {
      return prefix;
    }
  }

  return PREFIX_CANDIDATES[0];
}

async function measureSuggest(prefix, ranking = "basic") {
  const params = new URLSearchParams({ q: prefix, ranking });
  const startedAt = performance.now();
  const payload = await readJson(await fetch(`${BASE_URL}/suggest?${params.toString()}`));
  const wallMs = performance.now() - startedAt;

  return {
    prefix,
    ranking,
    source: payload.source,
    cacheStatus: payload.cacheStatus,
    wallMs,
    apiLatencyMs: Number(payload.latencyMs ?? 0)
  };
}

async function measureWarmP95(prefix, ranking) {
  const wallLatencies = [];
  const apiLatencies = [];

  for (let index = 0; index < WARM_REQUESTS; index += 1) {
    const result = await measureSuggest(prefix, ranking);
    wallLatencies.push(result.wallMs);
    apiLatencies.push(result.apiLatencyMs);
  }

  return {
    prefix,
    ranking,
    iterations: WARM_REQUESTS,
    wallP95Ms: percentile(wallLatencies, 95),
    apiP95Ms: percentile(apiLatencies, 95)
  };
}

async function main() {
  await waitForServer();

  const coldPrefix = await chooseColdPrefix("basic");
  const coldResult = await measureSuggest(coldPrefix, "basic");
  const warmResult = await measureWarmP95(coldPrefix, "basic");

  const trendingPrefix = await chooseColdPrefix("trending");
  await measureSuggest(trendingPrefix, "trending");
  const trendingResult = await measureWarmP95(trendingPrefix, "trending");

  const metrics = await readJson(await fetch(`${BASE_URL}/metrics`));

  console.log(`[benchmark] base URL: ${BASE_URL}`);
  console.log(
    `[benchmark] cold /suggest?q=${coldResult.prefix}: ` +
      `wall=${formatMs(coldResult.wallMs)}, api=${formatMs(coldResult.apiLatencyMs)}, ` +
      `source=${coldResult.source}, cacheStatus=${coldResult.cacheStatus}`
  );
  console.log(
    `[benchmark] warm /suggest?q=${warmResult.prefix} p95 over ${warmResult.iterations} requests: ` +
      `wall=${formatMs(warmResult.wallP95Ms)}, api=${formatMs(warmResult.apiP95Ms)}`
  );
  console.log(
    `[benchmark] trending /suggest?q=${trendingResult.prefix}&ranking=trending p95 ` +
      `over ${trendingResult.iterations} requests: wall=${formatMs(trendingResult.wallP95Ms)}, ` +
      `api=${formatMs(trendingResult.apiP95Ms)}`
  );
  console.log(
    `[benchmark] cache hit rate from /metrics: ${(metrics.cache.hitRate * 100).toFixed(0)}%`
  );
}

main().catch((error) => {
  console.error("[benchmark] failed", error);
  process.exitCode = 1;
});
