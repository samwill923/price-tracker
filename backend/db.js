const supabase = require("./supabaseClient");

async function ensureProduct(productId, name) {
  const row = { id: productId };
  // Only overwrite the stored name when we actually have one, so a plain
  // scrape run never wipes the name captured at track time.
  if (name) row.name = name;

  await supabase.from("products").upsert(row, { onConflict: "id" });
}

async function insertPriceHistory(result) {
  const { error } = await supabase.from("price_history").insert({
    product_id: result.productId,
    price: result.price,
    mrp: result.mrp,
    discount: result.discount,
    stock: String(result.stock),
    stock_text: result.stockText,
    seller: result.seller,
    delivery: result.delivery,
  });

  if (error) console.error("price_history insert failed:", error);
}

async function insertScrapeLogs(
  productId,
  attemptLog,
  runId,
  siteReportedAttempts,
) {
  const rows = attemptLog.map((log) => ({
    product_id: productId,
    attempt_number: log.attempt,
    outcome: log.outcome,
    reason: log.reason ?? null,
    site_reported_attempts: siteReportedAttempts ?? null,
    run_id: runId,
  }));

  const { error } = await supabase.from("scrape_logs").insert(rows);

  if (error) console.error("scrape_logs insert failed:", error);
}
async function getTrackedProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data || [];
}
async function getPriceHistory(productId) {
  const { data, error } = await supabase
    .from("price_history")
    .select("*")
    .eq("product_id", productId)
    .order("scraped_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getScrapeLogs(productId) {
  const { data, error } = await supabase
    .from("scrape_logs")
    .select("*")
    .eq("product_id", productId)
    .order("logged_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getLatestPrices(productIds) {
  if (!productIds.length) return {};

  const { data, error } = await supabase
    .from("price_history")
    .select("*")
    .in("product_id", productIds)
    .order("scraped_at", { ascending: false });

  if (error) throw error;

  const latest = {};
  for (const row of data || []) {
    // Rows arrive newest-first, so the first one seen per product wins.
    if (!latest[row.product_id]) latest[row.product_id] = row;
  }
  return latest;
}

async function deleteTrackedProduct(productId) {
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);
  if (error) throw error;
}
module.exports = {
  ensureProduct,
  insertPriceHistory,
  insertScrapeLogs,
  getTrackedProducts,
  getPriceHistory,
  getScrapeLogs,
  getLatestPrices,
  deleteTrackedProduct,
};
