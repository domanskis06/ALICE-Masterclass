# Particle Propagation — plan implementacji

Checklista do automatycznego wykonania krok po kroku (Cursor Agent, "Generate"). Każdy `[ ]` to jeden atomowy krok — jedna zmiana / jeden plik / jedna weryfikacja. Zaznaczaj `[x]` po wykonaniu.

## Architektura (ustalona, nie zmieniać bez konsultacji)

- Angular 21, `three@0.160`, nowy moduł feature `particle-propagation` (NgModule, wzorzec identyczny do `strangeness-visual-analysis`).
- Dedykowana scena Three.js (`propagation-scene.ts`) — **nie** rozszerzamy `EventDisplayComponent` (god node, zakaz z `docs/event-display.md` i `.cursor/rules/architecture.mdc`).
- Cała fizyka w dedykowanych Angular Services pod `particle-propagation/physics/` — zero matematyki w komponentach/rendererze.
- Pole magnetyczne: pełny model Czebyszewa portowany z `pnwkw/gpu_propagator` (`src/mag_field/mag_cheb.cpp`), dane binarne w `assets/field/*.bin`.
- Całkowanie: **RK4** na równaniu ruchu (nie helix-stepper), pole B próbkowane z Czebyszewa w każdym z 4 stage'y.
- Renderowanie torów: `THREE.BufferGeometry` + `.setDrawRange()` — **zero fizyki w pętli renderu ani podczas przesuwania suwaka**.
- Kontrolki: `lil-gui`.
- **KRYTYCZNE POPRAWKI** (patrz Faza 4, Faza 2, Faza 9 poniżej):
  1. Pre-kalkulacja fizyki NIE może blokować głównego wątku → Web Worker.
  2. Parser `.bin` musi wymuszać Little-Endian (`DataView.getFloat32(offset, true)`).
  3. Oś czasu ma 3 fazy: `t < 0` (intro, protony), `t = 0` (zderzenie), `t > 0` (propagacja torów).

---



## Faza 0 — Setup i zależności

- [x] Dodać `lil-gui` do `alice-masterclass-js/package.json` (`dependencies`), zainstalować (`npm install`). *(zainstalowano `lil-gui@0.21.0`, własne typy TS w pakiecie — bez potrzeby `@types/lil-gui`)*
- [x] Sprawdzić `@types/three` (`^0.160.0`) obejmuje używane API (`BufferGeometry.setDrawRange`, `Line`, `GLTFLoader`) — nie wymaga zmian, tylko weryfikacja. *(`three@0.160.1` potwierdzone w `node_modules`, `setDrawRange` obecne w `BufferGeometry.js`)*
- [x] Utworzyć katalog `alice-masterclass-js/src/assets/field/`.
- [x] Skopiować 4 pliki binarne z `pnwkw/gpu_propagator/data/` do `assets/field/`: `sol_segments.bin`, `sol_params.bin`, `dip_segments.bin`, `dip_params.bin`.
- [x] Dodać nagłówek atrybucji/licencji (GPL-3.0, źródło: `pnwkw/gpu_propagator`, `pnwkw/distributed_field`) w komentarzu na górze `magnetic-field.service.ts` i w `alice-masterclass-js/README.md` (sekcja Third-party). *(README zrobione teraz; nagłówek w serwisie — Faza 3)*
- [x] Utworzyć szkielet katalogów modułu (bez zawartości plików, patrz struktura poniżej). *(katalogi tworzone niejawnie wraz z plikami w kolejnych fazach)*



### Struktura katalogów (docelowa)

```
alice-masterclass-js/src/
├─ assets/
│  └─ field/
│     ├─ sol_segments.bin
│     ├─ sol_params.bin
│     ├─ dip_segments.bin
│     └─ dip_params.bin
└─ app/particle-propagation/
   ├─ particle-propagation.module.ts
   ├─ particle-propagation-routing.module.ts
   ├─ particle-propagation.component.ts
   ├─ particle-propagation.component.html
   ├─ particle-propagation.component.scss
   ├─ particle-propagation.component.spec.ts
   ├─ instructions/
   │  ├─ instructions.component.ts
   │  ├─ instructions.component.html
   │  └─ instructions.component.scss
   ├─ welcome-dialog/
   │  ├─ propagation-welcome-dialog.component.ts
   │  ├─ propagation-welcome-dialog.component.html
   │  └─ propagation-welcome-dialog.component.scss
   ├─ physics/
   │  ├─ constants.ts
   │  ├─ cheb-field-data.ts
   │  ├─ magnetic-field.service.ts
   │  ├─ magnetic-field.service.spec.ts
   │  ├─ rk4-propagator.service.ts
   │  ├─ rk4-propagator.service.spec.ts
   │  ├─ propagation-physics.worker.ts
   │  └─ propagation-types.ts
   ├─ data/
   │  ├─ particle-data.service.ts
   │  └─ particle-data.service.spec.ts
   ├─ scene/
   │  ├─ propagation-scene.ts
   │  ├─ detector-loader.ts
   │  ├─ collision-intro.ts
   │  ├─ track-renderer.ts
   │  └─ propagation-timeline.ts
   └─ gui/
      └─ propagation-gui.ts
```

---



## Faza 1 — Typy i stałe fizyczne

- [x] `physics/constants.ts`: zdefiniować i wyeksportować:
  - `B2C = 0.299792458e-2` (GeV/c, T, cm)
  - `FIELD_SCALE = -0.1` (odwzorowanie `SCALE` z `helix_geom_code.glsl`)
  - `MAX_DETECTOR_R_CM = 500` (5 m ścianka detektora, sferycznie od centrum)
  - `RK4_STEP_CM = 1.5` (krok całkowania)
  - `MAX_RK4_STEPS = 500`
  - `MAX_TRACKED_PARTICLES = 200`
  - Rozmiary LUT Czebyszewa (1:1 z `mag_cheb.h`): `SOL_Z_SEGS=29`, `SOL_P_SEGS=278`, `SOL_R_SEGS=3492`, `SOL_PARAMS=1534`, `SOL_COLS=9931`, `SOL_COEFFS_PER_COL=48444`, `SOL_COEFFS=110683`, `DIP_Z_SEGS=89`, `DIP_Y_SEGS=1295`, `DIP_X_SEGS=12019`, `DIP_PARAMS=1482`, `DIP_COLS=16108`, `DIP_COEFFS_PER_COL=56528`, `DIP_COEFFS=171958`, `DIMENSIONS=3`, `MAX_CHEB_ORDER=32`, `SOL_MIN_Z=-550`, `SOL_MAX_Z=850`, `DIP_MIN_Z=-1760`, `DIP_MAX_Z=-532.46997`.
- [x] `physics/propagation-types.ts`: zdefiniować interfejsy:
  - `Vec3 { x: number; y: number; z: number }`
  - `PropagationParticle { id: string; vertex: Vec3; momentum: Vec3; charge: number; mass: number; energy: number }`
  - `BufferedTrack { particleId: string; positions: Float32Array; times: Float32Array; pointCount: number; charge: number }`
  - `PropagationResult { tracks: BufferedTrack[]; maxTime: number }`

---



## Faza 2 — Parser danych binarnych Czebyszewa (KRYTYCZNE: Little-Endian)

- [x] `physics/cheb-field-data.ts`: zdefiniować interfejsy TS 1:1 z `mag_cheb.h` (`SolSegments`, `SolParams`, `DipSegments`, `DipParams`) — pola jako `Float32Array` / `Int32Array`. *(zaimplementowano jako `parseSolSegments`/`parseDipSegments`/`parseSolParams`/`parseDipParams` + `parseChebFieldData`, zamiast jednej funkcji z parametrem `kind` — czytelniejsze typowanie zwrotne)*
- [x] Zaimplementować parsowanie segmentów (`parseSolSegments`/`parseDipSegments`):
  - **Wymóg bezwzględny**: użyć `new DataView(buffer)` i czytać wyłącznie przez `dataView.getFloat32(offset, true)` / `dataView.getInt32(offset, true)` — jawny **little-endian** (`true` jako drugi argument). Zakaz używania `new Float32Array(buffer)` / `new Int32Array(buffer)` bezpośrednio na surowym `ArrayBuffer` pochodzącym z plików C++, ponieważ zależy to od endianness hosta.
  - Odwzorować dokładnie sekwencję odczytu z `mag_cheb.cpp::loadSolSegmentLUT` / `loadDipSegmentLUT` (kolejność: `NZSeg` (int32) → `SegZ` (float32[]) → `BegSegP`/`NSegP` (int32[]) → `NPSeg` (int32) → `SegP` (float32[]) → `BegSegR`/`NSegR` (int32[]) → `SegR` (float32[]) → `NRSeg` (int32) → `SegID` (int32[])), analogicznie dla dip (Z→Y→X).
  - Po każdym odczycie inkrementować offset o `4 * count` bajtów (float32/int32 to zawsze 4 bajty).
- [x] Zaimplementować parsowanie parametrów (`parseSolParams`/`parseDipParams`), odwzorowując `loadSolParamsLUT` / `loadDipParamsLUT` (kolejność: `NParams` → `BOffsets`,`BScales`,`BMin`,`BMax` (float32, `DIMENSIONS*NParams` każdy) → `NRows`,`ColsForRowOffset`,`CofsForRowOffset` (int32) → `NCols` → `NColsPerRow`,`CofsPerColOffset` (int32) → `NCoeffsPerCol` → `NCofsPerCol`,`PerColCoefOffset` (int32) → `NCoeffs` → `Coeffs` (float32)). Little-endian obowiązkowo jak wyżej.
- [x] Dodać asercje długości (`readExpectedCount` — rzuca błąd gdy `actual !== expected`, z offsetem bajtowym w komunikacie) analogiczne do `assert(...)` w C++, żeby błąd parsowania był głośny, nie cichy. Dodatkowo `assertFullyConsumed()` weryfikuje, że po parsowaniu nie zostały żadne nieprzeczytane bajty (silny sanity-check całego layoutu).
- [x] Napisać test jednostkowy (`cheb-field-data.spec.ts`) weryfikujący na **prawdziwych plikach** `assets/field/*.bin` (fetch przez `HttpClient`, Karma serwuje `src/assets`): `NParams === SOL_PARAMS/DIP_PARAMS`, wszystkie `Coeffs` skończone, `BMin <= BMax` dla każdego segmentu, oraz że `segZSol[0] === SOL_MIN_Z` / `segZDip[0] === DIP_MIN_Z` (zgodność z `mag_cheb.h`). **Zweryfikowano dwuetapowo**: (1) matematycznie — obliczony rozmiar w bajtach dla wszystkich 4 plików zgadza się exactly z rzeczywistym rozmiarem plików; (2) faktycznym uruchomieniem `npm run test:ci` (ChromeHeadless) — `41/41 SUCCESS`, zero błędów, w tym 5 nowych testów fetchujących i parsujących realne pliki binarne.

---



## Faza 3 — Serwis pola magnetycznego (Czebyszew)

> **Odstępstwo od planu (uzasadnione)**: metody 1:1 z `mag_cheb.cpp` (`solDipField`, `cartToCyl`, `findSolSegment`, `cheb1DArray`/`cheb1DParams`, ...) zostały wydzielone do nowej, czystej (bez Angular DI) klasy `physics/cheb-field-eval.ts::ChebFieldEvaluator`, zamiast być prywatnymi metodami `magnetic-field.service.ts`. Powód: Faza 4 wymaga tej samej logiki wewnątrz Web Workera, który nie ma dostępu do `@Injectable`/DI — plan sam to przewidywał w opisie Fazy 4 ("wydzielić logikę do czystych funkcji... np. `physics/cheb-field-eval.ts`"), więc zrobiono to już teraz, żeby uniknąć duplikacji kodu między serwisem i workerem. `magnetic-field.service.ts` jest teraz cienką fasadą: HTTP fetch + DI + skalowanie do Tesli, delegującą ewaluację do `ChebFieldEvaluator`.

- [x] `physics/magnetic-field.service.ts` (`@Injectable({ providedIn: 'root' })`):
  - `load(): Promise<void>` — pobiera 4 pliki `.bin` przez `HttpClient` z `responseType: 'arraybuffer'`, parsuje przez `cheb-field-data.ts`, cache'uje w polach prywatnych (w tym surowe bufory dla Fazy 4). Idempotentny (współbieżne wywołania czekają na to samo zadanie).
  - `field(pos: Vec3): Vec3` — port `mag_cheb::Field` (routing: jeśli `pos.z` w zakresie `[DIP_MIN_Z, SOL_MAX_Z]` → `solDipField`, inaczej `machineField` → `{0,0,0}`). Wynik przeskalowany przez `FIELD_SCALE` na końcu (Tesla). Rzuca błąd jeśli wywołany przed zakończeniem `load()`.
  - `getRawBuffers(): ChebFieldBuffers | null` — dla Fazy 4 (przekazanie do Workera bez ponownego fetchowania).
  - Cache ostatniego segmentu (`solSegCache`/`dipSegCache`, w `ChebFieldEvaluator`) analogicznie do C++ dla przyspieszenia — zawsze bezpieczny, bo re-walidowany przez `isInsideSol`/`isInsideDip` przed użyciem.
- [x] `physics/magnetic-field.service.spec.ts`: test sanity — w centrum detektora (`{0,0,0}`) `|B| ≈ 0.5 T` (solenoid L3), kierunek zgodny z osią z. **Zweryfikowano faktycznym pomiarem**: `|B(0,0,0)| = 0.5007 T`, `Bz` dominujący (transverse leakage rzędu 1e-5 T) — dokładnie nominalne pole solenoidu ALICE L3. Uruchomiono `npm run test:ci` (ChromeHeadless, realny fetch realnych plików `.bin`): `46/46 SUCCESS`.

---



## Faza 4 — RK4 + Web Worker (KRYTYCZNE: main thread non-blocking)

- [ ] Zdefiniować równanie ruchu w dokumentacji funkcji (komentarz w `rk4-propagator.service.ts`): parametryzacja długością łuku `s` (cm), stan `(r, u)` gdzie `u` = wersor kierunku pędu:
  ```
  dr/ds = u
  du/ds = k * (u × B(r)),  k = charge * B2C / |p|
  ```
  z renormalizacją `u` po każdym kroku RK4.
- [ ] `physics/propagation-physics.worker.ts` — wygenerować przez Angular CLI (`ng generate web-worker particle-propagation/physics/propagation-physics`), co automatycznie skonfiguruje `tsconfig.worker.json` i wpis w `angular.json`.
  - Worker przyjmuje `postMessage`: `{ particles: PropagationParticle[], fieldBuffers: { solSegments: ArrayBuffer; solParams: ArrayBuffer; dipSegments: ArrayBuffer; dipParams: ArrayBuffer } }` (bufory przekazywane jako **transferable objects**, żeby uniknąć kopiowania ~2.6 MB).
  - Wewnątrz workera: zaimportować `cheb-field-data.ts` (parser) i czystą, worker-friendly wersję logiki `magnetic-field` + `rk4` (bez zależności od Angular DI — worker nie ma dostępu do `@Injectable`; wydzielić logikę do czystych funkcji reużywanych przez serwis Angular i przez worker, np. `physics/cheb-field-eval.ts` i `physics/rk4-integrator.ts` jako plain TS moduły importowane przez oba konteksty).
  - Worker liczy tory w chunkach (np. po 10 cząstek) i wysyła częściowy postęp przez `postMessage({ type: 'progress', done, total })`, a na końcu `postMessage({ type: 'result', tracks: BufferedTrack[] }, [transferable buffers])`.
  - Zatrzymanie propagacji per cząstka: `|r| > MAX_DETECTOR_R_CM` lub `steps >= MAX_RK4_STEPS`; ostatni punkt interpolowany liniowo do dokładnego przecięcia sfery `R=500` (analogicznie do `LoopToBounds` w `gpu_propagator`, ale sferycznie a nie cylindrycznie).
  - Czas per punkt: `t_i = s_i / (β * c)`, `β = |p| / E` (jednostki: `s` w cm → konwersja do sekund/ns wg `c = 29.9792458 cm/ns`; przechowywać czas w ns dla wygody UI).
- [ ] `physics/rk4-propagator.service.ts` (`@Injectable`) — fasada Angular:
  - `precompute(particles: PropagationParticle[]): Observable<PropagationResult>` — tworzy `Worker`, wysyła dane (`fieldBuffers` z `MagneticFieldService`), zwraca `Observable` emitujący postęp (`{ progress: number }`) i finalny wynik; zamyka workera po zakończeniu (`worker.terminate()`).
  - **Fallback bez Web Workera** (dla środowisk bez wsparcia, np. testy jednostkowe/SSR): identyczna funkcja licząca w głównym wątku, ale w chunkach `for (batch of chunks(particles, 10)) { compute(batch); await new Promise(r => setTimeout(r, 0)); }`, żeby oddawać kontrolę event loopowi między paczkami. Wybór trybu: `typeof Worker !== 'undefined' ? worker : chunkedFallback`.
- [ ] `physics/rk4-propagator.service.spec.ts`: test — dla cząstki neutralnej (`charge=0`) tor jest linią prostą; dla naładowanej w stałym testowym `B` promień krzywizny zgodny ze wzorem `R = p_t / (B2C * |B| * |q|)`.

---



## Faza 5 — Dane wejściowe cząstek

- [ ] `data/particle-data.service.ts` (`@Injectable({ providedIn: 'root' })`):
  - Ścieżka bazowa: `assets/exercises/strangeness/part1`.
  - `loadEvent(datasetId: number, eventId: number): Observable<PropagationParticle[]>` — `HttpClient.get<Event>(...)`, mapowanie `tracks` + spłaszczone `decays[][]` z formatu `{ E, mass, particleId, px, py, pz, sign, trajectory }` na `PropagationParticle` (`vertex = trajectory[0]`, `momentum = {px,py,pz}`, `charge = sign`, `energy = E`).
  - Limitować do `MAX_TRACKED_PARTICLES` (obciąć/wybrać najciekawsze — np. sortować po `|p|` i wziąć pierwsze N), z ostrzeżeniem w konsoli jeśli obcięto.
  - Domyślne zdarzenie: `event_0_0.json` (dataset 0, event 0), z metodą `listAvailableEvents(): { dataset: number; event: number }[]` do wypełnienia dropdownu w GUI.

---



## Faza 6 — Scena Three.js: rdzeń

- [ ] `scene/propagation-scene.ts` — klasa `PropagationScene` (plain TS, nie Angular service, instancjowana przez komponent):
  - Konstruktor: `(canvas: HTMLCanvasElement)`. Tworzy `THREE.Scene`, `THREE.PerspectiveCamera`, `THREE.WebGLRenderer`, `OrbitControls`, światła (ambient + hemisphere + 2x directional — wzorem `EventDisplayComponent.createScene`).
  - Grupy: `detectorGroup`, `tracksGroup`, `introGroup` (analogicznie do `detector`/`tracks`/`collisionProtonsGroup` w `EventDisplayComponent`, ale bez reużywania samego komponentu).
  - `resize(width: number, height: number): void`.
  - `render(): void` — wywoływane w `requestAnimationFrame`; deleguje aktualizację widoczności do `PropagationTimeline` (Faza 9) i renderuje scenę.
  - `dispose(): void` — zwolnienie geometrii/materiałów/renderer (wzorem `ngOnDestroy` w `EventDisplayComponent`).
  - Skala obiektów: reużyć `objectScale = 1e-2` (te same jednostki co `EventDisplayComponent`, cm → world units).

---



## Faza 7 — Loader modeli detektora

- [ ] `scene/detector-loader.ts` — funkcja/klasa `loadDetectorParts(paths: string[], scale: number): Promise<THREE.Group>`:
  - `GLTFLoader` z `three/examples/jsm/loaders/GLTFLoader`.
  - Ścieżki: `assets/models/alice components/its.glb`, `tpc.glb`, `TRD.glb`, `TOF.glb`, `EMCal_Dcal.glb`, `DCAL.glb`, `PHOS.glb`, `L3.glb` (identyczna lista jak `ALICE_DETECTOR_MODEL` w `strangeness-visual-analysis.component.ts`).
  - Ładowanie równoległe (`Promise.all`), skalowanie `scene.scale.setScalar(scale)`, prosta jednolita opacity/materiał (bez multipart-assembly UI z EventDisplay — tu detektor jest tylko statycznym tłem, od razu widoczny).
  - Zwraca `THREE.Group` do dodania w `propagation-scene.ts`.

---



## Faza 8 — Intro kolizji (protony)

- [ ] `scene/collision-intro.ts` — klasa/funkcje `CollisionIntro`:
  - Ładuje `assets/models/proton.glb` (`GLTFLoader`), tworzy 2 klony (`protonPlusZ`, `protonMinusZ`), pozycjonuje symetrycznie wzdłuż osi wiązki (`z = ±beamPipeHalfLength`) na start.
  - `update(tIntroMs: number): void` — przesuwa protony do centrum proporcjonalnie do czasu (funkcja czasu `t < 0`, patrz Faza 9); przy `t >= 0` protony znikają (`visible = false`) — moment zderzenia.
  - `reset(): void` — przywraca protony na start (dla przewijania suwaka do `t < 0`).
  - Beam pipe: opcjonalna prosta geometria `THREE.CylinderGeometry` wzdłuż osi z (cienka, półprzezroczysta), jeśli w modelach detektora nie jest widoczna.

---



## Faza 9 — Renderer torów (BufferGeometry + setDrawRange)

- [ ] `scene/track-renderer.ts` — funkcje:
  - `createTrackLines(tracks: BufferedTrack[], scale: number): THREE.Line[]` — dla każdego `BufferedTrack` tworzy `THREE.BufferGeometry` z atrybutem `position` (skopiowany `Float32Array` przeskalowany przez `objectScale`), `THREE.LineBasicMaterial` (kolor wg ładunku: dodatni/ujemny/neutralny — reużyć palette z `globals.ts`), `new THREE.Line(geometry, material)`.
  - Ustawić `geometry.setDrawRange(0, 0)` na starcie (tor niewidoczny przed animacją).
  - `updateDrawRange(line: THREE.Line, track: BufferedTrack, tSincePropagationStart: number): void` — binary search (`track.times`) po najmniejszym indeksie `i` takim, że `times[i] <= t`, następnie `geometry.setDrawRange(0, i + 1)`. **Zero obliczeń fizycznych tutaj** — czysto odczyt z prekalkulowanej tablicy.
  - Uwaga jednostek: `times` w Fazie 4 w ns; `tSincePropagationStart` w tych samych jednostkach co `PropagationTimeline` (Faza 10) — ujednolicić.

---



## Faza 10 — Oś czasu (3 fazy) — KRYTYCZNE

- [ ] `scene/propagation-timeline.ts` — klasa `PropagationTimeline`:
  - Model osi czasu jednym globalnym `globalTime` (ms, dowolna jednostka wspólna dla UI):
    - `INTRO_DURATION_MS` (np. 1500) — czas trwania lotu protonów przed zderzeniem.
    - Zakres suwaka: `[-INTRO_DURATION_MS, PROPAGATION_DURATION_MS]`, gdzie `PROPAGATION_DURATION_MS = maxTime` z `PropagationResult` (Faza 4), przeskalowany do jednostek UI (np. `1 ns fizycznego czasu propagacji → X ms animacji`, konfigurowalny `playbackSpeed`).
    - `globalTime = 0` to moment zderzenia.
  - `applyTime(globalTime: number): void`:
    - jeśli `globalTime < 0`: `collisionIntro.update(globalTime)` (Faza 8), `tracksGroup.visible = false`.
    - jeśli `globalTime === 0`: krótki błysk/efekt (np. `THREE.PointLight` intensity spike lub skala protonów → 0 w 1-2 frame'ach), `collisionIntro` chowa protony.
    - jeśli `globalTime > 0`: `tracksGroup.visible = true`, `collisionIntro` niewidoczne, dla każdego toru `trackRenderer.updateDrawRange(line, track, globalTime * unitConversion)`.
  - Ta klasa jest jedynym miejscem, które łączy "czas z GUI" z "co jest widoczne" — komponent i GUI wywołują tylko `timeline.applyTime(t)`.
- [ ] Upewnić się, że domyślny `globalTime` po zakończeniu pre-kalkulacji (przed naciśnięciem "Start animation") to początek intro (`-INTRO_DURATION_MS`), nie `0`.

---



## Faza 11 — Kontrolki lil-gui

- [ ] `gui/propagation-gui.ts` — klasa `PropagationGui`:
  - Konstruktor: `(container: HTMLElement, callbacks: { onStart, onPlayPause, onTimeChange, onSpeedChange, onEventChange })`.
  - Kontrolki:
    - Przycisk `Start animation` (widoczny przed startem, chowany po kliknięciu; wyzwala pre-kalkulację w komponencie z pokazaniem spinnera).
    - Przycisk `Play / Pause` (aktywny po zakończeniu pre-kalkulacji).
    - Slider `Time` (Time Scrubbing) — zakres zgodny z `PropagationTimeline` (`[-INTRO_DURATION_MS, PROPAGATION_DURATION_MS]`), `onChange` wywołuje `onTimeChange(value)` — **tylko** aktualizacja `drawRange`/pozycji intro, zero przeliczeń fizyki.
    - Slider/dropdown `Playback speed` (np. 0.25x–4x).
    - Dropdown `Event` (dataset/event id z `particle-data.service.listAvailableEvents()`), zmiana wyzwala ponowną pre-kalkulację.
  - Metoda `syncTime(t: number): void` — aktualizuje wartość slidera bez wywoływania `onChange` (do użycia podczas auto-play w `requestAnimationFrame`).
  - `dispose(): void` (`gui.destroy()`).

---



## Faza 12 — Komponent Angular (UI shell)

- [ ] `particle-propagation.component.html`: `<canvas>` host + kontener dla lil-gui (`<div #guiHost>`) + spinner ładowania (Angular Material `mat-progress-spinner`, pokazywany podczas pre-kalkulacji w workerze) + miejsce na modal powitalny (otwierany programowo przez `MatDialog`, nie inline).
- [ ] `particle-propagation.component.scss`: layout pełnoekranowy analogiczny do `event-display.component.scss` (canvas fill parent, overlay dla spinnera/gui).
- [ ] `particle-propagation.component.ts`:
  - Implementuje `AfterViewInit`, `OnDestroy`, `InstructionsProvider` (`instructionsComponent = InstructionsComponent`, wzorem `StrangenessVisualAnalysisComponent`).
  - `ngAfterViewInit()`: tworzy `PropagationScene`, `PropagationGui`, ładuje detektor (Faza 7), otwiera `PropagationWelcomeDialogComponent` przez `MatDialog` (auto-open przy pierwszym wejściu, analogicznie do wzorca `InstructionsDialogComponent`, ale bez czekania na klik "?").
  - `onStartAnimation()`: pokazuje spinner → `magneticFieldService.loadFieldData()` (jeśli jeszcze nie) → `particleDataService.loadEvent(...)` → `rk4PropagatorService.precompute(particles)` (subskrybuje progres do aktualizacji spinnera/procentu) → po wyniku: `trackRenderer.createTrackLines(...)`, dodanie do scenu, ukrycie spinnera, start `collisionIntro`, ustawienie `timeline` na `t = -INTRO_DURATION_MS`, start pętli `requestAnimationFrame` z auto-play.
  - `ngOnDestroy()`: `scene.dispose()`, `gui.dispose()`, `worker` cleanup (delegowane przez serwis), `cancelAnimationFrame`.
- [ ] `particle-propagation.component.spec.ts`: podstawowy smoke test tworzenia komponentu (TestBed), mockowanie serwisów HTTP/Worker.

---



## Faza 13 — Modal powitalny i instrukcje

- [ ] `welcome-dialog/propagation-welcome-dialog.component.ts/.html/.scss`: prosty `MatDialog` content — opis modułu (czym jest propagacja w polu magnetycznym, jak korzystać z suwaka czasu), przycisk "Zamknij" / "Start animation" (może od razu wywołać `onStartAnimation` przez `MatDialogRef.close('start')` odbierane w komponencie).
- [ ] `instructions/instructions.component.ts/.html/.scss`: treść dla przycisku "?" w toolbarze (wzorem `strangeness-visual-analysis/instructions`), opis fizyki (RK4, pole Czebyszewa, oś czasu) w wersji skróconej dla studentów.

---



## Faza 14 — Integracja z aplikacją

- [ ] `particle-propagation-routing.module.ts`: trasa `path: 'particle-propagation'`, `component: ParticlePropagationComponent`.
- [ ] `particle-propagation.module.ts`: `NgModule` z `declarations` (component, instructions, welcome-dialog), `imports: [CommonModule, SharedModule, AngularModule, ParticlePropagationRoutingModule]`.
- [ ] `alice-masterclass-js/src/app/app-routing.module.ts`: import i dodanie `ParticlePropagationRoutingModule` do `imports`.
- [ ] `alice-masterclass-js/src/app/app.module.ts`: import i dodanie `ParticlePropagationModule` do `imports`.
- [ ] `alice-masterclass-js/src/app/nav/nav.component.html`: dodać `<a mat-list-item routerLink="/particle-propagation">{{ 'STRANGENESS.PARTICLE_PROPAGATION_MENU' | translate }}</a>` pod istniejącymi dwoma linkami (`strangeness-visual-analysis`, `strangeness-large-scale-analysis`).
- [ ] `assets/i18n/en.json`, `de.json`, `es.json`: dodać `STRANGENESS.PARTICLE_PROPAGATION_MENU` oraz namespace `PARTICLE_PROPAGATION.*` (tytuł/treść modala powitalnego, treść instrukcji, etykiety GUI jeśli renderowane poza lil-gui).

---



## Faza 15 — Weryfikacja i domknięcie

- [ ] `npm run build` w `alice-masterclass-js` — zero błędów kompilacji/typów.
- [ ] `npm run lint` — zero nowych błędów lint w dodanych plikach.
- [ ] Ręczna weryfikacja w `ng serve`: modal powitalny → Start animation → intro protonów → zderzenie → propagacja torów → suwak czasu działa płynnie w obu kierunkach (przód/tył) bez zauważalnego zamrożenia UI.
- [ ] Weryfikacja fizyki: dla kilku cząstek naładowanych z `event_0_0.json` porównać wygenerowany przez RK4 tor z zapisaną w JSON `trajectory` (tolerancja rozjazdu — inny model niż helix-stepper, ale ten sam charakter krzywizny/promienia).
- [ ] Weryfikacja Web Workera: sprawdzić w DevTools (Performance/Main thread) że podczas pre-kalkulacji główny wątek nie jest zablokowany (spinner się animuje płynnie).
- [ ] Zgodnie z `.cursor/rules/architecture.mdc`: po nowych serwisach i udanej kompilacji uruchomić w `alice-masterclass-js`: `graphify update .`.
- [ ] Zaktualizować `docs/` (opcjonalnie nowy `docs/particle-propagation.md` analogiczny do `docs/event-display.md`) opisujący nowy moduł, jego serwisy fizyki i granice odpowiedzialności — do wykorzystania przy przyszłych zmianach.

---



## Uwagi końcowe / ryzyka do pilnowania podczas implementacji

- Licencja GPL-3.0 źródeł (`pnwkw/gpu_propagator`, `pnwkw/distributed_field`) — atrybucja w kodzie i README (Faza 0).
- Web Worker w Angular CLI wymaga `ng generate web-worker` (konfiguruje `tsconfig.worker.json`); jeśli generator nie jest dostępny w tej wersji CLI, fallback: ręczna konfiguracja `worker-plugin`/natywny `new Worker(new URL(...), { type: 'module' })` + osobny `tsconfig`.
- Wspólna logika Czebyszewa/RK4 musi być w plain TS (bez Angular DI), żeby dało się ją importować identycznie w Web Workerze i w serwisie Angular — unikamy duplikacji algorytmu.
- Jednostki: cm (pozycja/promień), GeV/c (pęd), Tesla (pole), ns (czas fizyczny) — konsekwentnie w całym module fizyki; konwersja do world-units Three.js (`objectScale = 1e-2`) i do ms UI wyłącznie w warstwie scene/gui.

