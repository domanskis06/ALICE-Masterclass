import { Component, OnInit, Input, Output, EventEmitter, HostBinding } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Track, TrackType } from '../../shared/models';
import { positiveTrackColor, negativeTrackColor, bachelorTrackColor } from '../../shared/globals';

import { SubmitHistogramEntry } from '../strangeness-visual-analysis.component';
import { ParticleType, VisualAnalysisResultsEntry } from '../../shared/services/api.service';

export interface Particle {
  color: string;
  type: string;
  track: Track;
}

@Component({
    selector: 'app-calculator',
    templateUrl: './calculator.component.html',
    styleUrls: ['./calculator.component.scss'],
    standalone: false
})
export class CalculatorComponent implements OnInit {

  readonly displayedColumns: string[] = ['type', 'px', 'py', 'pz', 'mass'];

  tableRows: Particle[] = [
    {color: positiveTrackColor, type: '(+)', track: null},
    {color: negativeTrackColor, type: '(-)', track: null},
    {color: bachelorTrackColor, type: '(b)', track: null}
  ];

  particleTypes: ParticleType[] = [
    ParticleType.KAON,
    ParticleType.LAMBDA,
    ParticleType.ANTI_LAMBDA,
    ParticleType.XI,
    ParticleType.ANTI_XI,
    ParticleType.BACKGROUND,
  ];

  /** Same symbols as the histogram titles (K⁰_S, Λ, Λ̅, Ξ, Ξ̅); null for Background. */
  particleSymbolHtml(type: ParticleType | string | null | undefined): string | null {
    switch (type) {
      case ParticleType.KAON:
        return 'K<span class="supsub"><sup>0</sup><sub>S</sub></span>';
      case ParticleType.LAMBDA:
        return 'Λ';
      case ParticleType.ANTI_LAMBDA:
        return 'Λ&#773;';
      case ParticleType.XI:
        return 'Ξ';
      case ParticleType.ANTI_XI:
        return 'Ξ&#773;';
      default:
        return null;
    }
  }

  particleTypeLabelKey(type: ParticleType | string): string {
    return 'STRANGENESS.CALCULATOR.' + String(type).toUpperCase();
  }

  @Input()
  submitDisabled: boolean = false;

  @Input()
  darkMode = false;

  @Input()
  identifiedEntries: VisualAnalysisResultsEntry[] = [];

  /** True when an in-flight histogram add can still be cancelled via Undo. */
  @Input()
  hasPendingAdd = false;

  /** All required tracks in the current event have been added to histograms. */
  @Input()
  eventComplete = false;

  @Input()
  nextEventDisabled = false;

  @HostBinding('class.calculator-dark-mode')
  get calculatorDarkModeClass(): boolean {
    return this.darkMode;
  }

  get particleSelectPanelClass(): string | string[] {
    return this.darkMode
      ? ['calculator-particle-select-panel', 'calculator-particle-select-panel--dark']
      : 'calculator-particle-select-panel';
  }

  @Input()
  get particlePos(): Track { return this.tableRows[0].track; }
  set particlePos(particlePos: Track) {
    this.tableRows[0].track = particlePos;
    this.calcTotalMass();
  }

  @Input()
  get particleNeg(): Track { return this.tableRows[1].track; }
  set particleNeg(particleNeg: Track) {
    this.tableRows[1].track = particleNeg;
    this.calcTotalMass();
  }

  @Input()
  get particleBac(): Track { return this.tableRows[2].track; }
  set particleBac(particleBac: Track) {
    this.tableRows[2].track = particleBac;
    this.calcTotalMass();
  }

  @Output()
  addToHistogramEvent: EventEmitter<SubmitHistogramEntry> = new EventEmitter<SubmitHistogramEntry>();

  @Output()
  removeIdentifiedEvent: EventEmitter<number> = new EventEmitter<number>();

  @Output()
  undoEvent: EventEmitter<'selection' | 'histogram'> = new EventEmitter<'selection' | 'histogram'>();

  @Output()
  openInstructionsEvent: EventEmitter<void> = new EventEmitter<void>();

  @Output()
  resetEvent: EventEmitter<void> = new EventEmitter<void>();

  @Output()
  nextEvent: EventEmitter<void> = new EventEmitter<void>();

  totalMass: number = null;

  calculatorForm: FormGroup;

  get hasParticleType(): boolean {
    const value = this.calculatorForm?.controls?.type?.value;
    return value != null && value !== '';
  }

  get hasTracksForAdd(): boolean {
    return this.totalMass != null && Number.isFinite(this.totalMass);
  }

  get hasCalculatorSelection(): boolean {
    return this.particlePos != null || this.particleNeg != null || this.particleBac != null || this.hasParticleType;
  }

  get canAdd(): boolean {
    return !this.submitDisabled
      && this.hasParticleType
      && this.hasTracksForAdd
      && this.calculatorForm.valid;
  }

  get canUndo(): boolean {
    return this.hasCalculatorSelection
      || this.hasPendingAdd
      || this.identifiedEntries.length > 0;
  }

  private resetTypeField(): void {
    this.calculatorForm.controls.type.reset();
    this.calculatorForm.controls.type.setErrors(null);
  }

  /** Clear tracks / mass locally so mat-table refreshes immediately. */
  private clearLocalSelection(): void {
    this.tableRows = [
      { color: positiveTrackColor, type: '(+)', track: null },
      { color: negativeTrackColor, type: '(-)', track: null },
      { color: bachelorTrackColor, type: '(b)', track: null },
    ];
    this.totalMass = null;
    this.calculatorForm.controls.mass.setValue(null);
    this.resetTypeField();
  }

  private calcTotalMass(): void {
    const particles = this.tableRows.map((v: Particle) => v.track);

    let E = 0, px = 0, py = 0, pz = 0;

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];

      if (particle === null) {
        this.totalMass = null;
        return this.calculatorForm.controls.mass.setValue(this.totalMass);
      }
      
      E += particle.E;
      px += particle.px;
      py += particle.py;
      pz += particle.pz;

      //If V0, we are done, otherwise continue with the last particle (Bachelor)
      if (i == 1 && particle.type == TrackType.V0) {
        break;
      }
    }

    this.totalMass = Math.sqrt(E * E - px * px - py * py - pz * pz);
    this.calculatorForm.controls.mass.setValue(this.totalMass);
  }

  constructor(private formBuilder: FormBuilder) { 
    this.calculatorForm = this.formBuilder.group({
      type: ['', Validators.required],
      mass: ['', Validators.required]
    });
  }

  ngOnInit(): void {
  }

  onSubmit(): void {
    if (!this.canAdd) {
      return;
    }
    const type = this.calculatorForm.controls.type.value as ParticleType;
    if (type == null || type === ('' as unknown as ParticleType)) {
      return;
    }
    this.addToHistogramEvent.emit({
      type,
      mass: this.calculatorForm.controls.mass.value,
    });
    // Reset after emit so the parent still receives the chosen particle type.
    this.resetTypeField();
  }

  onRemoveIdentified(index: number): void {
    this.removeIdentifiedEvent.emit(index);
  }

  /**
   * Clear calculator selection first; otherwise ask the parent to undo the last
   * histogram add / pending flight (re-enables decay clicks).
   */
  onUndo(): void {
    if (this.hasCalculatorSelection) {
      this.clearLocalSelection();
      this.undoEvent.emit('selection');
      return;
    }
    this.undoEvent.emit('histogram');
  }

  onOpenInstructions(): void {
    this.openInstructionsEvent.emit();
  }

  onResetEvent(): void {
    this.resetEvent.emit();
  }

  onNextEvent(): void {
    this.nextEvent.emit();
  }

}
