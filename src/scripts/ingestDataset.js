import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { DEFAULT_DATASET_PATH } from "../config.js";
import { SearchDatabase } from "../db/database.js";

const DEFAULT_BATCH_SIZE = 10_000;
const DEFAULT_PROGRESS_EVERY = 10_000;
const numberFormatter = new Intl.NumberFormat("en-US");

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

export async function ingestDataset(inputPath = DEFAULT_DATASET_PATH, options = {}) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Dataset not found: ${inputPath}`);
  }

  const logger = options.logger ?? console;
  const database = options.database ?? new SearchDatabase(options.databasePath);
  const batchSize = Number(options.batchSize ?? DEFAULT_BATCH_SIZE);
  const progressEvery = Number(options.progressEvery ?? DEFAULT_PROGRESS_EVERY);
  const reset = options.reset ?? true;
  let pendingRows = [];
  let rowsIngested = 0;
  const startedAt = Date.now();

  logger.log(`[seed] ingestion started (${inputPath})`);

  if (reset) {
    database.clearAll();
  }

  const stream = fs.createReadStream(inputPath, { encoding: "utf8" });
  const input = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let isFirstLine = true;

  for await (const line of input) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    const [query, count] = parseCsvLine(line);
    pendingRows.push({ query, count: Number(count) || 0 });

    if (pendingRows.length >= batchSize) {
      database.bulkUpsert(pendingRows);
      rowsIngested += pendingRows.length;
      if (rowsIngested % progressEvery === 0) {
        logger.log(`[seed] ingestion progress: ${numberFormatter.format(rowsIngested)} rows inserted`);
      }
      pendingRows = [];
    }
  }

  if (pendingRows.length) {
    database.bulkUpsert(pendingRows);
    rowsIngested += pendingRows.length;
    logger.log(`[seed] ingestion progress: ${numberFormatter.format(rowsIngested)} rows inserted`);
  }

  const durationMs = Date.now() - startedAt;
  logger.log(`[seed] ingestion completed in ${durationMs}ms`);

  return {
    rowsIngested,
    durationMs,
    databasePath: database.databasePath
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const inputPath = process.argv[2] ?? DEFAULT_DATASET_PATH;

  ingestDataset(inputPath)
    .then((result) => {
      console.log(`[seed] total rows inserted: ${numberFormatter.format(result.rowsIngested)}`);
      console.log(`Ingested ${result.rowsIngested} rows into ${result.databasePath} in ${result.durationMs}ms`);
    })
    .catch((error) => {
      console.error("Failed to ingest dataset", error);
      process.exitCode = 1;
    });
}
