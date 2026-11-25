-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 OpenCharts contributors

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  password_salt TEXT,
  password_iters INTEGER,
  github_id TEXT UNIQUE,
  google_id TEXT UNIQUE,
  display_name TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS users_email ON users(email);
CREATE INDEX IF NOT EXISTS users_github ON users(github_id);
CREATE INDEX IF NOT EXISTS users_google ON users(google_id);
