import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Camera } from '../../core/models/camera';
import { adminStatusLabel } from '../copy/labels';
import { StatusBadgeComponent } from './status-badge.component';

@Component({
  selector: 'app-camera-card',
  standalone: true,
  imports: [RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      [routerLink]="['/cameras', camera().id]"
      class="block rounded border bg-[var(--sentra-bg-panel)] p-0 transition hover:border-[var(--sentra-line-bright)]"
      [class.border-[var(--sentra-severity-critical)]]="highlighted()"
      [class.border-[var(--sentra-line)]]="!highlighted()"
      [class.ring-1]="highlighted()"
      [style.--tw-ring-color]="highlighted() ? 'var(--sentra-severity-critical)' : null"
    >
      <div
        class="relative flex h-28 items-end bg-[var(--sentra-bg-panel-2)] p-3"
        [style.box-shadow]="
          highlighted() ? 'inset 3px 0 0 var(--sentra-severity-critical)' : null
        "
      >
        @if (highlighted()) {
          <span
            class="absolute top-2 right-2 rounded bg-[var(--sentra-severity-critical-dim)] px-1.5 py-0.5 text-[10px] text-[var(--sentra-severity-critical)]"
          >
            LIVE
          </span>
        }
        <span class="font-mono text-[10px] text-[var(--sentra-text-low)]">{{ camera().id }}</span>
      </div>
      <div class="space-y-2 p-3">
        <div class="font-medium text-[var(--sentra-text-hi)]">{{ camera().label }}</div>
        <div class="text-xs text-[var(--sentra-text-mid)]">{{ camera().location || 'Sin ubicación' }}</div>
        <div class="flex flex-wrap items-center gap-2">
          <app-status-badge kind="connectivity" [value]="camera().connectivity" />
          <span class="text-[10px] text-[var(--sentra-text-low)]">{{ adminStatusLabel(camera().adminStatus) }}</span>
        </div>
        <div class="font-mono text-[10px] text-[var(--sentra-text-low)]">
          HB {{ camera().lastHeartbeatAt || '—' }}
        </div>
      </div>
    </a>
  `,
})
export class CameraCardComponent {
  readonly camera = input.required<Camera>();
  readonly highlighted = input(false);
  protected readonly adminStatusLabel = adminStatusLabel;
}
