require("dotenv").config();

const { createApp } = require("./app");

const requiredVariables = [
  "USERS_SERVICE_URL",
  "CATALOG_SERVICE_URL",
  "ORDERS_SERVICE_URL",
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
  timeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 10000),
});

const PORT = process.env.PORT || 3000;

//para probar longitud token
/*console.log(
  "SERVICE_TOKEN cargado:",
  !!process.env.SERVICE_TOKEN,
  "longitud:",
  process.env.SERVICE_TOKEN?.length
);*/

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API Gateway ejecutándose en http://localhost:${PORT}`);
});