# Konta i synchronizacja rysunków — instrukcja wdrożenia

Ten przewodnik jest dla operatora (Mateusza). Kod jest już w repozytorium.
**Nic z poniższych kroków nie zostało wykonane z tej maszyny:** nie tworzono
aplikacji OAuth, nie logowano się do Cloudflare (`wrangler login`) i nie
wdrożono Workera. Sekrety nigdy nie trafiają do Gita.

Bez tego wdrożenia aplikacja działa jak dotychczas: rysunki zostają w
`localStorage` tej przeglądarki. Przycisk **Account** w Ustawieniach pokazuje
formularz, a próba logowania kończy się komunikatem, że konta nie są jeszcze
dostępne (Worker bez D1/KV albo stary Worker bez ścieżek `/auth` i `/sync`).

## Co powstanie

- Konta: GitHub, Google oraz e-mail + hasło.
- Hasła są liczone w Workerze przez **PBKDF2-SHA-256** (100 000 iteracji,
  losowa sól, WebCrypto). Jawne hasło nie jest zapisywane.
- Sesja to losowy token w ciasteczku **HttpOnly** (`opencharts_session`),
  `Secure` + `SameSite=None` na HTTPS. Token siedzi w KV (TTL 30 dni).
- Prywatne dane konta (klucze `opencharts:…`, w tym rysunki) są w KV pod
  `data:<userId>`. Użytkownik B nie może odczytać danych użytkownika A —
  potwierdzają to testy `npm run worker:test`.
- Istniejący proxy Yahoo i DEX zostaje bez zmian; ścieżki `/auth` i `/sync`
  dochodzą do tego samego Workera `opencharts-proxy`.

## 1. Zaloguj się do Cloudflare

Na swojej maszynie, w katalogu repozytorium:

```bash
npx wrangler login
```

## 2. Utwórz D1 i KV, wklej identyfikatory

```bash
cd worker
npx wrangler d1 create opencharts-accounts
npx wrangler kv namespace create ACCOUNTS
```

Wrangler wypisze `database_id` oraz `id` przestrzeni KV. Odkomentuj w
`worker/wrangler.toml` bloki `[[d1_databases]]` i `[[kv_namespaces]]` i wklej
**prawdziwe** identyfikatory (nie wymyślaj ich). Nie commituj `account_id` ani
sekretów.

Zastosuj migrację schematu użytkowników (lokalnie do testów i na koncie
Cloudflare):

```bash
npx wrangler d1 migrations apply opencharts-accounts --local
npx wrangler d1 migrations apply opencharts-accounts --remote
```

Migracja jest w `worker/migrations/0001_users.sql`.

## 3. Zarejestruj aplikację OAuth GitHub

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Application name: `OpenCharts`.
3. Homepage URL: `https://sellthenews.github.io/opencharts/`
4. Authorization callback URL:
   `https://opencharts-proxy.opencharts.workers.dev/auth/github/callback`
5. Zapisz **Client ID** (może trafić do `[vars]` w `wrangler.toml` jako
   `GITHUB_CLIENT_ID` — to nie jest sekret) oraz **Client Secret** (tylko
   `wrangler secret put`, nigdy do Gita).

Jeśli testujesz też podgląd lokalny, dodaj drugi callback
`http://127.0.0.1:8787/auth/github/callback` albo osobną aplikację deweloperską.

## 4. Zarejestruj klienta OAuth Google

1. Google Cloud Console → APIs & Services → Credentials → Create credentials
   → OAuth client ID → typ **Web application**.
2. Authorized JavaScript origins:
   - `https://sellthenews.github.io`
   - `https://opencharts-proxy.opencharts.workers.dev`
3. Authorized redirect URIs:
   - `https://opencharts-proxy.opencharts.workers.dev/auth/google/callback`
4. Zapisz Client ID w `[vars]` jako `GOOGLE_CLIENT_ID`. Client Secret wyłącznie
   przez `wrangler secret put`.

Ekran zgody OAuth (Consent screen) musi zawierać zakresy `email` i `profile`
(oraz `openid`).

## 5. Ustaw sekrety (nigdy w repozytorium)

```bash
cd worker
npx wrangler secret put SESSION_SECRET
# wklej długi losowy ciąg, np. wynik: openssl rand -hex 32

npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

`SESSION_SECRET` jest zarezerwowany na przyszłe podpisanie sesji; obecna sesja
opiera się na losowym tokenie w KV. i tak warto go ustawić.

W `wrangler.toml` w `[vars]` ustaw też (to nie są sekrety):

```toml
[vars]
GITHUB_CLIENT_ID = "…"
GOOGLE_CLIENT_ID = "…"
APP_ORIGIN = "https://sellthenews.github.io/opencharts/"
```

## 6. Wdróż Workera

```bash
cd worker
npx wrangler deploy
```

Nazwa skryptu ma pozostać `opencharts-proxy`. Publiczny URL bez zmian:
`https://opencharts-proxy.opencharts.workers.dev`. Frontend już z niego korzysta
(`src/config.ts`), więc po wdrożeniu tego samego Workera konta zaczną działać
bez przebudowy strony — o ile D1, KV i sekrety są na miejscu.

Sprawdzenie:

```bash
curl -sS https://opencharts-proxy.opencharts.workers.dev/auth/me
# oczekiwane bez ciasteczka: 401 {"error":"Not signed in"}
# jeśli nadal 404 albo 503, wdrożenie albo bindowania nie doszły.
```

Testy bez konta Cloudflare (z pamięciowym D1/KV):

```bash
npm run worker:test
```

## 7. Zachowanie aplikacji po wdrożeniu

- Bez logowania: rysunki i pozostałe ustawienia zostają lokalnie, jak dziś.
- Po rejestracji / logowaniu: jeśli konto nie ma jeszcze chmury, wysyłany jest
  lokalny stan; jeśli chmura ma dane, są scalane z przeglądarką (klucze
  `opencharts:…`, z wyjątkiem `opencharts:stocks-proxy`) i strona odświeża się.
- **Sync now** ponawia to scalenie. Wylogowanie nie kasuje lokalnych rysunków.
- Przyciski GitHub / Google przekierowują na oficjalny OAuth i wracają do
  `APP_ORIGIN` z ciasteczkiem sesji na domenie Workera (`credentials: 'include'`).

## Czego nie robić

- Nie wklejaj sekretów, haseł ani `account_id` do repozytorium.
- Nie udostępniaj otwartego proxy: `/auth` i `/sync` wymagają sesji albo
  poprawnych danych logowania; metody ledgerów DEX nadal są na białej liście.
