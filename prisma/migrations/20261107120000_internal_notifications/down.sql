BEGIN;
DROP INDEX notifications_user_id_event_key_key;
DROP INDEX notifications_user_id_created_at_idx;
DROP INDEX notifications_order_id_idx;
ALTER TABLE notifications DROP CONSTRAINT notifications_ready_event_check;
ALTER TABLE notifications DROP CONSTRAINT notifications_order_id_fkey;
ALTER TABLE notifications DROP COLUMN order_id;
COMMIT;
