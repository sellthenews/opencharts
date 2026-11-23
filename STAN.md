# Stan prac — etap 1

Aktualizacja: 23 listopada 2026, ok. 20:43 (Europe/Warsaw).

## Co działa

Statyczna aplikacja Vite + TypeScript w `/workspace/wykresy-strona`. Wykres: Lightweight Charts 5.3.0 (Apache 2.0), trzymany w `vendor/lightweight-charts@5.3.0/` (bez CDN, import przez alias Vite). Warstwa rysowania to własny overlay canvas (`src/drawings.ts`) — nie przepisana na pluginy LWC ani na KLineChart, bo już była w drzewie i przeszła test.

Źródła danych (publiczne REST, bez kluczy), sprawdzone prawdziwym `fetch` w headless Chrome z `http://127.0.0.1`:

| Giełda | CORS w przeglądarce | Uwagi |
| --- | --- | --- |
| Kraken (domyślna) | działa | — |
| Binance | działa | pary USDT (`XRPUSDT` itd.) |
| Coinbase | działa | — |
| Bitstamp | działa | pierwsze podejście z `--virtual-time-budget` padło (`Failed to fetch` w 10 ms); ponowny test: HTTP 200 i ciało odpowiedzi. Zarejestrowana w UI. |

Pary: XRP/USD (domyślna), BTC/USD, ETH/USD. Interwały: 1h, 4h, 1D, 1W, 1M (brakujące agregowane lokalnie). Rysunki: linia trendu, linia pozioma, prostokąt, usuwanie, `localStorage` per giełda+para. Ciemny motyw, interfejs po polsku.

`npm run build` przechodzi. Podgląd: `npx vite preview --host 127.0.0.1 --port 4173` (zostawiony w tle). Test Playwright: XRP/USD 1D, linia trendu, zrzut i przeżycie przeładowania — **pass**.

Zrzut: `/workspace/wykresy-strona/screenshots-test/xrp-1d.png`

## Historia (XRP, stan na 23.11.2026)

| Giełda | 1D | 1W | 1M |
| --- | --- | --- | --- |
| Kraken | 721 świec, ~24 mies. (od 2024-12-03); limit ~720 na request, bez wstecznej paginacji | 497 świec, ~114 mies. (od 2017-05-18) | brak natywnego; agregacja z 1W → ~114 mies. (~115 słupków) |
| Binance | od 2018-05-04, ~103 mies., ok. 3126 świec (paginacja po 1000) | od 2018-04-30, 448 świec, ~103 mies. (natywne) | od 2018-05-01, 103 świece, ~102 mies. (natywne) |
| Coinbase | 1234 świece, ~40 mies. (od 2023-07-13, relisting XRP); max 300/request | agregacja z 1D → ~176 tyg., te same ~40 mies. | agregacja z 1D → ~41 mies. |
| Bitstamp | 3630 świec, ~119 mies. (od 2016-12-16), paginacja `end=` | brak natywnego `step`; agregacja z 1D → ~519 tyg., ~119 mies. | agregacja z 1D → ~120 mies. |

Aplikacja ładuje do ok. 2500 świec na interwał (stała `MAX_CANDLES`).

## Uruchomienie

```bash
cd /workspace/wykresy-strona
npm install          # tylko narzędzia build/test (Vite, TypeScript, Playwright)
npm run dev          # http://127.0.0.1:5173
npm run build        # wynik w site/
npm run preview      # http://127.0.0.1:4173
npm run test:e2e     # wymaga działającego preview
```

Repozytorium zainicjowane lokalnie, bez pushowania. Licencja MIT, dokumentacja po angielsku (README, CONTRIBUTING, THIRD_PARTY).

## Świadoma decyzja o stosie

Zostaje **Lightweight Charts + własny overlay**. Oficjalne `plugin-examples` (Apache 2.0) i KLineChart (Apache 2.0) były opcją, ale nie ma sensu przepisywać już napisanego i przetestowanego rysowania. Kod zamkniętej platformy TradingView i projekty GPL (np. DegenView) nie były kopiowane.

## Brakuje / następne kroki

1. Etap 2: wskaźniki liczone lokalnie (SMA, EMA, Bollinger, RSI, MACD, wolumen).
2. Więcej narzędzi rysowania (Fibonacci, równoległe, tekst), ewentualnie oficjalne pluginy LWC.
3. Opcjonalny live WebSocket (publiczny, bez klucza).
4. Więcej par i interwałów; dopracowanie historii (pełna paginacja vs. limit 2500).
5. Publikacja na GitHub Pages (workflow: `npm ci && npm run build`, wrzucić `site/`) — dopiero po decyzji szefa; teraz bez pushy i bez logowania do GitHuba.
6. Drobiazgi UX: zapis wybranej giełdy/interwału, wyraźniejsze zasady zaznaczania rysunków.
