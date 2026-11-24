# Stan prac

Aktualizacja: 24 listopada 2026, ok. 16:50 (Europe/Warsaw).

Projekt nazywa się **OpenCharts**. Etap 1 i etap 2 są ukończone. Repozytorium publiczne: [sellthenews/opencharts](https://github.com/sellthenews/opencharts). GitHub Pages: [https://sellthenews.github.io/opencharts/](https://sellthenews.github.io/opencharts/). Licencja projektu: **AGPL-3.0-or-later**. Interfejs jest po angielsku.

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
- Pary: wyszukiwarka wszystkich par spot z oficjalnych API Krakena, Binance, Coinbase i Bitstamp (filtr giełdy, podpowiedzi, cache 24 h). Domyślnie XRP/USD, BTC/USD, ETH/USD; interwały 1h, 4h, 1D, 1W, 1M (agregacja gdy trzeba).
- Wskaźniki lokalne, włączanie/okres w UI, `localStorage`.
- Obserwowane: wiele list (My list, Crypto), dodawanie/usuwanie, cena i zmiana 24h, klik otwiera wykres; odświeżanie 45 s gdy karta widoczna; pozycje Krakena też z tickera WS.
- Rysunki: narzędzia P1–P3 z listy poniżej; rysowanie klik-klik z podglądem, magnes do OHLC, cienkie wygładzone linie, kółka-uchwyty po zaznaczeniu, pływający pasek stylu (kolor, grubość, styl, blokada, usuń), Delete/Backspace, po narysowaniu powrót do kursora. JSON i `localStorage` per giełda+para, wraz ze stylem. Linia pozioma ma etykietę ceny na osi.
- Live Kraken: `wss://ws.kraken.com/v2`, kanały `ohlc` i `ticker`, ponowne łączenie.
- Deploy Pages z `main` (`.github/workflows/pages.yml`) na https://sellthenews.github.io/opencharts/.
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
- [x] P2 Linia rozszerzona (extended line)
- [x] P1 Linia pozioma
- [x] P2 Linia pozioma-promień (horizontal ray)
- [x] P2 Linia pionowa
- [x] P1 Kanał równoległy
- [x] P2 Kanał regresji
- [x] P3 Widły Andrewsa

### Fibonacci

- [x] P1 Zniesienie (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1)
- [x] P1 Rozszerzenie wg trendu (Trend-Based Fib Extension)
- [x] P2 Kanał Fibonacciego
- [x] P2 Wachlarz Fibonacciego
- [x] P3 Strefy czasowe Fibonacciego
- [x] P3 Łuki Fibonacciego
- [x] P3 Spirala Fibonacciego

### Gann

- [x] P3 Gann box
- [x] P3 Gann fan
- [x] P3 Gann square

### Formacje

- [x] P1 ABCD / korekta 1:1 (AB=CD), z projekcjami 1.272 i 1.618
- [x] P2 XABCD / formacje harmoniczne
- [x] P2 Głowa z ramionami
- [x] P2 Trójkąt
- [x] P3 Fale Elliotta (impuls)
- [x] P3 Fale Elliotta (korekta)

### Prognozy i pomiary

- [x] P2 Long position
- [x] P2 Short position
- [x] P2 Zakres cen
- [x] P2 Zakres dat
- [x] P2 Zakres dat i cen
- [x] P3 Prognoza (forecast)

### Kształty

- [x] P1 Prostokąt
- [x] P2 Elipsa
- [x] P2 Trójkąt (kształt)
- [x] P2 Łuk
- [x] P2 Strzałki
- [x] P3 Ścieżka
- [x] P3 Pędzel

### Tekst i notatki

- [x] P1 Tekst
- [x] P2 Notatka
- [x] P2 Objaśnienie (callout / balloon)
- [x] P2 Etykieta ceny
- [x] P3 Flaga

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
- [x] P2 ROC
- [x] P2 Momentum
- [x] P2 CMF
- [x] P2 Aroon
- [ ] P3 pozostałe z typowej listy ~100 (np. Alligator, Awesome Oscillator, Chaikin Oscillator, Detrended Price, Elder Ray, Envelope, Force Index, Hull MA, KAMA, Mass Index, McGinley, PSAR wariantów, Trix, Ultimate Oscillator, Vortex, ZigZag, volume profile itd.)

### Alerty i układ

- [x] P1 Alerty cenowe
- [x] P1 Układ wielu wykresów
- [x] P2 Etykiety wskaźników w dodatkowych panelach układu wielu wykresów
- [x] P1 Motyw ciemny (domyślny)
- [x] P1 Motyw jasny
- [x] P1 Zapis układu (layout) — automatyczny zapis giełdy, pary, interwału i motywu

## UI wskaźników i panel (23 XI 2026)

- Pasek checkboxów zastąpiony przyciskiem „fx Wskaźniki”: okno z wyszukiwarką i grupami (Trend, Momentum, Zmienność, Wolumen), wiele instancji tego samego wskaźnika, etykiety na wykresie (ustawienia / ukryj / usuń). Zapis `opencharts:indicators` (migracja z `wykresy:`) v2 z migracją ze starych ustawień.
- Etykiety wskaźników (fx, ustawienia / ukryj / usuń) są też na dodatkowych panelach układu wielu wykresów; lista zapisywana w układzie.
- Panel obserwowanych i alertów cenowych po prawej stronie. Przycisk „Panel” w górnym pasku chowa/pokazuje panel; wykresy zajmują wtedy całą szerokość. Stan w `opencharts:sidebar` (migracja z `wykresy:`).

## Płynność i wygląd (23 XI 2026)

- Płynne przewijanie i zoom: kinetic scroll (mysz i dotyk), ograniczone `barSpacing`, `rightOffset`, osie bez ciężkiej ramki. Przy zmianie pary/interwału zachowywany jest logiczny zakres; zamiast pustego ekranu szkielet lub pasek odświeżania; płynne przyciemnienie (ok. 180 ms).
- Cache świec w pamięci i `sessionStorage` (klucz giełda+para+interwał, max 8 wpisów). Dodatkowe panele układu wielu wykresów inicjowane leniwie.
- Overlay rysowania: `requestAnimationFrame`, bez zbędnych przerysowań przy ruchu wskaźnika, `devicePixelRatio`.
- Ciemny motyw: subtelna siatka, czytelny crosshair z etykietami, legenda OHLC (O H L C i zmiana %) przy kursorze, podświetlenie ostatniej ceny, lewy pionowy pasek narzędzi rysowania (ikony z tooltipami), uporządkowany górny pasek, przejścia hover 160 ms. Etykiety wskaźników także na dodatkowych panelach układu.

## Postęp P2 (23 XI 2026)

Skończona całość P2 z listy w tym pliku: etykiety wskaźników w układzie wielu wykresów, wszystkie popularne wskaźniki P2 (StochRSI … Aroon) oraz wszystkie narzędzia rysowania P2 (pozycje long/short, zakresy, linie, strzałka, etykieta ceny, notatka/objaśnienie, elipsa, trójkąt kształt i formacja, kanał regresji, XABCD, głowa z ramionami, kanał i wachlarz Fibonacciego, łuk). Każde z uchwytami, przesuwaniem, zapisem i eksportem jak istniejące narzędzia.

Następne (poza tym przebiegiem): pozycje P3, m.in. łuki Fibonacciego.

## Postęp P3 (23 XI 2026)

Zrobione narzędzia rysowania P3 z listy: fale Elliotta (impuls 0–5 i korekta ABC), ścieżka, pędzel, flaga, prognoza, łuki i spirala Fibonacciego, strefy czasowe Fibonacciego, Gann box/fan/square, widły Andrewsa. Każde z uchwytami, przesuwaniem, zapisem i eksportem.

Pozostało: pozostałe wskaźniki z typowej listy ~100 (P3).

## Wyszukiwarka, menu, kursor i rysowanie (24 XI 2026)

- Wyszukiwarka par: klik w nazwę pary w nagłówku albo litera na wykresie (gdy focus nie jest w polu tekstowym); Esc zamyka. Listy z oficjalnych API (Kraken AssetPairs, Binance exchangeInfo — tylko SPOT/TRADING, Coinbase products online, Bitstamp trading-pairs-info Enabled). Filtr Wszystkie/Kraken/Binance/Coinbase/Bitstamp. Prefiks bazy przed trafieniem w środku, limit ~100, strzałki + Enter. Wybór przełącza giełdę i parę. Cache `opencharts:symbols:<giełda>` (migracja z `wykresy:`) 24 h. Błąd jednej giełdy nie psuje pozostałych. Kraken WS tylko gdy źródło to Kraken.
- Cache list (24 XI 2026): Kraken 1353, Binance 1376, Coinbase 511. Lista Bitstamp z `trading-pairs-info` jest blokowana przez CORS w przeglądarce (świece z `/api/v2/ohlc/` nadal działają; curl widzi 252 pary Enabled). Błąd tej giełdy nie psuje pozostałych.
- Menu kontekstowe (prawy klik na wykresie): Zresetuj wykres (zoom/scroll i autoscale osi ceny, bez kasowania rysunków i wskaźników), Kopiuj cenę, Dodaj alert na tej cenie, Usuń wszystkie rysunki (z potwierdzeniem). Zamknięcie: klik poza / Esc.
- Kursor: krzyż z przerywanymi liniami i etykietami ceny/czasu na osiach (LWC CrosshairMode + LineStyle.Dashed). Pierwsza ikona lewego paska: krzyż / kropka / strzałka, zapis w `localStorage`. Przełącznik magnesu (przyciąganie do OHLC) obok.
- Po zaznaczeniu rysunku pływający pasek (kolor, grubość 1–4, styl linii, zablokuj, usuń). Ustawienia zapisywane z rysunkiem.

Zrzuty (lokalne, w `.gitignore`): `screenshots-test/wyszukiwarka-par.png`, `screenshots-test/menu-kontekstowe.png`, `screenshots-test/rysowanie-tv.png`.

## OpenCharts i język angielski (24 XI 2026)

Aplikacja nosi nazwę **OpenCharts** (tytuł, logo, meta, `package.json`, README, CONTRIBUTING, THIRD_PARTY, nagłówki copyright „OpenCharts contributors”). UI, komunikaty, etykiety, aria-label, nazwy narzędzi i miesięcy oraz locale LWC/`Intl` są po angielsku (`en-US`), `html lang="en"`.

Klucze `localStorage` / `sessionStorage` mają prefiks `opencharts:`. Przy starcie jednorazowo kopiowane są stare klucze `wykresy:` oraz ewentualne `opencandle:`, o ile nowy klucz jeszcze nie istnieje (rysunki, wskaźniki, layout, sidebar, listy, alerty, kursor, magnes, motyw, cache par i świec). Dane użytkownika nie są nadpisywane ani usuwane.

## Akcje i xStocks (24 XI 2026)

- Wyszukiwarka ma filtr **Crypto / Stocks** obok filtra giełdy; przy każdym wyniku widać źródło danych.
- Kraken xStocks: **177** par `*x/USD` online (np. AAPLx/USD) z publicznego `AssetPairs?aclass_base=tokenized_asset` (CORS działa w przeglądarce). Świece i ticker wymagają `asset_class=tokenized_asset`. Wyszukiwarka pokazuje wariant `*x`, bez równoległych listingów `*SPV`.
- XRPN (Evernorth, Nasdaq) nie jest na Krakenie jako xStock. Yahoo Finance ma ten ticker, ale API Yahoo/Stooq/Nasdaq są blokowane przez CORS w przeglądarce — bez backendu nie da się ich dodać.
