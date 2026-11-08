const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

function createApp({ usersUrl, catalogUrl, ordersUrl, timeoutMs }) {
  const app = express();

  const allowedOrigins = [
    "https://pp3-frontend-alternativo.vercel.app",
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(
          new Error("Origen no permitido por CORS")
        );
      },
    })
  );

  app.use(express.json());

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
    const authorization =
      req.get("authorization") || "";

    const [scheme, token] =
      authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      return null;
    }

    try {
      return jwt.verify(
        token,
        process.env.JWT_SECRET
      );
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

    for (
      const [name, baseUrl]
      of Object.entries(services)
    ) {
      try {
        const response = await fetch(
          `${baseUrl}/health`,
          {
            signal:
              AbortSignal.timeout(timeoutMs),
          }
        );

        health[name] = response.ok
          ? "ok"
          : "unavailable";
      } catch (error) {
        health[name] = "unavailable";
      }
    }

    const allOk =
      Object.values(health).every(
        (status) => status === "ok"
      );

    return res
      .status(allOk ? 200 : 503)
      .json({
        status: allOk ? "ok" : "degraded",
        services: health,
      });
  });

  // --------------------------------------------------
// SESIONES - RUTA CANÓNICA
// --------------------------------------------------

app.post("/api/sesiones", async (req, res) => {
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

    return res
      .status(result.status)
      .json(result.data);

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

        return res
          .status(result.status)
          .json({
            success:
              result.data.success,

            message:
              result.data.message,

            token:
              result.data.token,

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
// USUARIOS - REGISTRO CANÓNICO
// --------------------------------------------------

app.post("/api/usuarios", async (req, res) => {
  try {
    const result = await callService(
      "users",
      "/api/usuarios",
      {
        method: "POST",
        body: {
          ...req.body,
          name: req.body.name ?? req.body.nombre,
        },
      }
    );

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
});

// --------------------------------------------------
// USUARIO AUTENTICADO
// --------------------------------------------------

app.get(
  "/api/usuarios/me",
  requireAuth,
  async (req, res) => {
    try {
      const result = await callService(
        "users",
        "/api/usuarios/me",
        {
          headers: {
            Authorization:
              req.get("authorization"),
          },
        }
      );

      return res
        .status(result.status)
        .json(result.data);

    } catch (error) {
      console.error(
        "Error consultando usuario:",
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
// ACTUALIZAR USUARIO AUTENTICADO
// --------------------------------------------------

app.put(
  "/api/usuarios/me",
  requireAuth,
  async (req, res) => {
    try {
      const result = await callService(
        "users",
        "/api/usuarios/me",
        {
          method: "PUT",

          headers: {
            Authorization:
              req.get("authorization"),
          },

          body: req.body,
        }
      );

      return res
        .status(result.status)
        .json(result.data);

    } catch (error) {
      console.error(
        "Error actualizando usuario:",
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
// CARRITO DEL USUARIO
// --------------------------------------------------

app.get(
  "/api/usuarios/me/carrito",
  requireAuth,
  async (req, res) => {
    try {
      const result = await callService(
        "users",
        "/api/usuarios/me/carrito",
        {
          headers: {
            Authorization: req.get("authorization"),
          },
        }
      );

      return res
        .status(result.status)
        .json(result.data);

    } catch (error) {
      console.error(
        "Error consultando carrito:",
        error.message
      );

      return res.status(503).json({
        message:
          "El servicio de usuarios no está disponible",
      });
    }
  }
);

app.put(
  "/api/usuarios/me/carrito",
  requireAuth,
  async (req, res) => {
    try {
      const result = await callService(
        "users",
        "/api/usuarios/me/carrito",
        {
          method: "PUT",
          headers: {
            Authorization: req.get("authorization"),
          },
          body: req.body,
        }
      );

      return res
        .status(result.status)
        .json(result.data);

    } catch (error) {
      console.error(
        "Error guardando carrito:",
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

        const result =
          await callService(
            "users",
            "/api/usuarios/me",
            {
              headers: {
                Authorization:
                  authorization,
              },
            }
          );

        if (result.status >= 400) {
          return res
            .status(result.status)
            .json(result.data);
        }

        const user =
          result.data.user;

        return res
          .status(result.status)
          .json({
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

  // --------------------------------------------------
  // PERFIL DE CLIENTE
  // --------------------------------------------------

  app.get(
    "/api/clientes/perfil",
    requireAuth,
    async (req, res) => {
      try {
        const authorization =
          req.get("authorization");

        const result =
          await callService(
            "users",
            "/api/clientes/perfil",
            {
              headers: {
                Authorization:
                  authorization,
              },
            }
          );

        return res
          .status(result.status)
          .json(result.data);
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

  app.post(
    "/api/clientes",
    requireAuth,
    async (req, res) => {
      try {
        const authorization =
          req.get("authorization");

        const result =
          await callService(
            "users",
            "/api/clientes",
            {
              method: "POST",

              headers: {
                Authorization:
                  authorization,
              },

              body: req.body,
            }
          );

        return res
          .status(result.status)
          .json(result.data);
      } catch (error) {
        console.error(
          "Error guardando perfil del cliente:",
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

  app.get(
    "/api/productos",
    async (req, res) => {
      try {
        const params =
          new URLSearchParams(req.query);

        if (!params.has("limit")) {
          params.set("limit", "100");
        }

        const query =
          params.toString();

        const path = query
          ? `/api/productos?${query}`
          : "/api/productos";

        const result =
          await callService(
            "catalog",
            path
          );

        if (result.status >= 400) {
          return res
            .status(result.status)
            .json(result.data);
        }

        return res
          .status(result.status)
          .json({
            productos:
              result.data.items || [],

            pagination:
              result.data.pagination ||
              null,
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
    }
  );

// --------------------------------------------------
// RECUPERAR INTENTO DE PEDIDO
// --------------------------------------------------

app.get(
  "/api/pedidos/operaciones/:attemptId",
  requireAuth,
  async (req, res) => {
    try {
      const result = await callService(
        "orders",
        `/api/pedidos/internal/intentos/${encodeURIComponent(
          req.params.attemptId
        )}`,
        {
          internal: true,
          headers: {
            "x-user-id": String(
              req.user.sub ||
              req.user.id
            ),
            "x-user-role": String(
              req.user.role ||
              ""
            ),
          },
        }
      );

      return res
        .status(result.status)
        .json(result.data);

    } catch (error) {
      console.error(
        "Error recuperando intento de pedido:",
        error.message
      );

      return res.status(503).json({
        message:
          "El servicio de pedidos no está disponible",
      });
    }
  }
);

  // --------------------------------------------------
// DETALLE DE PRODUCTO
// --------------------------------------------------

app.get(
  "/api/productos/:id",
  async (req, res) => {
    try {
      const result = await callService(
        "catalog",
        `/api/productos/${encodeURIComponent(req.params.id)}`
      );

      return res
        .status(result.status)
        .json(result.data);

    } catch (error) {
      console.error(
        "Error consultando producto:",
        error.message
      );

      return res.status(503).json({
        message:
          "El servicio de catálogo no está disponible",
      });
    }
  }
);

  // --------------------------------------------------
  // CATEGORÍAS
  // --------------------------------------------------

  app.get(
    "/api/categorias",
    async (req, res) => {
      try {
        const result =
          await callService(
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
    }
  );

  // --------------------------------------------------
  // LISTAR PEDIDOS
  // --------------------------------------------------

  app.get(
    "/api/pedidos",
    requireAuth,
    async (req, res) => {
      try {
        const result =
          await callService(
            "orders",
            "/api/pedidos",
            {
              internal: true,

              headers: {
                "x-user-id":
                  String(
                    req.user.sub ||
                    req.user.id
                  ),

                "x-user-role":
                  String(
                    req.user.role ||
                    ""
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

  // --------------------------------------------------
  // MIS PEDIDOS
  // --------------------------------------------------

  app.get(
    "/api/pedidos/mis-pedidos",
    requireAuth,
    async (req, res) => {
      try {
        const result =
          await callService(
            "orders",
            "/api/pedidos",
            {
              internal: true,

              headers: {
                "x-user-id":
                  String(
                    req.user.sub ||
                    req.user.id
                  ),

                "x-user-role":
                  String(
                    req.user.role ||
                    ""
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

  // --------------------------------------------------
// DETALLE DE PEDIDO
// --------------------------------------------------

app.get(
  "/api/pedidos/:id",
  requireAuth,
  async (req, res) => {
    try {
      const result = await callService(
        "orders",
        `/api/pedidos/${req.params.id}`,
        {
          internal: true,
          headers: {
            "x-user-id": req.user.sub,
            "x-user-role": req.user.role,
          },
        }
      );

      return res
        .status(result.status)
        .json(result.data);

    } catch (error) {
      console.error(
        "Error consultando pedido:",
        error.message
      );

      return res.status(503).json({
        message:
          "El servicio de pedidos no está disponible",
      });
    }
  }
);

// --------------------------------------------------
// PAGAR PEDIDO
// --------------------------------------------------

app.post(
  "/api/pedidos/:id/pagar",
  requireAuth,
  async (req, res) => {
    try {
      const result = await callService(
        "orders",
        `/api/pedidos/${req.params.id}/pagar`,
        {
          method: "POST",
          internal: true,
          headers: {
            "x-user-id": req.user.sub,
            "x-user-role": req.user.role,
          },
          body: req.body,
        }
      );

      return res
        .status(result.status)
        .json(result.data);

    } catch (error) {
      console.error(
        "Error procesando pago:",
        error.message
      );

      return res.status(503).json({
        message:
          "El servicio de pedidos no está disponible",
      });
    }
  }
);

// --------------------------------------------------
// COMPROBANTE DE PEDIDO
// --------------------------------------------------

app.get(
  "/api/pedidos/:id/comprobante",
  requireAuth,
  async (req, res) => {
    try {
      const result = await callService(
        "orders",
        `/api/pedidos/${req.params.id}/comprobante`,
        {
          internal: true,
          headers: {
            "x-user-id": req.user.sub,
            "x-user-role": req.user.role,
          },
        }
      );

      return res
        .status(result.status)
        .json(result.data);

    } catch (error) {
      console.error(
        "Error consultando comprobante:",
        error.message
      );

      return res.status(503).json({
        message:
          "El servicio de pedidos no está disponible",
      });
    }
  }
);

  // --------------------------------------------------
// CANCELACIÓN DE PEDIDOS
// --------------------------------------------------

const cancelarPedido = async (req, res) => {
  try {
    const orderId =
      req.params.id;

    const userHeaders = {
      "x-user-id":
        String(
          req.user.sub ||
          req.user.id
        ),

      "x-user-role":
        String(
          req.user.role ||
          ""
        ),
    };

    // ------------------------------------------
    // 1. CONSULTAR PEDIDO
    // ------------------------------------------

    const orderResult =
      await callService(
        "orders",
        `/api/pedidos/${orderId}`,
        {
          internal: true,
          headers: userHeaders,
        }
      );

    if (
      orderResult.status >= 400
    ) {
      return res
        .status(
          orderResult.status
        )
        .json(
          orderResult.data
        );
    }

    const order =
      orderResult.data;

    // ------------------------------------------
    // 2. PASAR PEDIDO A CANCELLING
    // ------------------------------------------

    const cancellingResult =
      await callService(
        "orders",
        `/api/pedidos/${orderId}`,
        {
          method: "PATCH",
          internal: true,

          headers:
            userHeaders,

          body: {
            estado:
              "cancelling",
          },
        }
      );

    if (
      cancellingResult.status >=
      400
    ) {
      return res
        .status(
          cancellingResult.status
        )
        .json(
          cancellingResult.data
        );
    }

    // ------------------------------------------
    // 3. PREPARAR PRODUCTOS
    // ------------------------------------------

    const items =
      Array.isArray(
        order.detalles
      )
        ? order.detalles.map(
            (item) => ({
              productId:
                item.productoId,

              quantity:
                item.cantidad,
            })
          )
        : [];

    if (
      items.length === 0
    ) {
      return res
        .status(409)
        .json({
          message:
            "El pedido no tiene productos para devolver",
        });
    }

    // ------------------------------------------
    // 4. RESTAURAR STOCK
    // ------------------------------------------

    const inventoryResult =
      await callService(
        "catalog",
        "/api/movimientos-stock",
        {
          method: "POST",
          internal: true,

          body: {
            orderId:
              String(
                orderId
              ),

            idempotencyKey:
              `order:${orderId}:cancel`,

            items,

            action:
              "return",
          },
        }
      );

    if (
      inventoryResult.status >=
      400
    ) {
      return res
        .status(
          inventoryResult.status
        )
        .json({
          message:
            "No se pudo restaurar el stock",

          detalle:
            inventoryResult.data,
        });
    }

    // ------------------------------------------
    // 5. PASAR PEDIDO A CANCELLED
    // ------------------------------------------

    const cancelledResult =
      await callService(
        "orders",
        `/api/pedidos/${orderId}`,
        {
          method: "PATCH",
          internal: true,

          headers:
            userHeaders,

          body: {
            estado:
              "cancelled",
          },
        }
      );

    if (
      cancelledResult.status >=
      400
    ) {
      return res
        .status(
          cancelledResult.status
        )
        .json(
          cancelledResult.data
        );
    }

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Pedido cancelado",

        pedido:
          cancelledResult.data,

        inventario:
          inventoryResult.data,
      });

  } catch (error) {
    console.error(
      "Error cancelando pedido:",
      error.message
    );

    return res
      .status(503)
      .json({
        message:
          "No se pudo cancelar el pedido",
      });
  }
};


// --------------------------------------------------
// RUTA REST PRINCIPAL
// PATCH /api/pedidos/:id
// --------------------------------------------------

app.patch(
  "/api/pedidos/:id",
  requireAuth,
  async (req, res) => {

    if (
      req.body.estado !==
      "cancelled"
    ) {
      return res
        .status(400)
        .json({
          message:
            "Solo se permite cancelar el pedido desde esta ruta",
        });
    }

    return cancelarPedido(
      req,
      res
    );
  }
);


// --------------------------------------------------
// RUTA LEGACY
// Se mantiene temporalmente para no romper
// el frontend existente.
// --------------------------------------------------

app.put(
  "/api/pedidos/:id/cancelar",
  requireAuth,
  cancelarPedido
);

 // --------------------------------------------------
// CREAR PEDIDO
// --------------------------------------------------

app.post(
  "/api/pedidos",
  requireAuth,
  async (req, res) => {
    try {
      const items =
        Array.isArray(
          req.body.items
        )
          ? req.body.items.map(
              (item) => ({
                productId:
                  item.productId ??
                  item.productoId,

                quantity:
                  item.quantity ??
                  item.cantidad,
              })
            )
          : [];

      if (
        items.length === 0
      ) {
        return res
          .status(400)
          .json({
            message:
              "El pedido debe contener al menos un producto",
          });
      }

      // Normalizamos el cupón para aceptar
      // tanto couponCode como cupon
      const couponCode =
        req.body.couponCode ??
        req.body.cupon ??
        null;

      const idempotencyKey =
        req.get(
          "Idempotency-Key"
        ) ||
        `order-${
          req.user.sub ||
          req.user.id
        }-${Date.now()}`;

      const userHeaders = {
        "x-user-id":
          String(
            req.user.sub ||
            req.user.id
          ),

        "x-user-role":
          String(
            req.user.role ||
            ""
          ),
      };

      // ------------------------------------------
      // 1. CREAR PEDIDO EN PEDIDOS
      // ------------------------------------------

      const orderResult =
        await callService(
          "orders",
          "/api/pedidos",
          {
            method: "POST",
            internal: true,

            headers: {
              ...userHeaders,

              "x-user-email":
                String(
                  req.user.email ||
                  ""
                ),

              "x-user-name":
                [
                  req.user.name,
                  req.user.apellido,
                ]
                  .filter(Boolean)
                  .join(" "),

              "idempotency-key":
                idempotencyKey,
            },

            body: {
              items,

              direccionEntrega:
                req.body
                  .direccionEntrega,

              couponCode,
            },
          }
        );

      if (
        orderResult.status >= 400
      ) {
        return res
          .status(
            orderResult.status
          )
          .json(
            orderResult.data
          );
      }

      const order =
        orderResult.data;

        // ------------------------------------------
        // 2. DESCONTAR STOCK EN CATÁLOGO
        // ------------------------------------------

        const inventoryResult =
          await callService(
            "catalog",
            "/api/movimientos-stock",
            {
              method: "POST",
              internal: true,

              body: {
                orderId:
                  String(
                    order.id
                  ),

                idempotencyKey:
                  `order:${order.id}:sale`,

                items,

                couponCode,
                action:
                  "sale",
              },
            }
          );

        // ------------------------------------------
        // CATÁLOGO RECHAZÓ EL STOCK
        // ------------------------------------------

        if (
          inventoryResult.status >=
          400
        ) {
          const rejectedOrder =
            await callService(
              "orders",
              `/api/pedidos/${order.id}`,
              {
                method:
                  "PATCH",

                internal: true,

                headers:
                  userHeaders,

                body: {
                  estado:
                    "rejected",
                },
              }
            );

          return res
            .status(
              inventoryResult.status
            )
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
        // 3. CATÁLOGO CONFIRMÓ STOCK
        // INTENTAR CONFIRMAR PEDIDO
        // ------------------------------------------

        let confirmedOrder;

        try {
          confirmedOrder =
            await callService(
              "orders",
              `/api/pedidos/${order.id}`,
              {
                method:
                  "PATCH",

                internal: true,

                headers:
                  userHeaders,

                body: {
                  estado:
                    "confirmed",

                  inventory:
                    inventoryResult.data,
                },
              }
            );
        } catch (confirmationError) {
          console.error(
            "Error confirmando pedido después de descontar stock:",
            confirmationError.message
          );

          confirmedOrder = {
            status: 503,

            data: {
              message:
                "No fue posible contactar al servicio de pedidos durante la confirmación",
            },
          };
        }

        // ------------------------------------------
        // 4. SI FALLA CONFIRMACIÓN:
        // COMPENSAR DEVOLVIENDO EL STOCK
        // ------------------------------------------

        if (
          confirmedOrder.status >=
          400
        ) {
          let rollbackInventory;

          try {
            rollbackInventory =
              await callService(
                "catalog",
                "/api/movimientos-stock",
                {
                  method:
                    "POST",

                  internal: true,

                  body: {
                    orderId:
                      String(
                        order.id
                      ),

                    idempotencyKey:
                      `order:${order.id}:rollback`,

                    items,

                    action:
                      "return",
                  },
                }
              );
          } catch (rollbackError) {
            console.error(
              "Error intentando restaurar stock:",
              rollbackError.message
            );

            rollbackInventory = {
              status: 503,

              data: {
                message:
                  "No fue posible contactar a Catálogo para restaurar el stock",
              },
            };
          }

          // ------------------------------------------
          // 5. SI EL STOCK VOLVIÓ,
          // INTENTAR RECHAZAR EL PEDIDO
          // ------------------------------------------

          let rejectedOrder = null;

          if (
            rollbackInventory.status <
            400
          ) {
            try {
              rejectedOrder =
                await callService(
                  "orders",
                  `/api/pedidos/${order.id}`,
                  {
                    method:
                      "PATCH",

                    internal:
                      true,

                    headers:
                      userHeaders,

                    body: {
                      estado:
                        "rejected",
                    },
                  }
                );
            } catch (rejectError) {
              console.error(
                "No se pudo marcar el pedido como rechazado después del rollback:",
                rejectError.message
              );
            }
          }

          return res
            .status(503)
            .json({
              success: false,

              message:
                rollbackInventory.status <
                400
                  ? "No se pudo confirmar el pedido. El stock fue restaurado."
                  : "No se pudo confirmar el pedido y tampoco se pudo restaurar el stock automáticamente.",

              confirmacion:
                confirmedOrder.data,

              rollbackInventario:
                rollbackInventory.data,

              pedido:
                rejectedOrder
                  ? rejectedOrder.data
                  : order,
            });
        }

        // ------------------------------------------
        // TODO SALIÓ BIEN
        // ------------------------------------------

        return res
          .status(201)
          .json({
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