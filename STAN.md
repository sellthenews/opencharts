# Stan prac

Aktualizacja: 24 listopada 2026, ok. 16:50 (Europe/Warsaw).

Projekt nazywa się **Swapwick** (dawniej OpenCharts). Etap 1 i etap 2 są ukończone. Repozytorium publiczne: [sellthenews/opencharts](https://github.com/sellthenews/opencharts). Strona live (custom domain): [https://swapwick.com/](https://swapwick.com/) (stary adres `sellthenews.github.io/opencharts/` przekierowuje na `swapwick.com`). Licencja projektu: **AGPL-3.0-or-later**. Interfejs jest po angielsku.

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
- Rysunki: narzędzia P1–P3 z listy poniżej; rysowanie klik-klik z podglądem, magnes do OHLC, cienkie wygładzone linie, kółka-uchwyty po zaznaczeniu, pływający pasek stylu (kolor, grubość, styl, blokada, usuń; ukryty, aż rysunek jest zaznaczony, wtedy mały w lewym górnym rogu wykresu, znika po kliknięciu w puste miejsce albo Esc), Delete/Backspace (nie gdy fokus jest w polu tekstowym), po narysowaniu powrót do kursora. JSON i `localStorage` per giełda+para, wraz ze stylem. Linia pozioma ma etykietę ceny na osi.
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

## Roadmapa: narzędzia rysowania

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
- Ciemny motyw: subtelna siatka, czytelny crosshair z etykietami, legenda OHLC (O H L C i zmiana %) przy kursorze, podświetlenie ostatniej ceny, lewy pionowy pasek narzędzi w grupach (menu z nagłówkami i gwiazdkami, pływający pasek ulubionych), uporządkowany górny pasek, przejścia hover 160 ms. Etykiety wskaźników także na dodatkowych panelach układu.

## Postęp P2 (23 XI 2026)

Skończona całość P2 z listy w tym pliku: etykiety wskaźników w układzie wielu wykresów, wszystkie popularne wskaźniki P2 (StochRSI … Aroon) oraz wszystkie narzędzia rysowania P2 (pozycje long/short, zakresy, linie, strzałka, etykieta ceny, notatka/objaśnienie, elipsa, trójkąt kształt i formacja, kanał regresji, XABCD, głowa z ramionami, kanał i wachlarz Fibonacciego, łuk). Każde z uchwytami, przesuwaniem, zapisem i eksportem jak istniejące narzędzia.

Następne (poza tym przebiegiem): pozycje P3, m.in. łuki Fibonacciego.

## Postęp P3 (23 XI 2026)

Zrobione narzędzia rysowania P3 z listy: fale Elliotta (impuls 0–5 i korekta ABC), ścieżka, pędzel, flaga, prognoza, łuki i spirala Fibonacciego, strefy czasowe Fibonacciego, Gann box/fan/square, widły Andrewsa. Każde z uchwytami, przesuwaniem, zapisem i eksportem.

Pozostało: pozostałe wskaźniki z typowej listy ~100 (P3).

## Wyszukiwarka, menu, kursor i rysowanie (24 XI 2026)

- Wyszukiwarka par: klik w nazwę pary w nagłówku albo litera na wykresie (gdy focus nie jest w polu tekstowym); Esc zamyka. Listy z oficjalnych API (Kraken AssetPairs, Binance exchangeInfo — tylko SPOT/TRADING, Coinbase products online, Bitstamp trading-pairs-info Enabled). Filtr Wszystkie/Kraken/Binance/Coinbase/Bitstamp. Prefiks bazy przed trafieniem w środku, limit ~100, strzałki + Enter. Wybór przełącza giełdę i parę. Cache `opencharts:symbols:<giełda>` (migracja z `wykresy:`) 24 h. Błąd jednej giełdy nie psuje pozostałych. Kraken WS tylko gdy źródło to Kraken.
- Cache list (24 XI 2026): Kraken 1353, Binance 1376, Coinbase 511. Lista Bitstamp z `trading-pairs-info` jest blokowana przez CORS w przeglądarce (świece z `/api/v2/ohlc/` nadal działają; curl widzi 252 pary Enabled). Błąd tej giełdy nie psuje pozostałych.
- Menu kontekstowe (prawy klik na wykresie): Zresetuj wykres (zoom/scroll i autoscale osi ceny, bez kasowania rysunków i wskaźników), Kopiuj cenę, Dodaj alert na tej cenie, Usuń wszystkie rysunki (z potwierdzeniem), Eksport / import rysunków, Extend Fib right. Zamknięcie: klik poza / Esc.
- Kursor: krzyż z przerywanymi liniami i etykietami ceny/czasu na osiach (LWC CrosshairMode + LineStyle.Dashed). Pierwsza ikona lewego paska: krzyż / kropka / strzałka, zapis w `localStorage`. Przełącznik magnesu (przyciąganie do OHLC) na dole paska.
- Po zaznaczeniu rysunku pływający pasek (kolor, grubość 1–4, styl linii, zablokuj, usuń). Ustawienia zapisywane z rysunkiem.

Zrzuty (lokalne, w `.gitignore`): `screenshots-test/wyszukiwarka-par.png`, `screenshots-test/menu-kontekstowe.png`, `screenshots-test/rysowanie.png`.

## Swapwick i język angielski (24 XI 2026)

Aplikacja nosi nazwę **Swapwick** (tytuł, logo, meta, `package.json`, README, CONTRIBUTING, THIRD_PARTY, nagłówki copyright „Swapwick contributors”). Do 25 XI 2026 projekt nazywał się OpenCharts. UI, komunikaty, etykiety, aria-label, nazwy narzędzi i miesięcy oraz locale LWC/`Intl` są po angielsku (`en-US`), `html lang="en"`.

Klucze `localStorage` / `sessionStorage` mają prefiks `opencharts:`. Przy starcie jednorazowo kopiowane są stare klucze `wykresy:` oraz ewentualne `opencandle:`, o ile nowy klucz jeszcze nie istnieje (rysunki, wskaźniki, layout, sidebar, listy, alerty, kursor, magnes, motyw, cache par i świec). Dane użytkownika nie są nadpisywane ani usuwane.

## Akcje i xStocks (24 XI 2026)

- Wyszukiwarka ma filtr **Crypto / Stocks** obok filtra giełdy; przy każdym wyniku widać źródło danych.
- Kraken xStocks: **177** par `*x/USD` online (np. AAPLx/USD) z publicznego `AssetPairs?aclass_base=tokenized_asset` (CORS działa w przeglądarce). Świece i ticker wymagają `asset_class=tokenized_asset`. Wyszukiwarka pokazuje wariant `*x`, bez równoległych listingów `*SPV`.
- XRPN (Evernorth, Nasdaq) nie jest na Krakenie jako xStock. Świece i ticker idą przez Cloudflare Worker (`worker/`, `opencharts-proxy`) do Yahoo Finance (`query1`/`query2.finance.yahoo.com`, tylko `/v8/finance/chart/{symbol}` i `/v1/finance/search`). Domyślny URL: `https://opencharts-proxy.opencharts.workers.dev` (`src/config.ts` / `VITE_STOCKS_PROXY`). Bez URL kategoria Stocks pokazuje „Stock data proxy not configured yet”; krypto i xStocks działają dalej.
- Lista Stocks (Yahoo): XRPN, AAPL, MSFT, NVDA, TSLA, AMZN, META, GOOGL, COIN, MSTR, HOOD (z nazwami spółek) plus wyszukiwanie dowolnego tickera (debounce, tylko EQUITY/ETF, w tym GPW `.WA`). Interwały: 1h z Yahoo (historia intraday zwykle ~60–90 dni), 4h agregowane z 1h, 1D/1W/1M z Yahoo (`1d`/`1wk`/`1mo`).

Zrzut (lokalny, w `.gitignore`): `screenshots-test/stocks-yahoo.png` (XRPN z zamockowanym proxy).

## Pasek narzędzi i ulubione (24 XI 2026)

- Lewy pasek w grupach: kursor, linie, Fibonacci, formacje, prognozy i mierniki, pędzel, tekst, kształty. Na dole: linijka (zakres daty i ceny), zoom (przybliż / oddal / dopasuj), magnes, zablokuj wszystkie rysunki, ukryj wszystkie, kosz (z potwierdzeniem). Klik ikony grupy włącza ostatnio użyte narzędzie w tej grupie (ikona się zmienia, stan w `opencharts:rail-last`); mały trójkąt otwiera menu z nagłówkami sekcji po angielsku (np. FORECASTING / MEASURERS) i gwiazdką przy każdym narzędziu. Esc albo klik poza menu zamyka je.
- W menu są tylko narzędzia, które działają. Nie ma sekcji VOLUME-BASED (Anchored VWAP, profil wolumenu), Ghost feed ani innych pozycji, których nie implementujemy.
- Gwiazdka dodaje narzędzie do pływającego paska ulubionych (ciemna pastylka, uchwyt z sześcioma kropkami, przeciąganie). Aktualna lista i pozycja są w `opencharts:favorites-v2`. Gdy brak klucza, pasek jest widoczny z domyślnym zestawem narzędzi, wyśrodkowany w górnej części wykresu. Jednorazowa migracja ze starego `opencharts:favorites` (także pusta lista) zapisuje unię: najpierw zestaw domyślny, potem własne narzędzia bez duplikatów, pokazuje pasek i zeruje pozycję. Po migracji lista v2 (także pusta po świadomym usunięciu) nie jest nadpisywana. Pusty pasek jest ukryty.
- Eksport / import rysunków oraz „Extend Fib right” są w menu kontekstowym, nie na lewym pasku.

Zrzuty (lokalne, w `.gitignore`): `screenshots-test/pasek-menu.png`, `screenshots-test/pasek-ulubione.png`. Folder `screenshots-test/ref/` z referencyjnymi zdjęciami też jest ignorowany i nie trafia do repo.

## Watchlista i menu (24 XI 2026)

- Menu prawego przycisku: „Add <SYMBOL> to watchlist” albo „Remove <SYMBOL> from watchlist”.
- Przycisk + w nagłówku listy otwiera wyszukiwarkę w trybie dodawania (wybór dopisuje symbol, nie zmienia wykresu). × przy wierszu usuwa. Zapis `opencharts:watchlists` (migracja z `wykresy:`).
- Limit 3 pozycji wynikał z formularza Add opartego wyłącznie o `PAIR_IDS` (XRP/BTC/ETH) — te trzy już były na liście. Formularz zastąpiony wyszukiwarką, bez limitu.
- Wiersze dla krypto (wszystkie giełdy), Kraken xStocks i Yahoo (XRPN itd.): cena i zmiana % (24h / dzienna z meta). Klik otwiera wykres ze źródłem. Odświeżanie co 60 s, max 4 równoległe zapytania.
- Gdy fetch do Workera lub giełdy się nie uda (np. adblock): czytelny komunikat w pasku statusu. W `index.html` jest `Cache-Control: no-cache, no-store`; GitHub Pages i tak serwuje HTML z `max-age=600`. `version.json` z hashem buildu — przy starcie, jeśli nowszy, jednorazowy reload.

Zrzuty (lokalne, w `.gitignore`): `screenshots-test/watchlist-menu.png`, `screenshots-test/watchlist-lista.png`.

## Fib Retracement i ulubione (24 XI 2026)

- Zniesienie Fibonacciego ma 24 domyślne poziomy (0 … 2.618), wszystkie włączone. Nowe rysunki dostają kopię aktualnych domyślnych (`opencharts:fib-defaults` po „Save as default”, w przeciwnym razie wbudowane). Stare rysunki bez zapisanych poziomów renderują się z nowym wbudowanym zestawem 24 poziomów (nie z późniejszymi domyślnymi użytkownika). Rysunki z własnymi poziomami zostają bez zmian.
- Własna paleta pod ciemny motyw (czytelna też w jasnym): szaro-niebieski → niebieski / turkus / zieleń (0–1), złoto / pomarańcz dla rozszerzeń (>1). Kluczowe 0.5, 0.61, 0.786, 1, 1.618 są grubsze i w pełnej nieprzezroczystości; pozostałe delikatniejsze. Półprzezroczyste tło między poziomami (domyślnie 8%). Etykiety 10 px, z lekkim rozsuwaniem przy kolizji.
- Okno Style: dwuklik na rysunku, „Settings…” w menu prawego przycisku oraz koło zębate na pasku stylu. Lista poziomów (checkbox, wartość, kolor, dodaj/usuń), Background, Reverse, Prices, Levels, Labels (lewo/prawo), Extend lines, OK / Cancel / Reset to defaults / Save as default. UI po angielsku. Ustawienia per rysunek zapisują się z rysunkiem.

Zrzuty (lokalne, w `.gitignore`): `screenshots-test/fib-wykres.png`, `screenshots-test/fib-ustawienia.png`, `screenshots-test/ulubione-domyslne.png`.

## Ulubione v2 i pasek stylu (24 XI 2026)

- Jednorazowa migracja `opencharts:favorites` → `opencharts:favorites-v2`: unia zestawu domyślnego i wcześniej dodanych narzędzi (kolejność: domyślne, potem własne), pasek widoczny, pozycja wyzerowana. Drugi raz nie migrujemy.
- Pasek edycji rysunku jest domyślnie ukryty, pojawia się po zaznaczeniu, stoi mały w lewym górnym rogu wykresu i znika po kliknięciu w puste miejsce albo Esc.

Zrzuty (lokalne, w `.gitignore`): `screenshots-test/fib-zaznaczony.png`, `screenshots-test/ulubione-migracja.png`.

- Kierunek zniesienia (24 XI 2026, poprawka): pierwszy punkt to poziom 1, drugi to poziom 0, poziomy >1 za pierwszym punktem. Reverse odwraca to (0 na pierwszym punkcie). Stare rysunki bez Reverse przechodzą na nowy kierunek. Extension: 0 na C, 1 = C+(B−A) — wzór już był poprawny.

Zrzut (lokalny, w `.gitignore`): `screenshots-test/fib-kierunek.png`.

- Trend-based Fib Extension (24 XI 2026): osobny zestaw poziomów z uzgodnionej listy (włączone: 0, 0.9, 1, 1.061, 1.155, 1.272, 1.414, 1.618; pozostałe na liście wyłączone). Domyślnie linia trendu kropkowana, Extend right, Background, Prices wyłączone, etykiety Values po lewej na środku. Paleta z tej samej rodziny co zniesienie, ale inna; 1 i 1.618 grubsze. Zapis `opencharts:fibext-defaults`. Na liście nie było 2.618 ani 4.236 — nie dodałem ich. Duplikaty 1.061 i 1.414 sprowadzone do jednego wpisu (włączonego).

Zrzuty (lokalne, w `.gitignore`): `screenshots-test/fib-extension-domyslne.png`, `screenshots-test/fib-extension.png` (z włączonymi cenami).

## Export / Import ustawień (24 XI 2026)

- Przycisk Settings w pasku narzędzi (koło zębate): Export data i Import data. Backup JSON `{format:'opencharts-backup', version:1, exportedAt, data}` ze wszystkimi kluczami `opencharts:`. Import przez `input type=file`, walidacja, Replace all albo Merge, potem odświeżenie widoku. Bez serwera i logowania.

Zrzut (lokalny, w `.gitignore`): `screenshots-test/eksport-import-menu.png`.

## Kinetic scroll i magnes Ctrl (24 XI 2026)

- `kineticScroll` (mysz i touch) jest wyłączony, więc wykres nie „pływa” po puszczeniu przycisku.
- Ctrl (Cmd na Macu) tymczasowo włącza magnes do O/H/L/C; gdy stały magnes jest włączony, ten sam klawisz go wyłącza.

## Wskaźniki ETAP 1 i sekcje watchlisty (24 XI 2026)

- Okno Indicators: wyszukiwarka, kategorie, ulubione (gwiazdki). Ustawienia parametrów, koloru i grubości, ukryj/usuń, wiele instancji. Nakładki na cenie i panele oscylatorów z możliwością zmiany wysokości. Zapis per wykres `opencharts:indicators:<giełda>:<symbol>` (migracja ze starego `opencharts:indicators`).
- Zestaw ETAP 1: SMA, EMA, WMA, VWAP sesyjny i anchored, Bollinger, RSI, MACD, Stochastic, Stoch RSI, ATR, ADX/DMI, Ichimoku, Parabolic SAR, SuperTrend, OBV, Volume + MA, Volume Profile (Visible Range i Fixed Range), Pivot Points (Standard/Fib), Keltner, Donchian, CCI, MFI, Williams %R, ROC/Momentum, Aroon, CMF.
- Watchlista: przeciąganie kolejności i między sekcjami, Add section (menu listy i prawy przycisk), nazwa dwuklikiem, zwijanie, przeciąganie sekcji, usuwanie sekcji z potwierdzeniem (aktywa wracają do listy bez sekcji). Migracja istniejącej listy, klucz `opencharts:watchlists` (objęty Export/Import).

Zrzuty (lokalne, w `.gitignore`): `screenshots-test/wskazniki-okno.png`, `screenshots-test/wskazniki-wykres.png`, `screenshots-test/watchlista-sekcje.png`.

## Skróty, alerty i Compare (24 XI 2026)

- Skróty: Alt+T/H/V/F (trend, pozioma, pionowa, Fib), Ctrl+Z / Ctrl+Y (także Cmd) cofa i przywraca rysunki oraz wskaźniki, Del usuwa zaznaczenie, Esc odznacza. Litera otwiera wyszukiwarkę symbolu; liczba+Enter zmienia interwał. Bez kolizji z polami tekstowymi.
- Alerty: „Add alert” z menu prawego przycisku na wykresie albo na linii (poziom ceny albo przecięcie trendu/poziomej). Dźwięk i Notification API, zgoda dopiero po kliknięciu (Add albo „Enable notifications”). Lista z edycją i usuwaniem, zapis `opencharts:alerts`, notka „Alerts work while this tab is open”.
- Compare: nakładka innych symboli w %, liczona od pierwszej widocznej świecy, kilka symboli, kolory i legenda. Klucz `opencharts:compare` (Export/Import).

Nie weszły do tego pusha: szablony zestawów wskaźników/stylów oraz przyspieszenie liczenia wskaźników (Web Worker / inkrementalnie).

Zrzuty (lokalne, w `.gitignore`): `screenshots-test/alerty.png`, `screenshots-test/compare.png`.

## Szablony i liczenie inkrementalne (24 XI 2026)

- Settings: Save template… zapisuje zestaw wskaźników (z parametrami i stylami) oraz domyślne style Fib, Fib Ext i linii pod nazwą, klucz `opencharts:templates` (Export/Import). Kliknięcie nazwy ładuje zestaw na bieżący wykres.
- Przy aktualizacji ostatniej świecy albo dopisaniu nowej host nie przebudowuje serii, tylko przelicza ogon i robi `update`/`setData` na istniejących seriach.

Zrzut (lokalny, w `.gitignore`): `screenshots-test/szablony.png`.

