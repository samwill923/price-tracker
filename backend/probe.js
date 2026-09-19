require("dotenv").config();
const puppeteer = require("puppeteer");
const { randomUUID } = require("crypto");
const { scrapeWithRetry } = require("./scraper/scrapeProduct");
const { ensureProduct, insertPriceHistory, insertScrapeLogs } = require("./db");

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
  });

  try {
    const productIds = [868, 869, 870];
    const runId = randomUUID();

    for (const id of productIds) {
      const page = await browser.newPage();

      try {
        const result = await scrapeWithRetry(page, id);

        console.log(`\nFINAL RESULT for product ${id}:`);
        console.log(result);

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
      } catch (error) {
        console.error(`\nUNEXPECTED ERROR for product ${id}:`);
        console.error(error);
      } finally {
        await page.close();
      }
    }
  } catch (error) {
    console.error("\nSCRAPER ERROR:");
    console.error(error);
  } finally {
    await browser.close();
  }
})();
