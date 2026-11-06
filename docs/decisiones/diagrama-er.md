# Diagrama ER

Modelo vigente del catálogo por sucursal (DB-01) y del inventario de insumos (DB-05). Las demás tasks de datos agregan aquí sus entidades. Las reglas y justificaciones están en [modelo-datos.md](modelo-datos.md).

```mermaid
erDiagram
    branches ||--o{ categories : "tiene"
    branches ||--o{ dishes : "ofrece"
    branches |o--o{ users : "asigna personal"
    categories ||--o{ dishes : "agrupa (misma sucursal)"
    branches ||--o{ branch_ingredients : "tiene existencias"
    ingredients ||--o{ branch_ingredients : "se registra en"

    branches {
        uuid id PK
        varchar name UK
        varchar address
        varchar time_zone
        boolean is_active
        timestamptz created_at
    }
    users {
        uuid id PK
        text email UK
        enum role
        uuid branch_id FK "nulo para cliente y gerente general"
        boolean is_active
    }
    categories {
        uuid id PK
        uuid branch_id FK
        varchar name "UNIQUE con branch_id"
        integer display_order
        text description
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
    dishes {
        uuid id PK
        uuid branch_id FK
        uuid category_id FK "FK compuesta con branch_id"
        varchar name "UNIQUE con branch_id"
        varchar description
        numeric price "NUMERIC(10,2), mayor que 0"
        text image_url
        enum status "se conserva hasta BE-01"
        boolean is_available
        boolean is_deleted
        timestamptz created_at
        timestamptz updated_at
    }
    ingredients {
        uuid id PK
        varchar name UK
        varchar unit
        boolean is_active
    }
    branch_ingredients {
        uuid id PK
        uuid branch_id FK "DELETE RESTRICT"
        uuid ingredient_id FK "UNIQUE con branch_id"
        numeric current_stock "NUMERIC(14,3), mayor o igual a 0"
        numeric minimum_stock "NUMERIC(14,3), mayor o igual a 0"
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
```

Índices del catálogo: `dishes(branch_id, category_id)`, `categories(branch_id, name)` y `dishes(branch_id, name)`. El par `categories(branch_id, id)` es único para que la FK compuesta impida un platillo en una categoría de otra sucursal.

Índice del inventario: `branch_ingredients(branch_id, current_stock)`. El stock bajo se calcula y no se guarda. Las reglas están en [inventario-insumos.md](inventario-insumos.md).
