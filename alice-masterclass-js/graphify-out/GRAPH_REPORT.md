# Graph Report - alice-masterclass-js  (2026-07-09)

## Corpus Check
- 407 files · ~63,633 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 777 nodes · 1383 edges · 56 communities (45 shown, 11 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_main.ts|main.ts]]
- [[_COMMUNITY_TString|TString]]
- [[_COMMUNITY_TString|TString]]
- [[_COMMUNITY_Int_t|Int_t]]
- [[_COMMUNITY_json|json]]
- [[_COMMUNITY_NgModule|NgModule]]
- [[_COMMUNITY_NgModule|NgModule]]
- [[_COMMUNITY_Component|Component]]
- [[_COMMUNITY_NgModule|NgModule]]
- [[_COMMUNITY_NgModule|NgModule]]
- [[_COMMUNITY_Component|Component]]
- [[_COMMUNITY_Inject|Inject]]
- [[_COMMUNITY_NgModule|NgModule]]
- [[_COMMUNITY_Injectable|Injectable]]
- [[_COMMUNITY_Component|Component]]
- [[_COMMUNITY_NgModule|NgModule]]
- [[_COMMUNITY_Component|Component]]
- [[_COMMUNITY_Inject|Inject]]
- [[_COMMUNITY_Component|Component]]
- [[_COMMUNITY_Input|Input]]
- [[_COMMUNITY_ViewChild|ViewChild]]
- [[_COMMUNITY_NgModule|NgModule]]
- [[_COMMUNITY_Component|Component]]
- [[_COMMUNITY_Inject|Inject]]
- [[_COMMUNITY_Injectable|Injectable]]
- [[_COMMUNITY_NgModule|NgModule]]
- [[_COMMUNITY_Component|Component]]
- [[_COMMUNITY_Component|Component]]
- [[_COMMUNITY_HostBinding|HostBinding]]
- [[_COMMUNITY_Input|Input]]
- [[_COMMUNITY_Output|Output]]
- [[_COMMUNITY_ViewChild|ViewChild]]
- [[_COMMUNITY_Component|Component]]
- [[_COMMUNITY_HostBinding|HostBinding]]
- [[_COMMUNITY_Input|Input]]
- [[_COMMUNITY_ViewChild|ViewChild]]
- [[_COMMUNITY_Component|Component]]
- [[_COMMUNITY_HostBinding|HostBinding]]
- [[_COMMUNITY_Input|Input]]
- [[_COMMUNITY_Output|Output]]
- [[_COMMUNITY_api.service.ts|api.service.ts]]
- [[_COMMUNITY_FitSelectorComponent|FitSelectorComponent]]
- [[_COMMUNITY_strangeness-large-scale-analysis.component.ts|strangeness-large-scale-analysis.component.ts]]
- [[_COMMUNITY_Component|Component]]
- [[_COMMUNITY_HistogramSelectorComponent|HistogramSelectorComponent]]
- [[_COMMUNITY_ResultsComponent|ResultsComponent]]
- [[_COMMUNITY_AuthDialogComponent|AuthDialogComponent]]
- [[_COMMUNITY_HomeComponent|HomeComponent]]

## God Nodes (most connected - your core abstractions)
1. `EventDisplayComponent` - 103 edges
2. `HistogramComponent` - 36 edges
3. `ApiService` - 32 edges
4. `StrangenessVisualAnalysisComponent` - 30 edges
5. `FitService` - 28 edges
6. `SharedModule` - 28 edges
7. `AngularModule` - 27 edges
8. `FitHistogramComponent` - 23 edges
9. `StrangenessDataService` - 20 edges
10. `StrangenessLargeScaleAnalysisComponent` - 17 edges

## Surprising Connections (you probably didn't know these)
- `HistogramSelectorComponent` --references--> `CollisionCentralityEntry`  [EXTRACTED]
  src/app/strangeness-large-scale-analysis/histogram-selector/histogram-selector.component.ts → src/app/services/strangeness-data.service.ts
- `StrangenessDataService` --references--> `LargeScaleAnalysisResultsEntry`  [EXTRACTED]
  src/app/services/strangeness-data.service.ts → src/app/shared/services/api.service.ts
- `EventDisplayComponent` --references--> `Event`  [EXTRACTED]
  src/app/shared/components/event-display/event-display.component.ts → src/app/shared/models/event/event.ts
- `EventDisplayComponent` --references--> `Track`  [EXTRACTED]
  src/app/shared/components/event-display/event-display.component.ts → src/app/shared/models/event/event.ts
- `FitHistogramComponent` --inherits--> `HistogramComponent`  [EXTRACTED]
  src/app/shared/components/fit-histogram/fit-histogram.component.ts → src/app/shared/components/histogram/histogram.component.ts

## Import Cycles
- None detected.

## Communities (56 total, 11 thin omitted)

### Community 0 - "main.ts"
Cohesion: 0.08
Nodes (5): EventDisplayComponent, Component, HostBinding, Output, ViewChild

### Community 1 - "TString"
Cohesion: 0.08
Nodes (6): HistogramComponent, Component, HostBinding, Input, Output, ViewChild

### Community 2 - "TString"
Cohesion: 0.08
Nodes (9): Track, CalculatorComponent, Particle, Component, Input, Output, StrangenessVisualAnalysisComponent, Component (+1 more)

### Community 5 - "json"
Cohesion: 0.29
Nodes (4): MassHistogramsComponent, Component, Input, Output

### Community 8 - "NgModule"
Cohesion: 0.28
Nodes (6): DetectorPaletteItem, DetectorPartToggleModel, Event, TrackType, HistogramFlightParticle, SubmitHistogramEntry

### Community 9 - "Component"
Cohesion: 0.32
Nodes (10): TString, convert_events(), load_cascades(), load_clusters(), load_tracks(), load_v0s(), process_file(), Int_t (+2 more)

### Community 12 - "Component"
Cohesion: 0.05
Nodes (40): dependencies, @angular/animations, @angular/cdk, @angular/common, @angular/compiler, @angular/core, @angular/flex-layout, @angular/forms (+32 more)

### Community 13 - "Inject"
Cohesion: 0.05
Nodes (42): architect, projectType, root, projectType, root, sourceRoot, lint, cli (+34 more)

### Community 14 - "NgModule"
Cohesion: 0.13
Nodes (8): InstructionsDialogComponent, Component, Inject, NavComponent, Component, Input, ViewChild, InstructionsProvider

### Community 15 - "Injectable"
Cohesion: 0.05
Nodes (38): AboutModule, NgModule, CoreModule, NgModule, HomeModule, NgModule, HomeRoutingModule, routes (+30 more)

### Community 16 - "Component"
Cohesion: 0.10
Nodes (20): schematics, prefix, style, type, prefix, type, typeSeparator, typeSeparator (+12 more)

### Community 17 - "NgModule"
Cohesion: 0.16
Nodes (4): AppComponent, Component, ApiService, Injectable

### Community 19 - "Component"
Cohesion: 0.09
Nodes (16): AboutComponent, Component, AboutRoutingModule, routes, NgModule, AppRoutingModule, routes, NgModule (+8 more)

### Community 20 - "Inject"
Cohesion: 0.12
Nodes (15): compileOnSave, compilerOptions, allowJs, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, module (+7 more)

### Community 21 - "Component"
Cohesion: 0.20
Nodes (15): options, path, assets, customWebpackConfig, index, karmaConfig, main, outputPath (+7 more)

### Community 22 - "Input"
Cohesion: 0.15
Nodes (12): angularCompilerOptions, fullTemplateTypeCheck, preserveWhitespaces, strictInjectionParameters, compilerOptions, baseUrl, module, outDir (+4 more)

### Community 23 - "ViewChild"
Cohesion: 0.67
Nodes (3): build, builder, configurations

### Community 24 - "NgModule"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, emitDecoratorMetadata, experimentalDecorators, lib, moduleResolution, sourceMap, target (+3 more)

### Community 25 - "Component"
Cohesion: 0.18
Nodes (11): dev, aot, buildOptimizer, buildTarget, extractLicenses, fileReplacements, namedChunks, optimization (+3 more)

### Community 26 - "Inject"
Cohesion: 0.18
Nodes (11): production, aot, buildOptimizer, buildTarget, extractLicenses, fileReplacements, namedChunks, optimization (+3 more)

### Community 27 - "Injectable"
Cohesion: 0.18
Nodes (11): web, aot, buildOptimizer, buildTarget, extractLicenses, fileReplacements, namedChunks, optimization (+3 more)

### Community 28 - "NgModule"
Cohesion: 0.22
Nodes (8): compilerOptions, module, outDir, types, exclude, extends, files, include

### Community 29 - "Component"
Cohesion: 0.29
Nodes (6): compilerOptions, module, outDir, types, extends, include

### Community 30 - "Component"
Cohesion: 0.29
Nodes (6): env, browser, es2017, es6, node, overrides

### Community 31 - "HostBinding"
Cohesion: 0.43
Nodes (3): HistogramBinIncrementedEvent, ParticleType, MassHistogramBinIncrementedEvent

### Community 32 - "Input"
Cohesion: 0.20
Nodes (11): architect, extract-i18n, serve, test, builder, options, buildTarget, builder (+3 more)

### Community 33 - "Output"
Cohesion: 0.50
Nodes (3): electronPath, path, setup()

### Community 34 - "ViewChild"
Cohesion: 0.22
Nodes (5): AppModule, NgModule, ElectronService, Injectable, AppConfig

### Community 35 - "Component"
Cohesion: 0.12
Nodes (5): StrangenessDataService, Injectable, VisualAnalysisResultsEntry, StrangenessLargeScaleAnalysisComponent, Component

### Community 38 - "ViewChild"
Cohesion: 0.15
Nodes (5): FitHistogramComponent, Component, HostBinding, Input, ViewChild

### Community 48 - "api.service.ts"
Cohesion: 0.22
Nodes (4): LargeScaleAnalysisResultsEntry, Session, MockApiService, Injectable

### Community 49 - "FitSelectorComponent"
Cohesion: 0.21
Nodes (5): FitSelectorComponent, Component, Input, Output, FitHistogramEntry

### Community 50 - "strangeness-large-scale-analysis.component.ts"
Cohesion: 0.47
Nodes (6): CollisionCentralityEntry, CentralityType, CollisionType, FitResult, AddToHistogramEntry, OpenHistogramEntry

### Community 51 - "Component"
Cohesion: 0.19
Nodes (5): LSAData, FitService, pbpbp_k0, pbpbp_lambda, Injectable

### Community 52 - "HistogramSelectorComponent"
Cohesion: 0.25
Nodes (4): HistogramSelectorComponent, Component, Input, Output

### Community 53 - "ResultsComponent"
Cohesion: 0.22
Nodes (5): ResultsComponent, Component, Input, Output, ViewChild

### Community 54 - "AuthDialogComponent"
Cohesion: 0.29
Nodes (3): AuthDialogComponent, Component, Inject

## Knowledge Gaps
- **192 isolated node(s):** `browser`, `node`, `es6`, `es2017`, `overrides` (+187 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `EventDisplayComponent` connect `main.ts` to `TString`, `TString`, `Directive`, `Int_t`, `Component`, `NgModule`, `Injectable`, `NgModule`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Why does `HistogramComponent` connect `TString` to `Injectable`, `ViewChild`, `HostBinding`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `StrangenessVisualAnalysisComponent` connect `TString` to `Component`, `NgModule`, `NgModule`, `Injectable`, `NgModule`, `NgModule`, `Component`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `browser`, `node`, `es6` to the rest of the system?**
  _192 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07563025210084033 - nodes in this community are weakly interconnected._
- **Should `TString` be split into smaller, more focused modules?**
  _Cohesion score 0.08403361344537816 - nodes in this community are weakly interconnected._
- **Should `TString` be split into smaller, more focused modules?**
  _Cohesion score 0.08258258258258258 - nodes in this community are weakly interconnected._