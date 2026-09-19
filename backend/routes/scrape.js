const express = require("express");
const puppeteer = require("puppeteer");
const { randomUUID } = require("crypto");
const { scrapeWithRetry } = require("../scraper/scrapeProduct");
const {
  ensureProduct,
  insertPriceHistory,
  insertScrapeLogs,
} = require("../db");

const router = express.Router();

router.post("/", async (req, res) => {
  const { productIds } = req.body;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res
      .status(400)
      .json({ error: "productIds must be a non-empty array" });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // needed for most hosted environments
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

  res.json({ runId, results });
});

module.exports = router;
