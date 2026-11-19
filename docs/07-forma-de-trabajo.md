# 7. Forma de trabajo

## 7.1 Tablero

El seguimiento del proyecto está en Trello: **[Plataforma de gestión de restaurantes - Elektro](https://trello.com/b/e4NODyOF)**.

Cada historia de usuario es una card. Las tareas (DB-, BE-, FE-, QA-) se registran en la card de su historia, con responsable y horas estimadas. Las columnas del tablero son:

| Columna | Significado |
|---|---|
| Por hacer | Historia lista para empezar |
| En progreso | Alguien trabaja en una tarea de la historia |
| Code review | PR abierto, esperando revisión de otro integrante |
| QA | Código integrado en `develop`; falta validar los criterios de aceptación |
| Hecho | Criterios validados y evidencia registrada |
| Bloqueado | Depende de algo externo o tiene un problema abierto |

Cada card enlaza sus PR en la descripción. Las etiquetas indican la épica (E1 a E11), el sprint y la prioridad.

## 7.2 Git Flow

| Rama | Propósito | Se crea desde | Se integra a |
|---|---|---|---|
| `main` | Producción. Solo recibe releases y hotfixes. | — | — |
| `develop` | Integración. Aquí se prueban las funcionalidades juntas. | `main` | — |
| `feat/<id>-<descripcion>` | Una tarea o historia. Ejemplo: `feat/be-01-menu` | `develop` | `develop` |
| `fix/<descripcion>` | Corrección no urgente | `develop` | `develop` |
| `release/x.y.z` | Preparación de una versión | `develop` | `main` y luego `develop` |
| `hotfix/<descripcion>` | Corrección urgente en producción | `main` | `main` y luego `develop` |

Reglas:

- Nunca hacer commit directo a `main` ni a `develop`.
- Una rama por tarea. Los commits son pequeños y cada uno representa un paso lógico.
- Si una rama depende de otra que aún no está integrada, se crea encima de esa rama y se actualiza con `git rebase origin/develop` antes de abrir el PR.
- Antes de cada commit deben pasar `npm run lint`, `npm run build` y `npm test` en el backend.
- No se commitean `.env`, credenciales ni archivos generados (`src/generated/`).

Nombres de ramas usados en el proyecto: `feat/BE-01-menu`, `feat/db-01-categorias-platillos`, `feature/FE-07-loyalty-points`. Las ramas anteriores usan mayúsculas y prefijos distintos; la convención recomendada es la de arriba [09 · Problemas conocidos](09-problemas-conocidos.md#911-convenciones-de-nombres).

## 7.3 Commits

Mensajes en español con Conventional Commits y el ID de la tarea al final:

```text
tipo(ámbito): descripción en español (ID)
```

Ejemplos reales de `develop`:

```text
feat(be): crear endpoint HTTP reportes top dishes con Swagger (BE-10)
docs(be): documentar contrato y decisiones del reporte top dishes (BE-10)
```

Parte del historial anterior no sigue esta convención; ver [09 · Problemas conocidos](09-problemas-conocidos.md#911-convenciones-de-nombres).

Tipos usados: `feat`, `fix`, `docs`, `test`, `refactor` y `chore`. Los commits no llevan líneas `Co-Authored-By`.

## 7.4 Pull requests

- **Título**: `(ID. Nombre de la historia o tarea)`. Ejemplo: `(HU-08. Calificar un pedido completado)`.
- **Destino**: `develop` para funcionalidades; `main` solo para releases y hotfixes.
- **Descripción**: enlace a la card de Trello, resumen del cambio, cómo probarlo y capturas si hay interfaz.
- **Tamaño**: idealmente menos de 400 líneas cambiadas, sin contar migraciones generadas.
- **Aprobación**: un integrante distinto al autor revisa y aprueba. Nadie hace merge de su propio PR sin aprobación.
- **Push**: se sube la rama después de cada commit o cada dos commits, no solo al final.

Enlace a la card: el PR debe apuntar a la card de la historia en Trello, y la card debe listar el PR. Ver los enlaces en [08 · Historias](08-historias.md).

## 7.5 Responsables

Los responsables de cada historia están en [08 · Historias](08-historias.md). La distribución de tareas por integrante está en la PDF V_FINAL, sección 2.1 y parte 4.
