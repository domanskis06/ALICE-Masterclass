import { AnimationBuilder, AnimationPlayer, animate, keyframes, style } from '@angular/animations';
import {
  Component,
  DestroyRef,
  ElementRef,
  AfterViewInit,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslateService, LangChangeEvent } from '@ngx-translate/core';
import { AppConfig } from '../environments/environment';
import { ApiService } from './shared/services/api.service';
import { FlightService, ParticleFlight, getFlightOverlayParent } from './shared/services/flight.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: false
})
export class AppComponent implements AfterViewInit {
  private readonly flightService = inject(FlightService);
  private readonly animationBuilder = inject(AnimationBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly flyingBall = viewChild<ElementRef<HTMLElement>>('flyingBall');

  private player: AnimationPlayer | null = null;
  private landTimeout: number | null = null;

  /** Total parabolic flight length (ms). */
  private static readonly FLIGHT_DURATION_MS = 2000;
  /** Keyframe offset where the ball sits on the destination bin (then fades out). */
  private static readonly FLIGHT_LAND_OFFSET = 0.88;

  readonly LANGUAGES: Array<string> = ['en', 'pl', 'de', 'fr']; // 'es' omitted: assets/i18n/es.json is empty
  readonly languageKey: string = 'language';

  /** Exposed for template color binding while a flight is active. */
  readonly activeFlight = this.flightService.active;

  constructor(private translateService: TranslateService, private apiService: ApiService) {
    this.translateService.setDefaultLang(this.LANGUAGES[0]);

    let language = localStorage.getItem(this.languageKey);

    if (language === null || !this.LANGUAGES.includes(language)) {
      language = this.LANGUAGES[0];
    }

    this.translateService.use(language);

    this.translateService.onLangChange.subscribe((params: LangChangeEvent) => this.onLangChange(params));

    this.apiService.API_URL = AppConfig.apiUrl;

    this.apiService.init();

    this.apiService.updateTitle();

    if (AppConfig.production) {
      console.log('AppConfig', AppConfig);
      console.log('Run in browser');
    }

    effect(() => {
      const flight = this.flightService.active();
      if (!flight) {
        return;
      }
      // AnimationBuilder side effects must not re-subscribe inside the effect tracking graph.
      untracked(() => this.playParabolicFlight(flight));
    });

    this.destroyRef.onDestroy(() => {
      this.clearLandTimeout();
      this.player?.destroy();
      this.player = null;
      const el = this.flyingBall()?.nativeElement;
      // Ball may have been moved to document.body — remove it on destroy.
      el?.remove();
    });
  }

  private clearLandTimeout(): void {
    if (this.landTimeout !== null) {
      window.clearTimeout(this.landTimeout);
      this.landTimeout = null;
    }
  }

  ngAfterViewInit(): void {
    this.mountFlyingBall();
  }

  onLangChange(event: LangChangeEvent) {
    localStorage.setItem(this.languageKey, event.lang);
  }

  private mountFlyingBall(): void {
    const el = this.flyingBall()?.nativeElement;
    const parent = getFlightOverlayParent();
    if (!el || !parent) {
      return;
    }
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    if (el.parentElement !== parent) {
      parent.appendChild(el);
    }
  }

  private playParabolicFlight(flight: ParticleFlight): void {
    this.clearLandTimeout();
    this.player?.destroy();
    this.player = null;

    this.mountFlyingBall();

    const el = this.flyingBall()?.nativeElement;
    if (!el) {
      this.flightService.notifyDone(flight.id);
      return;
    }

    const ballHalf = 8;
    const { from, to } = flight;
    const midX = from.x + (to.x - from.x) * 0.5;
    const midY = Math.min(from.y, to.y) - 150;
    const durationMs = AppComponent.FLIGHT_DURATION_MS;
    const landOffset = AppComponent.FLIGHT_LAND_OFFSET;

    el.style.setProperty('--flight-color', flight.color);
    el.classList.add('is-flying');

    const at = (x: number, y: number, scale: number) =>
      `translate3d(${x - ballHalf}px, ${y - ballHalf}px, 0) scale(${scale})`;

    const factory = this.animationBuilder.build([
      style({
        opacity: 1,
        transform: at(from.x, from.y, 0.55),
      }),
      animate(
        `${durationMs}ms cubic-bezier(0.22, 0.72, 0.28, 1)`,
        keyframes([
          style({ opacity: 1, transform: at(from.x, from.y, 0.55), offset: 0 }),
          style({ opacity: 1, transform: at(midX, midY, 1.2), offset: 0.45 }),
          style({ opacity: 1, transform: at(to.x, to.y, 1), offset: landOffset }),
          style({ opacity: 0, transform: at(to.x, to.y, 0.35), offset: 1 }),
        ])
      ),
    ]);

    this.player = factory.create(el);
    // Resolve fly() when the ball hits the bin so the histogram bar can grow in sync.
    this.landTimeout = window.setTimeout(() => {
      this.landTimeout = null;
      this.flightService.notifyLanded(flight.id);
    }, Math.round(durationMs * landOffset));

    this.player.onDone(() => {
      this.clearLandTimeout();
      el.classList.remove('is-flying');
      el.style.opacity = '0';
      el.style.transform = 'translate3d(-100px, -100px, 0) scale(0.55)';
      this.player?.destroy();
      this.player = null;
      this.flightService.notifyDone(flight.id);
    });
    this.player.play();
  }
}
