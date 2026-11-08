BEGIN;
ALTER TABLE notifications ADD COLUMN order_id UUID;
ALTER TABLE notifications ADD CONSTRAINT notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT ON UPDATE CASCADE;
-- Otros tipos conservan referencias genéricas; PEDIDO_LISTO exige pedido y clave.
ALTER TABLE notifications ADD CONSTRAINT notifications_ready_event_check CHECK (type <> 'PEDIDO_LISTO' OR (order_id IS NOT NULL AND event_key IS NOT NULL AND length(trim(event_key)) > 0));
CREATE UNIQUE INDEX notifications_user_id_event_key_key ON notifications(user_id,event_key);
CREATE INDEX notifications_user_id_created_at_idx ON notifications(user_id,created_at);
CREATE INDEX notifications_order_id_idx ON notifications(order_id);
COMMIT;
