import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 280;

async function readJson(response) {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }

  return payload;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [ranking, setRanking] = useState("basic");
  const [suggestions, setSuggestions] = useState([]);
  const [debug, setDebug] = useState(null);
  const [cacheDebug, setCacheDebug] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [trending, setTrending] = useState([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [submittingSearch, setSubmittingSearch] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const activeRequest = useRef(null);

  useEffect(() => {
    loadTrending();
    loadMetrics();
  }, []);

  useEffect(() => {
    if (activeRequest.current) {
      activeRequest.current.abort();
      activeRequest.current = null;
    }

    if (!query.trim()) {
      setSuggestions([]);
      setDebug(null);
      setCacheDebug(null);
      setLoadingSuggestions(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      const controller = new AbortController();
      activeRequest.current = controller;
      setLoadingSuggestions(true);
      setError("");

      try {
        const params = new URLSearchParams({
          q: query,
          ranking
        });
        const payload = await readJson(
          await fetch(`/suggest?${params.toString()}`, { signal: controller.signal })
        );
        setSuggestions(payload.suggestions);
        setDebug(payload);
        await loadCacheDebug(query, ranking);
        setHighlightedIndex(-1);
        setShowSuggestions(true);
        await loadMetrics();
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          setError(requestError.message);
        }
      } finally {
        setLoadingSuggestions(false);
        if (activeRequest.current === controller) {
          activeRequest.current = null;
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controllerCleanup();
    };
  }, [query, ranking]);

  function controllerCleanup() {
    if (activeRequest.current) {
      activeRequest.current.abort();
      activeRequest.current = null;
    }
  }

  async function loadTrending() {
    try {
      const payload = await readJson(await fetch("/trending?limit=8"));
      setTrending(payload.suggestions);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function loadMetrics() {
    try {
      const payload = await readJson(await fetch("/metrics"));
      setMetrics(payload);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function loadCacheDebug(prefix, rankingMode) {
    if (!prefix.trim()) {
      setCacheDebug(null);
      return;
    }

    try {
      const params = new URLSearchParams({
        prefix,
        ranking: rankingMode
      });
      const payload = await readJson(await fetch(`/cache/debug?${params.toString()}`));
      setCacheDebug(payload);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function submitSearch(value) {
    const submittedQuery = value.trim();
    if (!submittedQuery) {
      return;
    }

    setSubmittingSearch(true);
    setError("");

    try {
      await readJson(
        await fetch("/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ query: submittedQuery })
        })
      );

      setSearchMessage(submittedQuery);
      setQuery(submittedQuery);
      setShowSuggestions(false);
      await Promise.all([loadTrending(), loadMetrics()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmittingSearch(false);
    }
  }

  function handleKeyDown(event) {
    if (!suggestions.length) {
      if (event.key === "Enter") {
        event.preventDefault();
        submitSearch(query);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setShowSuggestions(true);
      setHighlightedIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setShowSuggestions(true);
      setHighlightedIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
      return;
    }

    if (event.key === "Escape") {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected = highlightedIndex >= 0 ? suggestions[highlightedIndex].query : query;
      submitSearch(selected);
    }
  }

  const indexedQueries = metrics?.indexedQueries?.toLocaleString() ?? "0";
  const cacheNodeCount = metrics?.cache?.nodes?.length ?? 3;
  const cacheNodes = metrics?.cache?.nodes ?? [];
  const visibleTrends = trending.slice(0, 4);
  const suggestionPanelOpen = showSuggestions && Boolean(query.trim());
  const requestRows = [
    ["Ranking", formatMode(debug?.ranking ?? ranking)],
    ["Source", debug?.source ?? "-"],
    ["Cache status", debug?.cacheStatus ?? cacheDebug?.cacheStatus ?? "-"],
    ["Cache node", debug?.cacheNode ?? "-"],
    ["Latency", `${debug?.latencyMs ?? 0} ms`],
    ["TTL", `${cacheDebug?.ttlSecondsRemaining ?? "-"} s`]
  ];
  const writeRows = [
    ["Submissions", metrics?.batchWriter?.totalSearchSubmissions ?? 0],
    ["Flushes", metrics?.batchWriter?.flushCount ?? 0],
    ["Pending entries", metrics?.batchWriter?.pendingEntries ?? 0],
    ["Pending searches", metrics?.batchWriter?.pendingSearches ?? 0],
    ["Writes avoided", metrics?.batchWriter?.databaseWritesAvoided ?? 0],
    ["Reduction", formatPercent(metrics?.batchWriter?.writeReduction)]
  ];

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="brand-block">
          <div className="brand-mark">SI</div>
          <div className="brand-copy">
            <p className="brand-name">SearchIQ</p>
          </div>
        </div>

        <div className="header-meta">
          <MetaPill label="Indexed" value={indexedQueries} />
          <MetaPill label="Cache nodes" value={cacheNodeCount} />
          <MetaPill label="Source" value="SQLite" />
        </div>
      </header>

      <main className="content-shell">
        <section className="hero-section">
          <p className="hero-eyebrow">Search infrastructure</p>
          <h1>Fast typeahead with cache-aware ranking</h1>
          <p className="hero-subtitle">
            Serve prefix suggestions from SQLite, route cache keys with consistent
            hashing, and blend recent activity into ranking.
          </p>

          <div className="search-module card">
            <div className="search-module-header">
              <div className="ranking-toggle" role="tablist" aria-label="Ranking mode">
                <button
                  className={ranking === "basic" ? "toggle active" : "toggle"}
                  onClick={() => setRanking("basic")}
                  type="button"
                >
                  Basic
                </button>
                <button
                  className={ranking === "trending" ? "toggle active" : "toggle"}
                  onClick={() => setRanking("trending")}
                  type="button"
                >
                  Trending
                </button>
              </div>

              <p className="search-helper">Top 10 suggestions / 280ms debounce</p>
            </div>

            <div className={suggestionPanelOpen ? "search-stack open" : "search-stack"}>
              <div className="search-row">
                <input
                  aria-label="Search query"
                  className="search-input"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSearchMessage("");
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    window.setTimeout(() => setShowSuggestions(false), 120);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search for products, tutorials, destinations..."
                />
                <button
                  className="search-button"
                  onClick={() => submitSearch(query)}
                  type="button"
                  disabled={submittingSearch}
                >
                  {submittingSearch ? "Recording..." : "Search"}
                </button>
              </div>

              {suggestionPanelOpen && (
                <div className="suggestion-panel" role="listbox" aria-label="Suggestions">
                  <div className="suggestion-meta">
                    <strong>
                      {loadingSuggestions
                        ? "Refreshing suggestions"
                        : `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}`}
                    </strong>
                    <span>{formatMode(ranking)} ranking</span>
                  </div>

                  {loadingSuggestions && <p className="status-line">Loading suggestions...</p>}

                  {!loadingSuggestions &&
                    suggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.normalizedQuery}-${index}`}
                        className={highlightedIndex === index ? "suggestion-row active" : "suggestion-row"}
                        onMouseDown={() => {
                          setQuery(suggestion.query);
                          submitSearch(suggestion.query);
                        }}
                        type="button"
                      >
                        <span className="suggestion-query">{suggestion.query}</span>
                        <div className="suggestion-values">
                          <span>{suggestion.count.toLocaleString()} count</span>
                          {ranking === "trending" && (
                            <span>{suggestion.score.toLocaleString()} score</span>
                          )}
                        </div>
                      </button>
                    ))}

                  {!loadingSuggestions && suggestions.length === 0 && (
                    <p className="status-line">No suggestions found for "{query.trim()}".</p>
                  )}
                </div>
              )}
            </div>

            {searchMessage && (
              <p className="success-banner">Search recorded for "{searchMessage}".</p>
            )}
            {error && <p className="error-banner">{error}</p>}

            <div className="inline-metrics">
              <InlineStat label="Cache hit rate" value={formatPercent(metrics?.cache?.hitRate)} />
              <InlineStat
                label="Writes avoided"
                value={metrics?.batchWriter?.databaseWritesAvoided?.toLocaleString() ?? "0"}
              />
              <InlineStat
                label="Write reduction"
                value={formatPercent(metrics?.batchWriter?.writeReduction)}
              />
            </div>
          </div>
        </section>

        <section className="evidence-grid">
          <article className="evidence-card card">
            <div className="card-copy">
              <h2>Request insights</h2>
              <p>Ranking path, source selection, and cache response details.</p>
            </div>

            <div className="key-value-list">
              {requestRows.map(([label, value]) => (
                <KeyValueRow key={label} label={label} value={value} />
              ))}
            </div>
          </article>

          <article className="evidence-card card">
            <div className="card-copy">
              <h2>Write optimization</h2>
              <p>Submission buffering and write reduction from aggregated updates.</p>
            </div>

            <div className="key-value-list">
              {writeRows.map(([label, value]) => (
                <KeyValueRow key={label} label={label} value={value} />
              ))}
            </div>
          </article>

          <article className="evidence-card card">
            <div className="card-copy">
              <h2>Signals</h2>
              <p>Recent activity ranking and logical cache ownership at a glance.</p>
            </div>

            <div className="signal-section">
              <div className="signal-header">
                <h3>Live trends</h3>
                <code className="formula-line">
                  score = allTimeCount + recentCountLastHour * 50
                </code>
              </div>

              <div className="signal-list">
                {visibleTrends.length === 0 && (
                  <p className="status-line compact">
                    Recent activity appears here after searches are recorded.
                  </p>
                )}

                {visibleTrends.map((item, index) => (
                  <button
                    key={`${item.normalizedQuery}-${index}`}
                    className="signal-row"
                    onClick={() => {
                      setQuery(item.query);
                      setShowSuggestions(true);
                    }}
                    type="button"
                  >
                    <span className="suggestion-query">{item.query}</span>
                    <div className="suggestion-values">
                      <span>{item.recentCount} recent</span>
                      <span>{item.score.toLocaleString()} score</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="signal-section">
              <div className="signal-header">
                <h3>Cache ring</h3>
                <p>Consistent hashing routes each prefix to one logical node.</p>
              </div>

              <div className="signal-list">
                {cacheNodes.length === 0 && (
                  <p className="status-line compact">
                    Cache node metrics appear here once the latest totals are loaded.
                  </p>
                )}

                {cacheNodes.map((node) => (
                  <div className="signal-row static" key={node.nodeName}>
                    <span className="suggestion-query">{node.nodeName}</span>
                    <div className="suggestion-values">
                      <span>{node.keys} keys</span>
                      <span>{node.hits} hits</span>
                      <span>{node.misses} misses</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function MetaPill({ label, value }) {
  return (
    <div className="meta-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InlineStat({ label, value }) {
  return (
    <div className="inline-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function KeyValueRow({ label, value }) {
  return (
    <div className="key-value-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatPercent(value) {
  if (typeof value !== "number") {
    return "0%";
  }

  return `${Math.round(value * 100)}%`;
}

function formatMode(value) {
  if (!value) {
    return "-";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
