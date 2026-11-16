CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_valid_interval CHECK (ends_at > starts_at),
  ADD CONSTRAINT reservations_no_active_overlap
    EXCLUDE USING gist (table_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status IN ('PENDING', 'CONFIRMED'));
