require("dotenv").config();
const express = require("express");
const scrapeRouter = require("./routes/scrape");

const app = express();
app.use(express.json());

app.use("/api/scrape", scrapeRouter);

app.get("/", (req, res) => {
  res.send("INE Price Tracker backend is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
