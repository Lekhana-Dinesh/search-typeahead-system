import path from "node:path";

export const APP_ROOT = process.cwd();
export const DATA_DIRECTORY = path.join(APP_ROOT, "data");
export const DATABASE_PATH = process.env.DB_PATH ?? path.join(DATA_DIRECTORY, "searches.db");
export const DEFAULT_DATASET_PATH = process.env.DATASET_PATH ?? path.join(DATA_DIRECTORY, "generated-queries.csv");

export const MAX_SUGGESTIONS = 10;
export const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 60_000);
export const CACHE_NODE_NAMES = (process.env.CACHE_NODES ?? "cache-node-1,cache-node-2,cache-node-3")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
export const CACHE_VIRTUAL_NODES = Number(process.env.CACHE_VIRTUAL_NODES ?? 40);

export const TRENDING_WINDOW_MS = Number(process.env.TRENDING_WINDOW_MS ?? 60 * 60 * 1000);
export const TRENDING_BOOST = Number(process.env.TRENDING_BOOST ?? 50);
export const TRENDING_CANDIDATE_LIMIT = Number(process.env.TRENDING_CANDIDATE_LIMIT ?? 250);

export const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 100);
export const BATCH_FLUSH_INTERVAL_MS = Number(process.env.BATCH_FLUSH_INTERVAL_MS ?? 5_000);
