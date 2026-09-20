const express = require("express");
const puppeteer = require("puppeteer");
const {
  ensureProduct,
  getTrackedProducts,
  getPriceHistory,
  getScrapeLogs,
  getLatestPrices,
  deleteTrackedProduct,
} = require("../db");

const router = express.Router();

const STORE_URL = "https://demo.inelabteamdev.com/";
const CATALOG_API = "https://demo.inelabteamdev.com/api/catalog";
const PRODUCT_API = "https://demo.inelabteamdev.com/api/product";
const CATALOG_PAGE_SIZE = 60; // the store caps pageSize at 60
const CATALOG_TTL_MS = 30 * 60 * 1000; // product metadata is effectively static

// The catalog endpoint returns a *randomly ordered* page on every request, so
// paging through it once yields roughly 640 of the 1000 products with
// duplicates. Coverage is therefore built up by resampling and merging, and
// the store throttles under load, so rounds are paced and bounded.
const CATALOG_CONCURRENCY = 3;
const CATALOG_MAX_ROUNDS = 6;
const CATALOG_ROUND_DELAY_MS = 400;
// Stop once a round barely helps. Full coverage is not worth hammering the
// store, because throttling it would degrade the price scraper that matters.
const CATALOG_MIN_ROUND_GAIN = 5;

const catalogItems = new Map(); // productId -> normalized product
let catalogFetchedAt = 0;
let catalogTotal = 0;
let catalogBuild = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The store's SKU carries the product id offset by 10000 ("LAR-10087" -> 87).
// The product pages the scraper visits are keyed by the short id, so the
// offset has to be removed or every tracked product would 404.
const SKU_ID_OFFSET = 10000;

function productIdFromSku(sku) {
  const match = String(sku || "").match(/(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]) - SKU_ID_OFFSET;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalize(item) {
  return {
    productId: item.productId,
    name: item.name || "",
    brand: item.brand || "",
    sku: item.sku || "",
    category: item.category || "",
  };
}

// Fetches one catalog page and merges whatever it returns into the shared map.
// Returns the reported page count, or null if the request could not be used.
async function mergeCatalogPage(page) {
  try {
    const response = await fetch(
      `${CATALOG_API}?page=${page}&pageSize=${CATALOG_PAGE_SIZE}`,
    );
    if (!response.ok) return null;

    const body = await response.json();
    if (!Array.isArray(body.items)) return null;

    if (Number(body.total)) catalogTotal = Number(body.total);

    for (const item of body.items) {
      const productId = Number(item.id) || productIdFromSku(item.sku);
      if (!productId || !item.name) continue;
      catalogItems.set(
        productId,
        normalize({
          productId,
          name: item.name,
          brand: item.brand,
          sku: item.sku,
          category: item.category,
        }),
      );
    }
    return Number(body.pages) || 1;
  } catch {
    return null;
  }
}

// Resamples the randomly-ordered catalog until every product has been seen or
// the round budget runs out. Stops early once a round adds nothing new, which
// is the signal that the store has started throttling.
async function buildCatalog() {
  let pages = (await mergeCatalogPage(1)) || 1;

  for (let round = 0; round < CATALOG_MAX_ROUNDS; round += 1) {
    if (catalogTotal && catalogItems.size >= catalogTotal) break;
    const before = catalogItems.size;

    for (let page = 1; page <= pages; page += CATALOG_CONCURRENCY) {
      const batch = [];
      for (
        let offset = 0;
        offset < CATALOG_CONCURRENCY && page + offset <= pages;
        offset += 1
      ) {
        batch.push(mergeCatalogPage(page + offset));
      }
      const reported = await Promise.all(batch);
      pages = reported.find((value) => value) || pages;
      await sleep(CATALOG_ROUND_DELAY_MS);
    }

    if (catalogItems.size - before < CATALOG_MIN_ROUND_GAIN) break;
  }

  if (!catalogItems.size) throw new Error("catalog api returned no products");
  catalogFetchedAt = Date.now();
  return [...catalogItems.values()];
}

// Resolves a single product directly. Catalog sampling can leave a few of the
// 1000 products unseen, so a tracked product is looked up by id rather than
// being shown as a bare "#868".
async function fetchProductMeta(productId) {
  try {
    const response = await fetch(`${PRODUCT_API}/${productId}`);
    if (!response.ok) return null;

    const item = await response.json();
    if (!item || !item.name) return null;

    const meta = normalize({
      productId,
      name: item.name,
      brand: item.brand,
      sku: item.sku,
      category: item.category,
    });
    catalogItems.set(productId, meta);
    return meta;
  } catch {
    return null;
  }
}

// Fallback only: if the JSON catalog is unavailable we can still read the
// rendered tiles, though the store paginates so this covers one page.
async function fetchCatalogFromDom() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(20000);
    await page.goto(STORE_URL, { waitUntil: "networkidle0", timeout: 20000 });

    const tiles = await page.evaluate(() =>
      [...document.querySelectorAll("article.tile")].map((tile) => ({
        name: tile.querySelector(".tile-name")?.innerText?.trim() || "",
        brand: tile.querySelector(".tile-brand")?.innerText?.trim() || "",
        sku: tile.querySelector(".tile-sku")?.innerText?.trim() || "",
        category: tile.querySelector(".tile-category")?.innerText?.trim() || "",
      })),
    );

    return tiles
      .map((tile) =>
        normalize({ ...tile, productId: productIdFromSku(tile.sku) }),
      )
      .filter((p) => p.productId && p.name);
  } finally {
    await browser.close();
  }
}

function startCatalogBuild() {
  // Collapse concurrent callers (the UI searches on every keystroke) onto a
  // single in-flight build instead of hammering the store.
  if (catalogBuild) return catalogBuild;

  catalogBuild = (async () => {
    try {
      return await buildCatalog();
    } catch (apiError) {
      console.error(
        "Catalog API failed, falling back to DOM:",
        apiError.message,
      );
      const tiles = await fetchCatalogFromDom();
      for (const tile of tiles) catalogItems.set(tile.productId, tile);
      catalogFetchedAt = Date.now();
      return [...catalogItems.values()];
    } finally {
      catalogBuild = null;
    }
  })();

  return catalogBuild;
}

async function loadCatalog() {
  const fresh = Date.now() - catalogFetchedAt < CATALOG_TTL_MS;

  if (catalogItems.size) {
    // Never block a request on a refresh once something is cached; top up in
    // the background so coverage keeps improving between searches.
    if (!fresh && !catalogBuild) {
      startCatalogBuild().catch((error) =>
        console.error("Background catalog refresh failed:", error.message),
      );
    }
    return [...catalogItems.values()];
  }

  return startCatalogBuild();
}

// Warm the catalog at boot so the first search does not pay for the crawl.
function warmCatalog() {
  startCatalogBuild()
    .then((items) =>
      console.log(
        `Catalog warmed: ${items.length}${catalogTotal ? `/${catalogTotal}` : ""} products`,
      ),
    )
    .catch((error) => console.error("Catalog warm-up failed:", error.message));
}

// Name is the required search field, so name matches rank above the
// brand/sku/category matches that are only offered as a convenience.
function scoreMatch(product, query) {
  const name = product.name.toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;

  const other = [product.brand, product.sku, product.category]
    .join(" ")
    .toLowerCase();
  return other.includes(query) ? 3 : -1;
}

router.get("/search", async (req, res) => {
  const query = String(req.query.q || "")
    .trim()
    .toLowerCase();
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  if (!query) return res.json({ results: [], total: 0 });

  try {
    const catalog = await loadCatalog();
    const matches = [];

    for (const product of catalog) {
      const score = scoreMatch(product, query);
      if (score >= 0) matches.push({ product, score });
    }

    matches.sort(
      (a, b) =>
        a.score - b.score || a.product.name.localeCompare(b.product.name),
    );

    res.json({
      results: matches.slice(0, limit).map((m) => m.product),
      total: matches.length,
    });
  } catch (error) {
    console.error("Product search failed:", error);
    res
      .status(502)
      .json({ error: "Unable to search the mock store right now." });
  }
});

router.get("/catalog", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 1000);
  try {
    const catalog = await loadCatalog();
    res.json({
      results: catalog.slice(0, limit),
      total: catalog.length,
      storeTotal: catalogTotal || catalog.length,
    });
  } catch (error) {
    console.error("Catalog load failed:", error);
    res.status(502).json({ error: "Unable to load the mock store catalog." });
  }
});

router.post("/track", async (req, res) => {
  const productId = Number(req.body?.productId);
  if (!Number.isInteger(productId) || productId <= 0)
    return res
      .status(400)
      .json({ error: "A valid numeric productId is required." });

  try {
    // Resolve the name from the catalog so tracked products stay readable even
    // if the store is unreachable later.
    let name = String(req.body?.name || "").trim();
    if (!name) {
      const catalog = await loadCatalog().catch(() => []);
      name = catalog.find((p) => p.productId === productId)?.name || "";
    }

    await ensureProduct(productId, name || null);
    res.json({ success: true, productId, name: name || null });
  } catch (error) {
    console.error("Track product failed:", error);
    res.status(500).json({ error: "Unable to track product." });
  }
});

router.delete("/track/:productId", async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId <= 0)
    return res.status(400).json({ error: "Invalid productId." });
  try {
    await deleteTrackedProduct(productId);
    res.json({ success: true, productId });
  } catch (error) {
    console.error("Untrack product failed:", error);
    res.status(500).json({ error: "Unable to stop tracking product." });
  }
});

router.get("/tracked", async (_req, res) => {
  try {
    const rows = await getTrackedProducts();
    const productIds = rows.map((row) => row.id);

    // Catalog metadata and last known price are best-effort: a tracked list
    // must still render if the store or a history lookup is unavailable.
    const catalog = await loadCatalog().catch((error) => {
      console.error("Catalog unavailable while listing tracked:", error.message);
      return [];
    });
    const byId = new Map(catalog.map((p) => [p.productId, p]));

    const latest = await getLatestPrices(productIds).catch((error) => {
      console.error("Latest prices unavailable:", error.message);
      return {};
    });

    const products = await Promise.all(
      rows.map(async (row) => {
        let meta = byId.get(row.id);

        // Fill in a name we do not have yet, so the dashboard never falls back
        // to showing a bare product id.
        if (!meta && !row.name) meta = await fetchProductMeta(row.id);

        // Persist any name we learned, so products tracked before names were
        // stored keep working even if the catalog sample later misses them.
        if (meta?.name && !row.name) {
          ensureProduct(row.id, meta.name).catch((error) =>
            console.error("Name backfill failed:", error.message),
          );
        }

        meta = meta || {};
        const last = latest[row.id] || null;

        return {
          productId: row.id,
          name: meta.name || row.name || "",
          brand: meta.brand || "",
          sku: meta.sku || "",
          category: meta.category || "",
          trackedAt: row.created_at || null,
          price: last ? last.price : null,
          mrp: last ? last.mrp : null,
          discount: last ? last.discount : null,
          stock: last ? last.stock : null,
          stockText: last ? last.stock_text : null,
          seller: last ? last.seller : null,
          delivery: last ? last.delivery : null,
          lastScrapedAt: last ? last.scraped_at : null,
        };
      }),
    );

    res.json({ products, productIds });
  } catch (error) {
    console.error("Tracked products failed:", error);
    res.status(500).json({ error: "Unable to load tracked products." });
  }
});

router.get("/:productId/history", async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId <= 0)
    return res.status(400).json({ error: "Invalid productId." });
  try {
    res.json({ productId, history: await getPriceHistory(productId) });
  } catch (error) {
    console.error("Price history failed:", error);
    res.status(500).json({ error: "Unable to load price history." });
  }
});

router.get("/:productId/logs", async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId <= 0)
    return res.status(400).json({ error: "Invalid productId." });
  try {
    res.json({ productId, logs: await getScrapeLogs(productId) });
  } catch (error) {
    console.error("Scrape logs failed:", error);
    res.status(500).json({ error: "Unable to load scrape logs." });
  }
});

module.exports = router;
module.exports.warmCatalog = warmCatalog;
