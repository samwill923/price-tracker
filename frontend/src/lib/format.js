// The mock store the scraper reads from; used only to link a card back to the
// product page a human can open.
const STORE_BASE = "https://demo.inelabteamdev.com";

export function storeUrl(productId) {
  return `${STORE_BASE}/product/${productId}`;
}

export function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `₹${number.toLocaleString("en-IN")}`;
}

// Short form for chart axes, where a full rupee value would collide.
export function formatPriceCompact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (Math.abs(number) >= 100000) return `₹${(number / 100000).toFixed(1)}L`;
  if (Math.abs(number) >= 1000) return `₹${(number / 1000).toFixed(1)}K`;
  return `₹${Math.round(number)}`;
}

export function formatDate(value) {
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

export function formatDayTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "4m ago" reads faster than a timestamp on a card. Falls back to the absolute
// date once the gap stops being useful as a relative figure.
export function formatRelative(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function getDiscountNumber(discount) {
  const match = String(discount ?? "").match(/[\d.]+/);
  return match ? Number(match[0]) : null;
}

// The store phrases availability several ways — "Hurry, just 109 left",
// "In stock · 120 left", "87 in stock" — so the unit count is pulled out of
// whichever wording came back.
function quantityFromText(text) {
  const match = String(text || "").match(/(\d[\d,]*)\s*(?:left|in stock|available|remaining)/i);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

// The scraper reports either a unit count or the strings in_stock /
// out_of_stock, so both forms have to be handled explicitly. A product that has
// never been scraped has neither, and must not be reported as out of stock —
// "unknown" is a real third state, not a failure.
export function readStock(product) {
  const raw = String(product?.stock ?? "").trim();
  const text = String(product?.stockText ?? product?.stock_text ?? "").trim();

  if (raw === "out_of_stock") return { state: "out", quantity: null, text: text || "Out of stock" };
  // "in_stock" carries no count of its own, but the store's wording often does
  // ("87 in stock"), so the number is read back off the text when present.
  if (raw === "in_stock") {
    return { state: "in", quantity: quantityFromText(text), text: text || "In stock" };
  }

  const numeric = Number(raw);
  if (raw !== "" && raw !== "null" && Number.isFinite(numeric)) {
    return {
      state: numeric > 0 ? "in" : "out",
      quantity: numeric,
      text: text || (numeric > 0 ? `${numeric} left` : "Out of stock"),
    };
  }

  if (text) {
    if (/out of stock/i.test(text)) return { state: "out", quantity: null, text };
    const quantity = quantityFromText(text);
    if (quantity !== null) return { state: "in", quantity, text };
    if (/in stock|available/i.test(text)) return { state: "in", quantity: null, text };
  }

  return { state: "unknown", quantity: null, text: text || "Awaiting first scrape" };
}

export const STOCK_LABEL = { in: "In stock", out: "Out of stock", unknown: "Not scraped yet" };
