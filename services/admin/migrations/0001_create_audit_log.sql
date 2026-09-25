-- Append-only record of every change made through the admin dashboard.
CREATE TABLE audit_log (
  id      TEXT PRIMARY KEY,
  at      TEXT NOT NULL,
  actor   TEXT NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT NOT NULL,
  details TEXT NOT NULL CHECK (json_valid(details))
);
CREATE INDEX audit_log_at ON audit_log (at DESC);
