const express = require("express");
const puppeteer = require("puppeteer");
const { randomUUID } = require("crypto");
const { scrapeWithRetry } = require("../scraper/scrapeProduct");
const {
  ensureProduct,
  insertPriceHistory,
  insertScrapeLogs,
  getTrackedProducts,
} = require("../db");

const router = express.Router();

router.post("/", async (req, res) => {
  const isCronRequest = req.query.source === "cron";

  let { productIds } = req.body;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    // getTrackedProducts returns { id, name } rows; the scrape loop wants ids.
    productIds = (await getTrackedProducts()).map((product) => product.id);
  }

  if (productIds.length === 0) {
    return res.status(400).json({ error: "No tracked products found" });
  }

  // cron-job.org disconnects after 30s, while a full scrape takes 90-150s.
  // The scrape itself is unaffected by that disconnect and runs to completion,
  // so the scheduled caller is acknowledged before the work starts instead of
  // being left to time out. "accepted" reports only that the run began — the
  // actual outcome of every attempt is recorded in price_history and
  // scrape_logs by the unchanged logic below.
  if (isCronRequest) {
    res.status(202).json({
      status: "accepted",
      message: "Scheduled scrape started",
    });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ], // needed for most hosted environments
  });

  const runId = randomUUID();
  const results = [];

  try {
    for (const id of productIds) {
      const page = await browser.newPage();

      try {
        const result = await scrapeWithRetry(page, id);

        await ensureProduct(id);

        if (result.status === "success") {
          await insertPriceHistory(result);
        }

        await insertScrapeLogs(
          id,
          result.attemptLog,
          runId,
          result.siteReportedAttempts,
        );

        results.push(result);
      } catch (error) {
        console.error(`Unexpected error for product ${id}:`, error);
        results.push({
          productId: id,
          status: "failed",
          reason: "unexpected error",
          error: error.message,
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  // Scheduled runs were already acknowledged before the scrape began, so there
  // is nothing further to send them.
  if (isCronRequest) return;

  res.json({ runId, results });
});

module.exports = router;
