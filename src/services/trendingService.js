import { MAX_SUGGESTIONS, TRENDING_BOOST, TRENDING_WINDOW_MS } from "../config.js";
import { normalizeQuery } from "../utils/query.js";

export class TrendingService {
  constructor(options = {}) {
    this.windowMs = options.windowMs ?? TRENDING_WINDOW_MS;
    this.trendingBoost = options.trendingBoost ?? TRENDING_BOOST;
    this.activity = new Map();
    this.now = options.now ?? (() => Date.now());
  }

  record(query) {
    const timestamps = this.activity.get(query) ?? [];
    timestamps.push(this.now());
    this.activity.set(query, timestamps);
    this.pruneQuery(query);
  }

  pruneQuery(query) {
    const timestamps = this.activity.get(query);
    if (!timestamps) {
      return;
    }

    const cutoff = this.now() - this.windowMs;
    const filtered = timestamps.filter((timestamp) => timestamp >= cutoff);

    if (filtered.length) {
      this.activity.set(query, filtered);
    } else {
      this.activity.delete(query);
    }
  }

  getRecentCount(query) {
    this.pruneQuery(query);
    return this.activity.get(query)?.length ?? 0;
  }

  score(allTimeCount, recentCount) {
    return allTimeCount + recentCount * this.trendingBoost;
  }

  rank(candidates, limit = MAX_SUGGESTIONS) {
    return [...candidates]
      .map((candidate) => {
        const recentCount = this.getRecentCount(candidate.normalizedQuery);
        return {
          ...candidate,
          recentCount,
          score: this.score(candidate.count, recentCount)
        };
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        if (right.count !== left.count) {
          return right.count - left.count;
        }

        return left.normalizedQuery.localeCompare(right.normalizedQuery);
      })
      .slice(0, limit);
  }

  getTopRecentEntries(limit = MAX_SUGGESTIONS) {
    const entries = [];

    for (const query of this.activity.keys()) {
      const recentCount = this.getRecentCount(query);
      if (!recentCount) {
        continue;
      }

      entries.push({ normalizedQuery: query, recentCount });
    }

    return entries
      .sort((left, right) => {
        if (right.recentCount !== left.recentCount) {
          return right.recentCount - left.recentCount;
        }

        return left.normalizedQuery.localeCompare(right.normalizedQuery);
      })
      .slice(0, limit);
  }

  getRecentEntriesForPrefix(prefix) {
    const normalizedPrefix = normalizeQuery(prefix);
    if (!normalizedPrefix) {
      return [];
    }

    const entries = [];

    for (const query of this.activity.keys()) {
      const recentCount = this.getRecentCount(query);
      if (!recentCount || !query.startsWith(normalizedPrefix)) {
        continue;
      }

      entries.push({ normalizedQuery: query, recentCount });
    }

    return entries.sort((left, right) => {
      if (right.recentCount !== left.recentCount) {
        return right.recentCount - left.recentCount;
      }

      return left.normalizedQuery.localeCompare(right.normalizedQuery);
    });
  }
}
