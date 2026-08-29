import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { BACKEND_CAPABILITIES } from '../../core/config/backend-capabilities';
import { PermissionService } from '../../core/permissions/permission.service';
import { CameraStore } from './camera.store';
import { CameraCardComponent } from '../../shared/ui/camera-card.component';
import { FilterBarComponent, type CameraFilterValue } from '../../shared/ui/filter-bar.component';
import { LoadingStateComponent } from '../../shared/ui/loading-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import {
  HlmButtonDirective,
  HlmCardComponent,
  HlmCardContentComponent,
  HlmCardDescriptionComponent,
  HlmCardHeaderComponent,
  HlmCardTitleComponent,
  HlmInputDirective,
} from '../../shared/ui/primitives';

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
    HlmCardComponent,
    HlmCardHeaderComponent,
    HlmCardTitleComponent,
    HlmCardDescriptionComponent,
    HlmCardContentComponent,
    HlmButtonDirective,
    HlmInputDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-2xl font-semibold tracking-tight text-foreground">Cámaras</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Datos reales del workspace en Convex
          </p>
        </div>
      </div>

      @if (canRegister()) {
        <hlm-card class="gap-4 p-6">
          <hlm-card-header>
            <hlm-card-title class="text-base">Registrar cámara</hlm-card-title>
            <hlm-card-description>
              Llama a <code class="font-mono text-xs">cameras.create</code> en Convex (requiere workspace_admin).
            </hlm-card-description>
          </hlm-card-header>
          <hlm-card-content class="grid gap-4 sm:grid-cols-3">
            <label class="block text-xs uppercase tracking-wide text-muted-foreground">
              ID externo
              <input
                hlmInput
                class="mt-2"
                placeholder="ENT-01"
                [value]="externalId()"
                (input)="externalId.set($any($event).target.value)"
              />
            </label>
            <label class="block text-xs uppercase tracking-wide text-muted-foreground">
              Etiqueta
              <input
                hlmInput
                class="mt-2"
                placeholder="Entrada principal"
                [value]="label()"
                (input)="label.set($any($event).target.value)"
              />
            </label>
            <label class="block text-xs uppercase tracking-wide text-muted-foreground">
              Ubicación (opcional)
              <input
                hlmInput
                class="mt-2"
                placeholder="Lobby norte"
                [value]="location()"
                (input)="location.set($any($event).target.value)"
              />
            </label>
            <div class="sm:col-span-3">
              <button
                type="button"
                hlmBtn
                [disabled]="!canSubmit() || store.loading()"
                (click)="register()"
              >
                {{ store.loading() ? 'Registrando…' : 'Registrar cámara' }}
              </button>
            </div>
          </hlm-card-content>
        </hlm-card>
      }

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
        <app-empty-state
          title="Sin cámaras en este workspace"
          description="Registra la primera cámara arriba. Los incidentes llegarán cuando el pipeline de visión envíe detecciones a Convex."
        />
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
          <button type="button" hlmBtn variant="outline" (click)="store.loadMore()">
            Cargar más
          </button>
        }
      }
    </div>
  `,
})
export class CamerasPageComponent implements OnInit {
  readonly store = inject(CameraStore);
  private readonly permissions = inject(PermissionService);
  private readonly caps = inject(BACKEND_CAPABILITIES);

  readonly externalId = signal('');
  readonly label = signal('');
  readonly location = signal('');

  readonly canRegister = computed(
    () => this.caps.cameraCreate && this.permissions.can('camera:write'),
  );

  ngOnInit(): void {
    void this.store.load();
  }

  canSubmit(): boolean {
    return this.externalId().trim().length > 0 && this.label().trim().length > 0;
  }

  onFilters(f: CameraFilterValue): void {
    this.store.setFilters(f.adminStatus, f.connectivity);
  }

  register(): void {
    void this.store
      .create({
        externalId: this.externalId(),
        label: this.label(),
        location: this.location() || undefined,
      })
      .then(() => {
        this.externalId.set('');
        this.label.set('');
        this.location.set('');
      });
  }
}
