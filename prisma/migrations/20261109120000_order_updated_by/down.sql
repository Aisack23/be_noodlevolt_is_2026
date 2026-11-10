BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM orders WHERE updated_by IS NOT NULL) THEN
    RAISE EXCEPTION 'Respaldar y retirar la auditoría updated_by antes de revertir DB-03';
  END IF;
END $$;
ALTER TABLE orders DROP CONSTRAINT orders_updated_by_fkey;
ALTER TABLE orders DROP COLUMN updated_by;
COMMIT;
