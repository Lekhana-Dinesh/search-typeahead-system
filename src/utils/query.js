export function normalizeQuery(input) {
  return String(input ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function sanitizeDisplayQuery(input) {
  return String(input ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function getPrefixUpperBound(prefix) {
  return `${prefix}\uffff`;
}

export function getPrefixes(query) {
  const normalized = normalizeQuery(query);
  const prefixes = [];

  for (let index = 1; index <= normalized.length; index += 1) {
    prefixes.push(normalized.slice(0, index));
  }

  return prefixes;
}
