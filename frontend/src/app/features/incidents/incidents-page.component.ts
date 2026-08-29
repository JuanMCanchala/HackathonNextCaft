import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { IncidentStore } from './incident.store';
import { FilterBarComponent, type IncidentFilterValue } from '../../shared/ui/filter-bar.component';
import { IncidentCardComponent } from '../../shared/ui/incident-card.component';
import { LoadingStateComponent } from '../../shared/ui/loading-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { HlmButtonDirective } from '../../shared/ui/primitives';
import type { IncidentState, OperationalSeverity } from '../../core/models/enums';

@Component({
  selector: 'app-incidents-page',
  standalone: true,
  providers: [IncidentStore],
  imports: [
    FilterBarComponent,
    IncidentCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    HlmButtonDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="font-display text-2xl font-semibold tracking-tight text-foreground">Incidentes</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Filtros · paginación por cursor
          @if (store.latestLiveId()) {
            <span class="ml-2 text-primary">· live {{ store.latestLiveId() }}</span>
          }
        </p>
      </div>

      <app-filter-bar
        mode="incidents"
        [incidentFilters]="incidentFilters()"
        (incidentChange)="onFilters($event)"
      />

      @if (store.loading() && store.page().items.length === 0) {
        <app-loading-state />
      } @else if (store.error(); as err) {
        <app-error-state [error]="err" (retry)="store.loadList()" />
      } @else if (store.page().items.length === 0) {
        <app-empty-state title="Sin incidentes" />
      } @else {
        <div class="grid gap-3 lg:grid-cols-2">
          @for (inc of store.page().items; track inc.id) {
            <app-incident-card [incident]="inc" />
          }
        </div>
        @if (store.page().hasMore) {
          <button type="button" hlmBtn variant="outline" (click)="store.loadMore()">
            Cargar más
          </button>
        }
      }
    </div>
  `,
})
export class IncidentsPageComponent implements OnInit {
  readonly store = inject(IncidentStore);

  readonly incidentFilters = computed((): IncidentFilterValue => {
    const f = this.store.filters();
    return {
      state: f.state ? (Array.isArray(f.state) ? f.state : [f.state]) : [],
      severity: f.severity ? (Array.isArray(f.severity) ? f.severity : [f.severity]) : [],
      category: f.category ?? '',
      cameraId: f.cameraId ?? '',
    };
  });

  ngOnInit(): void {
    void this.store.loadList();
  }

  onFilters(f: IncidentFilterValue): void {
    this.store.setFilters({
      state: f.state.length ? (f.state as IncidentState[]) : undefined,
      severity: f.severity.length ? (f.severity as OperationalSeverity[]) : undefined,
      category: f.category || undefined,
      cameraId: f.cameraId || undefined,
    });
  }
}
