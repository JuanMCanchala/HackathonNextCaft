import { ChangeDetectionStrategy, Component, inject, input, OnInit } from '@angular/core';
import { IncidentStore } from './incident.store';
import { TransitionActionsComponent } from './transition-actions.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { SeverityBadgeComponent } from '../../shared/ui/severity-badge.component';
import { CategoryLabelComponent } from '../../shared/ui/category-label.component';
import { TimelineViewComponent } from '../../shared/ui/timeline-view.component';
import { ConfidenceIndicatorComponent } from '../../shared/ui/confidence-indicator.component';
import { AdditionalDetailsComponent } from '../../shared/ui/additional-details.component';
import { EvidenceViewerComponent } from '../detections/evidence-viewer.component';
import { LoadingStateComponent } from '../../shared/ui/loading-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import type { OperationalSeverity } from '../../core/models/enums';

@Component({
  selector: 'app-incident-detail-page',
  standalone: true,
  providers: [IncidentStore],
  imports: [
    TransitionActionsComponent,
    StatusBadgeComponent,
    SeverityBadgeComponent,
    CategoryLabelComponent,
    TimelineViewComponent,
    ConfidenceIndicatorComponent,
    AdditionalDetailsComponent,
    EvidenceViewerComponent,
    LoadingStateComponent,
    ErrorStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.loading() && !store.detail()) {
      <app-loading-state />
    } @else if (store.error(); as err) {
      <app-error-state [error]="err" (retry)="store.loadDetail(id())" />
    } @else if (store.detail(); as inc) {
      <div class="space-y-8">
        @if (store.conflict()) {
          <div
            class="rounded border border-[var(--sentra-warn)] bg-[var(--sentra-warn-dim)] px-3 py-2 text-sm"
            role="status"
          >
            Conflicto de versión — recurso actualizado.
          </div>
        }

        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 class="font-display text-2xl text-[var(--sentra-text-hi)]">
              <app-category-label [category]="inc.category" />
            </h1>
            <p class="mt-1 font-mono text-xs text-[var(--sentra-text-low)]">{{ inc.id }}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <app-status-badge kind="incident" [value]="inc.state" />
              <app-severity-badge [severity]="inc.severity" />
            </div>
            <dl class="mt-4 grid gap-1 text-xs text-[var(--sentra-text-mid)] sm:grid-cols-2">
              <div>Inicial: {{ inc.initialSeverity }}</div>
              <div>
                Override:
                {{
                  inc.severityOverride
                    ? inc.severityOverride.from + ' → ' + inc.severityOverride.to
                    : '—'
                }}
              </div>
              <div>Cámara: {{ inc.cameraId }}</div>
              <div>
                Asignado:
                {{ inc.assignedToSubjectId || 'Sin asignar' }}
              </div>
              <div class="font-mono">v{{ inc.version }}</div>
            </dl>
          </div>

          <app-transition-actions
            [state]="inc.state"
            [severity]="inc.severity"
            [busy]="store.loading()"
            (triage)="store.triage({})"
            (acknowledge)="store.acknowledge({})"
            (resolve)="store.resolve({})"
            (dismiss)="store.dismiss({ reason: $event })"
            (severityChange)="store.patchSeverity($event)"
          />
        </div>

        <section>
          <h2 class="mb-3 text-sm uppercase tracking-wide text-[var(--sentra-text-low)]">Timeline</h2>
          <app-timeline-view [entries]="inc.timeline" />
        </section>

        <section>
          <h2 class="mb-3 text-sm uppercase tracking-wide text-[var(--sentra-text-low)]">
            Detecciones
          </h2>
          <ul class="space-y-3">
            @for (det of store.detections(); track det.id) {
              <li class="rounded border border-[var(--sentra-line)] p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <app-category-label [category]="det.category" />
                  <app-confidence-indicator [confidence]="det.confidence" />
                </div>
                <div class="mt-1 font-mono text-[10px] text-[var(--sentra-text-low)]">
                  {{ det.occurredAt }} · conf {{ det.confidence }} · {{ det.modelVersion }}
                </div>
                <app-additional-details class="mt-2 block" [metadata]="det.metadata" />
              </li>
            } @empty {
              @if (inc.detectionIds.length) {
                <ul class="space-y-1 font-mono text-xs text-[var(--sentra-text-mid)]">
                  @for (did of inc.detectionIds; track did) {
                    <li>{{ did }}</li>
                  }
                </ul>
                <p class="mt-2 text-xs text-[var(--sentra-text-low)]">
                  El backend MVP solo expone IDs de detección en el detalle (sin listado nested).
                </p>
              } @else {
                <p class="text-sm text-[var(--sentra-text-mid)]">Sin detecciones.</p>
              }
            }
          </ul>
        </section>

        <section>
          <h2 class="mb-3 text-sm uppercase tracking-wide text-[var(--sentra-text-low)]">Evidencia</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            @for (ev of store.evidence(); track ev.id) {
              <app-evidence-viewer [descriptor]="ev" />
            } @empty {
              @if (inc.evidenceIds.length) {
                <ul class="col-span-full space-y-2">
                  @for (ref of inc.evidenceIds; track ref) {
                    <li class="rounded border border-[var(--sentra-line)] p-3 text-xs">
                      @if (isUrl(ref)) {
                        <a
                          class="break-all text-[var(--sentra-signal-cyan)] underline"
                          [href]="ref"
                          target="_blank"
                          rel="noopener noreferrer"
                        >{{ ref }}</a>
                      } @else {
                        <span class="font-mono break-all text-[var(--sentra-text-mid)]">{{ ref }}</span>
                      }
                    </li>
                  }
                </ul>
                <p class="col-span-full text-xs text-[var(--sentra-text-low)]">
                  Refs de evidencia del intake (sin access grant en MVP).
                </p>
              } @else {
                <p class="text-sm text-[var(--sentra-text-mid)]">Sin evidencia.</p>
              }
            }
          </div>
        </section>
      </div>
    }
  `,
})
export class IncidentDetailPageComponent implements OnInit {
  readonly id = input.required<string>();
  readonly store = inject(IncidentStore);

  ngOnInit(): void {
    void this.store.loadDetail(this.id());
  }

  isUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }
}
