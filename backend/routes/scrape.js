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
  let { productIds } = req.body;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    // getTrackedProducts returns { id, name } rows; the scrape loop wants ids.
    productIds = (await getTrackedProducts()).map((product) => product.id);
  }

  if (productIds.length === 0) {
    return res.status(400).json({ error: "No tracked products found" });
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

  // cron-job.org caps the response body it will accept (~1KB) and marks the
  // run "Failed (output too large)" beyond that. The detailed payload is about
  // 295 bytes per product, so scheduled runs ask for a compact acknowledgement
  // instead. This branch runs only after every scrape, price-history write and
  // scrape-log write above has already completed — it changes nothing about
  // what is scraped or stored, only what is echoed back to the caller.
  if (req.query.source === "cron") {
    const failureCount = results.filter(
      (result) => result.status !== "success",
    ).length;

    return res.json(
      failureCount === 0
        ? { status: "success", message: "Scheduled scrape completed" }
        : {
            status: "completed_with_errors",
            message: "Scheduled scrape completed with some failures",
          },
    );
  }

  res.json({ runId, results });
});

module.exports = router;
