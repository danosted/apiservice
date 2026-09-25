-- Persistent game state: item catalog, players and their inventories.

CREATE TABLE items (
  id        TEXT    PRIMARY KEY,
  name      TEXT    NOT NULL,
  rarity    TEXT    NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  max_stack INTEGER NOT NULL CHECK (max_stack > 0)
);

CREATE TABLE players (
  id           TEXT    PRIMARY KEY,
  display_name TEXT    NOT NULL,
  level        INTEGER NOT NULL DEFAULT 1 CHECK (level >= 0),
  xp           INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX players_display_name ON players (display_name COLLATE NOCASE);

-- `version` increments on every change so concurrent writers can't overwrite each other.
CREATE TABLE inventory (
  player_id TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  item_id   TEXT    NOT NULL REFERENCES items (id),
  quantity  INTEGER NOT NULL CHECK (quantity >= 0),
  version   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, item_id)
);

-- One row per applied inventory change, keyed by the caller's idempotency key,
-- so a retried request is recognised instead of applied twice.
CREATE TABLE inventory_changes (
  idempotency_key TEXT    PRIMARY KEY,
  player_id       TEXT    NOT NULL,
  item_id         TEXT    NOT NULL,
  delta           INTEGER NOT NULL,
  applied_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
