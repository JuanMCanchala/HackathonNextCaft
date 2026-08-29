import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OperationalSeverity } from '../../core/models/enums';
import { severityLabel } from '../copy/labels';
import { severityColor } from '../design/tokens';
import { HlmBadgeDirective } from './primitives';

@Component({
  selector: 'app-severity-badge',
  standalone: true,
  imports: [HlmBadgeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      hlmBadge
      variant="outline"
      class="uppercase tracking-wide"
      [style.color]="color()"
      [style.background]="bg()"
      [style.borderColor]="color()"
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
  readonly color = computed(() => severityColor[this.severity()]);
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
