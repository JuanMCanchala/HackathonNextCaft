import { ChangeDetectionStrategy, Component, inject, input, OnInit } from '@angular/core';
import { CameraStore } from './camera.store';
import { CameraDetailStore } from './camera-detail.store';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { ConfidenceIndicatorComponent } from '../../shared/ui/confidence-indicator.component';
import { CategoryLabelComponent } from '../../shared/ui/category-label.component';
import { AdditionalDetailsComponent } from '../../shared/ui/additional-details.component';
import { LoadingStateComponent } from '../../shared/ui/loading-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { adminStatusLabel } from '../../shared/copy/labels';

@Component({
  selector: 'app-camera-detail-page',
  standalone: true,
  providers: [CameraStore, CameraDetailStore],
  imports: [
    StatusBadgeComponent,
    ConfidenceIndicatorComponent,
    CategoryLabelComponent,
    AdditionalDetailsComponent,
    LoadingStateComponent,
    ErrorStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cameraStore.loading() && !cameraStore.selected()) {
      <app-loading-state />
    } @else if (cameraStore.error(); as err) {
      <app-error-state [error]="err" (retry)="reload()" />
    } @else if (cameraStore.selected(); as cam) {
      <div class="space-y-6">
        <div>
          <h1 class="font-display text-2xl text-[var(--sentra-text-hi)]">{{ cam.label }}</h1>
          <p class="mt-1 font-mono text-xs text-[var(--sentra-text-low)]">{{ cam.id }} · {{ cam.externalId }}</p>
        </div>

        <div class="flex flex-wrap gap-3">
          <app-status-badge kind="connectivity" [value]="cam.connectivity" />
          <span class="text-xs text-[var(--sentra-text-mid)]">{{ adminStatusLabel(cam.adminStatus) }}</span>
          <span class="font-mono text-xs text-[var(--sentra-text-low)]">
            HB {{ cam.lastHeartbeatAt || '—' }}
          </span>
        </div>

        <div
          class="relative flex h-56 items-center justify-center overflow-hidden rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel-2)]"
          aria-label="Placeholder de stream"
        >
          <div class="text-center">
            <div class="font-mono text-xs text-[var(--sentra-text-low)]">STREAM PLACEHOLDER</div>
            <div class="mt-2 text-sm text-[var(--sentra-text-mid)]">{{ cam.location || 'Sin ubicación' }}</div>
          </div>
          @if (detailStore.detections()[0]; as det) {
            <div
              class="absolute inset-x-8 top-8 rounded border border-[var(--sentra-signal-cyan)]/50 bg-[var(--sentra-bg-void)]/70 p-3"
            >
              <div class="text-xs text-[var(--sentra-signal-cyan)]">Detection overlay</div>
              <app-category-label [category]="det.category" />
              <app-confidence-indicator [confidence]="det.confidence" />
            </div>
          }
        </div>

        <section>
          <h2 class="mb-3 text-sm uppercase tracking-wide text-[var(--sentra-text-low)]">
            Detecciones recientes
          </h2>
          @if (detailStore.loading()) {
            <app-loading-state message="Cargando detecciones…" />
          } @else {
            <ul class="space-y-3">
              @for (det of detailStore.detections(); track det.id) {
                <li class="rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel)] p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <app-category-label [category]="det.category" />
                    <app-confidence-indicator [confidence]="det.confidence" />
                  </div>
                  <div class="mt-2 font-mono text-[10px] text-[var(--sentra-text-low)]">
                    {{ det.occurredAt }} · {{ det.modelVersion }}
                  </div>
                  <div class="mt-2">
                    <app-additional-details [metadata]="$any(det).metadata" />
                  </div>
                </li>
              } @empty {
                <p class="text-sm text-[var(--sentra-text-mid)]">Sin detecciones vinculadas.</p>
              }
            </ul>
          }
        </section>
      </div>
    }
  `,
})
export class CameraDetailPageComponent implements OnInit {
  readonly id = input.required<string>();
  readonly cameraStore = inject(CameraStore);
  readonly detailStore = inject(CameraDetailStore);
  private readonly workspace = inject(WorkspaceContextService);
  protected readonly adminStatusLabel = adminStatusLabel;

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    await this.cameraStore.loadOne(this.id());
    const ws = this.workspace.workspaceId();
    if (ws) await this.detailStore.loadDetectionsForCamera(this.id(), ws);
  }
}
