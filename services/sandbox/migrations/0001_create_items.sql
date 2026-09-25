-- One row per item. Covers each SQLite storage class D1 supports:
-- TEXT, INTEGER, REAL, BLOB, plus booleans (0/1) and JSON (as TEXT).
CREATE TABLE items (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  count      INTEGER,
  price      REAL,
  active     INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  data       BLOB,
  metadata   TEXT    CHECK (metadata IS NULL OR json_valid(metadata)),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
