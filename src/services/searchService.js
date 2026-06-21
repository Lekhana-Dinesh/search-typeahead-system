import { getPrefixes, normalizeQuery, sanitizeDisplayQuery } from "../utils/query.js";

export class SearchService {
  constructor({ batchWriter, cache, trendingService }) {
    this.batchWriter = batchWriter;
    this.cache = cache;
    this.trendingService = trendingService;
  }

  recordSearch(query) {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
      return {
        ok: false,
        message: "Query is required."
      };
    }

    const displayQuery = sanitizeDisplayQuery(query) || normalizedQuery;
    this.trendingService.record(normalizedQuery);
    this.batchWriter.record(displayQuery);
    const invalidated = this.cache.invalidate(getPrefixes(normalizedQuery));

    return {
      ok: true,
      message: "Searched",
      invalidatedPrefixes: invalidated
    };
  }
}
