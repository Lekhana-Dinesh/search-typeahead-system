import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp, registerFinalHandlers } from "./src/api/createApp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shouldServeDist = process.argv.includes("--serve-dist");
const port = Number(process.env.API_PORT ?? 3001);

const { app, services } = createApp({
  registerFinalHandlers: !shouldServeDist
});

if (shouldServeDist) {
  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));
  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/suggest") || request.path.startsWith("/search") || request.path.startsWith("/cache") || request.path.startsWith("/trending") || request.path.startsWith("/metrics")) {
      next();
      return;
    }

    response.sendFile(path.join(distPath, "index.html"));
  });

  registerFinalHandlers(app);
}

const server = app.listen(port, () => {
  services.batchWriter.start();
  console.log(`Search typeahead API listening on http://localhost:${port}`);
});

const shutdown = () => {
  services.batchWriter.stop();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
