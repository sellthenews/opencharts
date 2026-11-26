-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Copyright (C) 2026 Swapwick contributors

-- Daily CoinGecko Demo credit counter (day is UTC, YYYY-MM-DD). The Worker also creates
-- this table on first use, so applying the migration is optional.
CREATE TABLE IF NOT EXISTS api_budget (
  day TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0
);
