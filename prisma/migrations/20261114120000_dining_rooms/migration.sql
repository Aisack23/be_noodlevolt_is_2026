BEGIN;

CREATE TABLE dining_rooms (
    id UUID NOT NULL,
    branch_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT dining_rooms_pkey PRIMARY KEY (id),
    CONSTRAINT dining_rooms_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT dining_rooms_name_nonempty CHECK (length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX dining_rooms_branch_id_name_key ON dining_rooms(branch_id, name);
CREATE UNIQUE INDEX dining_rooms_id_branch_id_key ON dining_rooms(id, branch_id);

ALTER TABLE tables ADD COLUMN room_id UUID;
ALTER TABLE tables ADD CONSTRAINT tables_room_id_branch_id_fkey
    FOREIGN KEY (room_id, branch_id) REFERENCES dining_rooms(id, branch_id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX tables_room_id_idx ON tables(room_id);

INSERT INTO dining_rooms(id, branch_id, name)
SELECT gen_random_uuid(), id, 'Salón principal' FROM branches;
UPDATE tables t SET room_id = r.id FROM dining_rooms r WHERE r.branch_id = t.branch_id;

COMMIT;
