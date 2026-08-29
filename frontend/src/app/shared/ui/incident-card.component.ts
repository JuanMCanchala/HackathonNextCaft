import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { IncidentSummary } from '../../core/models/incident';
import { CategoryLabelComponent } from './category-label.component';
import { SeverityBadgeComponent } from './severity-badge.component';
import { StatusBadgeComponent } from './status-badge.component';

@Component({
  selector: 'app-incident-card',
  standalone: true,
  imports: [RouterLink, StatusBadgeComponent, SeverityBadgeComponent, CategoryLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      [routerLink]="['/incidents', incident().id]"
      class="block rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel)] p-4 transition hover:border-[var(--sentra-line-bright)]"
    >
      <div class="flex flex-wrap items-center gap-2">
        <app-status-badge kind="incident" [value]="incident().state" />
        <app-severity-badge [severity]="incident().severity" />
      </div>
      <div class="mt-3">
        <app-category-label [category]="incident().category" />
      </div>
      <div class="mt-2 flex justify-between gap-2 font-mono text-[10px] text-[var(--sentra-text-low)]">
        <span>{{ incident().cameraId }}</span>
        <span>{{ incident().openedAt }}</span>
      </div>
      <div class="mt-1 text-xs text-[var(--sentra-text-mid)]">
        {{ incident().assignedToSubjectId ? 'Asignado: ' + incident().assignedToSubjectId : 'Sin asignar' }}
      </div>
    </a>
  `,
})
export class IncidentCardComponent {
  readonly incident = input.required<IncidentSummary>();
}
