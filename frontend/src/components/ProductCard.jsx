import {
  ArrowDown,
  ExternalLink,
  FileText,
  LineChart,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  formatPrice,
  formatRelative,
  getDiscountNumber,
  readStock,
  STOCK_LABEL,
  storeUrl,
} from "../lib/format";

export function StockBadge({ state, quantity }) {
  return (
    <span className={`badge badge-${state === "in" ? "good" : state === "out" ? "bad" : "muted"}`}>
      <span className="badge-dot" />
      {STOCK_LABEL[state]}
      {state === "in" && quantity != null && <span className="badge-count">{quantity}</span>}
    </span>
  );
}

export default function ProductCard({
  product,
  latest,
  onHistory,
  onLogs,
  onScrape,
  onUntrack,
  scraping,
  untracking,
  note,
}) {
  const current = latest || product;
  const discount = getDiscountNumber(current?.discount);
  const stock = readStock(current);
  const lastScraped = formatRelative(current?.lastScrapedAt || current?.scraped_at);
  const hasPrice = Number.isFinite(Number(current?.price));

  return (
    <article className={`product-card${scraping ? " is-busy" : ""}`}>
      <header className="card-head">
        <div className="card-title">
          <h3 title={product.name || `Product #${product.productId}`}>
            {product.name || `Product #${product.productId}`}
          </h3>
          <p className="card-sub">
            <span className="mono">#{product.productId}</span>
            {product.brand && <> · {product.brand}</>}
            {product.sku && <> · {product.sku}</>}
          </p>
        </div>
        <StockBadge state={stock.state} quantity={stock.quantity} />
      </header>

      <div className="card-price">
        {hasPrice ? (
          <>
            <span className="price-value">{formatPrice(current.price)}</span>
            {discount !== null && (
              <span className="price-discount">
                <ArrowDown size={12} strokeWidth={2.6} />
                {discount}%
              </span>
            )}
            {Number.isFinite(Number(current?.mrp)) && (
              <span className="price-mrp">{formatPrice(current.mrp)}</span>
            )}
          </>
        ) : (
          <span className="price-empty">No price recorded yet</span>
        )}
      </div>

      <dl className="card-facts">
        <div>
          <dt>Stock</dt>
          <dd>{stock.text}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{lastScraped || "Never"}</dd>
        </div>
      </dl>

      {note && <p className={`card-note card-note-${note.tone}`}>{note.text}</p>}

      <div className="card-actions">
        <button className="btn btn-primary" onClick={() => onScrape(product)} disabled={scraping}>
          {scraping ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          {scraping ? "Scraping…" : "Scrape now"}
        </button>
        <div className="card-actions-secondary">
          <button className="btn btn-ghost" onClick={() => onHistory(product)}>
            <LineChart size={15} /> History
          </button>
          <button className="btn btn-ghost" onClick={() => onLogs(product)}>
            <FileText size={15} /> Logs
          </button>
          <a
            className="btn btn-ghost"
            href={storeUrl(product.productId)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} /> Store
          </a>
          <button
            className="btn btn-ghost btn-danger"
            onClick={() => onUntrack(product)}
            disabled={untracking}
            aria-label="Stop tracking this product"
            title="Stop tracking"
          >
            {untracking ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
          </button>
        </div>
      </div>
    </article>
  );
}
