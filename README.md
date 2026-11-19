# NoodleVolt — Backend

NoodleVolt es una plataforma de gestión para un restaurante chino multisucursal: menú digital, pedidos para llevar y de salón, cocina, reservaciones, inventario, pagos simulados, lealtad, reseñas, notificaciones y reportes de ventas.

**Proyecto 3: Plataforma de gestión de restaurantes**
Curso: Ingeniería de Software, Universidad Centroamericana "José Simeón Cañas" (UCA), ciclo 02/2026, Sección 02.
Equipo: **Elektro**.

## Despliegue

| Componente | Plataforma | URL | Rama |
|---|---|---|---|
| Frontend (Next.js) | Vercel | [pendiente] | `main` |
| Backend (NestJS) | Render | [pendiente] | `main` |
| Base de datos (PostgreSQL) | Neon | [pendiente] | — |
| Swagger (solo si `SWAGGER_ENABLED=true`) | Render | [pendiente]/api/docs | `main` |

Los usuarios de prueba se entregan en Moodle, no en este repositorio.

## Integrantes

| Nombre | Carnet | Usuario de GitHub | Historias responsables |
|---|---|---|---|
| Abraham Alejandro Flores Vásquez | 00067323 | AlejandroFV74 | HU-08, HU-10 |
| Pamela Alexandra Gómez Tenorio | 00139622 | pamelalexndra [verificar] | HU-01, HU-05, HU-07, HU-11 |
| Diego Alejandro Iraheta Monterrosa | 00041923 | DiegoIraheta00041923 | HU-04 |
| Gabriela Denise Maldonado Girón | 00133523 | DeniseMaldonadoG | HU-03 |
| César Isaac Tovar Jovel | 00016023 | Aisack23 | HU-02, HU-06, HU-09 |

## Documentación

| Documento | Contenido |
|---|---|
| [01 · Guía de uso](docs/01-guia-de-uso.md) | Roles, permisos y flujos principales con pasos |
| [02 · Arquitectura](docs/02-arquitectura.md) | Componentes, stack, estructura de carpetas y decisiones técnicas |
| [03 · Modelo de datos](docs/03-modelo-de-datos.md) | Diagrama entidad-relación y descripción de tablas |
| [04 · API](docs/04-api.md) | Autenticación y tabla de endpoints por módulo |
| [05 · Instalación local](docs/05-instalacion-local.md) | Requisitos, pasos con Docker, variables de entorno, seeds y pruebas |
| [06 · Despliegue](docs/06-despliegue.md) | Publicación en Vercel, Render y Neon; flujo de releases y variables de producción |
| [07 · Forma de trabajo](docs/07-forma-de-trabajo.md) | Tablero, Git Flow, convención de commits y de pull requests |
| [08 · Historias](docs/08-historias.md) | Las 11 historias de usuario con responsable, card, PR y estado |
| [09 · Problemas conocidos](docs/09-problemas-conocidos.md) | Limitaciones, pendientes y puntos por verificar |

## Frontend

El frontend está en el repositorio [fe_noodlevolt_is_2026](https://github.com/Aisack23/fe_noodlevolt_is_2026). Su README explica cómo instalarlo y ejecutarlo.

## Inicio rápido

```bash
cp .env.example .env          # completar JWT_SECRET y POSTGRES_PASSWORD
docker compose up -d postgres
npm install
npm run prisma:deploy
npm run db:seed:base          # requiere DEMO_SEED_PASSWORD en .env
npm run start:dev
```

Detalles completos en [05 · Instalación local](docs/05-instalacion-local.md).
