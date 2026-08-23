import { Component } from '@angular/core';

import { MISSION_GROUPS, NmfSaMissionGroup, NmfSaMissionStep } from '../sa-tutorial/sa-tutorial.constants';
import { NmfSaTutorialService } from '../sa-tutorial/sa-tutorial.service';

/**
 * Compact stand-in for `app-nmf-raa-plots`'s full "Your code must:" card, once
 * that card has been replaced by the tab strip (first plot produced). Docked
 * beside the block picker so the plan — and each step's checkmark — stays in
 * view while the student keeps building, instead of scrolling away with the
 * mission card once results exist.
 */
@Component({
  selector: 'app-nmf-sa-mission-strip',
  templateUrl: './mission-strip.component.html',
  styleUrls: ['./mission-strip.component.scss'],
  standalone: false,
})
export class NmfSaMissionStripComponent {
  readonly missionGroups: NmfSaMissionGroup[] = MISSION_GROUPS;

  constructor(private readonly tutorial: NmfSaTutorialService) {}

  stepDone(step: NmfSaMissionStep): boolean {
    return this.tutorial.isMissionStepDone(step);
  }
}
