import { Injectable, computed, inject, signal } from '@angular/core';
import { INCIDENT_REPOSITORY } from '../../core/config/injection-tokens';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { RealtimeStore } from '../../core/realtime/realtime.store';
import type { IncidentDetail, IncidentSummary } from '../../core/models/incident';
import type { Detection } from '../../core/models/detection';
import type { EvidenceDescriptor } from '../../core/models/evidence';
import type {
  DismissRequest,
  ListIncidentsQuery,
  PatchIncidentRequest,
  TransitionRequest,
  TriageRequest,
} from '../../core/models/requests';
import type { NormalizedError } from '../../core/models/errors';
import type { Page } from '../../core/models/page';
import { SentraHttpError } from '../../core/http/error.interceptor';
import { clampLimit } from '../../core/validation/schemas';

@Injectable()
export class IncidentStore {
  private readonly repo = inject(INCIDENT_REPOSITORY);
  private readonly workspace = inject(WorkspaceContextService);
  private readonly realtime = inject(RealtimeStore);

  private readonly _page = signal<Page<IncidentSummary>>({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  private readonly _detail = signal<IncidentDetail | null>(null);
  private readonly _detections = signal<Detection[]>([]);
  private readonly _evidence = signal<EvidenceDescriptor[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<NormalizedError | null>(null);
  private readonly _filters = signal<Partial<ListIncidentsQuery>>({});
  private readonly _conflict = signal(false);

  readonly page = computed(() => {
    const base = this._page();
    const live = this.realtime.liveIncidents();
    const f = this._filters();
    let liveFiltered = [...live];
    if (f.cameraId) liveFiltered = liveFiltered.filter((i) => i.cameraId === f.cameraId);
    if (f.category) liveFiltered = liveFiltered.filter((i) => i.category === f.category);
    if (f.state) {
      const states = Array.isArray(f.state) ? f.state : [f.state];
      liveFiltered = liveFiltered.filter((i) => states.includes(i.state));
    }
    if (f.severity) {
      const sevs = Array.isArray(f.severity) ? f.severity : [f.severity];
      liveFiltered = liveFiltered.filter((i) => sevs.includes(i.severity));
    }

    const seen = new Set<string>();
    const items: IncidentSummary[] = [];
    for (const item of [...liveFiltered, ...base.items]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
    return { ...base, items };
  });

  readonly detail = this._detail.asReadonly();
  readonly detections = computed(() => {
    const rest = this._detections();
    const live = this.realtime.liveDetections();
    const detailId = this._detail()?.id;
    const related = live.filter((d) => d.incidentId === detailId);
    const seen = new Set<string>();
    const out: Detection[] = [];
    for (const d of [...related, ...rest]) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
    }
    return out;
  });
  readonly evidence = this._evidence.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly filters = this._filters.asReadonly();
  readonly conflict = this._conflict.asReadonly();
  readonly latestLiveId = this.realtime.latestIncidentId;

  setFilters(partial: Partial<ListIncidentsQuery>): void {
    this._filters.set(partial);
    void this.loadList(true);
  }

  async loadList(reset = true): Promise<void> {
    const workspaceId = this.workspace.workspaceId();
    if (!workspaceId) return;
    this._loading.set(true);
    this._error.set(null);
    try {
      const f = this._filters();
      const page = await this.repo.list({
        workspaceId,
        ...f,
        cursor: reset ? undefined : this._page().nextCursor ?? undefined,
        limit: clampLimit(f.limit ?? 25),
      });
      this._page.set(
        reset
          ? page
          : {
              items: [...this._page().items, ...page.items],
              nextCursor: page.nextCursor,
              hasMore: page.hasMore,
            },
      );
    } catch (err) {
      this.capture(err, 'Error al listar incidentes');
    } finally {
      this._loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    if (this._page().hasMore) await this.loadList(false);
  }

  async loadDetail(id: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    this._conflict.set(false);
    try {
      const detail = await this.repo.get(id);
      this._detail.set(detail);
      const [dets, ev] = await Promise.all([
        this.repo.listDetections(id),
        this.repo.listEvidence(id),
      ]);
      this._detections.set(dets.items);
      this._evidence.set(ev.items);
    } catch (err) {
      this.capture(err, 'Error al cargar incidente');
    } finally {
      this._loading.set(false);
    }
  }

  async triage(body: Omit<TriageRequest, 'expectedVersion'>): Promise<void> {
    const d = this._detail();
    if (!d) return;
    await this.runMutation(() => this.repo.triage(d.id, { ...body, expectedVersion: d.version }));
  }

  async acknowledge(body: Omit<TransitionRequest, 'expectedVersion'> = {}): Promise<void> {
    const d = this._detail();
    if (!d) return;
    await this.runMutation(() =>
      this.repo.acknowledge(d.id, { ...body, expectedVersion: d.version }),
    );
  }

  async resolve(body: Omit<TransitionRequest, 'expectedVersion'> = {}): Promise<void> {
    const d = this._detail();
    if (!d) return;
    await this.runMutation(() => this.repo.resolve(d.id, { ...body, expectedVersion: d.version }));
  }

  async dismiss(body: Omit<DismissRequest, 'expectedVersion'>): Promise<void> {
    const d = this._detail();
    if (!d) return;
    await this.runMutation(() => this.repo.dismiss(d.id, { ...body, expectedVersion: d.version }));
  }

  async patchSeverity(body: Omit<PatchIncidentRequest, 'expectedVersion'>): Promise<void> {
    const d = this._detail();
    if (!d) return;
    await this.runMutation(() => this.repo.patch(d.id, { ...body, expectedVersion: d.version }));
  }

  private async runMutation(fn: () => Promise<IncidentDetail>): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const updated = await fn();
      this._detail.set(updated);
      this._conflict.set(false);
    } catch (err) {
      if (err instanceof SentraHttpError && (err.normalized.code === 'CONFLICT' || err.normalized.code === 'IDEMPOTENCY_CONFLICT')) {
        this._conflict.set(true);
        const id = this._detail()?.id;
        if (id) await this.loadDetail(id);
      } else {
        this.capture(err, 'Error en la transición');
      }
    } finally {
      this._loading.set(false);
    }
  }

  private capture(err: unknown, fallback: string): void {
    this._error.set(
      err instanceof SentraHttpError
        ? err.normalized
        : { code: 'INTERNAL_ERROR', message: fallback, requestId: 'client', httpStatus: 500 },
    );
  }
}
