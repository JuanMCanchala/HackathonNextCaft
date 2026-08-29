import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { CameraStore } from './camera.store';
import { CameraCardComponent } from '../../shared/ui/camera-card.component';
import { FilterBarComponent, type CameraFilterValue } from '../../shared/ui/filter-bar.component';
import { LoadingStateComponent } from '../../shared/ui/loading-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';

@Component({
  selector: 'app-cameras-page',
  standalone: true,
  providers: [CameraStore],
  imports: [
    CameraCardComponent,
    FilterBarComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="font-display text-2xl text-[var(--sentra-text-hi)]">Cámaras</h1>
        <p class="mt-1 text-sm text-[var(--sentra-text-mid)]">
          Grid con estado admin y conectividad
        </p>
      </div>

      <app-filter-bar
        mode="cameras"
        [cameraFilters]="{
          adminStatus: store.adminStatus(),
          connectivity: store.connectivity(),
        }"
        (cameraChange)="onFilters($event)"
      />

      @if (store.loading() && store.page().items.length === 0) {
        <app-loading-state />
      } @else if (store.error(); as err) {
        <app-error-state [error]="err" (retry)="store.load()" />
      } @else if (store.page().items.length === 0) {
        <app-empty-state title="Sin cámaras" description="Ajusta los filtros o revisa el workspace." />
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          @for (cam of store.page().items; track cam.id) {
            <app-camera-card
              [camera]="cam"
              [highlighted]="store.highlightedCameraIds().has(cam.id)"
            />
          }
        </div>
        @if (store.page().hasMore) {
          <button
            type="button"
            class="rounded border border-[var(--sentra-line)] px-4 py-2 text-sm"
            (click)="store.loadMore()"
          >
            Cargar más
          </button>
        }
      }
    </div>
  `,
})
export class CamerasPageComponent implements OnInit {
  readonly store = inject(CameraStore);

  ngOnInit(): void {
    void this.store.load();
  }

  onFilters(f: CameraFilterValue): void {
    this.store.setFilters(f.adminStatus, f.connectivity);
  }
}
