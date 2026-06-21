import { BATCH_FLUSH_INTERVAL_MS, BATCH_SIZE } from "../config.js";
import { normalizeQuery, sanitizeDisplayQuery } from "../utils/query.js";

export class BatchWriter {
  constructor(database, options = {}) {
    this.database = database;
    this.batchSize = options.batchSize ?? BATCH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs ?? BATCH_FLUSH_INTERVAL_MS;
    this.buffer = new Map();
    this.timer = null;
    this.metrics = {
      totalSearchSubmissions: 0,
      totalRowsWritten: 0,
      flushCount: 0
    };
  }

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.flush();
  }

  record(query) {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
      return;
    }

    const displayQuery = sanitizeDisplayQuery(query) || normalizedQuery;
    const existing = this.buffer.get(normalizedQuery) ?? {
      normalizedQuery,
      displayQuery,
      increment: 0
    };

    existing.increment += 1;
    existing.displayQuery = displayQuery;
    this.buffer.set(normalizedQuery, existing);
    this.metrics.totalSearchSubmissions += 1;

    if (this.buffer.size >= this.batchSize) {
      this.flush();
    }
  }

  flush() {
    if (!this.buffer.size) {
      return { rowsWritten: 0, flushedEntries: 0 };
    }

    const updates = [...this.buffer.values()];
    this.buffer.clear();
    const result = this.database.applyBatch(updates);
    this.metrics.flushCount += 1;
    this.metrics.totalRowsWritten += result.rowsWritten;

    return {
      rowsWritten: result.rowsWritten,
      flushedEntries: updates.length
    };
  }

  getPendingIncrement(normalizedQuery) {
    return this.buffer.get(normalizedQuery)?.increment ?? 0;
  }

  getPendingEntries() {
    return [...this.buffer.values()];
  }

  getStats() {
    const pendingSearches = [...this.buffer.values()].reduce(
      (total, entry) => total + entry.increment,
      0
    );
    const avoided = Math.max(0, this.metrics.totalSearchSubmissions - this.metrics.totalRowsWritten);
    const reduction = this.metrics.totalSearchSubmissions
      ? Number((avoided / this.metrics.totalSearchSubmissions).toFixed(2))
      : 0;

    return {
      ...this.metrics,
      pendingEntries: this.buffer.size,
      pendingSearches,
      pendingBufferedWrites: pendingSearches,
      databaseWritesAvoided: avoided,
      writeReduction: reduction
    };
  }
}
