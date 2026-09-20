import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  X,
  AlertCircle,
  History,
  FileText,
} from "lucide-react";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "https://price-tracker-3bxr.onrender.com"
).replace(/\/$/, "");

function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `₹${number.toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDiscountNumber(discount) {
  const match = String(discount ?? "").match(/[\d.]+/);
  return match ? Number(match[0]) : null;
}

function unwrapArray(data, keys = []) {
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
  }
  return data;
}

function stockAvailable(product) {
  const raw = String(product?.stock ?? "");
  // The scraper reports either a unit count or the strings in_stock /
  // out_of_stock, so both forms have to be handled explicitly.
  if (raw === "out_of_stock") return false;
  if (raw === "in_stock") return true;

  const numeric = Number(raw);
  if (raw !== "" && Number.isFinite(numeric)) return numeric > 0;

  const text = String(product?.stockText || "");
  if (/out of stock/i.test(text)) return false;
  return /in stock|\d+\s*left|available/i.test(text);
}

function ProductIcon() {
  return (
    <div className="product-icon">
      <ShoppingBag size={20} strokeWidth={2.1} />
    </div>
  );
}

function SearchResult({ product, onTrack, tracking }) {
  return (
    <article className="search-result">
      <ProductIcon />
      <div className="search-result-copy">
        <strong>{product.name || "Unnamed product"}</strong>
        <span>
          {product.brand || "Unknown brand"} · {product.sku || `Product #${product.productId}`}
        </span>
        {product.category && <small>{product.category}</small>}
      </div>
      <button className="track-button" onClick={() => onTrack(product)} disabled={tracking}>
        {tracking ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
        {tracking ? "Tracking..." : "Track product"}
      </button>
    </article>
  );
}

function TrackedCard({ product, latest, onDetails, onUntrack, untracking }) {
  const current = latest || product;
  const discountNumber = getDiscountNumber(current?.discount);
  const available = stockAvailable(current);

  return (
    <article className="product-card">
      <div className="card-top">
        <ProductIcon />
        <div className="product-id">
          <span>{product.brand || "TRACKED PRODUCT"}</span>
          <strong>{product.name || `#${product.productId}`}</strong>
        </div>
        <span className={`status ${available ? "success" : "warning"}`}>
          <span className="status-dot" />
          {available ? "In stock" : "Check stock"}
        </span>
      </div>

      <div className="product-meta">
        <span>{product.sku || `Product #${product.productId}`}</span>
        {product.category && <span>{product.category}</span>}
      </div>

      <div className="price-area">
        <span className="label">CURRENT PRICE</span>
        <div className="price-row">
          <h2>{formatPrice(current?.price)}</h2>
          {discountNumber !== null && (
            <span className="discount"><ArrowDown size={13} />{discountNumber}% OFF</span>
          )}
        </div>
        <div className="mrp">MRP <span>{formatPrice(current?.mrp)}</span></div>
      </div>

      <div className="details">
        <div className="detail"><Package size={17} /><div><span>Stock</span><strong>{current?.stockText || current?.stock || "Awaiting scrape"}</strong></div></div>
        <div className="detail"><Store size={17} /><div><span>Seller</span><strong>{current?.seller || "—"}</strong></div></div>
        <div className="detail"><Truck size={17} /><div><span>Delivery</span><strong>{current?.delivery || "—"}</strong></div></div>
      </div>

      <div className="card-actions">
        <button className="secondary-button" onClick={() => onDetails(product)}><Eye size={16} /> Details</button>
        <button className="danger-button" onClick={() => onUntrack(product)} disabled={untracking}><Trash2 size={16} /> {untracking ? "Stopping..." : "Stop tracking"}</button>
      </div>
    </article>
  );
}

function DetailsPanel({ product, latest, history, logs, loading, onClose, onRefresh }) {
  const prices = history
    .map((row) => Number(row.price))
    .filter((value) => Number.isFinite(value) && value > 0);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="details-panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">PRODUCT DETAILS</p>
            <h2>{product.name || `Product #${product.productId}`}</h2>
            <p>{product.brand || ""} {product.sku ? `· ${product.sku}` : ""}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>

        <div className="detail-summary">
          <div><span>Current price</span><strong>{formatPrice(latest?.price)}</strong></div>
          <div><span>Lowest recorded</span><strong>{formatPrice(minPrice)}</strong></div>
          <div><span>Highest recorded</span><strong>{formatPrice(maxPrice)}</strong></div>
          <div><span>History points</span><strong>{history.length}</strong></div>
        </div>

        <div className="panel-toolbar">
          <div className="panel-tabs"><span className="active"><History size={15} /> Price history</span><span><FileText size={15} /> Scrape logs</span></div>
          <button className="secondary-button" onClick={onRefresh} disabled={loading}>{loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Refresh</button>
        </div>

        <div className="history-section">
          <div className="subheading"><div><h3>Price & stock history</h3><p>Every successful scrape saved for this product.</p></div></div>
          {loading ? <div className="panel-loading"><Loader2 className="spin" /> Loading details...</div> : history.length ? (
            <div className="table-wrap"><table><thead><tr><th>Timestamp</th><th>Price</th><th>MRP</th><th>Discount</th><th>Stock</th></tr></thead><tbody>
              {history.map((row, index) => <tr key={`${row.id || row.scraped_at || index}`}><td>{formatDate(row.scraped_at || row.created_at || row.timestamp)}</td><td className="table-price">{formatPrice(row.price)}</td><td>{formatPrice(row.mrp)}</td><td>{row.discount || "—"}</td><td>{row.stock_text || row.stockText || row.stock || "—"}</td></tr>)}
            </tbody></table></div>
          ) : <div className="empty-panel">No successful price history yet. Run a refresh to create the first data point.</div>}
        </div>

        <div className="logs-section">
          <div className="subheading"><div><h3>Scrape attempts</h3><p>Failures and retries remain visible instead of being hidden.</p></div></div>
          {logs.length ? <div className="logs-list">{logs.map((log, index) => {
            const outcome = String(log.outcome || log.status || "unknown").toLowerCase();
            const good = outcome === "success";
            const warn = outcome === "retried";
            return <div className="log-row" key={`${log.id || log.logged_at || index}`}><div className={`log-dot ${good ? "success" : warn ? "retry" : "failure"}`} /><div className="log-main"><strong>Attempt {log.attempt_number ?? index + 1} · {log.outcome || log.status || "unknown"}</strong><span>{log.reason || log.message || "No additional reason recorded"}</span></div><div className="log-time">{formatDate(log.logged_at || log.created_at || log.timestamp)}</div></div>;
          })}</div> : <div className="empty-panel">No scrape attempts recorded yet.</div>}
        </div>
      </section>
    </div>
  );
}

function App() {
  const [catalog, setCatalog] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [latest, setLatest] = useState({});
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("connecting");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [trackingId, setTrackingId] = useState(null);
  const [untrackingId, setUntrackingId] = useState(null);
  const [detailsProduct, setDetailsProduct] = useState(null);
  const [details, setDetails] = useState({ history: [], logs: [] });
  const [detailsLoading, setDetailsLoading] = useState(false);

  const loadTracked = useCallback(async () => {
    const data = await api("/api/products/tracked");
    const items = unwrapArray(data, ["products", "tracked"]);
    setTracked(items);
    return items;
  }, []);

  const loadCatalog = useCallback(async () => {
    const data = await api("/api/products/catalog");
    const items = unwrapArray(data, ["results", "products", "catalog"]);
    setCatalog(items);
    return items;
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadCatalog(), loadTracked()]);
      setConnection("connected");
    } catch (err) {
      setConnection("error");
      setError(err.message || "Could not connect to the tracker backend.");
    } finally {
      setLoading(false);
    }
  }, [loadCatalog, loadTracked]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setSearchResults([]); setSearching(false); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api(`/api/products/search?q=${encodeURIComponent(trimmed)}`);
        setSearchResults(unwrapArray(data, ["products", "results"]));
      } catch (err) {
        setError(err.message || "Search failed.");
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const catalogMap = useMemo(() => new Map(catalog.map((p) => [String(p.productId), p])), [catalog]);

  const trackProduct = async (product) => {
    setTrackingId(product.productId);
    setError("");
    try {
      await api("/api/products/track", { method: "POST", body: JSON.stringify({ productId: product.productId }) });
      await loadTracked();
      setQuery("");
      setSearchResults([]);
    } catch (err) { setError(err.message || "Could not track this product."); }
    finally { setTrackingId(null); }
  };

  const untrackProduct = async (product) => {
    setUntrackingId(product.productId);
    setError("");
    try {
      await api(`/api/products/track/${product.productId}`, { method: "DELETE" });
      await loadTracked();
      if (detailsProduct?.productId === product.productId) setDetailsProduct(null);
    } catch (err) { setError(err.message || "Could not stop tracking this product."); }
    finally { setUntrackingId(null); }
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    setError("");
    try {
      const data = await api("/api/scrape", { method: "POST", body: JSON.stringify({}) });
      const results = Array.isArray(data?.results) ? data.results : unwrapArray(data, ["data"]);

      // Only successful scrapes overlay the card. A failed attempt must not
      // erase the last known price — it is reported below and recorded in the
      // product's scrape logs instead.
      const next = {};
      const failed = [];
      results.forEach((result) => {
        if (result?.productId == null) return;
        if (result.status === "success") next[String(result.productId)] = result;
        else failed.push(result);
      });

      setLatest(next);
      setLastUpdated(new Date());
      await loadTracked();
      setConnection("connected");

      if (failed.length) {
        setError(
          `${failed.length} of ${results.length} scrapes failed (${failed
            .map((f) => `#${f.productId}: ${f.reason || "unknown reason"}`)
            .join(", ")}). Every attempt is recorded under Details -> Scrape attempts.`
        );
      }
    } catch (err) {
      setError(err.message || "Could not refresh prices. Failed attempts should be visible in product logs.");
      setConnection("error");
    } finally { setRefreshing(false); }
  };

  const openDetails = async (product) => {
    setDetailsProduct(product);
    setDetailsLoading(true);
    try {
      const [historyData, logsData] = await Promise.all([
        api(`/api/products/${product.productId}/history`),
        api(`/api/products/${product.productId}/logs`),
      ]);
      setDetails({
        history: unwrapArray(historyData, ["history", "prices", "data"]),
        logs: unwrapArray(logsData, ["logs", "attempts", "data"]),
      });
    } catch (err) { setError(err.message || "Could not load product details."); }
    finally { setDetailsLoading(false); }
  };

  const stats = useMemo(() => {
    const available = tracked.filter((p) => stockAvailable(latest[String(p.productId)] || p)).length;
    const prices = tracked.map((p) => Number((latest[String(p.productId)] || p)?.price)).filter(Number.isFinite);
    return { count: tracked.length, available, average: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null };
  }, [tracked, latest]);

  const resultsToShow = searchResults.length ? searchResults : query.trim() ? [] : [];
  const updatedText = lastUpdated ? lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Activity size={21} /></div><div><h1>Price Tracker</h1><p>INE product monitoring</p></div></div>
        <button className="refresh-button" onClick={refreshPrices} disabled={refreshing || tracked.length === 0}><RefreshCw className={refreshing ? "spin" : ""} size={17} />{refreshing ? "Scraping..." : "Refresh Prices"}</button>
      </header>

      <main className="main">
        <section className="hero">
          <div><p className="eyebrow">PRODUCT PRICE MONITORING</p><h2>Track the products that matter.</h2><p className="hero-copy">Search INE's mock store, start tracking a product, and inspect its price history and scrape reliability over time.</p></div>
          <div className={`live-pill ${connection}`}><span />{connection === "connected" ? "Backend connected" : connection === "error" ? "Backend unavailable" : "Connecting..."}</div>
        </section>

        <section className="search-section">
          <div className="section-heading"><div><h3>Find a product</h3><p>Search by partial or full product name.</p></div></div>
          <div className="search-large"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. wireless headphones" aria-label="Search products by name" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={17} /></button>}</div>
          {query.trim() && <div className="search-results">{searching ? <div className="search-status"><Loader2 className="spin" size={18} /> Searching the product catalog...</div> : resultsToShow.length ? resultsToShow.map((p) => <SearchResult key={p.productId} product={p} onTrack={trackProduct} tracking={trackingId === p.productId} />) : <div className="search-status"><Search size={18} /> No matching products found.</div>}</div>}
        </section>

        {error && <div className="error-box"><AlertCircle size={19} /><div><strong>Something needs attention</strong><p>{error}</p></div><button onClick={() => setError("")}><X size={17} /></button></div>}

        <section className="stats-grid">
          <div className="stat-card"><div className="stat-icon"><ShoppingBag size={18} /></div><div><span>Tracked products</span><strong>{stats.count}</strong></div></div>
          <div className="stat-card"><div className="stat-icon"><CheckCircle2 size={18} /></div><div><span>Currently available</span><strong>{stats.available}</strong></div></div>
          <div className="stat-card"><div className="stat-icon"><Clock3 size={18} /></div><div><span>Last scrape</span><strong>{updatedText}</strong></div></div>
          <div className="stat-card"><div className="stat-icon"><Activity size={18} /></div><div><span>Average price</span><strong>{formatPrice(stats.average)}</strong></div></div>
        </section>

        <section className="products-section">
          <div className="section-heading"><div><h3>Tracked products</h3><p>{tracked.length ? `${tracked.length} product${tracked.length === 1 ? "" : "s"} being monitored` : "Choose a product above to start tracking"}</p></div><div className="schedule-note"><Clock3 size={15} /> Scheduled every 2 hours</div></div>
          {loading ? <div className="product-grid">{[1,2,3].map((i) => <div className="skeleton-card" key={i}><div className="skeleton skeleton-small" /><div className="skeleton skeleton-price" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /><div className="skeleton skeleton-line" /></div>)}</div> : tracked.length ? <div className="product-grid">{tracked.map((product) => <TrackedCard key={product.productId} product={product} latest={latest[String(product.productId)]} onDetails={openDetails} onUntrack={untrackProduct} untracking={untrackingId === product.productId} />)}</div> : <div className="empty-state"><ShoppingBag size={27} /><h3>No products are being tracked</h3><p>Search the INE mock store above and click “Track product” to begin collecting price and stock history.</p></div>}
        </section>
      </main>

      <footer><span>Price Tracker</span><span>INE mock store · 2-hour scheduled scraping</span></footer>

      {detailsProduct && <DetailsPanel product={detailsProduct} latest={latest[String(detailsProduct.productId)] || detailsProduct} history={details.history} logs={details.logs} loading={detailsLoading} onClose={() => setDetailsProduct(null)} onRefresh={() => openDetails(detailsProduct)} />}
    </div>
  );
}

export default App;
