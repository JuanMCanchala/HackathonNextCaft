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
          <h2 class="mb-3 text-sm uppercase tracking-wide text-[var(--sentra-text-low)]">
            Qué ocurrió
          </h2>

          @if (clipUrl(); as clip) {
            <video
              [src]="clip"
              controls
              autoplay
              muted
              loop
              playsinline
              class="mb-4 block w-full rounded-lg border border-[var(--sentra-line)] bg-black"
            ></video>
          } @else if (imagenUrl(); as img) {
            <img
              [src]="img"
              alt="Momento de la detección"
              class="mb-4 block w-full rounded-lg border border-[var(--sentra-line)] bg-black"
            />
          }

          @if (analisis(); as texto) {
            <div
              class="rounded-lg border border-[var(--sentra-line)] border-l-4 border-l-[var(--sentra-signal-cyan)] bg-[var(--sentra-bg-panel)] p-4"
            >
              <p class="mb-2 font-mono text-[10px] uppercase tracking-widest text-[var(--sentra-text-low)]">
                Análisis de la escena
              </p>
              <p class="max-w-[64ch] leading-relaxed text-[var(--sentra-text-hi)]">{{ texto }}</p>
              <p class="mt-3 font-mono text-[11px] text-[var(--sentra-text-low)]">
                Verificado por Gemini
              </p>
            </div>
          } @else if (!clipUrl() && !imagenUrl()) {
            <p class="text-sm text-[var(--sentra-text-mid)]">
              Este incidente no guardó grabación ni análisis. Ocurre con los registrados antes
              de que el sistema los almacenara.
            </p>
          }
        </section>

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

  /**
   * Las referencias vienen como `url#mime`: el almacenamiento de Convex sirve
   * todo bajo la misma ruta sin extension, asi que sin esa marca no hay forma
   * de saber si una referencia es la imagen del correo o el clip del panel.
   * Las antiguas no la llevan y cuentan como imagen, que es lo que eran.
   */
  private evidencias(): Array<{ url: string; mime: string }> {
    return this.store
      .detections()
      .flatMap((d) => d.evidenceIds)
      .filter((ref) => this.isUrl(ref))
      .map((ref) => {
        const corte = ref.indexOf('#');
        return corte === -1
          ? { url: ref, mime: 'image/jpeg' }
          : { url: ref.slice(0, corte), mime: ref.slice(corte + 1) };
      });
  }

  clipUrl(): string | null {
    return this.evidencias().find((e) => e.mime.startsWith('video/'))?.url ?? null;
  }

  imagenUrl(): string | null {
    return this.evidencias().find((e) => e.mime.startsWith('image/'))?.url ?? null;
  }

  /** Lo que el verificador describio de la escena, si quedo guardado. */
  analisis(): string | null {
    for (const deteccion of this.store.detections()) {
      const texto = deteccion.metadata?.['summary'];
      if (typeof texto === 'string' && texto.trim().length > 0) {
        return texto;
      }
    }
    return null;
  }
}
