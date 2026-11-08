require("dotenv").config();

const { createApp } = require("./app");

const requiredVariables = [
  "USERS_SERVICE_URL",
  "CATALOG_SERVICE_URL",
  "ORDERS_SERVICE_URL",
  "JWT_SECRET",
  "CATALOG_SERVICE_TOKEN",
  "ORDERS_SERVICE_TOKEN",
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`Falta configurar la variable ${variable}`);
  }
}

const app = createApp({
  usersUrl: process.env.USERS_SERVICE_URL,
  catalogUrl: process.env.CATALOG_SERVICE_URL,
  ordersUrl: process.env.ORDERS_SERVICE_URL,
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 30000),
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API Gateway ejecutándose en http://localhost:${PORT}`);
});