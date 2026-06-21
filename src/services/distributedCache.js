import { CACHE_NODE_NAMES, CACHE_TTL_MS, CACHE_VIRTUAL_NODES } from "../config.js";
import { normalizeQuery } from "../utils/query.js";
import { ConsistentHashRing } from "./consistentHashRing.js";

class CacheNode {
  constructor(name) {
    this.name = name;
    this.entries = new Map();
    this.stats = {
      hits: 0,
      misses: 0
    };
  }

  get(key) {
    const entry = this.entries.get(key);

    if (!entry) {
      this.stats.misses += 1;
      return { status: "miss" };
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      this.stats.misses += 1;
      return { status: "expired" };
    }

    this.stats.hits += 1;
    return { status: "hit", value: entry.value, expiresAt: entry.expiresAt };
  }

  peek(key) {
    const entry = this.entries.get(key);
    if (!entry) {
      return { status: "miss" };
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return { status: "expired", expiresAt: entry.expiresAt };
    }

    return { status: "hit", expiresAt: entry.expiresAt, value: entry.value };
  }

  set(key, value, ttlMs) {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  delete(key) {
    return this.entries.delete(key);
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total ? Number((this.stats.hits / total).toFixed(2)) : 0,
      keys: this.entries.size
    };
  }
}

export class DistributedCache {
  constructor(options = {}) {
    this.nodeNames = options.nodeNames ?? CACHE_NODE_NAMES;
    this.ttlMs = options.ttlMs ?? CACHE_TTL_MS;
    this.ring = options.ring ?? new ConsistentHashRing(this.nodeNames, options.virtualNodeCount ?? CACHE_VIRTUAL_NODES);
    this.nodes = new Map(this.nodeNames.map((nodeName) => [nodeName, new CacheNode(nodeName)]));
  }

  buildKey(prefix, ranking) {
    return `${ranking}:${prefix}`;
  }

  get(prefix, ranking = "basic") {
    const key = this.buildKey(prefix, ranking);
    const assignment = this.ring.getAssignment(key);
    const node = this.nodes.get(assignment.nodeName);
    const result = node.get(key);

    return {
      ...result,
      key,
      prefix,
      ranking,
      hash: assignment.hash,
      nodeName: assignment.nodeName,
      log: `[cache] prefix="${prefix}" ranking="${ranking}" hash=${assignment.hash} node=${assignment.nodeName} status=${result.status}`
    };
  }

  set(prefix, ranking, value, ttlMs = this.ttlMs) {
    const key = this.buildKey(prefix, ranking);
    const assignment = this.ring.getAssignment(key);
    const node = this.nodes.get(assignment.nodeName);
    node.set(key, value, ttlMs);

    return {
      key,
      prefix,
      ranking,
      hash: assignment.hash,
      nodeName: assignment.nodeName
    };
  }

  invalidate(prefixes, rankings = ["basic", "trending"]) {
    let invalidated = 0;

    for (const prefix of prefixes) {
      for (const ranking of rankings) {
        const key = this.buildKey(prefix, ranking);
        const assignment = this.ring.getAssignment(key);
        const node = this.nodes.get(assignment.nodeName);
        if (node.delete(key)) {
          invalidated += 1;
        }
      }
    }

    return invalidated;
  }

  debug(prefix, ranking = "basic") {
    const normalizedPrefix = normalizeQuery(prefix);
    const key = this.buildKey(normalizedPrefix, ranking);
    const assignment = this.ring.getAssignment(key);
    const node = this.nodes.get(assignment.nodeName);
    const result = node.peek(key);
    const ttlSecondsRemaining = result.expiresAt
      ? Math.max(0, Math.ceil((result.expiresAt - Date.now()) / 1000))
      : null;

    return {
      prefix: normalizedPrefix,
      ranking,
      key,
      assignedNode: assignment.nodeName,
      hash: assignment.hash,
      cacheStatus: result.status,
      ttlSecondsRemaining,
      stats: node.getStats()
    };
  }

  getClusterStats() {
    const nodes = [];
    let hits = 0;
    let misses = 0;

    for (const [nodeName, node] of this.nodes.entries()) {
      const stats = node.getStats();
      hits += stats.hits;
      misses += stats.misses;
      nodes.push({ nodeName, ...stats });
    }

    const total = hits + misses;

    return {
      hits,
      misses,
      hitRate: total ? Number((hits / total).toFixed(2)) : 0,
      nodes
    };
  }
}
