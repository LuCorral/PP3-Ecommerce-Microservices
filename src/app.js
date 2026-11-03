const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

function createApp({ usersUrl, catalogUrl, ordersUrl, timeoutMs }) {
  const app = express();

  app.use(
    cors({
      origin: process.env.FRONTEND_ORIGIN || "*",
    })
  );

  app.use(express.json());

  const services = {
    users: usersUrl,
    catalog: catalogUrl,
    orders: ordersUrl,
  };

  // --------------------------------------------------
  // FUNCIÓN GENÉRICA PARA LLAMAR A LOS MICROSERVICIOS
  // --------------------------------------------------

  async function callService(service, path, options = {}) {
    const url = `${services[service]}${path}`;

    let serviceToken = null;

    if (service === "orders") {
      serviceToken = process.env.ORDERS_SERVICE_TOKEN;
    }

    if (service === "catalog") {
      serviceToken = process.env.CATALOG_SERVICE_TOKEN;
    }

    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",

        ...(options.internal && serviceToken
          ? { "x-service-token": serviceToken }
          : {}),

        ...(options.headers || {}),
      },

      body: options.body
        ? JSON.stringify(options.body)
        : undefined,

      signal: AbortSignal.timeout(timeoutMs),
    });

    const data = await response.json();

    return {
      status: response.status,
      data,
    };
  }

  // --------------------------------------------------
  // JWT
  // --------------------------------------------------

  function readUser(req) {
    const authorization = req.get("authorization") || "";

    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      return null;
    }

    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  function requireAuth(req, res, next) {
    const user = readUser(req);

    if (!user) {
      return res.status(401).json({
        message: "Autenticación requerida",
      });
    }

    req.user = user;

    next();
  }

  // --------------------------------------------------
  // HEALTH
  // --------------------------------------------------

  app.get("/health", async (req, res) => {
    const health = {};

    for (const [name, baseUrl] of Object.entries(services)) {
      try {
        const response = await fetch(`${baseUrl}/health`, {
          signal: AbortSignal.timeout(timeoutMs),
        });

        health[name] = response.ok
          ? "ok"
          : "unavailable";
      } catch (error) {
        health[name] = "unavailable";
      }
    }

    const allOk = Object.values(health).every(
      (status) => status === "ok"
    );

    return res.status(allOk ? 200 : 503).json({
      status: allOk ? "ok" : "degraded",
      services: health,
    });
  });

  // --------------------------------------------------
  // LOGIN
  // --------------------------------------------------

  app.post(
    "/api/usuarios/auth/login",
    async (req, res) => {
      try {
        const result = await callService(
          "users",
          "/api/sesiones",
          {
            method: "POST",
            body: {
              email: req.body.email,
              password: req.body.password,
            },
          }
        );

        if (result.status >= 400) {
          return res
            .status(result.status)
            .json(result.data);
        }

        const user = result.data.user;

        return res.status(result.status).json({
          success: result.data.success,
          message: result.data.message,
          token: result.data.token,
          usuario: {
            id: user.id,
            nombre: user.name,
            apellido: user.apellido,
            email: user.email,
            rol: user.role,
          },
        });
      } catch (error) {
        console.error(
          "Error comunicándose con Usuarios:",
          error.message
        );

        return res.status(503).json({
          message:
            "El servicio de usuarios no está disponible",
        });
      }
    }
  );

  // --------------------------------------------------
  // REGISTRO
  // --------------------------------------------------

  app.post(
    "/api/usuarios/auth/register",
    async (req, res) => {
      try {
        const result = await callService(
          "users",
          "/api/usuarios",
          {
            method: "POST",
            body: {
              name: req.body.nombre,
              apellido: req.body.apellido,
              email: req.body.email,
              password: req.body.password,
              telefono: req.body.telefono,
            },
          }
        );

        if (result.status >= 400) {
          return res
            .status(result.status)
            .json(result.data);
        }

        return res
          .status(result.status)
          .json(result.data);
      } catch (error) {
        console.error(
          "Error registrando usuario:",
          error.message
        );

        return res.status(503).json({
          message:
            "El servicio de usuarios no está disponible",
        });
      }
    }
  );

  // --------------------------------------------------
  // PERFIL DEL USUARIO
  // --------------------------------------------------

  app.get(
    "/api/usuarios/auth/profile",
    requireAuth,
    async (req, res) => {
      try {
        const authorization =
          req.get("authorization");

        const result = await callService(
          "users",
          "/api/usuarios/me",
          {
            headers: {
              Authorization: authorization,
            },
          }
        );

        if (result.status >= 400) {
          return res
            .status(result.status)
            .json(result.data);
        }

        const user = result.data.user;

        return res.status(result.status).json({
          success: true,
          usuario: {
            id: user.id,
            nombre: user.name,
            apellido: user.apellido,
            email: user.email,
            telefono: user.telefono,
            rol: user.role,
          },
        });
      } catch (error) {
        console.error(
          "Error consultando el perfil:",
          error.message
        );

        return res.status(503).json({
          message:
            "El servicio de usuarios no está disponible",
        });
      }
    }
  );

  app.get(
  "/api/clientes/perfil",
  requireAuth,
  async (req, res) => {
    try {
      const authorization = req.get("authorization");

      const result = await callService(
        "users",
        "/api/usuarios/me",
        {
          headers: {
            Authorization: authorization,
          },
        }
      );

      if (result.status >= 400) {
        return res
          .status(result.status)
          .json(result.data);
      }

      const user = result.data.user;

      return res.status(result.status).json({
        id: user.id,
        nombre: user.name,
        apellido: user.apellido,
        email: user.email,
        telefono: user.telefono,
        rol: user.role,
      });
    } catch (error) {
      console.error(
        "Error consultando perfil del cliente:",
        error.message
      );

      return res.status(503).json({
        message:
          "El servicio de usuarios no está disponible",
      });
    }
  }
);

  // --------------------------------------------------
  // PRODUCTOS
  // --------------------------------------------------

  app.get("/api/productos", async (req, res) => {
    try {
      const params = new URLSearchParams(req.query);

      if (!params.has("limit")) {
        params.set("limit", "100");
      }

      const query = params.toString();

      const path = query
        ? `/api/productos?${query}`
        : "/api/productos";

      const result = await callService(
        "catalog",
        path
      );

      if (result.status >= 400) {
        return res
          .status(result.status)
          .json(result.data);
      }

      return res.status(result.status).json({
        productos: result.data.items || [],
        pagination:
          result.data.pagination || null,
      });
    } catch (error) {
      console.error(
        "Error comunicándose con Catálogo:",
        error.message
      );

      return res.status(503).json({
        message:
          "El servicio de catálogo no está disponible",
      });
    }
  });

  // --------------------------------------------------
  // CATEGORÍAS
  // --------------------------------------------------

  app.get("/api/categorias", async (req, res) => {
    try {
      const result = await callService(
        "catalog",
        "/api/categorias"
      );

      return res
        .status(result.status)
        .json(result.data);
    } catch (error) {
      console.error(
        "Error comunicándose con Catálogo:",
        error.message
      );

      return res.status(503).json({
        message:
          "El servicio de catálogo no está disponible",
      });
    }
  });

  // --------------------------------------------------
  // LISTAR PEDIDOS
  // --------------------------------------------------

  app.get(
    "/api/pedidos",
    requireAuth,
    async (req, res) => {
      try {
        const result = await callService(
          "orders",
          "/api/pedidos",
          {
            internal: true,
            headers: {
              "x-user-id": String(
                req.user.sub || req.user.id
              ),
              "x-user-role": String(
                req.user.role || ""
              ),
            },
          }
        );

        return res
          .status(result.status)
          .json(result.data);
      } catch (error) {
        console.error(
          "Error comunicándose con Pedidos:",
          error.message
        );

        return res.status(503).json({
          message:
            "El servicio de pedidos no está disponible",
        });
      }
    }
  );

  app.get(
  "/api/pedidos/mis-pedidos",
  requireAuth,
  async (req, res) => {
    try {
      const result = await callService(
        "orders",
        "/api/pedidos",
        {
          internal: true,
          headers: {
            "x-user-id": String(
              req.user.sub || req.user.id
            ),
            "x-user-role": String(
              req.user.role || ""
            ),
          },
        }
      );

      return res
        .status(result.status)
        .json(result.data);
    } catch (error) {
      console.error(
        "Error consultando pedidos del usuario:",
        error.message
      );

      return res.status(503).json({
        message:
          "El servicio de pedidos no está disponible",
      });
    }
  }
);

//cancelacion pedidos

app.put(
  "/api/pedidos/:id/cancelar",
  requireAuth,
  async (req, res) => {
    try {
      const orderId = req.params.id;

      const userHeaders = {
        "x-user-id": String(
          req.user.sub || req.user.id
        ),
        "x-user-role": String(
          req.user.role || ""
        ),
      };

      // 1. Consultar el pedido para conocer sus productos
      const orderResult = await callService(
        "orders",
        `/api/pedidos/${orderId}`,
        {
          internal: true,
          headers: userHeaders,
        }
      );

      if (orderResult.status >= 400) {
        return res
          .status(orderResult.status)
          .json(orderResult.data);
      }

      const order = orderResult.data;

      // 2. Marcar pedido como "cancelling"
      const cancellingResult = await callService(
        "orders",
        `/api/pedidos/${orderId}`,
        {
          method: "PATCH",
          internal: true,
          headers: userHeaders,
          body: {
            estado: "cancelling",
          },
        }
      );

      if (cancellingResult.status >= 400) {
        return res
          .status(cancellingResult.status)
          .json(cancellingResult.data);
      }

      // 3. Preparar productos para devolver el stock
      const items = Array.isArray(order.detalles)
        ? order.detalles.map((item) => ({
            productId: item.productoId,
            quantity: item.cantidad,
          }))
        : [];

      if (items.length === 0) {
        return res.status(409).json({
          message:
            "El pedido no tiene productos para devolver",
        });
      }

      // 4. Restaurar stock en Catálogo
      const inventoryResult = await callService(
        "catalog",
        "/api/movimientos-stock",
        {
          method: "POST",
          internal: true,
          body: {
            orderId: String(orderId),
            idempotencyKey:
              `order:${orderId}:cancel`,
            items,
            action: "return",
          },
        }
      );

      if (inventoryResult.status >= 400) {
        return res
          .status(inventoryResult.status)
          .json({
            message:
              "No se pudo restaurar el stock",
            detalle: inventoryResult.data,
          });
      }

      // 5. Marcar finalmente como "cancelled"
      const cancelledResult = await callService(
        "orders",
        `/api/pedidos/${orderId}`,
        {
          method: "PATCH",
          internal: true,
          headers: userHeaders,
          body: {
            estado: "cancelled",
          },
        }
      );

      if (cancelledResult.status >= 400) {
        return res
          .status(cancelledResult.status)
          .json(cancelledResult.data);
      }

      return res.status(200).json({
        success: true,
        message: "Pedido cancelado",
        pedido: cancelledResult.data,
        inventario: inventoryResult.data,
      });
    } catch (error) {
      console.error(
        "Error cancelando pedido:",
        error.message
      );

      return res.status(503).json({
        message:
          "No se pudo cancelar el pedido",
      });
    }
  }
);

  // --------------------------------------------------
  // CREAR PEDIDO
  // --------------------------------------------------

  app.post(
    "/api/pedidos",
    requireAuth,
    async (req, res) => {
      try {
        const items = Array.isArray(req.body.items)
          ? req.body.items.map((item) => ({
              productId:
                item.productId ?? item.productoId,
              quantity:
                item.quantity ?? item.cantidad,
            }))
          : [];

        if (items.length === 0) {
          return res.status(400).json({
            message:
              "El pedido debe contener al menos un producto",
          });
        }

        const idempotencyKey =
          req.get("Idempotency-Key") ||
          `order-${
            req.user.sub || req.user.id
          }-${Date.now()}`;

        // 1. Crear pedido en Pedidos
        const orderResult = await callService(
          "orders",
          "/api/pedidos",
          {
            method: "POST",
            internal: true,
            headers: {
              "x-user-id": String(
                req.user.sub || req.user.id
              ),

              "x-user-email": String(
                req.user.email || ""
              ),

              "x-user-name": [
                req.user.name,
                req.user.apellido,
              ]
                .filter(Boolean)
                .join(" "),

              "x-user-role": String(
                req.user.role || ""
              ),

              "idempotency-key":
                idempotencyKey,
            },

            body: {
              items,
              direccionEntrega:
                req.body.direccionEntrega,
            },
          }
        );

        if (orderResult.status >= 400) {
          return res
            .status(orderResult.status)
            .json(orderResult.data);
        }

        const order = orderResult.data;

        // 2. Validar y descontar stock en Catálogo
        const inventoryResult =
          await callService(
            "catalog",
            "/api/movimientos-stock",
            {
              method: "POST",
              internal: true,

              body: {
                orderId: String(order.id),

                idempotencyKey:
                  `order:${order.id}:sale`,

                items,

                couponCode:
                  req.body.couponCode ??
                  req.body.cupon ??
                  null,
              },
            }
          );

        // ------------------------------------------
        // CATÁLOGO RECHAZÓ EL STOCK
        // ------------------------------------------

        if (inventoryResult.status >= 400) {
          const rejectedOrder =
            await callService(
              "orders",
              `/api/pedidos/${order.id}`,
              {
                method: "PATCH",
                internal: true,

                headers: {
                  "x-user-id": String(
                    req.user.sub ||
                      req.user.id
                  ),

                  "x-user-role": String(
                    req.user.role || ""
                  ),
                },

                body: {
                  estado: "rejected",
                },
              }
            );

          return res
            .status(inventoryResult.status)
            .json({
              message:
                "No se pudo confirmar el inventario",

              pedido:
                rejectedOrder.data,

              detalle:
                inventoryResult.data,
            });
        }

        // ------------------------------------------
        // CATÁLOGO CONFIRMÓ STOCK
        // ------------------------------------------

        const confirmedOrder =
          await callService(
            "orders",
            `/api/pedidos/${order.id}`,
            {
              method: "PATCH",
              internal: true,

              headers: {
                "x-user-id": String(
                  req.user.sub ||
                    req.user.id
                ),

                "x-user-role": String(
                  req.user.role || ""
                ),
              },

              body: {
                estado: "confirmed",
                inventory:
                  inventoryResult.data,
              },
            }
          );

        if (confirmedOrder.status >= 400) {
          return res
            .status(confirmedOrder.status)
            .json({
              message:
                "El stock fue procesado pero no se pudo confirmar el pedido",

              detalle:
                confirmedOrder.data,
            });
        }

        return res.status(201).json({
          success: true,

          pedido:
            confirmedOrder.data,

          inventario:
            inventoryResult.data,
        });
      } catch (error) {
        console.error(
          "Error creando pedido:",
          error.message
        );

        return res.status(503).json({
          message:
            "No se pudo procesar el pedido",
        });
      }
    }
  );

  return app;
}

module.exports = { createApp };