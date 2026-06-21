import assert from "node:assert/strict";
import test from "node:test";
import { buildTestServices } from "./helpers.js";

test("batch writer aggregates repeated queries into one pending entry", () => {
  const services = buildTestServices();

  try {
    services.batchWriter.record("iphone 15");
    services.batchWriter.record("iphone 15");
    services.batchWriter.record("iphone 15");

    const entries = services.batchWriter.getPendingEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].increment, 3);
  } finally {
    services.batchWriter.stop();
    services.database.close();
  }
});

test("batch flush updates database counts and metrics", () => {
  const services = buildTestServices({
    rows: [{ query: "iphone 15", count: 10 }]
  });

  try {
    services.batchWriter.record("iphone 15");
    services.batchWriter.record("iphone 15");
    services.batchWriter.record("iphone case");

    const flushResult = services.batchWriter.flush();
    const existing = services.database.getQuery("iphone 15");
    const inserted = services.database.getQuery("iphone case");
    const stats = services.batchWriter.getStats();

    assert.equal(flushResult.rowsWritten, 2);
    assert.equal(existing.count, 12);
    assert.equal(inserted.count, 1);
    assert.equal(stats.totalSearchSubmissions, 3);
    assert.equal(stats.totalRowsWritten, 2);
    assert.equal(stats.pendingSearches, 0);
    assert.equal(stats.databaseWritesAvoided, 1);
  } finally {
    services.batchWriter.stop();
    services.database.close();
  }
});
