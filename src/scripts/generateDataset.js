import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DATASET_PATH } from "../config.js";

const TARGET_SIZE = Number(process.env.DATASET_SIZE ?? 100_000);
const DEFAULT_PROGRESS_EVERY = 10_000;
const numberFormatter = new Intl.NumberFormat("en-US");

const brands = [
  "iphone", "samsung", "sony", "lg", "oneplus", "xiaomi", "oppo", "vivo",
  "apple", "macbook", "dell", "hp", "lenovo", "asus", "acer", "nintendo",
  "playstation", "xbox", "tesla", "toyota", "honda", "hyundai", "kia",
  "adidas", "nike", "puma", "reebok", "zara", "uniqlo", "ikea", "spotify",
  "netflix", "youtube", "instagram", "whatsapp", "slack", "notion", "figma"
];

const productTypes = [
  "phone", "case", "charger", "wireless earbuds", "laptop", "tablet", "smart watch",
  "monitor", "headphones", "gaming console", "controller", "running shoes", "backpack",
  "office chair", "standing desk", "protein powder", "coffee maker", "air fryer",
  "vacuum cleaner", "water bottle", "travel bag", "sunscreen", "face wash", "sofa"
];

const modifiers = [
  "best", "cheap", "premium", "budget", "wireless", "fast charging", "mini", "pro",
  "max", "ultra", "review", "price", "discount", "offer", "near me", "for students",
  "for office", "for gaming", "for travel", "for beginners", "vs", "specs", "used"
];

const intents = [
  "buy", "compare", "review", "price", "features", "setup", "repair", "accessories",
  "replacement", "tutorial", "download", "coupon", "warranty", "launch date"
];

const locations = [
  "new york", "san francisco", "seattle", "chicago", "boston", "austin", "miami",
  "los angeles", "denver", "atlanta", "london", "dubai", "singapore", "tokyo", "sydney"
];

const travelTopics = [
  "flight tickets", "weekend getaway", "hotel deals", "visa status", "travel insurance",
  "beach resorts", "mountain trips", "city guide", "road trip planner", "honeymoon places"
];

const codingTopics = [
  "react hooks", "node express", "system design", "sql joins", "python tutorial",
  "javascript interview questions", "docker compose", "redis caching", "api testing", "vite setup"
];

const foodTopics = [
  "pizza", "biryani", "coffee", "sushi", "burger", "meal prep", "protein snacks",
  "vegan recipes", "smoothie bowl", "healthy breakfast"
];

const years = ["2023", "2024", "2025", "2026", "2027"];
const audiences = ["students", "developers", "beginners", "families", "travelers", "gamers"];
const templatesPerCycle = 6;

function pseudoRandom(seed) {
  const value = Math.sin(seed * 12_345.6789) * 10_000;
  return value - Math.floor(value);
}

function takeFrom(values, state) {
  return {
    value: values[state % values.length],
    nextState: Math.floor(state / values.length)
  };
}

function buildUniqueQuery(index) {
  const template = index % templatesPerCycle;
  let state = Math.floor(index / templatesPerCycle);

  switch (template) {
    case 0: {
      const modifier = takeFrom(modifiers, state);
      const brand = takeFrom(brands, modifier.nextState);
      const product = takeFrom(productTypes, brand.nextState);
      const year = takeFrom(years, product.nextState);
      return `${modifier.value} ${brand.value} ${product.value} ${year.value}`;
    }

    case 1: {
      const brand = takeFrom(brands, state);
      const product = takeFrom(productTypes, brand.nextState);
      const intent = takeFrom(intents, product.nextState);
      const audience = takeFrom(audiences, intent.nextState);
      return `${brand.value} ${product.value} ${intent.value} for ${audience.value}`;
    }

    case 2: {
      const modifier = takeFrom(modifiers, state);
      const product = takeFrom(productTypes, modifier.nextState);
      const location = takeFrom(locations, product.nextState);
      const audience = takeFrom(audiences, location.nextState);
      return `${modifier.value} ${product.value} in ${location.value} for ${audience.value}`;
    }

    case 3: {
      const travelTopic = takeFrom(travelTopics, state);
      const location = takeFrom(locations, travelTopic.nextState);
      const modifier = takeFrom(modifiers, location.nextState);
      const year = takeFrom(years, modifier.nextState);
      const intent = takeFrom(intents, year.nextState);
      return `${travelTopic.value} ${modifier.value} ${intent.value} in ${location.value} ${year.value}`;
    }

    case 4: {
      const codingTopic = takeFrom(codingTopics, state);
      const intent = takeFrom(intents, codingTopic.nextState);
      const audience = takeFrom(audiences, intent.nextState);
      const year = takeFrom(years, audience.nextState);
      const modifier = takeFrom(modifiers, year.nextState);
      return `how to ${intent.value} ${codingTopic.value} ${modifier.value} for ${audience.value} ${year.value}`;
    }

    default: {
      const foodTopic = takeFrom(foodTopics, state);
      const modifier = takeFrom(modifiers, foodTopic.nextState);
      const location = takeFrom(locations, modifier.nextState);
      const audience = takeFrom(audiences, location.nextState);
      return `${foodTopic.value} ${modifier.value} in ${location.value} for ${audience.value}`;
    }
  }
}

function buildCount(index) {
  const headCurve = Math.floor(850_000 / Math.sqrt(index + 1));
  const noise = Math.floor(pseudoRandom(index + 1) * 2_500);
  return Math.max(1, headCurve + noise);
}

export function generateDataset(outputPath = DEFAULT_DATASET_PATH, targetSize = TARGET_SIZE, options = {}) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const logger = options.logger ?? console;
  const progressEvery = Number(options.progressEvery ?? DEFAULT_PROGRESS_EVERY);
  const startedAt = Date.now();

  const commonHeadQueries = [
    ["iphone 15 pro max price", 950000],
    ["samsung galaxy s24 ultra review", 910000],
    ["macbook air m3 benchmark", 870000],
    ["wireless earbuds with anc", 830000],
    ["best laptop for college students", 790000],
    ["react useeffect cleanup example", 750000],
    ["flight tickets to dubai", 710000],
    ["pizza delivery near times square", 680000],
    ["travel insurance for europe trip", 650000],
    ["running shoes for half marathon", 620000]
  ];

  const stream = fs.createWriteStream(outputPath);
  stream.write("query,count\n");
  logger.log(`[seed] CSV generation started (${numberFormatter.format(targetSize)} rows)`);

  for (const [query, count] of commonHeadQueries) {
    stream.write(`${query},${count}\n`);
  }

  let generatedRows = commonHeadQueries.length;
  const remainingRows = Math.max(0, targetSize - commonHeadQueries.length);

  for (let index = 0; index < remainingRows; index += 1) {
    const query = buildUniqueQuery(index);
    const currentRowNumber = generatedRows + 1;
    stream.write(`${query},${buildCount(currentRowNumber)}\n`);
    generatedRows += 1;

    if (generatedRows % progressEvery === 0 || generatedRows === targetSize) {
      logger.log(`[seed] CSV generation progress: ${numberFormatter.format(generatedRows)}/${numberFormatter.format(targetSize)}`);
    }
  }

  stream.end();

  return new Promise((resolve) => {
    stream.on("finish", () => resolve({
      outputPath,
      rows: generatedRows,
      durationMs: Date.now() - startedAt
    }));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const outputPath = process.argv[2] ?? DEFAULT_DATASET_PATH;
  const size = Number(process.argv[3] ?? TARGET_SIZE);
  generateDataset(outputPath, size)
    .then((result) => {
      console.log(`[seed] CSV generation completed in ${result.durationMs}ms`);
      console.log(`[seed] Generated ${result.rows} rows at ${result.outputPath}`);
    })
    .catch((error) => {
      console.error("Failed to generate dataset", error);
      process.exitCode = 1;
    });
}
