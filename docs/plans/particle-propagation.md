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

- [x] Zdefiniować równanie ruchu w dokumentacji funkcji (komentarz w `physics/rk4-integrator.ts`, funkcja `computeTrajectory`): parametryzacja długością łuku `s` (cm), stan `(r, u)` gdzie `u` = wersor kierunku pędu:
  ```
  dr/ds = u
  du/ds = k * (u × B(r)),  k = charge * B2C / |p|
  ```
  z renormalizacją `u` po każdym kroku RK4.
- [x] `physics/propagation-physics.worker.ts` — wygenerowano przez Angular CLI (`ng generate web-worker particle-propagation/physics/propagation-physics`), co automatycznie skonfigurowało `tsconfig.worker.json` i `angular.json` (`webWorkerTsConfig`).
  - Worker przyjmuje `postMessage`: `{ particles: PropagationParticle[], fieldBuffers: { solSegments: ArrayBuffer; solParams: ArrayBuffer; dipSegments: ArrayBuffer; dipParams: ArrayBuffer }, options? }` (bufory przekazywane jako **transferable objects** przez `rk4-propagator.service.ts`, żeby uniknąć kopiowania ~2.6 MB).
  - Wewnątrz workera: zaimportowano `cheb-field-data.ts` (parser) + `cheb-field-eval.ts` (`ChebFieldEvaluator`, już bez Angular DI — patrz odstępstwo opisane w Fazie 3) + `rk4-integrator.ts` (czysty `computeTrajectoriesInChunks`).
  - Worker liczy tory w chunkach po 10 cząstek (`CHUNK_SIZE`) i wysyła częściowy postęp przez `postMessage({ type: 'progress', done, total })`, a na końcu `postMessage({ type: 'result', tracks, maxTimeNs }, [transferable buffers])`. Błędy wewnętrzne łapane i wysyłane jako `{ type: 'error', message }` (nie zabijają silently workera).
  - Zatrzymanie propagacji per cząstka: `|r| > MAX_DETECTOR_R_CM` lub `steps >= MAX_RK4_STEPS`; ostatni punkt interpolowany liniowo do dokładnego przecięcia sfery `R=500` (funkcja `sphereCrossingFraction`, rozwiązanie kwadratowe `|prevR + f*(nextR-prevR)| = R`). **Zweryfikowano testem**: cząstka radialna zatrzymuje się dokładnie na `R=55` (tolerancja 1e-5).
  - Czas per punkt: `t_i = s_i / (β * c)`, `β = |p| / E` (jednostki: `s` w cm → ns wg `c = 29.9792458 cm/ns`).
- [x] `physics/rk4-propagator.service.ts` (`@Injectable`) — fasada Angular:
  - `precompute(particles: PropagationParticle[], options?: RK4Options): Observable<PrecomputeEvent>` — tworzy `Worker` (`new Worker(new URL('./propagation-physics.worker', import.meta.url))`), wysyła klon buforów pola (`fieldBuffers` z `MagneticFieldService.getRawBuffers()`, klonowany przed transferem żeby nie odłączyć oryginału z cache'u), zwraca `Observable<{type:'progress',...} | {type:'result',...}>`; zamyka workera po zakończeniu/błędzie/unsubscribe (`worker.terminate()`).
  - **Fallback bez Web Workera**: identyczna funkcja licząca w głównym wątku w chunkach po 10 z `await new Promise(r => setTimeout(r, 0))` między paczkami. Wybór trybu: `typeof Worker !== 'undefined' ? worker : chunkedFallback`.
  - **Naprawa konfiguracji odkryta przy tej fazie**: `src/tsconfig.app.json` nadpisywał `module` na `es2015` (blokując składnię `import.meta.url` wymaganą przez wzorzec Workera Angulara) i nie wykluczał `**/*.worker.ts` (co powodowało konflikt typów `lib.dom.d.ts` vs `lib.webworker.d.ts` w głównym programie TS) — najpewniej dlatego, że `tsconfig.app.json` leży w `src/` (niestandardowa lokalizacja), więc schemat `ng generate web-worker` nie zaktualizował go automatycznie. Naprawiono: usunięto nadpisanie `module` (dziedziczy `es2020` z `tsconfig.json`) i dodano `"**/*.worker.ts"` do `exclude`. Zweryfikowano `npm run build:dev` — kompiluje się bez błędów.
- [x] `physics/rk4-integrator.spec.ts`: test — dla cząstki neutralnej (`charge=0`) tor jest linią prostą (w niejednorodnym polu testowym, żeby wykluczyć przypadkowe "wyzerowanie" krzywizny); dla naładowanej w stałym testowym `B=0.5T` promień krzywizny (fit z 3 punktów, 3 różne trójki) zgodny ze wzorem `R = p_t / (B2C * |B| * |q|)` z dokładnością do ~0cm/667cm (`toBeCloseTo(..., 0)`).
- [x] `physics/rk4-propagator.service.spec.ts`: test end-to-end na **prawdziwym polu magnetycznym** (`MagneticFieldService.load()` + prawdziwy Worker) oraz test fallbacku (tymczasowe `globalThis.Worker = undefined`). **Zweryfikowano faktycznym uruchomieniem** `npm run test:ci` (ChromeHeadless, prawdziwy Worker + prawdziwe dane): `53/53 SUCCESS`.

---



## Faza 5 — Dane wejściowe cząstek

- [x] `data/particle-data.service.ts` (`@Injectable({ providedIn: 'root' })`):
  - Ścieżka bazowa: `assets/exercises/strangeness/part1` (`PARTICLE_EVENT_DATA_BASE_PATH`).
  - `loadEvent(datasetId = 0, eventId = 0): Observable<PropagationParticle[]>` — `HttpClient.get<Event>(...)`, mapowanie `tracks` + spłaszczone `decays[][]` z formatu `{ E, mass, particleId, px, py, pz, sign, trajectory }` na `PropagationParticle` (`vertex = trajectory[0]`, `momentum = {px,py,pz}`, `charge = sign`, `energy = E`). Track bez `trajectory` jest pomijany (brak wierzchołka startowego).
  - Limitowanie do `MAX_TRACKED_PARTICLES`: sortowanie po `|p|` malejąco i `slice(0, MAX)`, z `console.warn` jeśli obcięto.
  - Domyślne zdarzenie: `event_0_0.json` (dataset 0, event 0), metoda `listAvailableEvents(): EventRef[]` zwraca wszystkie znane pary `{dataset,event}` (0: 4 zdarzenia demo, 1–19: 15 każdy, 20: 4 zdarzenia full — potwierdzone `ls` na `assets/exercises/strangeness/part1`, identyczne liczby jak w `StrangenessDataService`).
- [x] `data/particle-data.service.spec.ts`: test na **prawdziwym** `event_0_0.json` (13 tracks + 2 decay products = 15 cząstek), test mapowania pól (`HttpTestingController` z syntetycznym zdarzeniem), test obcinania do `MAX_TRACKED_PARTICLES` z zachowaniem cząstek o najwyższym `|p|` i `console.warn`. **Zweryfikowano `npm run test:ci`**: `57/57 SUCCESS`.

---



## Faza 6 — Scena Three.js: rdzeń

> **Odstępstwo od planu (drobne)**: `render()` **nie** deleguje do `PropagationTimeline` samo — `PropagationScene` nie zna klasy `PropagationTimeline` (unika zależności w złą stronę). Zamiast tego komponent (Faza 12) w pętli `requestAnimationFrame` wywołuje `timeline.applyTime(t)`, a potem `scene.render()`. `render()` tylko aktualizuje `OrbitControls` i renderuje.

- [x] `scene/propagation-scene.ts` — klasa `PropagationScene` (plain TS, nie Angular service, instancjowana przez komponent):
  - Konstruktor: `(canvas: HTMLCanvasElement)`. Tworzy `THREE.Scene`, `THREE.PerspectiveCamera`, `THREE.WebGLRenderer`, `OrbitControls`, światła (ambient + hemisphere + 2x directional — wzorem `EventDisplayComponent.createScene`).
  - Grupy: `detectorGroup`, `tracksGroup` (domyślnie `visible=false`), `introGroup` (analogicznie do `detector`/`tracks`/`collisionProtonsGroup` w `EventDisplayComponent`, ale bez reużywania samego komponentu).
  - `resize(width: number, height: number): void` — ignoruje wymiary `<= 0`.
  - `render(): void` — wywoływane w `requestAnimationFrame`; aktualizuje `controls` i renderuje scenę.
  - `dispose(): void` — zwolnienie geometrii/materiałów/renderer (wzorem `ngOnDestroy` w `EventDisplayComponent`).
  - Skala obiektów: `static readonly objectScale = 1e-2` (te same jednostki co `EventDisplayComponent`, cm → world units).
- [x] `scene/propagation-scene.spec.ts`: realny test z prawdziwym `<canvas>` i `THREE.WebGLRenderer` (Karma/ChromeHeadless z `--use-angle=swiftshader`, ten sam mechanizm co istniejący, przechodzący `event-display.component.spec.ts`) — tworzenie scieny, render bez wyjątku, resize, dispose. **Zweryfikowano `npm run test:ci`**: `63/63 SUCCESS`.

---



## Faza 7 — Loader modeli detektora

- [x] `scene/detector-loader.ts` — `loadDetectorParts(paths: readonly string[], scale: number): Promise<THREE.Group>`:
  - `GLTFLoader` z `three/examples/jsm/loaders/GLTFLoader`.
  - `DETECTOR_PART_PATHS`: `assets/models/alice components/its.glb`, `tpc.glb`, `TRD.glb`, `TOF.glb`, `EMCal_Dcal.glb`, `DCAL.glb`, `PHOS.glb`, `L3.glb` (identyczna lista jak `ALICE_DETECTOR_MODEL` w `strangeness-visual-analysis.component.ts`, zweryfikowane 1:1 w teście).
  - Ładowanie równoległe (`Promise.all`), skalowanie `scene.scale.setScalar(scale)`, prosta jednolita opacity (`0.35`, `transparent=true`, `depthWrite=false`) — bez multipart-assembly UI z EventDisplay, bez polygon-offset per-mesh sortowania; detektor jest tylko statycznym tłem, od razu widoczny.
  - Odporność na błędy: pojedynczy nieudany `.glb` jest logowany (`console.error`) i pomijany (`resolve(null)`), nigdy nie odrzuca całego `Promise.all` — jeden brakujący asset nie blokuje sceny.
  - Zwraca `THREE.Group` (`name = 'particle-propagation-detector'`) do dodania w `propagation-scene.ts` (`detectorGroup`).
- [x] `scene/detector-loader.spec.ts`: realne ładowanie wszystkich 8 plików `.glb` przez Karma/ChromeHeadless (assety serwowane tak jak `assets/field/*.bin` w `magnetic-field.service.spec.ts`) + test degradacji przy nieistniejącej ścieżce. **Zweryfikowano `npm run test:ci`**: `66/66 SUCCESS`.

---



## Faza 8 — Intro kolizji (protony)

- [x] `scene/timeline-constants.ts` (nowy plik, poza planem 1:1 — patrz notatka niżej): `INTRO_DURATION_MS = 2500`, `PROTON_HALF_SEPARATION_START = 0.42` (world units, ta sama wartość co `EventDisplayComponent.protonHalfSeparationStart`), `PROTON_TARGET_DIAMETER_WORLD = 0.1` (= `objectScale * 10`, ta sama reguła sizing co `EventDisplayComponent`). Trzymane osobno od `physics/constants.ts`, bo to stałe *prezentacyjne* (ms animacji), nie fizyczne — współdzielone przez `collision-intro.ts` i `propagation-timeline.ts` (Faza 10).
- [x] `scene/collision-intro.ts` — klasa `CollisionIntro`:
  - `static async create(protonModelUrl, addBeamPipe = true): Promise<CollisionIntro>` — ładuje `assets/models/proton.glb` (`GLTFLoader`), tworzy 2 klony (`protonPlusZ`, `protonMinusZ`), skaluje jednolicie do `PROTON_TARGET_DIAMETER_WORLD` (wzorem `EventDisplayComponent.beginProtonCollisionIntroLoad`), pozycjonuje symetrycznie wzdłuż osi wiązki (`z = ±PROTON_HALF_SEPARATION_START`) na start.
  - `update(tIntroMs: number): void` — **czysta funkcja czasu** (nie akumulowana delta, w przeciwieństwie do `EventDisplayComponent.updateProtonCollisionIntro`) — przesuwa protony do centrum proporcjonalnie do `(t + INTRO_DURATION_MS) / INTRO_DURATION_MS` (zakres `t < 0`); przy `t >= 0` protony znikają (`visible = false`) — moment zderzenia. Dzięki czystej funkcji czasu, przewijanie suwaka tam i z powrotem (Faza 10/11) działa bez driftu.
  - `reset(): void` — `update(-INTRO_DURATION_MS)`, przywraca protony na start.
  - `dispose(): void` — zwolnienie geometrii/materiałów (protony + beam pipe).
  - Beam pipe: prosta geometria `THREE.CylinderGeometry` wzdłuż osi z (cienka, `opacity=0.18`, `depthWrite=false`), dodawana domyślnie (`addBeamPipe=true`) — modele detektora (Faza 7) nie zawierają rury wiązki w centrum.
- [x] `scene/collision-intro.spec.ts`: realne ładowanie `proton.glb` przez Karma/ChromeHeadless — sprawdza pozycjonowanie startowe, ruch do środka w funkcji `t`, chowanie po `t >= 0`, poprawne "cofnięcie" suwaka z `t > 0` do `t < 0`, `dispose()`. **Zweryfikowano `npm run test:ci`**: `72/72 SUCCESS`.

---



## Faza 9 — Renderer torów (BufferGeometry + setDrawRange)

- [x] `scene/track-renderer.ts` — funkcje:
  - `createTrackLines(tracks: BufferedTrack[], scale: number): THREE.Line[]` — dla każdego `BufferedTrack` tworzy `THREE.BufferGeometry` z atrybutem `position` (skopiowany `Float32Array` przeskalowany przez `objectScale`, oryginalny bufor fizyki w cm zostaje nietouched), `THREE.LineBasicMaterial` (kolor wg ładunku: `positiveTrackColor`/`negativeTrackColor`/`trackColor` z `shared/globals/colors/colors.ts`), `new THREE.Line(geometry, material)`. `frustumCulled = false` (drawRange zmienia się co klatkę — stary bounding sphere obciąłby poprawny wzrost toru).
  - `geometry.setDrawRange(0, 0)` na starcie (tor niewidoczny przed animacją).
  - `updateDrawRange(line: THREE.Line, track: BufferedTrack, tSincePropagationStart: number): void` — binary search (`track.times`, tylko `[0, pointCount)`) po największym indeksie `i` takim, że `times[i] <= t`, następnie `geometry.setDrawRange(0, i + 1)` (`0` gdy `t` przed pierwszym punktem). **Zero obliczeń fizycznych tutaj** — czysto odczyt z prekalkulowanej tablicy.
  - Uwaga jednostek: `times` w Fazie 4 w ns; `tSincePropagationStart` w tych samych jednostkach co `PropagationTimeline` (Faza 10) — ujednolicone (ns).
- [x] `scene/track-renderer.spec.ts`: testy jednostkowe na syntetycznych `BufferedTrack` (bez assetów) — skalowanie pozycji, brak mutacji bufora `positions`, kolory wg ładunku, binary search drawRange (przed pierwszym punktem / środek / ostatni punkt / poza zakresem), idempotencja. **Zweryfikowano `npm run test:ci`**: `79/79 SUCCESS`.

---



## Faza 10 — Oś czasu (3 fazy) — KRYTYCZNE

- [x] `scene/propagation-timeline.ts` — klasa `PropagationTimeline`:
  - Model osi czasu jednym globalnym `globalTimeMs`:
    - `introDurationMs = INTRO_DURATION_MS` (2500ms, z `timeline-constants.ts`, Faza 8) — czas trwania lotu protonów przed zderzeniem.
    - Zakres suwaka: `[minTimeMs, maxTimeMs]` = `[-introDurationMs, propagationDurationMs]`, gdzie `propagationDurationMs = maxTimeNs / nsPerMs` (`maxTimeNs` z `PropagationResult.maxTimeNs`, Faza 4; `nsPerMs` = konfigurowalny `playbackSpeed`, domyślnie `1`).
    - `globalTimeMs = 0` to moment zderzenia.
  - `applyTime(globalTimeMs: number): void` — idempotentna i bezpieczna do przewijania w obie strony (nie zakłada monotoniczności wywołań):
    - `collisionIntro.update(globalTimeMs)` (Faza 8) wywoływane zawsze bezwarunkowo — sam potrafi rozstrzygnąć `t<0` vs `t>=0`.
    - jeśli `globalTimeMs < 0`: `tracksGroup.visible = false`, `return`.
    - jeśli `globalTimeMs >= 0`: `tracksGroup.visible = true`, dla każdego toru `trackRenderer.updateDrawRange(line, track, globalTimeMs * nsPerMs)`.
    - Efekt "błysku" (`onCollisionMoment` callback w opcjach konstruktora) wyzwalany **edge-triggered** dokładnie raz przy przejściu z `t<0` na `t>=0` (a nie przy dokładnym `t===0`, bo pętla `requestAnimationFrame`/scrubber rzadko wylądują idealnie na zerze) — nie odpala się dla `reset()`.
  - `reset(): void` — `applyTime(minTimeMs)` bez wywołania `onCollisionMoment`.
  - Ta klasa jest jedynym miejscem, które łączy "czas z GUI" z "co jest widoczne" — komponent i GUI (Faza 11/12) wywołują tylko `timeline.applyTime(t)` / `timeline.reset()`.
- [x] Domyślny `globalTimeMs` po zakończeniu pre-kalkulacji (przed naciśnięciem "Start animation") to `timeline.minTimeMs` (początek intro) — zagwarantowane przez `reset()`; komponent (Faza 12) wywołuje `timeline.reset()` zaraz po skonstruowaniu `PropagationTimeline`.
- [x] `scene/propagation-timeline.spec.ts`: realny `CollisionIntro` (ładuje `proton.glb`) + syntetyczne `BufferedTrack`/`THREE.Line` — testuje obie fazy (`t<0`, `t>0`), edge-triggered `onCollisionMoment` (w tym wielokrotne przejścia), `reset()`, przewijanie nie-chronologiczne, konwersję `nsPerMs`. **Zweryfikowano `npm run test:ci`**: `86/86 SUCCESS`.

---



## Faza 11 — Kontrolki lil-gui

- [x] `gui/propagation-gui.ts` — klasa `PropagationGui`:
  - Konstruktor: `(container: HTMLElement, callbacks: PropagationGuiCallbacks, events: PropagationGuiEventOption[])` gdzie `callbacks = { onStart, onPlayPause, onTimeChange, onSpeedChange, onEventChange }`.
  - Kontrolki:
    - Przycisk `Start animation` (`FunctionController`) — widoczny przed startem; komponent (Faza 12) wywołuje `hideStartButton()` po kliknięciu, żeby zrobić miejsce na spinner.
    - Przycisk `Play / Pause` — `disable()` do `enableAfterPrecompute()`; etykieta przełączana przez `setPlaying(isPlaying)`.
    - Slider `Time` (`NumberController`) — `disable()` do `enableAfterPrecompute(minTimeMs, maxTimeMs)`, które ustawia realny zakres z `PropagationTimeline` (Faza 10) i domyślną wartość `minTimeMs`; `onChange` wywołuje `onTimeChange(value)` — **tylko** aktualizacja `drawRange`/pozycji intro w komponencie, zero przeliczeń fizyki tutaj.
    - Slider `Playback speed` (0.25x–4x, krok 0.25).
    - Dropdown `Event` (`OptionController`, `setEventOptions(events)` do repopulacji z `particle-data.service.listAvailableEvents()`), zmiana wyzwala `onEventChange(id)` → ponowną pre-kalkulację w komponencie.
  - `syncTime(t: number): void` — aktualizuje wartość slidera (`updateDisplay()`) **bez** wywoływania `onChange` (używane przez pętlę auto-play `requestAnimationFrame` w komponencie, żeby `PropagationTimeline.applyTime()` zostało jedynym pisarzem stanu widoczności, a GUI tylko go odzwierciedla).
  - `dispose(): void` (`gui.destroy()`).
- [x] `gui/propagation-gui.spec.ts`: testy z realnym DOM `lil-gui` (kontener w `document.body`) — domyślny stan disabled, włączanie po precompute, `onTimeChange` odpalane tylko przy prawdziwej zmianie (nie przy `syncTime`), przełączanie etykiety Play/Pause, dropdown Event, `dispose()`. **Zweryfikowano `npm run test:ci`**: `95/95 SUCCESS`.

---



## Faza 12 — Komponent Angular (UI shell)

- [x] `particle-propagation.component.html`: `<canvas>` host + kontener dla lil-gui (`<div #guiHost>`) + spinner ładowania (Angular Material `mat-progress-spinner`, pokazywany podczas pre-kalkulacji w workerze) + miejsce na modal powitalny (otwierany programowo przez `MatDialog`, nie inline).
- [x] `particle-propagation.component.scss`: layout pełnoekranowy analogiczny do `event-display.component.scss` (canvas fill parent, overlay dla spinnera/gui).
- [x] `particle-propagation.component.ts`:
  - Implementuje `AfterViewInit`, `OnDestroy`, `InstructionsProvider` (`instructionsComponent = InstructionsComponent`, wzorem `StrangenessVisualAnalysisComponent`).
  - `ngAfterViewInit()`: tworzy `PropagationScene`, `PropagationGui`, ładuje detektor (Faza 7), otwiera `PropagationWelcomeDialogComponent` przez `MatDialog` (auto-open przy pierwszym wejściu, analogicznie do wzorca `InstructionsDialogComponent`, ale bez czekania na klik "?").
  - `onStartAnimation()`: pokazuje spinner → `magneticFieldService.loadFieldData()` (jeśli jeszcze nie) → `particleDataService.loadEvent(...)` → `rk4PropagatorService.precompute(particles)` (subskrybuje progres do aktualizacji spinnera/procentu) → po wyniku: `trackRenderer.createTrackLines(...)`, dodanie do scenu, ukrycie spinnera, start `collisionIntro`, ustawienie `timeline` na `t = -INTRO_DURATION_MS`, start pętli `requestAnimationFrame` z auto-play.
  - `ngOnDestroy()`: `scene.dispose()`, `gui.dispose()`, `worker` cleanup (delegowane przez serwis), `cancelAnimationFrame`.
- [x] `particle-propagation.component.spec.ts`: podstawowy smoke test tworzenia komponentu (TestBed), mockowanie serwisów HTTP/Worker. **Odstępstwo/naprawa odkryta w tej fazie**: bezpośredni import funkcji `loadDetectorParts` (Faza 7) nie mógł być podmieniony `spyOn()` w webpacku (frozen ESM export bindings) i realne 8 fetchy GLTF na test powodowały timeouty/rozłączenia headless Chrome przy pełnym uruchomieniu suite. Naprawiono wydzielając cienki `scene/detector-loader.service.ts` (`@Injectable`, delegujący do `loadDetectorParts`) wstrzykiwany do komponentu przez DI i podmieniany w spec przez `TestBed` provider override — zero realnych requestów w testach komponentu. Dodano też flagę `destroyed` w komponencie, żeby żadny async callback (worker/promise) nie aktualizował stanu po `ngOnDestroy()`. **Zweryfikowano `npm run test:ci`**: `102/102 SUCCESS` (26s, brak timeoutów/rozłączeń).

---



## Faza 13 — Modal powitalny i instrukcje

- [x] `welcome-dialog/propagation-welcome-dialog.component.ts/.html/.scss`: prosty `MatDialog` content — opis modułu (czym jest propagacja w polu magnetycznym, jak korzystać z suwaka czasu), przycisk "Skip" / "Start animation" (`MatDialogRef<PropagationWelcomeDialogComponent, boolean>.close(true/false)`, odbierane w `particle-propagation.component.ts` jako `afterClosed()` → auto-`onStartAnimation()` gdy `true`). Standalone component (wzorem innych modali w projekcie), teksty przez `TranslateModule`/`en.json` (`PARTICLE_PROPAGATION.WELCOME_*`).
- [x] `instructions/instructions.component.ts/.html/.scss`: treść dla przycisku "?" w toolbarze (wzorem `strangeness-visual-analysis/instructions`), opis fizyki (RK4, pole Czebyszewa, oś czasu) w wersji skróconej dla studentów. `NgModule`-declared (nie standalone, zgodnie z `InstructionsProvider`/`InstructionsComponent` innych modułów), teksty w `en.json` (`STRANGENESS.INSTRUCTIONS_PARTICLE_PROPAGATION.*`).

---



## Faza 14 — Integracja z aplikacją

- [x] `particle-propagation-routing.module.ts`: trasa `path: 'particle-propagation'`, `component: ParticlePropagationComponent`.
- [x] `particle-propagation.module.ts`: `NgModule` z `declarations` (component, instructions), `imports: [CommonModule, SharedModule, AngularModule, ParticlePropagationRoutingModule]` (`welcome-dialog` jest `standalone: true`, więc nie jest w `declarations`, tylko importowany bezpośrednio przez `MatDialog.open()`).
- [x] `alice-masterclass-js/src/app/app-routing.module.ts`: import i dodanie `ParticlePropagationRoutingModule` do `imports`.
- [x] `alice-masterclass-js/src/app/app.module.ts`: import i dodanie `ParticlePropagationModule` do `imports`.
- [x] `alice-masterclass-js/src/app/nav/nav.component.html`: dodać `<a mat-list-item routerLink="/particle-propagation">{{ 'STRANGENESS.PARTICLE_PROPAGATION_MENU' | translate }}</a>` pod istniejącymi dwoma linkami (`strangeness-visual-analysis`, `strangeness-large-scale-analysis`).
- [x] `assets/i18n/en.json`: dodano `STRANGENESS.PARTICLE_PROPAGATION_MENU`, `STRANGENESS.INSTRUCTIONS_PARTICLE_PROPAGATION.*` oraz namespace `PARTICLE_PROPAGATION.*` (tytuł/treść modala powitalnego, przyciski, statusy ładowania/błędu). **Odstępstwo (uzasadnione)**: `de.json` (43 linii) i `es.json` (puste) nie zawierają nawet istniejącego namespace `STRANGENESS` dla `strangeness-visual-analysis`/`strangeness-large-scale-analysis` — są z założenia niekompletne w tym repo (fallback na `en.json` przez `ngx-translate`). Nie dodawano tam kluczy `PARTICLE_PROPAGATION`, żeby nie tworzyć precedensu częściowego tłumaczenia w plikach, które i tak nie mają rodzica `STRANGENESS`.

---



## Faza 15 — Weryfikacja i domknięcie

- [x] `npm run build` (via `npm run build:dev`) w `alice-masterclass-js` — zero błędów kompilacji/typów (tylko pre-existing, niezwiązane z tym modułem warningi: sass `@import` deprecation, `fit.service.ts` CommonJS bailouts, kilka nieużywanych plików w `tsconfig`).
- [x] `npm run lint` — **stan środowiska (pre-existing, niezwiązany z tym modułem)**: `ng lint` rzuca `Cannot find module '@typescript-eslint/eslint-plugin'` — `.eslintrc.json` referencuje ten plugin/parser, ale nie jest on zadeklarowany w `package.json`/`package-lock.json` ani zainstalowany w `node_modules` (zweryfikowano `git log`: `.eslintrc.json` nie było przez nas modyfikowane). Lint jest więc całkowicie niedostępny w tym repo/środowisku od przed startu tego zadania — nie było możliwości zweryfikować "zero nowych błędów lint" tym narzędziem. Nie instalowano brakującej zależności (poza zakresem tego zadania, ryzyko konfliktu wersji `@angular-eslint`).
- [x] Ręczna weryfikacja: `ng serve` (`npm run start`) skompilował się i wystawił appkę na `localhost:4200` bez błędów; potwierdzono HTTP 200 dla `assets/field/*.bin` i `assets/exercises/strangeness/part1/event_0_0.json`. **Interaktywne klikanie przez UI (modal → Start animation → intro → zderzenie → suwak) nie zostało wykonane w tej sesji** — brak dostępnego narzędzia do automatyzacji przeglądarki (`cursor-ide-browser` MCP nie był podłączony). Pokrycie tej ścieżki zapewnia `particle-propagation.component.spec.ts` (Faza 12, `102`+ testów, w tym `onStartAnimation()` → precompute → render loop end-to-end z prawdziwym Web Workerem i prawdziwym polem) oraz `propagation-timeline.spec.ts` (Faza 10, obie fazy czasu + przewijanie w obie strony). Rekomendacja: doraźnie zweryfikować wizualnie przez `npm run start` przy najbliższej okazji z działającym UI.
- [x] Weryfikacja fizyki: nowy `physics/rk4-trajectory-validation.spec.ts` — dla obu naładowanych pionów z rozpadu w prawdziwym `event_0_0.json`, RK4 (przez prawdziwe pole Czebyszewa) porównany z zapisaną w JSON `trajectory` na dopasowanej długości łuku blisko wierzchołka: kierunki zgodne z dokładnością `cos(kąt) > 0.98` (~11°), obie krzywe sięgają promienia detektora tego samego rzędu. **Ten test wykrył realny błąd znaku w `FIELD_SCALE`** (`physics/constants.ts`) — było `-0.1`, powinno być `+0.1` względem konwencji znaku ładunku użytej w naszym RK4 (`du/ds = charge·B2C/|p| · (u×B)`, standardowa siła Lorentza); `-0.1` był 1:1 portem znaku z `gpu_propagator`'s GLSL, ale ten GLSL paruje `SCALE` z **innym** (odwrotnie skonwencjonowanym) wzorem krzywizny w swoim kernelu GPU, więc znak nie przenosił się bezpośrednio na nasz RK4. Naprawiono + udokumentowano w komentarzu przy `FIELD_SCALE`. **Zweryfikowano `npm run test:ci`**: `104/104 SUCCESS` po naprawie (poprzednio błędny znak nie psuł żadnego z istniejących testów, bo Faza 4's `rk4-integrator.spec.ts` sprawdza tylko *wielkość* promienia krzywizny, nie kierunek/znak).
- [ ] Weryfikacja Web Workera: sprawdzić w DevTools (Performance/Main thread) że podczas pre-kalkulacji główny wątek nie jest zablokowany (spinner się animuje płynnie). **Nie wykonano w tej sesji** (wymaga interaktywnej przeglądarki z DevTools — patrz punkt wyżej). Architektura (Faza 4: `new Worker(...)`, transferable `ArrayBuffer`, fallback tylko gdy `Worker` niedostępny) została zaprojektowana i przetestowana end-to-end (`rk4-propagator.service.spec.ts`) tak, by to zagwarantować, ale finalne potwierdzenie "gołym okiem" w DevTools zostaje do zrobienia przy najbliższym `ng serve`.
- [x] Zgodnie z `.cursor/rules/architecture.mdc`: po nowych serwisach i udanej kompilacji uruchomiono w `alice-masterclass-js`: `graphify update .` → `1097 nodes, 2065 edges, 119 communities` (zaktualizowano `graphify-out/graph.json`, `graph.html`, `GRAPH_REPORT.md`).
- [x] Zaktualizowano `docs/particle-propagation.md` (analogiczny do `docs/event-display.md`) opisujący moduł, jego serwisy fizyki, granice odpowiedzialności, "hard rules" (w tym ostrzeżenie o `FIELD_SCALE`) i listę kluczowych testów — do wykorzystania przy przyszłych zmianach.

---



## Uwagi końcowe / ryzyka do pilnowania podczas implementacji

- Licencja GPL-3.0 źródeł (`pnwkw/gpu_propagator`, `pnwkw/distributed_field`) — atrybucja w kodzie i README (Faza 0).
- Web Worker w Angular CLI wymaga `ng generate web-worker` (konfiguruje `tsconfig.worker.json`); jeśli generator nie jest dostępny w tej wersji CLI, fallback: ręczna konfiguracja `worker-plugin`/natywny `new Worker(new URL(...), { type: 'module' })` + osobny `tsconfig`.
- Wspólna logika Czebyszewa/RK4 musi być w plain TS (bez Angular DI), żeby dało się ją importować identycznie w Web Workerze i w serwisie Angular — unikamy duplikacji algorytmu.
- Jednostki: cm (pozycja/promień), GeV/c (pęd), Tesla (pole), ns (czas fizyczny) — konsekwentnie w całym module fizyki; konwersja do world-units Three.js (`objectScale = 1e-2`) i do ms UI wyłącznie w warstwie scene/gui.

