import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CameraConnectivity, IncidentState } from '../../core/models/enums';
import { connectivityLabel, stateLabel } from '../copy/labels';
import { incidentStateBg, incidentStateColor, connectivityColor } from '../design/tokens';
import { HlmBadgeDirective } from './primitives';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [HlmBadgeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      hlmBadge
      variant="outline"
      [style.color]="color()"
      [style.background]="bg()"
      [style.borderColor]="color()"
      [attr.aria-label]="label()"
    >
      <span class="h-1.5 w-1.5 rounded-full" [style.background]="color()" aria-hidden="true"></span>
      {{ label() }}
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly kind = input.required<'incident' | 'connectivity'>();
  readonly value = input.required<IncidentState | CameraConnectivity>();

  readonly label = computed(() =>
    this.kind() === 'incident'
      ? stateLabel(this.value())
      : connectivityLabel(this.value()),
  );

  readonly color = computed(() => {
    const v = this.value();
    if (this.kind() === 'incident') {
      return incidentStateColor[v] ?? 'var(--sentra-text-mid)';
    }
    return connectivityColor[v] ?? 'var(--sentra-text-mid)';
  });

  readonly bg = computed(() => {
    const v = this.value();
    if (this.kind() === 'incident') {
      return incidentStateBg[v] ?? 'var(--sentra-signal-cyan-dim)';
    }
    if (v === 'offline') return 'var(--sentra-severity-critical-dim)';
    if (v === 'online') return 'var(--sentra-ok-dim)';
    if (v === 'degraded') return 'var(--sentra-warn-dim)';
    return 'var(--sentra-signal-cyan-dim)';
  });
}
