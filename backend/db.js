const supabase = require("./supabaseClient");

async function ensureProduct(productId) {
  await supabase
    .from("products")
    .upsert({ id: productId }, { onConflict: "id" });
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

module.exports = { ensureProduct, insertPriceHistory, insertScrapeLogs };
