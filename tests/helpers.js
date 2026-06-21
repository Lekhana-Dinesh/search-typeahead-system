import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp, createServices } from "../src/api/createApp.js";

export function createTempDatabasePath() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "typeahead-"));
  return path.join(tempDirectory, "searches.db");
}

export function seedDatabase(database, rows) {
  database.bulkUpsert(rows);
}

export function buildTestServices(options = {}) {
  const databasePath = options.databasePath ?? createTempDatabasePath();
  const services = createServices({
    databasePath,
    batchOptions: {
      batchSize: 50,
      flushIntervalMs: 60_000
    },
    ...options
  });

  if (options.rows?.length) {
    seedDatabase(services.database, options.rows);
  }

  return services;
}

export async function startTestServer(options = {}) {
  const { app, services } = createApp({
    databasePath: options.databasePath ?? createTempDatabasePath(),
    batchOptions: {
      batchSize: 50,
      flushIntervalMs: 60_000
    },
    ...options
  });

  if (options.rows?.length) {
    seedDatabase(services.database, options.rows);
  }

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    services,
    async close() {
      services.batchWriter.stop();
      services.database.close();

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}
