# Stan prac

Aktualizacja: 23 listopada 2026, ok. 21:00 (Europe/Warsaw).

Etap 1 i etap 2 są ukończone lokalnie (bez remote i bez pusha). Licencja projektu: **AGPL-3.0-or-later**.

## Commity

| Hash | Opis |
| --- | --- |
| `e44626d` | Etap 1: szkielet, giełdy, rysowanie podstawowe, vendor LWC |
| `e79a28e` | Etap 2.1: wskaźniki SMA/EMA/Bollinger, wolumen, RSI, MACD |
| `059d6db` | Etap 2.1b: listy obserwowanych i publiczne tickery |
| `e309ee3` | Etap 2.2: Fibo, kanał, promień, tekst, AB=CD, Fibo rozszerzenie, edycja, eksport/import |
| `f6ce2ea` | Relicencja na AGPL-3.0-or-later (oficjalny tekst GNU, SPDX, dokumentacja) |
| `c233361` | Etap 2.3: WebSocket Krakena v2 (OHLC + ticker), reconnect, agregacja 1M |
| `cb6c4ff` | Etap 2.4: workflow GitHub Pages (tylko lokalnie) |

Zrzut etapu 2: `/workspace/wykresy-strona/screenshots-test/etap2-rsi-fib.png` (Kraken XRP/USD 1D, RSI, zniesienie Fibo, panel obserwowanych).

Podgląd: http://127.0.0.1:4173 (`npm run build && npm run preview`). Testy: `npm run test:e2e`.

## Co działa

- Giełdy: Kraken (domyślna), Binance, Coinbase, Bitstamp — publiczne REST, CORS OK w przeglądarce.
- Pary XRP/USD, BTC/USD, ETH/USD; interwały 1h, 4h, 1D, 1W, 1M (agregacja gdy trzeba).
- Wskaźniki lokalne, włączanie/okres w UI, `localStorage`.
- Obserwowane: wiele list (Moje, Krypto), dodawanie/usuwanie, cena i zmiana 24h, klik otwiera wykres; odświeżanie 45 s gdy karta widoczna; pozycje Krakena też z tickera WS.
- Rysunki: linia trendu, promień, pozioma, prostokąt, kanał, Fibo, Fibo rozszerzenie, AB=CD (projekcje 1.272/1.618), tekst; uchwyty, przeciąganie, JSON, `localStorage` per giełda+para.
- Live Kraken: `wss://ws.kraken.com/v2`, kanały `ohlc` i `ticker`, ponowne łączenie.
- Workflow Pages zapisany lokalnie w `.github/workflows/pages.yml` — nie wypushowany.
- Runtime w `vendor/lightweight-charts@5.3.0/` (Apache 2.0, bez CDN).

## Uruchomienie

```bash
cd /workspace/wykresy-strona
npm install
npm run dev          # http://127.0.0.1:5173
npm run build        # wynik w site/
npm run preview      # http://127.0.0.1:4173
npm run test:e2e
```

## Roadmapa: narzędzia jak w TradingView

Priorytety wg popularności: **P1** (najpierw), **P2**, **P3**. `[x]` jest w etapie 1–2, `[ ]` czeka na osobne zlecenie — **nie zaczynać w tym przebiegu**.

### Linie

- [x] P1 Linia trendu
- [x] P1 Promień (ray)
- [ ] P2 Linia rozszerzona (extended line)
- [x] P1 Linia pozioma
- [ ] P2 Linia pozioma-promień (horizontal ray)
- [ ] P2 Linia pionowa
- [x] P1 Kanał równoległy
- [ ] P2 Kanał regresji
- [ ] P3 Widły Andrewsa

### Fibonacci

- [x] P1 Zniesienie (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1)
- [x] P1 Rozszerzenie wg trendu (Trend-Based Fib Extension)
- [ ] P2 Kanał Fibonacciego
- [ ] P2 Wachlarz Fibonacciego
- [ ] P3 Strefy czasowe Fibonacciego
- [ ] P3 Łuki Fibonacciego
- [ ] P3 Spirala Fibonacciego

### Gann

- [ ] P3 Gann box
- [ ] P3 Gann fan
- [ ] P3 Gann square

### Formacje

- [x] P1 ABCD / korekta 1:1 (AB=CD), z projekcjami 1.272 i 1.618
- [ ] P2 XABCD / formacje harmoniczne
- [ ] P2 Głowa z ramionami
- [ ] P2 Trójkąt
- [ ] P3 Fale Elliotta (impuls)
- [ ] P3 Fale Elliotta (korekta)

### Prognozy i pomiary

- [ ] P2 Long position
- [ ] P2 Short position
- [ ] P2 Zakres cen
- [ ] P2 Zakres dat
- [ ] P2 Zakres dat i cen
- [ ] P3 Prognoza (forecast)

### Kształty

- [x] P1 Prostokąt
- [ ] P2 Elipsa
- [ ] P2 Trójkąt (kształt)
- [ ] P2 Łuk
- [ ] P2 Strzałki
- [ ] P3 Ścieżka
- [ ] P3 Pędzel

### Tekst i notatki

- [x] P1 Tekst
- [ ] P2 Notatka
- [ ] P2 Objaśnienie (callout / balloon)
- [ ] P2 Etykieta ceny
- [ ] P3 Flaga

### Wskaźniki

Zrobione w etapie 2 (lokalnie, z okresem i przełącznikiem):

- [x] P1 SMA (MA)
- [x] P1 EMA
- [x] P1 Bollinger Bands
- [x] P1 Wolumen
- [x] P1 RSI
- [x] P1 MACD

Najpopularniejsze, jeszcze niezaimplementowane (kolejność P1 → P3):

- [x] P1 WMA
- [x] P1 VWAP
- [x] P1 Ichimoku
- [x] P1 Stochastic
- [x] P1 ATR
- [x] P1 Supertrend
- [x] P1 Pivot Points
- [x] P1 ADX/DMI
- [x] P2 StochRSI
- [x] P2 CCI
- [x] P2 SAR (Parabolic)
- [x] P2 Keltner Channels
- [x] P2 Donchian Channels
- [x] P2 OBV
- [x] P2 MFI
- [x] P2 Williams %R
- [ ] P2 ROC
- [ ] P2 Momentum
- [ ] P2 CMF
- [ ] P2 Aroon
- [ ] P3 pozostałe z typowej listy ~100 (np. Alligator, Awesome Oscillator, Chaikin Oscillator, Detrended Price, Elder Ray, Envelope, Force Index, Hull MA, KAMA, Mass Index, McGinley, PSAR wariantów, Trix, Ultimate Oscillator, Vortex, ZigZag, volume profile itd.)

### Alerty i układ

- [x] P1 Alerty cenowe
- [x] P1 Układ wielu wykresów
- [x] P2 Etykiety wskaźników w dodatkowych panelach układu wielu wykresów
- [x] P1 Motyw ciemny (domyślny)
- [x] P1 Motyw jasny
- [x] P1 Zapis układu (layout) — automatyczny zapis giełdy, pary, interwału i motywu

## UI wskaźników i panel (23 XI 2026)

- Pasek checkboxów zastąpiony przyciskiem „fx Wskaźniki”: okno z wyszukiwarką i grupami (Trend, Momentum, Zmienność, Wolumen), wiele instancji tego samego wskaźnika, etykiety na wykresie (ustawienia / ukryj / usuń). Zapis `wykresy:indicators` v2 z migracją ze starych ustawień.
- Etykiety wskaźników (fx, ustawienia / ukryj / usuń) są też na dodatkowych panelach układu wielu wykresów; lista zapisywana w układzie.
- Panel obserwowanych i alertów cenowych po prawej stronie. Przycisk „Panel” w górnym pasku chowa/pokazuje panel; wykresy zajmują wtedy całą szerokość. Stan w `wykresy:sidebar`.

## Płynność i wygląd (23 XI 2026)

- Płynne przewijanie i zoom: kinetic scroll (mysz i dotyk), ograniczone `barSpacing`, `rightOffset`, osie bez ciężkiej ramki. Przy zmianie pary/interwału zachowywany jest logiczny zakres; zamiast pustego ekranu szkielet lub pasek odświeżania; płynne przyciemnienie (ok. 180 ms).
- Cache świec w pamięci i `sessionStorage` (klucz giełda+para+interwał, max 8 wpisów). Dodatkowe panele układu wielu wykresów inicjowane leniwie.
- Overlay rysowania: `requestAnimationFrame`, bez zbędnych przerysowań przy ruchu wskaźnika, `devicePixelRatio`.
- Ciemny motyw: subtelna siatka, czytelny crosshair z etykietami, legenda OHLC (O H L C i zmiana %) przy kursorze, podświetlenie ostatniej ceny, lewy pionowy pasek narzędzi rysowania (ikony z tooltipami), uporządkowany górny pasek, przejścia hover 160 ms. Etykiety wskaźników także na dodatkowych panelach układu.

