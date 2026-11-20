BEGIN;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM dining_rooms WHERE name <> 'Salón principal' OR NOT is_active) THEN
        RAISE EXCEPTION 'La reversión eliminaría salones personalizados; conservar o exportar estos datos primero.';
    END IF;
END $$;
ALTER TABLE tables DROP CONSTRAINT tables_room_id_branch_id_fkey;
DROP INDEX tables_room_id_idx;
ALTER TABLE tables DROP COLUMN room_id;
DROP TABLE dining_rooms;
COMMIT;
