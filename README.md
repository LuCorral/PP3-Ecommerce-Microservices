# API Gateway - Ecommerce Microservicios

API Gateway del proyecto de ecommerce desarrollado para PP3.

El Gateway centraliza el acceso del frontend a los microservicios de:

- Usuarios
- Catálogo
- Pedidos

También se encarga de autenticación JWT, comunicación interna mediante service tokens y orquestación de operaciones que involucran más de un microservicio.

---

## Arquitectura

```text
Frontend
   |
   v
API Gateway
   |
   +--> API Usuarios
   |
   +--> API Catálogo
   |
   +--> API Pedidos