import { Injectable } from '@angular/core';
import { driver, type DriveStep, type Driver } from 'driver.js';

import { FitService } from '../../shared/services/fit.service';
import {
  LSA_TUTORIAL_STEP_INDEX_ACCEPT,
  LSA_TUTORIAL_STEP_INDEX_FIT,
  LSA_TUTORIAL_STEP_INDEX_OPEN_HISTOGRAM,
} from './lsa-tutorial.constants';

/** Injected only in StrangenessLargeScaleAnalysisModule (needs FitService). */
@Injectable()
export class LsaTutorialService {
  private driverInstance: Driver | null = null;
  private suppressDismissOnDestroy = false;
  private awaitingHistogramAdvance = false;
  /** In-memory only — resets on full page reload so the welcome dialog shows again. */
  private dismissedThisSession = false;

  constructor(private readonly fitService: FitService) {}

  shouldShow(): boolean {
    return !this.dismissedThisSession;
  }

  dismiss(): void {
    this.dismissedThisSession = true;
  }

  /** For unit tests only. */
  clearDismissFlag(): void {
    this.dismissedThisSession = false;
  }

  /**
   * Call when histogram JSON has finished loading successfully while the tour
   * may be waiting on the "Open histogram" step.
   */
  notifyHistogramReady(): void {
    if (!this.awaitingHistogramAdvance || !this.driverInstance?.isActive()) {
      return;
    }
    if (this.driverInstance.getActiveIndex() !== LSA_TUTORIAL_STEP_INDEX_OPEN_HISTOGRAM) {
      return;
    }
    this.awaitingHistogramAdvance = false;
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  /** Call after the user runs a fit while the tour is on the Fit step. */
  notifyFitClicked(): void {
    if (!this.driverInstance?.isActive()) {
      return;
    }
    if (this.driverInstance.getActiveIndex() !== LSA_TUTORIAL_STEP_INDEX_FIT) {
      return;
    }
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  /** Call after the user accepts a result while the tour is on the Accept step. */
  notifyAcceptClicked(): void {
    if (!this.driverInstance?.isActive()) {
      return;
    }
    if (this.driverInstance.getActiveIndex() !== LSA_TUTORIAL_STEP_INDEX_ACCEPT) {
      return;
    }
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  /**
   * @param suppressDismissOnDestroy pass true when the host route is destroyed
   * so the user can see the tutorial again on a later visit.
   */
  destroyDriver(suppressDismissOnDestroy = false): void {
    this.suppressDismissOnDestroy = suppressDismissOnDestroy;
    this.awaitingHistogramAdvance = false;
    this.driverInstance?.destroy();
    this.driverInstance = null;
  }

  isActive(): boolean {
    return this.driverInstance?.isActive() ?? false;
  }

  startMainTour(): void {
    this.destroyDriver(true);
    const steps = this.buildSteps();

    const d = driver({
      showProgress: true,
      smoothScroll: true,
      allowClose: true,
      overlayClickBehavior: () => { /* intentionally no-op: overlay click must not close the tour */ },
      overlayOpacity: 0.72,
      overlayColor: '#1a1a1a',
      stagePadding: 8,
      popoverClass: 'lsa-driver-popover',
      nextBtnText: 'Next &rarr;',
      prevBtnText: '&larr; Previous',
      doneBtnText: 'Done',
      showButtons: ['next', 'previous', 'close'],
      steps,
      onDestroyed: () => {
        if (!this.suppressDismissOnDestroy) {
          this.dismiss();
        }
        this.suppressDismissOnDestroy = false;
        this.driverInstance = null;
        this.awaitingHistogramAdvance = false;
      },
    });

    this.driverInstance = d;
    setTimeout(() => d.drive(0), 0);
  }

  private buildSteps(): DriveStep[] {
    return [
      {
        element: '#lsa-tour-particle-field',
        disableActiveInteraction: false,
        popover: {
          title: 'Select the particle species',
          description:
            'Choose the <strong>strange particle</strong> you want to study: <strong>K<sub>S</sub><sup>0</sup></strong> (Kaon), <strong>Λ</strong> (Lambda), or <strong>Λ̄</strong> (Anti-Lambda). Each species decays into a specific pair of daughter tracks, giving a distinct peak position in the invariant-mass spectrum.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#lsa-tour-collision-field',
        disableActiveInteraction: false,
        popover: {
          title: 'Select the collision system',
          description:
            'Choose the <strong>collision system</strong>: <strong>pp</strong> (proton–proton) or <strong>Pb–Pb</strong> (lead–lead). For Pb–Pb you also select the <strong>centrality</strong> class, which characterises how head-on the two nuclei collided — 0% is the most central (largest overlap), 90–100% is the most peripheral.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#lsa-tour-open-histogram',
        disableActiveInteraction: false,
        popover: {
          title: 'Load the spectrum',
          description:
            'Click <strong>Open histogram</strong> to fetch the binned data — the tour will then advance automatically. You can also press <strong>Next</strong> to skip ahead if a histogram is already loaded.',
          side: 'left',
          showButtons: ['next', 'previous', 'close'],
        },
        onHighlighted: () => {
          this.awaitingHistogramAdvance = true;
        },
        onDeselected: () => {
          this.awaitingHistogramAdvance = false;
        },
      },
      {
        element: '#lsa-tour-histogram-display',
        popover: {
          title: 'What you are looking at',
          description:
            'The horizontal axis is <strong>invariant mass</strong> (GeV/c²). You should see a <strong>broad continuum</strong> plus possible <strong>narrow structures</strong> (peaks). Most pairs are <strong>random combinatorial background</strong> (pions not from the same weak decay), so their mass can fall almost anywhere — that is why the background looks like a smooth underlying distribution, while a real <strong>K<sub>S</sub><sup>0</sup></strong>, <strong>Λ</strong>, or <strong>Ξ</strong> decay gives an excess near the known mass.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '#lsa-tour-signal-group',
        disableActiveInteraction: false,
        popover: {
          title: 'Define the signal (peak) region',
          description:
            'The <strong>Signal</strong> range control selects the mass interval where you expect the <strong>signal peak</strong>. A <strong>Gaussian</strong> will be fitted in this window to model the resonance. Choose a window wide enough to capture the peak, but not so wide that unrelated background structure dominates the fit.',
          side: 'bottom',
        },
      },
      {
        element: '#lsa-tour-background-group',
        disableActiveInteraction: false,
        popover: {
          title: 'Define the background sidebands',
          description:
            'The <strong>Background</strong> range control picks the mass interval used to fit the <strong>combinatorial background</strong> as a <strong>2nd-order polynomial</strong>. Typical practice is to use <strong>sidebands</strong> away from the peak (or a region dominated by smooth background). The polynomial coefficients are then extrapolated under the peak for <strong>background subtraction</strong>.',
          side: 'bottom',
        },
      },
      {
        element: '#lsa-tour-fit-button',
        popover: {
          title: 'Run the fit',
          description:
            '<strong>Fit</strong> runs the simultaneous background (polynomial) and signal (Gaussian) model. The curves are drawn on top of the histogram so you can judge by eye whether the model is reasonable — a quick <strong>quality check</strong> before you trust the numbers.',
          side: 'left',
        },
      },
      {
        element: '#lsa-tour-histogram-display',
        popover: {
          title: 'Does the model match the data?',
          description:
            'Check that the <strong>polynomial</strong> follows the continuum away from the peak and that the <strong>Gaussian</strong> sits on top of the excess. Poor range choices show up as obvious mismatches. If it looks wrong, adjust the ranges and <strong>Fit</strong> again.',
          side: 'right',
        },
      },
      {
        element: '#lsa-tour-accept-button',
        popover: {
          title: 'Record the signal yield',
          description:
            'If you are satisfied, press <strong>Accept</strong>. The app uses the polynomial to estimate <strong>background under the peak</strong>, then reports <strong>total</strong> counts in the peak region, <strong>estimated background</strong>, and <strong>signal</strong> (excess over background) — the quantity you need to compare production rates between species and collision systems.',
          side: 'left',
        },
      },
      {
        element: '#lsa-tour-results-table',
        popover: {
          title: 'Your submitted measurements',
          description:
            'Each accepted fit adds a row with the <strong>particle type</strong>, <strong>collision</strong>, <strong>centrality</strong> (if applicable), and the <strong>signal</strong> estimate. This mirrors how you would tabulate yields in a paper-style analysis workflow.',
          side: 'top',
        },
      },
      {
        element: '#lsa-tour-upload-button',
        popover: {
          title: 'Share results with your teacher',
          description:
            'When logged in, <strong>Upload data</strong> sends your table to the server session (pooling class results). If the button is disabled, sign in from the main flow first.',
          side: 'left',
        },
      },
    ];
  }
}
