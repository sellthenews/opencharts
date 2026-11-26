// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { decodeXrplCurrency } from '../sources/ledger-tokens';

/** Well-known issuers. Same ticker from another issuer gets a look-alike warning (info only, never hidden). */
export const KNOWN_ISSUERS: Record<string, string[]> = {
  RLUSD: ['rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'],
  USD: ['rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq', 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B'],
  EUR: ['rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq'],
  XRP: ['rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq'],
  USDC: ['rGm7WCVp9gb4jZHWTEtGUr4dd74z2XuWhE'],
  BTC: ['rchGBxcD1A1C2tdxF6papQYZ8kjRKMYcL', 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq'],
  ETH: ['rcA8X3TVMST1n3CJeAdGk1RdRCHii7N2h', 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq'],
  SOLO: ['rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz'],
  EVR: ['rEvernodee8dJLaFsujS6q1EiXvZYmHXr8'],
};

export interface IssuerFlags {
  issuer: string;
  domain?: string;
  globalFreeze: boolean;
  clawback: boolean;
  requireAuth: boolean;
  blackholed: boolean;
  hooks: boolean;
  lookalike: boolean;
  verified?: boolean;
  holders?: number;
}

export function lookalikeWarning(currency: string, issuer: string): boolean {
  const code = decodeXrplCurrency(currency).toUpperCase();
  const known = KNOWN_ISSUERS[code];
  return Boolean(known && !known.includes(issuer));
}

