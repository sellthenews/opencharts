# Budowa APK Swapwick (Trusted Web Activity)

Ten przewodnik jest dla Mateusza. Na środowisku, w którym przygotowano te pliki, nie było oficjalnego JDK ani Android SDK, więc APK nie został tu zbudowany. Konfiguracja jest gotowa w `twa/twa-manifest.json`. Nie trzeba zakładać żadnego konta (ani Google Play, ani innego), żeby powstał podpisany APK do instalacji ręcznej (sideload).

Aplikacja to opakowanie live site [https://sellthenews.github.io/opencharts/](https://sellthenews.github.io/opencharts/) jako [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity) przez oficjalne [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). Najpierw poczekaj, aż PWA z tej gałęzi będzie już opublikowana (manifest, ikony 512 px, service worker).

## 1. JDK 17

1. Pobierz **Temurin 17 (LTS)** z oficjalnej strony Adoptium: [https://adoptium.net/temurin/releases/?version=17](https://adoptium.net/temurin/releases/?version=17).
2. Zainstaluj pakiet dla swojego systemu i ustaw `JAVA_HOME` na katalog JDK.
3. Sprawdź: `java -version` (powinna być wersja 17).

## 2. Android SDK (command-line tools)

1. Pobierz **Command line tools only** z oficjalnej strony Androida: [https://developer.android.com/studio#command-tools](https://developer.android.com/studio#command-tools). Nie potrzebujesz pełnego Android Studio, choć też pochodzi z tej samej strony i jest w porządku.
2. Rozpakuj tools do np. `$HOME/android-sdk/cmdline-tools/latest`.
3. Ustaw zmienne:

```bash
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

4. Przyjmij licencje i doinstaluj platformę (oficjalny `sdkmanager`):

```bash
sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

## 3. Bubblewrap

Z oficjalnego rejestru npm:

```bash
npm install --global @bubblewrap/cli
bubblewrap --version
```

Przy pierwszym uruchomieniu Bubblewrap zapyta o ścieżki JDK i Android SDK — podaj te z kroków 1–2.

## 4. Lokalny keystore (nie commituj go)

W katalogu `twa/` repozytorium wygeneruj klucz narzędziem `keytool` z JDK (oficjalne, bez konta):

```bash
cd twa
keytool -genkeypair -v \
  -keystore android-release.keystore \
  -alias android \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Zapisz hasło i plik `android-release.keystore` w bezpiecznym miejscu. Bez tego samego klucza nie zaktualizujesz później tej samej aplikacji (np. gdy kiedyś wrzucisz ją do sklepu). Plików `*.keystore` / `*.jks` nie wolno dodawać do Git.

`twa/twa-manifest.json` już wskazuje ten plik (`signingKey.path` = `./android-release.keystore`, alias `android`).

## 5. Zbuduj APK

Gdy live manifest jest już dostępny pod adresem z `webManifestUrl`:

```bash
cd twa
bubblewrap update --skipVersionUpgrade
bubblewrap build
```

`bubblewrap update` ściąga ikony z opublikowanej PWA i generuje projekt Androida. `bubblewrap build` podpisuje APK tym keystore.

Gotowy plik zwykle leży w `twa/` jako `app-release-signed.apk` (dokładną ścieżkę poda Bubblewrap na końcu). Można go wgrać na telefon: `adb install app-release-signed.apk` albo skopiować plik i otworzyć na urządzeniu.

Jeśli `bubblewrap update` zapyta o wersję, zostaw `0.1.0` / kod `1` przy pierwszym buildzie. Przy kolejnym wydaniu podnieś `appVersionCode` (musi rosnąć) w `twa/twa-manifest.json`.

## 6. Digital Asset Links (pasek adresu w TWA)

Żeby Android uznał APK za zweryfikowaną TWA i **ukrył pasek URL**, host musi serwować `assetlinks.json` **w korzeniu domeny**:

`https://sellthenews.github.io/.well-known/assetlinks.json`

To **nie** może być `https://sellthenews.github.io/opencharts/.well-known/assetlinks.json`. GitHub Pages dla repozytorium projektowego (`sellthenews/opencharts`) publikuje tylko pod `/opencharts/`, więc plik trzeba dodać w repozytorium strony użytkownika/organizacji (`sellthenews.github.io`) albo na własnej domenie ustawionej jako host.

Szablon jest w [assetlinks.example.json](assetlinks.example.json). Odczytaj odcisk SHA-256 keystore:

```bash
keytool -list -v -keystore twa/android-release.keystore -alias android
```

Wpisz wartość `SHA256` w miejsce `REPLACE_WITH_KEYSTORE_SHA256` (wielkie litery, dwukropki jak w `keytool`, albo bez dwukropków — obie formy są przyjmowane, byle 32 bajty). `package_name` zostaw `io.github.sellthenews.opencharts`.

Bez tego pliku APK i tak się zainstaluje i otworzy Swapwick, ale Chrome może pokazać pasek adresu (tryb Custom Tabs z `fallbackType`).

Sprawdzenie po publikacji:

`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://sellthenews.github.io&relation=delegate_permission/common.handle_all_urls`

## Czego tu nie robić

- Nie zakładaj konta Google, Play Console ani innego, żeby tylko zbudować APK.
- Nie wklejaj hasła keystore ani samego keystore do repozytorium, czatu ani CI.
- Pobieraj JDK, SDK i Bubblewrap wyłącznie z powyższych oficjalnych źródeł.
