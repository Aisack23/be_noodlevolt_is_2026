BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM notifications WHERE order_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Respaldar y retirar notificaciones con pedido antes de revertir';
  END IF;
END $$;
DROP INDEX notifications_user_id_event_key_key;
DROP INDEX notifications_user_id_created_at_idx;
DROP INDEX notifications_order_id_idx;
ALTER TABLE notifications DROP CONSTRAINT notifications_ready_event_check;
ALTER TABLE notifications DROP CONSTRAINT notifications_order_id_fkey;
ALTER TABLE notifications DROP COLUMN order_id;
COMMIT;
