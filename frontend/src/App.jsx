import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw, Search, ShoppingBag, X } from "lucide-react";
import { api, unwrapArray } from "./lib/api";
import { formatDate, formatRelative, readStock } from "./lib/format";
import Sidebar, { VIEWS } from "./components/Sidebar";
import SummaryCards from "./components/SummaryCards";
import SearchPanel from "./components/SearchPanel";
import ProductCard from "./components/ProductCard";
import ProductDetails from "./components/ProductDetails";
import LogList from "./components/LogList";
import Toasts from "./components/Toasts";

// The feed merges every attempt from every tracked product, which grows without
// bound; the rest stays reachable per product under Logs.
const ACTIVITY_LIMIT = 150;

function App() {
  const [view, setView] = useState("dashboard");
  const [catalog, setCatalog] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [latest, setLatest] = useState({});
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("connecting");
  const [trackingId, setTrackingId] = useState(null);
  const [untrackingId, setUntrackingId] = useState(null);
  const [scrapingId, setScrapingId] = useState(null);
  const [cardNotes, setCardNotes] = useState({});
  const [detailsProduct, setDetailsProduct] = useState(null);
  const [detailsTab, setDetailsTab] = useState("history");
  const [details, setDetails] = useState({ history: [], logs: [] });
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activity, setActivity] = useState({ logs: [], loading: false, loaded: false });
  const [toasts, setToasts] = useState([]);

  const toastTimers = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (text, tone = "good") => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((current) => [...current.slice(-2), { id, text, tone }]);
      toastTimers.current.set(
        id,
        setTimeout(() => dismissToast(id), tone === "bad" ? 7000 : 4000)
      );
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = toastTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  // A card-local message, so a single product's outcome never has to be
  // announced with a page-level banner.
  const setCardNote = useCallback((productId, note) => {
    setCardNotes((current) => ({ ...current, [String(productId)]: note }));
    if (note) {
      setTimeout(() => {
        setCardNotes((current) => {
          if (current[String(productId)] !== note) return current;
          const next = { ...current };
          delete next[String(productId)];
          return next;
        });
      }, 8000);
    }
  }, []);

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

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearching(false);
      setSearchError("");
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const data = await api(`/api/products/search?q=${encodeURIComponent(trimmed)}`);
        setSearchResults(unwrapArray(data, ["products", "results"]));
      } catch (err) {
        setSearchError(err.message || "Search failed.");
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const trackedIds = useMemo(
    () => new Set(tracked.map((product) => String(product.productId))),
    [tracked]
  );

  const trackProduct = async (product) => {
    setTrackingId(product.productId);
    try {
      await api("/api/products/track", {
        method: "POST",
        body: JSON.stringify({ productId: product.productId }),
      });
      await loadTracked();
      pushToast(`Now tracking ${product.name || `#${product.productId}`}`);
    } catch (err) {
      pushToast(err.message || "Could not track this product.", "bad");
    } finally {
      setTrackingId(null);
    }
  };

  const untrackProduct = async (product) => {
    setUntrackingId(product.productId);
    try {
      await api(`/api/products/track/${product.productId}`, { method: "DELETE" });
      await loadTracked();
      if (detailsProduct?.productId === product.productId) setDetailsProduct(null);
      pushToast(`Stopped tracking ${product.name || `#${product.productId}`}`);
    } catch (err) {
      pushToast(err.message || "Could not stop tracking this product.", "bad");
    } finally {
      setUntrackingId(null);
    }
  };

  // Only successful scrapes overlay the card. A failed attempt must not erase
  // the last known price - it is reported on the card itself and recorded in
  // the product's scrape logs instead.
  const applyResults = (results) => {
    const succeeded = [];
    const failed = [];
    const overlay = {};
    results.forEach((result) => {
      if (result?.productId == null) return;
      if (result.status === "success") {
        overlay[String(result.productId)] = result;
        succeeded.push(result);
      } else {
        failed.push(result);
      }
    });
    if (Object.keys(overlay).length) setLatest((current) => ({ ...current, ...overlay }));
    return { succeeded, failed };
  };

  const openDetails = async (product, tab = "history") => {
    setDetailsProduct(product);
    setDetailsTab(tab);
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
    } catch (err) {
      pushToast(err.message || "Could not load product details.", "bad");
    } finally {
      setDetailsLoading(false);
    }
  };

  const scrapeProduct = async (product) => {
    setScrapingId(product.productId);
    setCardNote(product.productId, null);
    try {
      const data = await api("/api/scrape", {
        method: "POST",
        body: JSON.stringify({ productIds: [product.productId] }),
      });
      const results = Array.isArray(data?.results) ? data.results : unwrapArray(data, ["data"]);
      const { failed } = applyResults(results);
      await loadTracked();
      setConnection("connected");

      if (failed.length) {
        setCardNote(product.productId, {
          tone: "bad",
          text: `Scrape failed: ${failed[0].reason || "unknown reason"}. Every attempt is recorded under Logs.`,
        });
      } else {
        setCardNote(product.productId, { tone: "good", text: "Price updated just now." });
      }
      if (detailsProduct?.productId === product.productId) openDetails(product, detailsTab);
    } catch (err) {
      setCardNote(product.productId, {
        tone: "bad",
        text: err.message || "Could not reach the scraper. Failed attempts stay visible under Logs.",
      });
    } finally {
      setScrapingId(null);
    }
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    setError("");
    try {
      const data = await api("/api/scrape", { method: "POST", body: JSON.stringify({}) });
      const results = Array.isArray(data?.results) ? data.results : unwrapArray(data, ["data"]);
      const { succeeded, failed } = applyResults(results);
      await loadTracked();
      setConnection("connected");

      failed.forEach((result) =>
        setCardNote(result.productId, {
          tone: "bad",
          text: `Scrape failed: ${result.reason || "unknown reason"}. See Logs for every attempt.`,
        })
      );

      if (failed.length) {
        pushToast(
          `${succeeded.length} of ${results.length} products updated - ${failed.length} failed`,
          "bad"
        );
      } else if (succeeded.length) {
        pushToast(`${succeeded.length} ${succeeded.length === 1 ? "product" : "products"} updated`);
      }
    } catch (err) {
      setError(
        err.message || "Could not refresh prices. Failed attempts should be visible in product logs."
      );
      setConnection("error");
    } finally {
      setRefreshing(false);
    }
  };

  // Logs are only exposed per product, so the activity feed reads the same
  // endpoint once per tracked product and merges the rows by time.
  const loadActivity = useCallback(
    async (products) => {
      if (!products.length) {
        setActivity({ logs: [], loading: false, loaded: true });
        return;
      }
      setActivity((current) => ({ ...current, loading: true }));
      const responses = await Promise.all(
        products.map(async (product) => {
          const data = await api(`/api/products/${product.productId}/logs`).catch(() => null);
          if (!data) return [];
          return unwrapArray(data, ["logs", "attempts", "data"]).map((log) => ({
            ...log,
            productId: product.productId,
            productName: product.name || `#${product.productId}`,
          }));
        })
      );
      const merged = responses
        .flat()
        .sort(
          (a, b) =>
            new Date(b.logged_at || b.created_at || 0) - new Date(a.logged_at || a.created_at || 0)
        );
      setActivity({ logs: merged, loading: false, loaded: true });
    },
    []
  );

  useEffect(() => {
    if (view === "activity" && !activity.loaded && !activity.loading) loadActivity(tracked);
  }, [view, activity.loaded, activity.loading, tracked, loadActivity]);

  const stats = useMemo(() => {
    let inStock = 0;
    let outOfStock = 0;
    let unknown = 0;
    let lastSync = null;

    tracked.forEach((product) => {
      const current = latest[String(product.productId)] || product;
      const { state } = readStock(current);
      if (state === "in") inStock += 1;
      else if (state === "out") outOfStock += 1;
      else unknown += 1;

      // lastScrapedAt is what the tracked endpoint already reports; a fresh
      // scrape result in this session carries scraped_at instead.
      const scrapedAt = current?.lastScrapedAt || current?.scraped_at || product?.lastScrapedAt;
      const time = scrapedAt ? new Date(scrapedAt).getTime() : NaN;
      if (Number.isFinite(time) && (lastSync === null || time > lastSync)) lastSync = time;
    });

    return {
      total: tracked.length,
      inStock,
      outOfStock,
      unknown,
      lastSyncRelative: lastSync ? formatRelative(new Date(lastSync).toISOString()) : null,
      lastSyncAbsolute: lastSync ? formatDate(new Date(lastSync).toISOString()) : null,
    };
  }, [tracked, latest]);

  const activeView = VIEWS.find((item) => item.id === view) || VIEWS[0];

  const productGrid = loading ? (
    <div className="product-grid">
      {[1, 2, 3].map((index) => (
        <div className="skeleton-card" key={index}>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-price" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  ) : tracked.length ? (
    <div className="product-grid">
      {tracked.map((product) => (
        <ProductCard
          key={product.productId}
          product={product}
          latest={latest[String(product.productId)]}
          onHistory={(item) => openDetails(item, "history")}
          onLogs={(item) => openDetails(item, "logs")}
          onScrape={scrapeProduct}
          onUntrack={untrackProduct}
          scraping={scrapingId === product.productId}
          untracking={untrackingId === product.productId}
          note={cardNotes[String(product.productId)]}
        />
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <ShoppingBag size={26} />
      <h3>No products are being tracked</h3>
      <p>
        Find a product in the INE mock store and start tracking it to collect price and stock
        history.
      </p>
      <button className="btn btn-primary" onClick={() => setView("search")}>
        <Search size={15} /> Find products
      </button>
    </div>
  );

  return (
    <div className="app">
      <Sidebar view={view} onView={setView} trackedCount={tracked.length} connection={connection} />

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-copy">
            <h1>{activeView.label}</h1>
            <p>
              {view === "dashboard"
                ? "Price and stock across every product you track."
                : view === "search"
                  ? "Search the mock store and start tracking products."
                  : "Every scrape attempt recorded across your tracked products."}
            </p>
          </div>
          {view === "dashboard" && (
            <button
              className="btn btn-primary"
              onClick={refreshPrices}
              disabled={refreshing || tracked.length === 0}
            >
              <RefreshCw size={15} className={refreshing ? "spin" : ""} />
              {refreshing ? "Scraping..." : "Scrape all"}
            </button>
          )}
          {view === "activity" && (
            <button
              className="btn btn-ghost"
              onClick={() => loadActivity(tracked)}
              disabled={activity.loading}
            >
              {activity.loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
              Reload
            </button>
          )}
        </header>

        <main className="content">
          {error && (
            <div className="alert">
              <AlertCircle size={18} />
              <div>
                <strong>Something needs attention</strong>
                <p>{error}</p>
              </div>
              <button onClick={() => setError("")} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          )}

          {view === "dashboard" && (
            <>
              <SummaryCards stats={stats} />
              <section className="section">
                <div className="section-head">
                  <div>
                    <h2>Tracked products</h2>
                    <p>
                      {tracked.length
                        ? `${tracked.length} product${tracked.length === 1 ? "" : "s"} being monitored`
                        : "Nothing tracked yet"}
                    </p>
                  </div>
                </div>
                {productGrid}
              </section>
            </>
          )}

          {view === "search" && (
            <SearchPanel
              query={query}
              onQuery={setQuery}
              results={searchResults}
              catalog={catalog}
              searching={searching}
              onTrack={trackProduct}
              trackingId={trackingId}
              trackedIds={trackedIds}
              error={searchError}
            />
          )}

          {view === "activity" && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Scrape activity</h2>
                  <p>Attempts, retries and failures across all tracked products, newest first.</p>
                </div>
              </div>
              {activity.loading ? (
                <div className="panel-empty">
                  <Loader2 className="spin" size={18} /> Loading activity...
                </div>
              ) : activity.logs.length ? (
                <>
                  {activity.logs.length > ACTIVITY_LIMIT && (
                    <p className="result-meta">
                      Showing the {ACTIVITY_LIMIT} most recent of {activity.logs.length} attempts.
                      Older attempts stay available per product under Logs.
                    </p>
                  )}
                  <LogList logs={activity.logs.slice(0, ACTIVITY_LIMIT)} showProduct />
                </>
              ) : (
                <div className="panel-empty">
                  No scrape attempts recorded yet. Run a scrape from the dashboard to populate this
                  feed.
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {detailsProduct && (
        <ProductDetails
          product={detailsProduct}
          latest={latest[String(detailsProduct.productId)] || detailsProduct}
          history={details.history}
          logs={details.logs}
          loading={detailsLoading}
          tab={detailsTab}
          onTab={setDetailsTab}
          onClose={() => setDetailsProduct(null)}
          onRefresh={() => openDetails(detailsProduct, detailsTab)}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
