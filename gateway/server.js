require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    service: "api-gateway",
    status: "ok"
  });
});

app.listen(PORT, () => {
  console.log(`API Gateway ejecutándose en http://localhost:${PORT}`);
});