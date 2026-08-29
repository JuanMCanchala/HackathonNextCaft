import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CameraConnectivity, IncidentState } from '../../core/models/enums';
import { connectivityLabel, stateLabel } from '../copy/labels';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium"
      [style.color]="color()"
      [style.background]="bg()"
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
    const map: Record<string, string> = {
      detected: 'var(--sentra-severity-high)',
      triaged: 'var(--sentra-warn)',
      acknowledged: 'var(--sentra-signal-cyan)',
      resolved: 'var(--sentra-ok)',
      dismissed: 'var(--sentra-text-low)',
      online: 'var(--sentra-ok)',
      offline: 'var(--sentra-severity-critical)',
      degraded: 'var(--sentra-warn)',
      unknown: 'var(--sentra-text-low)',
    };
    return map[v] ?? 'var(--sentra-text-mid)';
  });

  readonly bg = computed(() => {
    const v = this.value();
    if (v === 'offline') return 'var(--sentra-severity-critical-dim)';
    if (v === 'online' || v === 'resolved') return 'var(--sentra-ok-dim)';
    if (v === 'degraded' || v === 'triaged' || v === 'detected') return 'var(--sentra-warn-dim)';
    return 'var(--sentra-signal-cyan-dim)';
  });
}
