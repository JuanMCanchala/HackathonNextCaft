import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { IncidentSummary } from '../../core/models/incident';
import { CategoryLabelComponent } from './category-label.component';
import { SeverityBadgeComponent } from './severity-badge.component';
import { StatusBadgeComponent } from './status-badge.component';
import { HlmCardComponent, HlmCardContentComponent } from './primitives';

@Component({
  selector: 'app-incident-card',
  standalone: true,
  imports: [
    RouterLink,
    StatusBadgeComponent,
    SeverityBadgeComponent,
    CategoryLabelComponent,
    HlmCardComponent,
    HlmCardContentComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="['/incidents', incident().id]" class="block transition hover:brightness-110">
      <hlm-card class="h-full gap-3 p-4 hover:border-primary/40">
        <div class="flex flex-wrap items-center gap-2">
          <app-status-badge kind="incident" [value]="incident().state" />
          <app-severity-badge [severity]="incident().severity" />
        </div>
        <hlm-card-content class="space-y-2 p-0">
          <app-category-label [category]="incident().category" />
          <div class="flex justify-between gap-2 font-mono text-[10px] text-muted-foreground">
            <span>{{ incident().cameraId }}</span>
            <span>{{ incident().openedAt }}</span>
          </div>
          <div class="text-xs text-muted-foreground">
            {{
              incident().assignedToSubjectId
                ? 'Asignado: ' + incident().assignedToSubjectId
                : 'Sin asignar'
            }}
          </div>
        </hlm-card-content>
      </hlm-card>
    </a>
  `,
})
export class IncidentCardComponent {
  readonly incident = input.required<IncidentSummary>();
}
