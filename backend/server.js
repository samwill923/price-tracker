require("dotenv").config();

const express = require("express");
const cors = require("cors");
const scrapeRouter = require("./routes/scrape");
const productsRouter = require("./routes/products");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/scrape", scrapeRouter);
app.use("/api/products", productsRouter);

app.get("/", (req, res) => {
  res.send("INE Price Tracker backend is running.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Build the store catalog in the background so the first search is instant.
  productsRouter.warmCatalog();
});
