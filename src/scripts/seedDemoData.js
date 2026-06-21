import fs from "node:fs";
import path from "node:path";
import { DEFAULT_DATASET_PATH } from "../config.js";
import { SearchDatabase } from "../db/database.js";
import { generateDataset } from "./generateDataset.js";
import { ingestDataset } from "./ingestDataset.js";

const numberFormatter = new Intl.NumberFormat("en-US");

function datasetPathForSize(targetSize) {
  const directory = path.dirname(DEFAULT_DATASET_PATH);
  return path.join(directory, `generated-queries-${targetSize}.csv`);
}

async function seed() {
  const targetSize = Number(process.argv[2] ?? process.env.DATASET_SIZE ?? 100_000);
  const datasetPath = datasetPathForSize(targetSize);
  const startedAt = Date.now();

  if (fs.existsSync(datasetPath)) {
    fs.unlinkSync(datasetPath);
  }

  const generated = await generateDataset(datasetPath, targetSize, {
    logger: console
  });
  console.log(`[seed] CSV generation completed in ${generated.durationMs}ms`);

  console.log("[seed] DB schema initialization started");
  const database = new SearchDatabase();
  console.log("[seed] DB schema initialization completed");

  const result = await ingestDataset(datasetPath, {
    database,
    batchSize: 10_000,
    progressEvery: 10_000,
    logger: console
  });
  console.log(`[seed] total rows inserted: ${numberFormatter.format(result.rowsIngested)}`);
  console.log(`[seed] total duration: ${Date.now() - startedAt}ms`);

  database.close();
}

seed().catch((error) => {
  console.error("Failed to seed demo data", error);
  process.exitCode = 1;
});
