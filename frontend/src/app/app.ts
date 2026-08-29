import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeToggleFabComponent } from './shared/ui/theme-toggle-fab.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ThemeToggleFabComponent],
  template: `
    <router-outlet />
    <app-theme-toggle-fab />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
