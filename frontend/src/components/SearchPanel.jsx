import { CheckCircle2, Loader2, Plus, Search, X } from "lucide-react";

function ResultRow({ product, onTrack, tracking, tracked }) {
  return (
    <li className="result-row">
      <div className="result-copy">
        <strong title={product.name || "Unnamed product"}>{product.name || "Unnamed product"}</strong>
        <span>
          <span className="mono">#{product.productId}</span>
          {product.brand && <> · {product.brand}</>}
          {product.category && <> · {product.category}</>}
        </span>
      </div>
      {tracked ? (
        <span className="badge badge-good">
          <CheckCircle2 size={12} strokeWidth={2.4} /> Tracked
        </span>
      ) : (
        <button className="btn btn-primary btn-sm" onClick={() => onTrack(product)} disabled={tracking}>
          {tracking ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
          {tracking ? "Adding…" : "Track"}
        </button>
      )}
    </li>
  );
}

export default function SearchPanel({
  query,
  onQuery,
  results,
  catalog,
  searching,
  onTrack,
  trackingId,
  trackedIds,
  error,
}) {
  const trimmed = query.trim();
  const browsing = !trimmed;
  const list = browsing ? catalog : results;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Find a product</h2>
          <p>Search the mock store by partial or full product name, then start tracking it.</p>
        </div>
      </div>

      <div className="search-field">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="e.g. wireless headphones"
          aria-label="Search products by name"
        />
        {searching && <Loader2 size={16} className="spin search-spinner" />}
        {query && (
          <button onClick={() => onQuery("")} aria-label="Clear search" className="search-clear">
            <X size={16} />
          </button>
        )}
      </div>

      {error && <p className="field-error">{error}</p>}

      <div className="result-meta">
        {browsing
          ? catalog.length
            ? `Browsing ${catalog.length} products from the store catalog`
            : "Catalog unavailable"
          : searching
            ? "Searching…"
            : `${results.length} ${results.length === 1 ? "match" : "matches"} for “${trimmed}”`}
      </div>

      {list.length ? (
        <ul className="result-list">
          {list.map((product) => (
            <ResultRow
              key={product.productId}
              product={product}
              onTrack={onTrack}
              tracking={trackingId === product.productId}
              tracked={trackedIds.has(String(product.productId))}
            />
          ))}
        </ul>
      ) : (
        <div className="panel-empty">
          {searching ? (
            <>
              <Loader2 className="spin" size={18} /> Searching the product catalog…
            </>
          ) : browsing ? (
            "The store catalog could not be loaded right now."
          ) : (
            `No products match “${trimmed}”. Try a shorter or different term.`
          )}
        </div>
      )}
    </section>
  );
}
