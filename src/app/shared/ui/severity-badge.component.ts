import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OperationalSeverity } from '../../core/models/enums';
import { severityLabel } from '../copy/labels';

@Component({
  selector: 'app-severity-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide"
      [style.color]="color()"
      [style.background]="bg()"
      [attr.aria-label]="'Severidad ' + label()"
    >
      <span aria-hidden="true">{{ icon() }}</span>
      {{ label() }}
    </span>
  `,
})
export class SeverityBadgeComponent {
  readonly severity = input.required<OperationalSeverity>();

  readonly label = computed(() => severityLabel(this.severity()));

  readonly color = computed(() => {
    const map: Record<OperationalSeverity, string> = {
      low: 'var(--sentra-severity-low)',
      medium: 'var(--sentra-severity-medium)',
      high: 'var(--sentra-severity-high)',
      critical: 'var(--sentra-severity-critical)',
    };
    return map[this.severity()];
  });

  readonly bg = computed(() =>
    this.severity() === 'critical'
      ? 'var(--sentra-severity-critical-dim)'
      : 'var(--sentra-bg-panel-2)',
  );

  readonly icon = computed(() => {
    const map: Record<OperationalSeverity, string> = {
      low: '◦',
      medium: '◇',
      high: '◆',
      critical: '▣',
    };
    return map[this.severity()];
  });
}
