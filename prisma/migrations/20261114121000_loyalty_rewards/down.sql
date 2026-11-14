BEGIN;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM redemptions WHERE reward_type IS NOT NULL OR operation_id IS NOT NULL)
       OR EXISTS (SELECT 1 FROM orders WHERE loyalty_redemption_id IS NOT NULL OR loyalty_discount <> 0)
       OR EXISTS (SELECT 1 FROM benefits WHERE reward_type IS NOT NULL AND id NOT IN (
           '73000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000002',
           '73000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000004')) THEN
        RAISE EXCEPTION 'La reversión eliminaría canjes o recompensas personalizados; conservar estos datos primero.';
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM benefits b JOIN (VALUES
            ('73000000-0000-4000-8000-000000000001'::uuid, 'Salsa extra', 20, 'PRODUCT', 'Salsa extra', NULL::integer),
            ('73000000-0000-4000-8000-000000000002'::uuid, 'Wantanes', 60, 'PRODUCT', 'Wantanes', NULL::integer),
            ('73000000-0000-4000-8000-000000000003'::uuid, '10% de descuento', 100, 'PERCENT_DISCOUNT', NULL, 10),
            ('73000000-0000-4000-8000-000000000004'::uuid, 'Rollitos primavera', 150, 'PRODUCT', 'Rollitos primavera', NULL::integer)
        ) AS initial(id, name, cost, kind, product, percent) ON initial.id=b.id
        WHERE (b.name, b.points_cost, b.reward_type::text, b.product_name, b.discount_percent, b.discount, b.is_active)
            IS DISTINCT FROM (initial.name, initial.cost, initial.kind, initial.product, initial.percent, 0::numeric, true)
            OR b.description IS DISTINCT FROM CASE initial.id
                WHEN '73000000-0000-4000-8000-000000000001' THEN 'Una porción de salsa extra.'
                WHEN '73000000-0000-4000-8000-000000000002' THEN 'Una orden de wantanes.'
                WHEN '73000000-0000-4000-8000-000000000003' THEN 'Diez por ciento sobre el subtotal del pedido, redondeado a centavos.'
                WHEN '73000000-0000-4000-8000-000000000004' THEN 'Una orden de rollitos primavera.'
            END
    ) THEN
        RAISE EXCEPTION 'La reversión eliminaría modificaciones del catálogo inicial; conservar estos datos primero.';
    END IF;
END $$;
ALTER TABLE orders DROP CONSTRAINT orders_loyalty_redemption_id_fkey;
DROP INDEX orders_loyalty_redemption_id_key;
ALTER TABLE orders DROP COLUMN loyalty_redemption_id, DROP COLUMN loyalty_discount;
DROP INDEX redemptions_operation_id_key;
ALTER TABLE redemptions DROP CONSTRAINT redemptions_reward_shape;
ALTER TABLE redemptions DROP COLUMN operation_id, DROP COLUMN reward_name, DROP COLUMN reward_type, DROP COLUMN product_name, DROP COLUMN discount_percent;
DELETE FROM benefits WHERE id IN (
    '73000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000004');
ALTER TABLE benefits DROP CONSTRAINT benefits_reward_shape;
ALTER TABLE benefits DROP COLUMN reward_type, DROP COLUMN product_name, DROP COLUMN discount_percent;
DROP TYPE reward_type;
COMMIT;
