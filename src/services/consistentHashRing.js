import crypto from "node:crypto";

function hashValue(input) {
  const digest = crypto.createHash("sha256").update(input).digest("hex");
  return Number.parseInt(digest.slice(0, 12), 16);
}

export class ConsistentHashRing {
  constructor(nodeNames, virtualNodeCount = 40) {
    this.nodeNames = [...nodeNames];
    this.virtualNodeCount = virtualNodeCount;
    this.ring = [];

    for (const nodeName of this.nodeNames) {
      for (let replica = 0; replica < this.virtualNodeCount; replica += 1) {
        this.ring.push({
          hash: hashValue(`${nodeName}#${replica}`),
          nodeName
        });
      }
    }

    this.ring.sort((left, right) => left.hash - right.hash);
  }

  getAssignment(key) {
    const keyHash = hashValue(key);
    const node = this.ring.find((entry) => entry.hash >= keyHash) ?? this.ring[0];

    return {
      key,
      hash: keyHash,
      nodeName: node.nodeName
    };
  }
}
