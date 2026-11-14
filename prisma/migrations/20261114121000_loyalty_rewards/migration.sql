BEGIN;
CREATE TYPE reward_type AS ENUM ('PRODUCT', 'PERCENT_DISCOUNT');
ALTER TABLE benefits
    ADD COLUMN reward_type reward_type,
    ADD COLUMN product_name VARCHAR(150),
    ADD COLUMN discount_percent INTEGER,
    ADD CONSTRAINT benefits_reward_shape CHECK (reward_type IS NULL OR (
        points_cost > 0 AND discount = 0 AND (
            (reward_type = 'PRODUCT' AND product_name IS NOT NULL AND length(btrim(product_name)) > 0 AND discount_percent IS NULL)
            OR (reward_type = 'PERCENT_DISCOUNT' AND product_name IS NULL AND discount_percent IS NOT NULL AND discount_percent BETWEEN 1 AND 99)
        )
    ));
ALTER TABLE redemptions
    ADD COLUMN operation_id UUID,
    ADD COLUMN reward_name VARCHAR(120),
    ADD COLUMN reward_type reward_type,
    ADD COLUMN product_name VARCHAR(150),
    ADD COLUMN discount_percent INTEGER,
    ADD CONSTRAINT redemptions_reward_shape CHECK (reward_type IS NULL OR (
        operation_id IS NOT NULL AND reward_name IS NOT NULL AND length(btrim(reward_name)) > 0
        AND points_cost > 0 AND status = 'USED' AND used_at IS NOT NULL AND (
            (reward_type = 'PRODUCT' AND product_name IS NOT NULL AND length(btrim(product_name)) > 0 AND discount_percent IS NULL)
            OR (reward_type = 'PERCENT_DISCOUNT' AND product_name IS NULL AND discount_percent IS NOT NULL AND discount_percent BETWEEN 1 AND 99)
        )
    ));
CREATE UNIQUE INDEX redemptions_operation_id_key ON redemptions(operation_id);
ALTER TABLE orders
    ADD COLUMN loyalty_discount DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN loyalty_redemption_id UUID,
    ADD CONSTRAINT orders_loyalty_redemption_id_fkey FOREIGN KEY (loyalty_redemption_id) REFERENCES redemptions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT orders_loyalty_discount_nonnegative CHECK (loyalty_discount >= 0 AND (loyalty_discount = 0 OR loyalty_redemption_id IS NOT NULL));
CREATE UNIQUE INDEX orders_loyalty_redemption_id_key ON orders(loyalty_redemption_id);

INSERT INTO benefits(id, name, description, points_cost, discount, reward_type, product_name, discount_percent) VALUES
('73000000-0000-4000-8000-000000000001', 'Salsa extra', 'Una porción de salsa extra.', 20, 0, 'PRODUCT', 'Salsa extra', NULL),
('73000000-0000-4000-8000-000000000002', 'Wantanes', 'Una orden de wantanes.', 60, 0, 'PRODUCT', 'Wantanes', NULL),
('73000000-0000-4000-8000-000000000003', '10% de descuento', 'Diez por ciento sobre el subtotal del pedido, redondeado a centavos.', 100, 0, 'PERCENT_DISCOUNT', NULL, 10),
('73000000-0000-4000-8000-000000000004', 'Rollitos primavera', 'Una orden de rollitos primavera.', 150, 0, 'PRODUCT', 'Rollitos primavera', NULL);
COMMIT;
