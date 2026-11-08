# Diagrama ER

Modelo vigente del catálogo por sucursal (DB-01), del inventario de insumos (DB-05), de las reseñas por pedido (DB-06), del programa de lealtad (DB-07) y de los parámetros de sucursal (DB-11). Las demás tasks de datos agregan aquí sus entidades. Las reglas y justificaciones están en [modelo-datos.md](modelo-datos.md).

```mermaid
erDiagram
    branches ||--o{ categories : "tiene"
    branches ||--o{ dishes : "ofrece"
    branches |o--o{ users : "asigna personal"
    branches ||--o{ orders : "registra"
    branches ||--o{ reviews : "recibe"
    categories ||--o{ dishes : "agrupa (misma sucursal)"
    branches ||--o{ branch_ingredients : "tiene existencias"
    ingredients ||--o{ branch_ingredients : "se registra en"
    branches ||--o| branch_configs : "tiene"
    users |o--o{ branch_configs : "cambió por última vez"
    users ||--o{ orders : "realiza"
    users ||--o{ reviews : "escribe"
    orders ||--|| reviews : "tiene, como máximo una"

    users ||--o| loyalty_accounts : "tiene saldo"
    users ||--o{ points_movements : "registra"
    orders |o--o{ payments : "recibe intentos"
    payments |o--o{ points_movements : "referencia (un EARN por pago)"
    points_rules |o--o{ points_movements : "aplica regla"
    users ||--o{ redemptions : "canjea"
    benefits ||--o{ redemptions : "ofrece"
    redemptions |o--o| points_movements : "registra canje"

    loyalty_accounts {
        uuid user_id PK,FK "DELETE RESTRICT"
        integer points "DEFAULT 0, CHECK >= 0"
        timestamptz created_at
        timestamptz updated_at
    }
    points_movements {
        uuid id PK
        uuid customer_id FK "DELETE RESTRICT"
        uuid points_rule_id FK "opcional, DELETE SET NULL"
        enum type "EARN, REDEEM, ADJUSTMENT"
        integer points "EARN > 0; otros con signo"
        uuid payment_id FK "opcional, UNIQUE parcial para EARN, DELETE RESTRICT"
        uuid redemption_id FK,UK "opcional, DELETE RESTRICT"
        timestamptz created_at
    }
    payments {
        uuid id PK
        uuid order_id FK "opcional, DELETE RESTRICT"
        enum status "PAID = APROBADO, REJECTED = RECHAZADO"
        numeric total_paid "NUMERIC(14,2)"
    }
    points_rules {
        uuid id PK
        numeric points_per_dollar
        boolean is_active
        timestamptz starts_at
        timestamptz ends_at "opcional"
    }
    benefits {
        uuid id PK
        varchar name
        integer points_cost
        numeric discount
        boolean is_active
    }
    redemptions {
        uuid id PK
        uuid customer_id FK "DELETE RESTRICT"
        uuid benefit_id FK "DELETE RESTRICT"
        varchar code UK
        integer points_cost
        enum status
        timestamptz created_at
        timestamptz used_at "opcional"
    }
    branches {
        uuid id PK
        varchar name UK
        varchar address
        varchar time_zone
        boolean is_active
        timestamptz created_at
    }
    branch_configs {
        uuid id PK
        uuid branch_id FK,UK "DELETE CASCADE"
        boolean is_open "DEFAULT true"
        uuid updated_by FK "opcional, DELETE SET NULL"
        timestamptz created_at
        timestamptz updated_at
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
    orders {
        uuid id PK
        uuid branch_id FK
        uuid customer_id FK "nullable"
        uuid account_id FK "nullable"
        enum status
        enum type
        numeric total "NUMERIC(14,2), no negativo"
        varchar order_number "UNIQUE con branch_id"
        uuid operation_id UK
        timestamptz created_at
        timestamptz updated_at
    }
    reviews {
        uuid id PK
        uuid order_id UK FK
        uuid customer_id FK
        uuid branch_id FK
        integer rating "CHECK 1..5"
        text comment
        timestamptz created_at
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

Índices de reseñas: `reviews(branch_id, created_at)`, `reviews(customer_id, created_at)` y `reviews_order_id_key` como unicidad por pedido. El promedio de рейтин por sucursal o por pedido se calcula con `AVG(rating)` en agregación a demanda; no se persiste un campo `average_rating` ni `review_count` para evitar duplicar datos derivados.

DB-07: `LoyaltyAccount` corresponde a `LoyaltyAccount` del PDF y `PointsMovement` conserva el nombre existente para representar `LoyaltyMovement`. El índice `points_movements_one_earn_per_payment` es único sobre `payment_id` solo para EARN; el historial mantiene `points_movements(customer_id, created_at)`. BE-07 valida PAID y actualiza saldo y movimientos en una transacción. Rechazos, coherencia y reversión protegida: [lealtad-db07.md](lealtad-db07.md).
