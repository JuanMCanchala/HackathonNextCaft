import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Camera } from '../../core/models/camera';
import { adminStatusLabel } from '../copy/labels';
import { StatusBadgeComponent } from './status-badge.component';
import { HlmBadgeDirective, HlmCardComponent, HlmCardContentComponent } from './primitives';

@Component({
  selector: 'app-camera-card',
  standalone: true,
  imports: [
    RouterLink,
    StatusBadgeComponent,
    HlmCardComponent,
    HlmCardContentComponent,
    HlmBadgeDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="['/cameras', camera().id]" class="block transition hover:brightness-110">
      <hlm-card
        class="overflow-hidden p-0"
        [class.border-destructive]="highlighted()"
        [class.ring-1]="highlighted()"
        [class.ring-destructive]="highlighted()"
      >
        <div
          class="relative flex h-28 items-end bg-muted/50 p-3"
          [style.box-shadow]="highlighted() ? 'inset 3px 0 0 var(--destructive)' : null"
        >
          @if (highlighted()) {
            <span hlmBadge variant="destructive" class="absolute top-2 right-2">LIVE</span>
          }
          <span class="font-mono text-[10px] text-muted-foreground">{{ camera().id }}</span>
        </div>
        <hlm-card-content class="space-y-2 p-4">
          <div class="font-medium text-foreground">{{ camera().label }}</div>
          <div class="text-xs text-muted-foreground">{{ camera().location || 'Sin ubicación' }}</div>
          <div class="flex flex-wrap items-center gap-2">
            <app-status-badge kind="connectivity" [value]="camera().connectivity" />
            <span class="text-[10px] text-muted-foreground">{{
              adminStatusLabel(camera().adminStatus)
            }}</span>
          </div>
          <div class="font-mono text-[10px] text-muted-foreground">
            HB {{ camera().lastHeartbeatAt || '—' }}
          </div>
        </hlm-card-content>
      </hlm-card>
    </a>
  `,
})
export class CameraCardComponent {
  readonly camera = input.required<Camera>();
  readonly highlighted = input(false);
  protected readonly adminStatusLabel = adminStatusLabel;
}
