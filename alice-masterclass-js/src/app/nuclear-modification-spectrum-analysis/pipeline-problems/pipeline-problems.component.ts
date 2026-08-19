import { Component, Input } from '@angular/core';

import { RaaProblem } from '../../shared/models/raa/spectrum';

const PROBLEM_PREFIX = 'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.PROBLEM.';

/**
 * The notes under the pipeline header: what is physically wrong with the last
 * run. Renders nothing while the chain is clean, so the build column keeps its
 * full height for the workspace — Run / Clear live in the column header.
 */
@Component({
  selector: 'app-nmf-pipeline-problems',
  templateUrl: './pipeline-problems.component.html',
  styleUrls: ['./pipeline-problems.component.scss'],
  standalone: false,
})
export class NmfPipelineProblemsComponent {
  @Input() problems: RaaProblem[] = [];

  /** One error repaints the whole strip: the run did not produce a result. */
  get hasError(): boolean {
    return this.problems.some((problem) => problem.severity === 'error');
  }

  translationKey(problem: RaaProblem): string {
    return PROBLEM_PREFIX + problem.key;
  }

  params(problem: RaaProblem): Record<string, string | number> {
    return problem.params ?? {};
  }
}
