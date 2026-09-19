async function scrapeProduct(page, productId) {
  const url = `https://demo.inelabteamdev.com/product/${productId}`;

  await page.goto(url, {
    waitUntil: "networkidle0",
  });

  const cookieBtn = await page.$('button[aria-label="Accept cookies"]');

  if (cookieBtn) {
    await cookieBtn.click();
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("Page loaded for product", productId);

  const priceBlock = await page.$(".price-block.price-idle");

  if (!priceBlock) {
    return {
      productId,
      status: "failed",
      reason: "price block not found",
    };
  }

  const blockBox = await priceBlock.boundingBox();

  console.log("price block:", blockBox);

  if (!blockBox) {
    return {
      productId,
      status: "failed",
      reason: "could not get price block coordinates",
    };
  }

  await page.mouse.move(blockBox.x + 20, blockBox.y + 20);

  console.log("Entered price area");

  for (let i = 0; i < 10; i++) {
    const x = blockBox.x + 20 + (i % 5) * 30;
    const y = blockBox.y + 20 + Math.floor(i / 5) * 20;

    await page.mouse.move(x, y);
    console.log(`move ${i + 1}:`, x, y);

    await new Promise((r) => setTimeout(r, 60));
  }

  console.log("Waiting for dwell...");
  await new Promise((r) => setTimeout(r, 700));

  const beforeClick = await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Reveal price"]');
    return {
      disabled: button?.disabled,
      buttonText: button?.innerText,
    };
  });

  console.log("AFTER HUMAN-LIKE HOVER:", beforeClick);

  if (beforeClick.disabled) {
    return {
      productId,
      status: "failed",
      reason: "button is still disabled",
      state: beforeClick,
    };
  }

  const btn = await page.$('button[aria-label="Reveal price"]');

  if (!btn) {
    return {
      productId,
      status: "failed",
      reason: "reveal button not found",
    };
  }

  console.log("Clicking Reveal price...");
  await btn.click();

  try {
    await page.waitForSelector(".price-block.price-success", {
      timeout: 6000,
    });
  } catch {
    const state = await page.evaluate(() => ({
      priceBlock: document.querySelector(".price-block")?.outerHTML ?? null,
      bodyText: document.body.innerText,
    }));

    return {
      productId,
      status: "failed",
      reason: "price did not reach success state",
      state,
    };
  }

  console.log("Price success state detected!");

  // The site's generated class suffix rotates (pv-k2, pv-m4, etc.)
  // so we match on the "pv-" prefix instead of an exact class.
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          ".price-block.price-success .price-main output[class*='pv-']",
        );
        return el && el.textContent.trim().replace(/[^\d]/g, "").length > 0;
      },
      { timeout: 3000 },
    );
  } catch {
    console.log("Price text didn't populate in time, proceeding anyway...");
  }

  const data = await page.evaluate(() => {
    const priceBlock = document.querySelector(".price-block.price-success");

    if (!priceBlock) {
      return { status: "failed", reason: "success price block not found" };
    }

    const priceMain = priceBlock.querySelector(".price-main");

    if (!priceMain) {
      return { status: "failed", reason: "price-main not found" };
    }

    const priceEl = priceMain.querySelector("output[class*='pv-']");

    if (!priceEl) {
      return {
        status: "failed",
        reason: "rendered selling price not found",
        priceMainHTML: priceMain.outerHTML,
      };
    }

    const priceText = priceEl.textContent.trim();
    const cleanPrice = priceText.replace(/[^\d.]/g, "");
    const price = Number(cleanPrice);

    if (!Number.isFinite(price)) {
      return {
        status: "failed",
        reason: "could not parse rendered selling price",
        priceText,
      };
    }

    const stockEl = priceBlock.querySelector(".stock-badge");
    let stock = "unknown";
    let stockText = null;

    if (stockEl) {
      stockText = stockEl.textContent.trim();
      if (/out of stock/i.test(stockText)) {
        stock = "out_of_stock";
      } else {
        const match = stockText.match(/(\d[\d,]*)\s*left/i);
        if (match) {
          stock = parseInt(match[1].replace(/,/g, ""), 10);
        } else {
          stock = "in_stock";
        }
      }
    }

    const mrpEl = priceBlock.querySelector(".price-main span[class*='mr-']");
    let mrp = null;
    if (mrpEl) {
      const match = mrpEl.textContent.match(/[\d,]+/);
      if (match) mrp = Number(match[0].replace(/,/g, ""));
    }

    const discountEl = priceBlock.querySelector(
      ".price-main span[class*='bd-']",
    );
    const discount = discountEl?.textContent.trim() ?? null;

    const sellerEl = priceBlock.querySelector(".sr-k2, [class*='sr-']");
    const seller =
      sellerEl?.textContent.replace(/^Sold by\s*/i, "").trim() ?? null;

    const deliveryEl = priceBlock.querySelector(".dl-k2, [class*='dl-']");
    const delivery = deliveryEl?.textContent.trim() ?? null;

    return {
      status: "success",
      price,
      mrp,
      discount,
      stock,
      stockText,
      seller,
      delivery,
      priceText,
    };
  });

  console.log("\nEXTRACTION RESULT:");
  console.log(data);

  return { productId, ...data };
}

async function scrapeWithRetry(page, productId, maxAttempts = 5) {
  const attemptLog = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await scrapeProduct(page, productId);

    const siteReportedAttempts = await page
      .evaluate(() => {
        const el = document.querySelector(".price-block");
        const match = el?.innerText.match(/Loaded in (\d+) attempt/i);
        return match ? Number(match[1]) : null;
      })
      .catch(() => null);

    if (result.status === "success") {
      attemptLog.push({ attempt, outcome: "success" });
      return {
        ...result,
        attempts: attempt,
        attemptLog,
        siteReportedAttempts,
      };
    }

    attemptLog.push({
      attempt,
      outcome: attempt < maxAttempts ? "retried" : "failed",
      reason: result.reason,
    });

    if (attempt < maxAttempts) {
      console.log(
        `Attempt ${attempt} failed for product ${productId}, retrying...`,
      );
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return {
    productId,
    status: "failed",
    reason: "exhausted retries",
    attempts: maxAttempts,
    attemptLog,
  };
}

module.exports = { scrapeProduct, scrapeWithRetry };
