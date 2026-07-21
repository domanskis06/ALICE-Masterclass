import { Injectable, signal } from '@angular/core';

/** Coordinates relative to the flight overlay's offset parent (scroll container). */
export interface FlightPoint {
  x: number;
  y: number;
}

export interface ParticleFlight {
  id: number;
  from: FlightPoint;
  to: FlightPoint;
  color: string;
}

export interface FlightOptions {
  color?: string;
}

interface QueuedFlight {
  from: FlightPoint;
  to: FlightPoint;
  color: string;
  resolve: () => void;
}

/** Scroll container that holds the routed pages (histograms live here). */
export function getFlightOverlayParent(): HTMLElement {
  if (typeof document === 'undefined') {
    return null as unknown as HTMLElement;
  }
  return (document.querySelector('mat-sidenav-content') as HTMLElement | null) ?? document.body;
}

/**
 * Convert a viewport point (from getBoundingClientRect) into coordinates
 * relative to the sidenav scroll container so an absolutely positioned ball
 * stays glued to page content while scrolling.
 */
export function viewportToOverlayPoint(x: number, y: number, overlayParent: HTMLElement): FlightPoint {
  const rootRect = overlayParent.getBoundingClientRect();
  return {
    x: x - rootRect.left + overlayParent.scrollLeft,
    y: y - rootRect.top + overlayParent.scrollTop,
  };
}

/**
 * Cross-component parabolic flight: any feature calls `fly()` / `flyBetweenRects()`,
 * AppComponent owns the overlay (inside mat-sidenav-content) and AnimationBuilder player.
 *
 * Callers pass **viewport** points from `getBoundingClientRect()`.
 */
@Injectable({ providedIn: 'root' })
export class FlightService {
  private readonly _active = signal<ParticleFlight | null>(null);
  /** Currently animating flight (null when idle). Consumed by AppComponent effect. */
  readonly active = this._active.asReadonly();

  private nextId = 0;
  private resolveActive: (() => void) | null = null;
  private readonly queue: QueuedFlight[] = [];

  /**
   * Fly between two element bounding boxes (centers). Resolves when the arc finishes.
   */
  flyBetweenRects(
    source: DOMRectReadOnly,
    destination: DOMRectReadOnly,
    options?: FlightOptions
  ): Promise<void> {
    return this.fly(
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      { x: destination.left + destination.width / 2, y: destination.top + destination.height / 2 },
      options
    );
  }

  /**
   * Fly between two viewport points (from getBoundingClientRect). Queued FIFO.
   */
  fly(from: FlightPoint, to: FlightPoint, options?: FlightOptions): Promise<void> {
    const color = options?.color ?? '#62d9ff';
    const parent = getFlightOverlayParent();
    const localFrom = viewportToOverlayPoint(from.x, from.y, parent);
    const localTo = viewportToOverlayPoint(to.x, to.y, parent);

    return new Promise<void>((resolve) => {
      if (this._active() !== null) {
        this.queue.push({ from: localFrom, to: localTo, color, resolve });
        return;
      }
      this.start({ from: localFrom, to: localTo, color }, resolve);
    });
  }

  /** Called by the overlay host when AnimationBuilder `onDone` fires. */
  notifyDone(id: number): void {
    if (this._active()?.id !== id) {
      return;
    }

    this._active.set(null);
    const resolve = this.resolveActive;
    this.resolveActive = null;
    resolve?.();

    const next = this.queue.shift();
    if (next) {
      queueMicrotask(() => this.start(next, next.resolve));
    }
  }

  private start(
    payload: { from: FlightPoint; to: FlightPoint; color: string },
    resolve: () => void
  ): void {
    this.resolveActive = resolve;
    this._active.set({
      id: ++this.nextId,
      from: payload.from,
      to: payload.to,
      color: payload.color,
    });
  }
}
