# Dokumentacja testów E2E (Playwright)

Ten dokument opisuje **stan na dziś** warstwy testów end-to-end wokół aplikacji ucznia (`alice-masterclass-js`), integracji z **Django** oraz minimalnego zestawu dla **aplikacji nauczyciela** (`alice-masterclass-teacher`). Uzupełnia skróconą sekcję w [README.md](../README.md).

## Cele

- **Szybka informacja zwrotna** — smoke bez backendu (stub HTTP), żeby lokalnie i w CI szybko wychwycić regresje routingu i podstawowego UI.
- **Integracja z prawdziwym API** — kilka scenariuszy przeciwko Django + seedowi, bez dublowania całej logiki biznesowej (tę część nadal pokrywają testy API w Django).
- **Minimalny smoke nauczyciela** — potwierdzenie, że dev bypass logowania, routing i odczyt eventów z API działają razem z tym samym backendem.

E2E **nie zastępuje** testów jednostkowych Angulara ani testów API w Django — uzupełnia je pod kątem przeglądarki, CORS, routingu i czasu odpowiedzi.

## Struktura plików

| Ścieżka | Znaczenie |
| --- | --- |
| `playwright.config.ts` | Domyślna konfiguracja: tylko `e2e/*.spec.ts`, **bez** `e2e/django/` (`testIgnore`), jeden `webServer` = `ng serve` na **4200**. |
| `playwright.django.config.ts` | Student + Django: `webServer` = skrypt startu Django + `ng serve` na **4200**, katalog testów `e2e/django/`. |
| `playwright.teacher.config.ts` | Nauczyciel + Django: Django + `ng serve` teachera na **4201**, katalog `e2e-teacher/`. |
| `e2e/` | Testy smoke / stub (np. `home.spec.ts`, `routing.spec.ts`, `api-stub.spec.ts`, `fixtures.ts`). |
| `e2e/django/` | Integracja z żywym backendem. |
| `e2e-teacher/` | Smoke aplikacji nauczyciela. |
| `e2e/scripts/start-django-e2e.sh` | Migracje, `seed_playwright_e2e`, `runserver` na `127.0.0.1:8000`. |
| `e2e/scripts/start-teacher-e2e.sh` | `ng serve` w katalogu `../alice-masterclass-teacher` na **4201**. |

## Komendy npm

| Skrypt | Opis |
| --- | --- |
| `npm run e2e` | Wszystkie testy z domyślnej konfiguracji (student, **bez** folderu `django`). |
| `npm run e2e:smoke` | Tylko testy oznaczone tagiem `@smoke` (szybki podzbiór). |
| `npm run e2e:django` | Konfiguracja Django + scenariusze w `e2e/django/`. |
| `npm run e2e:teacher` | Konfiguracja nauczyciela + Django + `e2e-teacher/`. |
| `npm run e2e:ui` | Playwright UI. |

Pierwsza instalacja przeglądarki Playwright:

```bash
npx playwright install chromium
```

## Tagi Playwright

- **`@smoke`** — scenariusze studenta ze **stubem** `check_session` (brak wymogu Django).
- **`@django`** — scenariusze wymagające seeda i API na porcie **8000**.
- **`@teacher`** — scenariusze aplikacji nauczyciela.

Przykłady filtrowania:

```bash
npx playwright test --grep @smoke
npx playwright test --config=playwright.django.config.ts --grep @django
npx playwright test --config=playwright.teacher.config.ts --grep @teacher
```

## Backend i seed

Komenda Django: `masterclass/management/commands/seed_playwright_e2e.py` w repozytorium **`alice-masterclass-django`**.

- Tworzy (idempotentnie) event **`PlaywrightE2EEvent`** i sesję **`PlaywrightE2ESession`**.
- Hasło sesji: zmienna środowiskowa **`E2E_SESSION_PASSWORD`**, domyślnie **`playwright-e2e`** — musi być **zgodne** z tym, co wpisują testy przeglądarkowe / body żądań API w E2E.

Skrypt `start-django-e2e.sh` ustawia domyślne hasło, odpala migracje i seed przed `runserver`.

Interpreter Pythona: **`E2E_PYTHON`**, albo automatycznie `../alice-masterclass-django/.venv-e2e/bin/python` jeśli istnieje.

## Scenariusze `e2e/django/` (skrót)

1. **`real-session.spec.ts`** — `sessionStorage` + `check_session` z przeglądarki, asercja tytułu dokumentu (nazwa sesji z seeda).
2. **`auth-dialog.spec.ts`** — happy path dialogu hasła (`data-testid` na polach i przycisku Proceed).
3. **`strangeness-exercise.spec.ts`** — wejście na trasę visual analysis, widoczność kluczowych elementów UI (toolbar, selektor datasetu, kontener strony).
4. **`visual-analysis-put.spec.ts`** — krótki test **`PUT /api/v1/strangeness_visual_analysis/0/1/`** przez `request` Playwright (kontrakt zgodny z testami Django w `strangeness/tests.py`).

## `data-testid` (stabilne haki UI)

Dodane m.in. w:

- dialogu auth (`auth-student-id`, `auth-session-password`, `auth-dialog-proceed`),
- toolbarze CERN (`cern-toolbar`),
- nawigacji (`nav-menu-toggle`, `nav-link-visual-analysis`),
- stronie visual analysis (`strangeness-visual-analysis-page`, `va-dataset-select`),
- przycisku uploadu histogramów (`va-upload-results`),
- panelu nauczyciela (`teacher-events-title` w `alice-masterclass-teacher`).

Zasada: w nowych testach preferuj **`getByTestId`** tam, gdzie tekst zależy od i18n.

**Kontrakt visual analysis:** przy rewrite’cie
[`strangeness-visual-analysis.component.html`](../src/app/strangeness-visual-analysis/strangeness-visual-analysis.component.html)
**zostaw** `data-testid="strangeness-visual-analysis-page"` na rootcie strony oraz
`data-testid="va-dataset-select"` na `mat-select` datasetu. Bez nich padają
`e2e/django/strangeness-exercise.spec.ts` i `e2e/routing.spec.ts` (`element(s) not found`),
nawet gdy UI wygląda poprawnie.

## CI (GitLab)

W **`.gitlab-ci.yml`**, job **`e2e_playwright`**:

- Obraz **`mcr.microsoft.com/playwright`** (przeglądarka wbudowana).
- Instalacja zależności Pythona w venv, `pip install` z `alice-masterclass-django/requirements.txt`.
- **`npm ci`** w `alice-masterclass-js` oraz w **`../alice-masterclass-teacher`** (testy nauczyciela).
- Kolejność: **`npm run e2e:django`**, potem **`npm run e2e:teacher`**.
- Job ma **`allow_failure: true`** — czerwony e2e nie blokuje dockerize / deploy na OKD, ale warto go naprawiać (artefakty + lokalne `npm run e2e:django`).
- **Artefakty** (`when: always`): raporty HTML i katalogi `test-results*` (m.in. trace przy retry), m.in. `playwright-report-django/`, `playwright-report-teacher/`.

## Aplikacja nauczyciela — zależności npm

Żeby **`npm ci`** w `alice-masterclass-teacher` działało z Angularem 21, **CDK i Material** muszą być w tej samej linii wersji (np. `^21.2.x`). Motyw w `src/alice-theme.scss` używa API **M2** Material (`mat.m2-define-palette`, …), zgodnego z Material 17+.

## Typowe problemy

| Objaw | Przyczyna / rozwiązanie |
| --- | --- |
| `npm run e2e` odpala testy Django i padają bez API | Domyślna konfiguracja **ignoruje** `e2e/django/` — użyj tylko `npm run e2e:django` do integracji z backendem. |
| `ECONNREFUSED 127.0.0.1:8000` | Django nie wystartował albo port zajęty; zwolnij **8000** lub nie używaj `reuseExistingServer` w konflikcie z innym procesem. |
| Brak Chromium Playwright | `npx playwright install chromium`. |
| Tytuł bez nazwy sesji przy `e2e:django` | Sprawdź seed, hasło `E2E_SESSION_PASSWORD`, logi Django. |
| `getByTestId('strangeness-visual-analysis-page')` → element(s) not found | W szablonie VA brakuje `data-testid` (częsty uboczny efekt rewrite’u HTML). Przywróć haki z sekcji **`data-testid`** powyżej; nie zmieniaj selektorów w teście. |
| `cd alice_szymon/...` z już właściwego katalogu | Ścieżki są względne — wejdź do repo z właściwego poziomu (`alice-masterclass-js` obok `alice-masterclass-django`). |

## Dalszy rozwój (orientacyjnie)

- Rozszerzać **`e2e/django/`** tylko dla **krytycznych** flow (np. upload z UI gdy już stabilne), nie duplikować każdego przycisku.
- Dopinać **`data-testid`** przy nowych elementach krytycznych dla E2E.
- Rozważyć osobne tagi (np. `@slow`) jeśli pojawią się długie scenariusze.

---

*Dokument opisuje implementację zgodną z planem jakości E2E (smoke, Django, teacher, CI, artefakty, tagi, selektory).*
