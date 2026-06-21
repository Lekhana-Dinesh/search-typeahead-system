import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATABASE_PATH, MAX_SUGGESTIONS, TRENDING_CANDIDATE_LIMIT } from "../config.js";
import { getPrefixUpperBound, normalizeQuery, sanitizeDisplayQuery } from "../utils/query.js";

export class SearchDatabase {
  constructor(databasePath = DATABASE_PATH) {
    this.databasePath = databasePath;
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.stats = {
      readOperations: 0,
      writeOperations: 0,
      rowsWritten: 0
    };
    this.initialize();
  }

  initialize() {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        normalized_query TEXT NOT NULL UNIQUE,
        display_query TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_queries_normalized_query
        ON queries(normalized_query);
    `);
  }

  clearAll() {
    this.database.exec("DELETE FROM queries");
    this.stats.writeOperations += 1;
  }

  upsertQuery({ query, count }) {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
      return;
    }

    const displayQuery = sanitizeDisplayQuery(query) || normalizedQuery;
    const now = new Date().toISOString();
    const statement = this.database.prepare(`
      INSERT INTO queries (normalized_query, display_query, count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(normalized_query) DO UPDATE SET
        display_query = excluded.display_query,
        count = excluded.count,
        updated_at = excluded.updated_at
    `);

    statement.run(normalizedQuery, displayQuery, Number(count) || 0, now, now);
  }

  bulkUpsert(rows) {
    const now = new Date().toISOString();
    const statement = this.database.prepare(`
      INSERT INTO queries (normalized_query, display_query, count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(normalized_query) DO UPDATE SET
        display_query = excluded.display_query,
        count = excluded.count,
        updated_at = excluded.updated_at
    `);

    this.database.exec("BEGIN");

    try {
      for (const row of rows) {
        const normalizedQuery = normalizeQuery(row.query);
        if (!normalizedQuery) {
          continue;
        }

        const displayQuery = sanitizeDisplayQuery(row.query) || normalizedQuery;
        statement.run(normalizedQuery, displayQuery, Number(row.count) || 0, now, now);
      }

      this.database.exec("COMMIT");
      this.stats.writeOperations += 1;
      this.stats.rowsWritten += rows.length;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getQuery(normalizedQuery) {
    this.stats.readOperations += 1;
    return this.database
      .prepare(`
        SELECT normalized_query AS normalizedQuery, display_query AS displayQuery, count
        FROM queries
        WHERE normalized_query = ?
      `)
      .get(normalizedQuery);
  }

  getPrefixMatches(prefix, options = {}) {
    const normalizedPrefix = normalizeQuery(prefix);
    if (!normalizedPrefix) {
      return [];
    }

    const limit = Number(options.limit ?? MAX_SUGGESTIONS);
    const upperBound = getPrefixUpperBound(normalizedPrefix);
    this.stats.readOperations += 1;

    return this.database
      .prepare(`
        SELECT normalized_query AS normalizedQuery, display_query AS displayQuery, count
        FROM queries
        WHERE normalized_query >= ? AND normalized_query < ?
        ORDER BY count DESC, normalized_query ASC
        LIMIT ?
      `)
      .all(normalizedPrefix, upperBound, limit);
  }

  getPrefixCandidates(prefix, options = {}) {
    const normalizedPrefix = normalizeQuery(prefix);
    if (!normalizedPrefix) {
      return [];
    }

    const limit = Number(options.limit ?? TRENDING_CANDIDATE_LIMIT);
    const upperBound = getPrefixUpperBound(normalizedPrefix);
    this.stats.readOperations += 1;

    return this.database
      .prepare(`
        SELECT normalized_query AS normalizedQuery, display_query AS displayQuery, count
        FROM queries
        WHERE normalized_query >= ? AND normalized_query < ?
        ORDER BY count DESC, normalized_query ASC
        LIMIT ?
      `)
      .all(normalizedPrefix, upperBound, limit);
  }

  applyBatch(updates) {
    if (!updates.length) {
      return { rowsWritten: 0 };
    }

    const selectStatement = this.database.prepare(`
      SELECT normalized_query AS normalizedQuery, count
      FROM queries
      WHERE normalized_query = ?
    `);
    const updateStatement = this.database.prepare(`
      UPDATE queries
      SET count = ?, display_query = ?, updated_at = ?
      WHERE normalized_query = ?
    `);
    const insertStatement = this.database.prepare(`
      INSERT INTO queries (normalized_query, display_query, count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();

    this.database.exec("BEGIN");

    try {
      for (const update of updates) {
        const existing = selectStatement.get(update.normalizedQuery);
        if (existing) {
          updateStatement.run(
            existing.count + update.increment,
            update.displayQuery,
            now,
            update.normalizedQuery
          );
        } else {
          insertStatement.run(
            update.normalizedQuery,
            update.displayQuery,
            update.increment,
            now,
            now
          );
        }
      }

      this.database.exec("COMMIT");
      this.stats.writeOperations += 1;
      this.stats.rowsWritten += updates.length;
      return { rowsWritten: updates.length };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getTopQueries(limit = MAX_SUGGESTIONS) {
    this.stats.readOperations += 1;
    return this.database
      .prepare(`
        SELECT normalized_query AS normalizedQuery, display_query AS displayQuery, count
        FROM queries
        ORDER BY count DESC, normalized_query ASC
        LIMIT ?
      `)
      .all(limit);
  }

  countRows() {
    this.stats.readOperations += 1;
    const result = this.database.prepare("SELECT COUNT(*) AS total FROM queries").get();
    return result?.total ?? 0;
  }

  getStats() {
    return {
      ...this.stats
    };
  }

  close() {
    this.database.close();
  }
}
