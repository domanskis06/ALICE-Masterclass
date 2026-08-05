import { Injectable, inject } from '@angular/core';
import { DEMO_MODE } from './demo.tokens';
import { LargeScaleAnalysisResultsEntry, VisualAnalysisResultsEntry } from '../services/api.service';

/** One accepted fit, plus the value it replaced (null when the bin was empty). */
export interface DemoLsaUndoEntry {
  key: string;
  previous: LargeScaleAnalysisResultsEntry | null;
}

export interface DemoVisualAnalysisSnapshot {
  results: Map<string, VisualAnalysisResultsEntry[]>;
  trackKeys: Map<string, string[][]>;
  /** Rebuilt from `trackKeys`, so it can never lock a track without an entry. */
  analyzed: Map<string, Set<string>>;
}

export interface DemoLargeScaleAnalysisSnapshot {
  results: Map<string, LargeScaleAnalysisResultsEntry>;
  undoStack: DemoLsaUndoEntry[];
}

/**
 * Per-tab persistence for the demo build, in place of uploading to Django.
 *
 * Uses `sessionStorage` so a refresh keeps VA/LSA progress, but opening the
 * demo in a new tab starts clean. Everything lives under the `demo:` prefix;
 * the workshop build never reads or writes these keys. All access is defensive:
 * unavailable storage (private mode) must not break the exercises.
 */
@Injectable({ providedIn: 'root' })
export class DemoResultsStore {
  readonly enabled: boolean = inject(DEMO_MODE);

  private static readonly KEY_VA_RESULTS = 'demo:va:results';
  private static readonly KEY_VA_TRACK_KEYS = 'demo:va:trackKeys';
  private static readonly KEY_LSA_RESULTS = 'demo:lsa:results';
  /** Accept history for Undo — see `DemoLsaUndoEntry`. */
  private static readonly KEY_LSA_ORDER = 'demo:lsa:order';

  private static readonly ALL_KEYS = [
    DemoResultsStore.KEY_VA_RESULTS,
    DemoResultsStore.KEY_VA_TRACK_KEYS,
    DemoResultsStore.KEY_LSA_RESULTS,
    DemoResultsStore.KEY_LSA_ORDER,
  ];

  constructor() {
    // Drop legacy localStorage copies from earlier demo builds.
    if (this.enabled) {
      this.clearLocalStorageLegacy();
    }
  }

  loadVisualAnalysis(): DemoVisualAnalysisSnapshot | null {
    if (!this.enabled) {
      return null;
    }

    const results = this.readEntries<VisualAnalysisResultsEntry[]>(DemoResultsStore.KEY_VA_RESULTS);
    const trackKeys = this.readEntries<string[][]>(DemoResultsStore.KEY_VA_TRACK_KEYS);
    if (results === null && trackKeys === null) {
      return null;
    }

    const resultsMap = new Map(results ?? []);
    const trackKeysMap = new Map(trackKeys ?? []);
    const analyzed = new Map<string, Set<string>>();

    for (const [key, keyLists] of Array.from(trackKeysMap.entries())) {
      const used = new Set<string>();
      for (const list of keyLists) {
        for (const trackKey of list) {
          used.add(trackKey);
        }
      }
      if (used.size > 0) {
        analyzed.set(key, used);
      }
    }

    return { results: resultsMap, trackKeys: trackKeysMap, analyzed };
  }

  saveVisualAnalysis(
    results: Map<string, VisualAnalysisResultsEntry[]>,
    trackKeys: Map<string, string[][]>,
  ): void {
    if (!this.enabled) {
      return;
    }
    this.write(DemoResultsStore.KEY_VA_RESULTS, Array.from(results.entries()));
    this.write(DemoResultsStore.KEY_VA_TRACK_KEYS, Array.from(trackKeys.entries()));
  }

  loadLargeScaleAnalysis(): DemoLargeScaleAnalysisSnapshot | null {
    if (!this.enabled) {
      return null;
    }

    const results = this.readEntries<LargeScaleAnalysisResultsEntry>(DemoResultsStore.KEY_LSA_RESULTS);
    if (results === null) {
      return null;
    }

    const undoStack = this.read<DemoLsaUndoEntry[]>(DemoResultsStore.KEY_LSA_ORDER);

    return {
      results: new Map(results),
      undoStack: Array.isArray(undoStack) ? undoStack : [],
    };
  }

  saveLargeScaleAnalysis(
    results: Map<string, LargeScaleAnalysisResultsEntry>,
    undoStack: DemoLsaUndoEntry[],
  ): void {
    if (!this.enabled) {
      return;
    }
    this.write(DemoResultsStore.KEY_LSA_RESULTS, Array.from(results.entries()));
    this.write(DemoResultsStore.KEY_LSA_ORDER, undoStack);
  }

  clear(): void {
    if (!this.enabled) {
      return;
    }
    for (const key of DemoResultsStore.ALL_KEYS) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        return;
      }
    }
    this.clearLocalStorageLegacy();
  }

  /** Maps are stored as `[key, value]` pairs; null means "nothing usable stored". */
  private readEntries<T>(storageKey: string): Array<[string, T]> | null {
    const parsed = this.read<Array<[string, T]>>(storageKey);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter((entry) => Array.isArray(entry) && typeof entry[0] === 'string');
  }

  private read<T>(storageKey: string): T | null {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private write(storageKey: string, value: unknown): void {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Quota exceeded / storage disabled: the exercise keeps working in memory.
    }
  }

  private clearLocalStorageLegacy(): void {
    for (const key of DemoResultsStore.ALL_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        return;
      }
    }
  }
}
