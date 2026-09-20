import { useMemo } from "react";
import { ExternalLink, FileText, LineChart, Loader2, RefreshCw, X } from "lucide-react";
import PriceChart from "./PriceChart";
import LogList from "./LogList";
import { formatDate, formatPrice, storeUrl } from "../lib/format";

export default function ProductDetails({
  product,
  latest,
  history,
  logs,
  loading,
  tab,
  onTab,
  onClose,
  onRefresh,
}) {
  // Only rows with a usable timestamp and price can be plotted; the table below
  // still shows every stored row, so nothing is hidden by this filter.
  const points = useMemo(
    () =>
      history
        .map((row) => {
          const raw = row.scraped_at || row.created_at || row.timestamp;
          const time = new Date(raw).getTime();
          const price = Number(row.price);
          return { raw, time, price };
        })
        .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.price) && p.price > 0)
        .sort((a, b) => a.time - b.time),
    [history]
  );

  const prices = points.map((p) => p.price);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-label="Product details">
        <header className="modal-head">
          <div>
            <h2>{product.name || `Product #${product.productId}`}</h2>
            <p className="modal-sub">
              <span className="mono">#{product.productId}</span>
              {product.brand && <> · {product.brand}</>}
              {product.sku && <> · {product.sku}</>}
            </p>
          </div>
          <div className="modal-head-actions">
            <a className="btn btn-ghost" href={storeUrl(product.productId)} target="_blank" rel="noreferrer">
              <ExternalLink size={15} /> Store
            </a>
            <button className="icon-btn" onClick={onClose} aria-label="Close details">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="modal-stats">
          <div>
            <span>Current price</span>
            <strong>{formatPrice(latest?.price)}</strong>
          </div>
          <div>
            <span>Lowest recorded</span>
            <strong>{formatPrice(minPrice)}</strong>
          </div>
          <div>
            <span>Highest recorded</span>
            <strong>{formatPrice(maxPrice)}</strong>
          </div>
          <div>
            <span>History points</span>
            <strong>{history.length}</strong>
          </div>
        </div>

        <div className="modal-toolbar">
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "history"}
              className={tab === "history" ? "tab is-active" : "tab"}
              onClick={() => onTab("history")}
            >
              <LineChart size={15} /> Price history
            </button>
            <button
              role="tab"
              aria-selected={tab === "logs"}
              className={tab === "logs" ? "tab is-active" : "tab"}
              onClick={() => onTab("logs")}
            >
              <FileText size={15} /> Scrape logs
              {logs.length > 0 && <span className="tab-count">{logs.length}</span>}
            </button>
          </div>
          <button className="btn btn-ghost" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Reload
          </button>
        </div>

        {loading ? (
          <div className="panel-empty">
            <Loader2 className="spin" size={18} /> Loading details…
          </div>
        ) : tab === "history" ? (
          <div className="tab-panel">
            {points.length === 0 ? (
              <div className="panel-empty">
                No successful price history yet. Run “Scrape now” to record the first data point.
              </div>
            ) : (
              <>
                <PriceChart points={points} />
                {points.length === 1 && (
                  <p className="chart-note">
                    Only one data point recorded so far — the trend line appears from the second
                    scrape onwards.
                  </p>
                )}
              </>
            )}

            {history.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Price</th>
                      <th>MRP</th>
                      <th>Discount</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row, index) => (
                      <tr key={`${row.id || row.scraped_at || index}`}>
                        <td>{formatDate(row.scraped_at || row.created_at || row.timestamp)}</td>
                        <td className="table-price">{formatPrice(row.price)}</td>
                        <td>{formatPrice(row.mrp)}</td>
                        <td>{row.discount || "—"}</td>
                        <td>{row.stock_text || row.stockText || row.stock || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="tab-panel">
            {logs.length ? (
              <LogList logs={logs} />
            ) : (
              <div className="panel-empty">No scrape attempts recorded yet.</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
