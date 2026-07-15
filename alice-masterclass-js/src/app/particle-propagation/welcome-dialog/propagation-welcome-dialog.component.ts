import { Component } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Auto-opened on first entry into the module (`ParticlePropagationComponent.ngAfterViewInit`),
 * mirroring `LsaTutorialWelcomeDialogComponent`'s standalone dialog pattern. Closing with
 * `start()` (result `true`) triggers `onStartAnimation()` in the caller; `skip()` (result
 * `false`) or dismissing leaves the module idle until the user presses "Start animation" themselves.
 */
@Component({
  selector: 'app-propagation-welcome-dialog',
  templateUrl: './propagation-welcome-dialog.component.html',
  styleUrls: ['./propagation-welcome-dialog.component.scss'],
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TranslateModule],
})
export class PropagationWelcomeDialogComponent {
  constructor(private readonly dialogRef: MatDialogRef<PropagationWelcomeDialogComponent, boolean>) {}

  skip(): void {
    this.dialogRef.close(false);
  }

  start(): void {
    this.dialogRef.close(true);
  }
}
