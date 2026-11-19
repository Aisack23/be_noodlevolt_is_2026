# 8. Historias de usuario

Las 11 historias del alcance (una por módulo y una del anexo de configuración) están definidas en el documento V_FINAL, parte 3. Cada una tiene tres criterios de aceptación y cuatro tareas: DB, BE, FE y QA.

**Fuentes:**

- Responsables y estado: cards de Trello, columna actual al 18 de noviembre de 2026.
- PR: merges de `git log --merges` en `origin/develop` de los repositorios backend y frontend. Los números de PR son distintos en cada repositorio; cuando la card y el historial de git no coinciden, se marca con [verificar].
- Los PR del backend se escriben como `BE #n`, los del frontend como `FE #n` y los de la base de datos (que viven en el backend) como `DB #n`.

Estados: **Hecho** (columna Hecho de Trello) y **En QA** (columna QA). Todas las historias tienen su código fusionado en `develop`.

---

## E1 · Menú digital

| ID | Historia | Responsable | Card | PRs | Estado |
|---|---|---|---|---|---|
| HU-01 | Consultar menú disponible | Pamela | [Card HU-01](https://trello.com/c/JESai1EP) | DB #5, #9 · BE #4, #15 · QA #14 · FE #2, #19 | Hecho |

## E2 · Toma de pedidos

| ID | Historia | Responsable | Card | PRs | Estado |
|---|---|---|---|---|---|
| HU-02 | Registrar pedido para llevar | Isaac | [Card HU-02](https://trello.com/c/mw5q1bmf) | DB #8 · BE #16, #22, #23, #28, #45 [verificar: la card lista BE #6] · FE #3, #10, #11 | Hecho |

## E3 · Cocina y comandas

| ID | Historia | Responsable | Card | PRs | Estado |
|---|---|---|---|---|---|
| HU-03 | Visualizar y marcar comandas listas | Denise (Gabriela Maldonado) | [Card HU-03](https://trello.com/c/eXMOAKNT) | DB #33 · BE #36, #41 · FE #15, #17 | Hecho |

## E4 · Reservaciones

| ID | Historia | Responsable | Card | PRs | Estado |
|---|---|---|---|---|---|
| HU-04 | Reservar mesa disponible | Diego | [Card HU-04](https://trello.com/c/wKlRAFvI) | BE #31, #34, #44, #46 · FE #16 · DB [verificar: sin PR en el historial de merges] | En QA |

## E5 · Inventario de insumos

| ID | Historia | Responsable | Card | PRs | Estado |
|---|---|---|---|---|---|
| HU-05 | Consultar insumos con bajo stock | Pamela | [Card HU-05](https://trello.com/c/eJ4S7zuw) | DB #12 · BE #20, #21 (ajustes del primer avance) · FE #4 [verificar: FE #9 "documento" también es de FE-05] | En QA |

## E6 · Pagos y facturación

| ID | Historia | Responsable | Card | PRs | Estado |
|---|---|---|---|---|---|
| HU-06 | Registrar pago simulado | Isaac | [Card HU-06](https://trello.com/c/a6ttvqQA) | BE #17, #32 · FE #14 · DB [verificar: la card lista DB-06 sin número de PR] | Hecho |

## E7 · Lealtad y puntos

| ID | Historia | Responsable | Card | PRs | Estado |
|---|---|---|---|---|---|
| HU-07 | Acumular puntos por pago | Pamela | [Card HU-07](https://trello.com/c/XCt0WdpD) | DB #27 · BE #29 · FE #18 · QA [pendiente: evidencia de los 3 criterios en el ambiente desplegado] | En QA |

## E8 · Reseñas y calificaciones

| ID | Historia | Responsable | Card | PRs | Estado |
|---|---|---|---|---|---|
| HU-08 | Calificar un pedido completado y calcular promedio por sucursal | Abraham | [Card HU-08](https://trello.com/c/7Pt8wkOD) | DB #18 · BE #19 · FE #7 | Hecho |

## E9 · Notificaciones

| ID | Historia | Responsable | Card | PRs | Estado |
|---|---|---|---|---|---|
| HU-09 | Consultar aviso de pedido listo | Isaac | [Card HU-09](https://trello.com/c/uBT0hRXj) | DB #26 · BE #35, #40 · FE #12, #13 | Hecho |

## E10 · Reportes de ventas por sucursal

| ID | Historia | Responsable | Card | PRs | Estado |
|---|---|---|---|---|---|
| HU-10 | Consultar ventas por fechas | Abraham | [Card HU-10](https://trello.com/c/qBfChl24) | DB #38 · BE #39, #47 · FE #20 | En QA |

## E11 · Anexo: configuración de sucursales

| ID | Historia | Responsable | Card | PRs | Estado |
|---|---|---|---|---|---|
| HU-11 | Actualizar estado operativo de sucursal | Pamela | [Card HU-11](https://trello.com/c/xbVGqeCG) | DB #10 · BE #13, #24, #25 · FE #6 | Hecho |

---

## Notas por historia

- **HU-02:** el PR BE #6 que lista la card no aparece en el historial de `develop` [verificar].
- **HU-04 y HU-10:** la card dice "PR(s): (pendiente: enlazar aquí)". Los números de esta tabla salen del historial de merges y deben enlazarse en la card.
- **HU-05:** la descripción de la card contiene credenciales de cuentas de prueba. Ver [09 · Problemas conocidos](09-problemas-conocidos.md#96-seguridad).
- **HU-07:** falta la evidencia de QA (QA-07) para los tres criterios.
- **HU-11:** el criterio 2 se completa en BE-02. Falta acordar un GET protegido para que el gerente vea la última modificación y quién la hizo; la card lo registra como pendiente.

## Responsables según otros documentos

Otra lista interna de responsables del equipo asigna algunas épicas de forma distinta (por ejemplo, E2 a Pamela y E4 a Gabriela). Esta tabla sigue el documento V_FINAL y las cards de Trello, que coinciden entre sí. La diferencia debe aclararse con el equipo antes de la entrega [verificar].
