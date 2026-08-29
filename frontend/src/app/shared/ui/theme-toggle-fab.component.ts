import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LucideMoon, LucideSun } from '@lucide/angular';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'app-theme-toggle-fab',
  standalone: true,
  imports: [LucideSun, LucideMoon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="theme-fab"
      (click)="theme.toggle()"
      [attr.aria-label]="label()"
      [title]="label()"
    >
      @if (isDark()) {
        <svg lucideSun [size]="18" aria-hidden="true"></svg>
      } @else {
        <svg lucideMoon [size]="18" aria-hidden="true"></svg>
      }
    </button>
  `,
  styles: `
    .theme-fab {
      position: fixed;
      right: 1.25rem;
      bottom: 1.25rem;
      z-index: 50;
      display: flex;
      height: 2.75rem;
      width: 2.75rem;
      align-items: center;
      justify-content: center;
      border-radius: 9999px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--primary);
      box-shadow: var(--sentra-shadow-panel);
      transition:
        transform 0.15s ease,
        border-color 0.15s ease,
        background 0.15s ease;
    }

    .theme-fab:hover {
      transform: scale(1.05);
      border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
      background: var(--accent);
    }

    .theme-fab:active {
      transform: scale(0.97);
    }
  `,
})
export class ThemeToggleFabComponent {
  readonly theme = inject(ThemeService);

  readonly isDark = computed(() => this.theme.resolved() === 'dark');

  readonly label = computed(() =>
    this.isDark() ? 'Activar modo claro' : 'Activar modo oscuro',
  );
}
