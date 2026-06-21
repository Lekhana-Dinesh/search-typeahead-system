import express from "express";
import { SearchDatabase } from "../db/database.js";
import { DistributedCache } from "../services/distributedCache.js";
import { TrendingService } from "../services/trendingService.js";
import { BatchWriter } from "../services/batchWriter.js";
import { SuggestionService } from "../services/suggestionService.js";
import { SearchService } from "../services/searchService.js";
import { normalizeQuery } from "../utils/query.js";

export function registerFinalHandlers(app) {
  app.use((request, response) => {
    response.status(404).json({
      message: `Route not found: ${request.method} ${request.originalUrl}`
    });
  });

  app.use((error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error?.type === "entity.parse.failed") {
      response.status(400).json({
        message: "Invalid JSON body."
      });
      return;
    }

    console.error("[api] unhandled error", error);
    response.status(500).json({
      message: "Internal server error."
    });
  });
}

export function createServices(overrides = {}) {
  const database = overrides.database ?? new SearchDatabase(overrides.databasePath);
  const cache = overrides.cache ?? new DistributedCache(overrides.cacheOptions);
  const trendingService = overrides.trendingService ?? new TrendingService(overrides.trendingOptions);
  const batchWriter = overrides.batchWriter ?? new BatchWriter(database, overrides.batchOptions);
  const suggestionService = overrides.suggestionService ?? new SuggestionService({
    database,
    cache,
    trendingService,
    batchWriter
  });
  const searchService = overrides.searchService ?? new SearchService({
    batchWriter,
    cache,
    trendingService
  });

  return {
    database,
    cache,
    trendingService,
    batchWriter,
    suggestionService,
    searchService
  };
}

export function createApp(overrides = {}) {
  const app = express();
  const services = createServices(overrides);

  app.use(express.json());

  app.get("/suggest", (request, response) => {
    const prefix = String(request.query.q ?? "");
    const ranking = request.query.ranking === "trending" ? "trending" : "basic";
    const payload = services.suggestionService.getSuggestions(prefix, ranking);
    response.json(payload);
  });

  app.post("/search", (request, response) => {
    const payload = services.searchService.recordSearch(request.body?.query);
    if (!payload.ok) {
      response.status(400).json({ message: payload.message });
      return;
    }

    response.json({ message: payload.message });
  });

  app.get("/cache/debug", (request, response) => {
    const prefix = normalizeQuery(String(request.query.prefix ?? request.query.q ?? ""));
    const ranking = request.query.ranking === "trending" ? "trending" : "basic";
    response.json(services.cache.debug(prefix, ranking));
  });

  app.get("/trending", (request, response) => {
    const limit = Number(request.query.limit ?? 10);
    response.json({
      windowMinutes: Math.round(services.trendingService.windowMs / 60_000),
      boost: services.trendingService.trendingBoost,
      suggestions: services.suggestionService.getTrendingList(limit)
    });
  });

  app.get("/metrics", (request, response) => {
    response.json({
      cache: services.cache.getClusterStats(),
      batchWriter: services.batchWriter.getStats(),
      database: services.database.getStats(),
      indexedQueries: services.database.countRows(),
    });
  });

  if (overrides.registerFinalHandlers ?? true) {
    registerFinalHandlers(app);
  }

  return { app, services };
}
