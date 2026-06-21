import { MAX_SUGGESTIONS } from "../config.js";
import { normalizeQuery } from "../utils/query.js";

export class SuggestionService {
  constructor({ database, cache, trendingService, batchWriter, maxSuggestions = MAX_SUGGESTIONS }) {
    this.database = database;
    this.cache = cache;
    this.trendingService = trendingService;
    this.batchWriter = batchWriter;
    this.maxSuggestions = maxSuggestions;
  }

  getSuggestions(rawPrefix, ranking = "basic") {
    const prefix = normalizeQuery(rawPrefix);
    if (!prefix) {
      return {
        query: "",
        ranking,
        suggestions: [],
        source: "none",
        cacheStatus: "skipped",
        cacheNode: null,
        latencyMs: 0
      };
    }

    const startTime = performance.now();
    const cached = this.cache.get(prefix, ranking);
    console.log(cached.log);

    if (cached.status === "hit") {
      return {
        ...cached.value,
        latencyMs: Number((performance.now() - startTime).toFixed(2)),
        source: "cache",
        cacheStatus: "hit",
        cacheNode: cached.nodeName
      };
    }

    const suggestions = this.buildSuggestions(prefix, ranking);
    const response = {
      query: prefix,
      ranking,
      suggestions,
      source: "database",
      cacheStatus: cached.status === "expired" ? "expired" : "miss",
      cacheNode: cached.nodeName,
      latencyMs: Number((performance.now() - startTime).toFixed(2))
    };

    this.cache.set(prefix, ranking, response);
    return response;
  }

  buildSuggestions(prefix, ranking) {
    const fromDatabase = ranking === "trending"
      ? this.database.getPrefixCandidates(prefix)
      : this.database.getPrefixMatches(prefix, { limit: this.maxSuggestions });

    const combined = ranking === "trending"
      ? this.mergeTrendingCandidates(fromDatabase, prefix)
      : this.mergePendingEntries(fromDatabase, prefix);
    const ranked = ranking === "trending"
      ? this.trendingService.rank(combined, this.maxSuggestions)
      : combined
          .map((candidate) => ({
            ...candidate,
            recentCount: this.trendingService.getRecentCount(candidate.normalizedQuery),
            score: candidate.count
          }))
          .sort((left, right) => {
            if (right.count !== left.count) {
              return right.count - left.count;
            }

            return left.normalizedQuery.localeCompare(right.normalizedQuery);
          })
          .slice(0, this.maxSuggestions);

    return ranked.map((candidate) => ({
      query: candidate.displayQuery,
      normalizedQuery: candidate.normalizedQuery,
      count: candidate.count,
      recentCount: candidate.recentCount,
      score: candidate.score
    }));
  }

  mergePendingEntries(databaseCandidates, prefix) {
    const candidateMap = new Map();

    for (const candidate of databaseCandidates) {
      candidateMap.set(candidate.normalizedQuery, {
        ...candidate
      });
    }

    for (const pending of this.batchWriter.getPendingEntries()) {
      if (!pending.normalizedQuery.startsWith(prefix)) {
        continue;
      }

      const existing = candidateMap.get(pending.normalizedQuery);
      if (existing) {
        existing.count += pending.increment;
      } else {
        candidateMap.set(pending.normalizedQuery, {
          normalizedQuery: pending.normalizedQuery,
          displayQuery: pending.displayQuery,
          count: pending.increment
        });
      }
    }

    return [...candidateMap.values()];
  }

  mergeTrendingCandidates(databaseCandidates, prefix) {
    const candidateMap = new Map();

    for (const candidate of this.mergePendingEntries(databaseCandidates, prefix)) {
      candidateMap.set(candidate.normalizedQuery, candidate);
    }

    for (const recentEntry of this.trendingService.getRecentEntriesForPrefix(prefix)) {
      if (candidateMap.has(recentEntry.normalizedQuery)) {
        continue;
      }

      const databaseRow = this.database.getQuery(recentEntry.normalizedQuery);
      const pendingIncrement = this.batchWriter.getPendingIncrement(recentEntry.normalizedQuery);
      candidateMap.set(recentEntry.normalizedQuery, {
        normalizedQuery: recentEntry.normalizedQuery,
        displayQuery: databaseRow?.displayQuery ?? recentEntry.normalizedQuery,
        count: (databaseRow?.count ?? 0) + pendingIncrement
      });
    }

    return [...candidateMap.values()];
  }

  getTrendingList(limit = MAX_SUGGESTIONS) {
    const recentEntries = this.trendingService.getTopRecentEntries(limit * 3);

    const combined = recentEntries.map((entry) => {
      const databaseRow = this.database.getQuery(entry.normalizedQuery);
      const pendingIncrement = this.batchWriter.getPendingIncrement(entry.normalizedQuery);
      const allTimeCount = (databaseRow?.count ?? 0) + pendingIncrement;

      return {
        normalizedQuery: entry.normalizedQuery,
        displayQuery: databaseRow?.displayQuery ?? entry.normalizedQuery,
        count: allTimeCount,
        recentCount: entry.recentCount,
        score: this.trendingService.score(allTimeCount, entry.recentCount)
      };
    });

    return combined
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.normalizedQuery.localeCompare(right.normalizedQuery);
      })
      .slice(0, limit)
      .map((entry) => ({
        query: entry.displayQuery,
        normalizedQuery: entry.normalizedQuery,
        count: entry.count,
        recentCount: entry.recentCount,
        score: entry.score
      }));
  }
}
