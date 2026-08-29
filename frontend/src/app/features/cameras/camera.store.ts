import { Injectable, computed, inject, signal } from '@angular/core';
import { CAMERA_REPOSITORY } from '../../core/config/injection-tokens';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { RealtimeStore } from '../../core/realtime/realtime.store';
import type { Camera } from '../../core/models/camera';
import type { CameraAdminStatus, CameraConnectivity } from '../../core/models/enums';
import type { NormalizedError } from '../../core/models/errors';
import type { Page } from '../../core/models/page';
import { SentraHttpError } from '../../core/http/error.interceptor';
import { clampLimit } from '../../core/validation/schemas';

@Injectable()
export class CameraStore {
  private readonly repo = inject(CAMERA_REPOSITORY);
  private readonly workspace = inject(WorkspaceContextService);
  private readonly realtime = inject(RealtimeStore);

  private readonly _page = signal<Page<Camera>>({ items: [], nextCursor: null, hasMore: false });
  private readonly _selected = signal<Camera | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<NormalizedError | null>(null);
  private readonly _adminStatus = signal<CameraAdminStatus | ''>('');
  private readonly _connectivity = signal<CameraConnectivity | ''>('');

  readonly page = computed(() => {
    const base = this._page();
    const merged = this.realtime.mergeCameras(base.items);
    const highlighted = this.realtime.highlightedCameraIds();
    return {
      ...base,
      items: [...merged].sort((a, b) => {
        const ha = highlighted.has(a.id) ? 0 : 1;
        const hb = highlighted.has(b.id) ? 0 : 1;
        return ha - hb;
      }),
    };
  });
  readonly selected = this._selected.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly adminStatus = this._adminStatus.asReadonly();
  readonly connectivity = this._connectivity.asReadonly();
  readonly highlightedCameraIds = this.realtime.highlightedCameraIds;

  setFilters(adminStatus: string, connectivity: string): void {
    this._adminStatus.set((adminStatus || '') as CameraAdminStatus | '');
    this._connectivity.set((connectivity || '') as CameraConnectivity | '');
    void this.load(true);
  }

  async load(reset = true): Promise<void> {
    const workspaceId = this.workspace.workspaceId();
    if (!workspaceId) return;

    this._loading.set(true);
    this._error.set(null);

    try {
      const page = await this.repo.list({
        workspaceId,
        adminStatus: this._adminStatus() || undefined,
        connectivity: this._connectivity() || undefined,
        cursor: reset ? undefined : this._page().nextCursor ?? undefined,
        limit: clampLimit(25),
      });

      if (reset) {
        this._page.set(page);
      } else {
        this._page.set({
          items: [...this._page().items, ...page.items],
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        });
      }
    } catch (err) {
      this._error.set(
        err instanceof SentraHttpError
          ? err.normalized
          : {
              code: 'INTERNAL_ERROR',
              message: 'Error al cargar cámaras',
              requestId: 'client',
              httpStatus: 500,
            },
      );
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      this._selected.set(await this.repo.get(id));
    } catch (err) {
      this._error.set(
        err instanceof SentraHttpError
          ? err.normalized
          : {
              code: 'NOT_FOUND',
              message: 'Cámara no encontrada',
              requestId: 'client',
              httpStatus: 404,
            },
      );
    } finally {
      this._loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    if (!this._page().hasMore) return;
    await this.load(false);
  }

  async create(input: {
    externalId: string;
    label: string;
    location?: string;
  }): Promise<void> {
    const workspaceId = this.workspace.workspaceId();
    if (!workspaceId) return;

    this._loading.set(true);
    this._error.set(null);

    try {
      await this.repo.create({
        workspaceId,
        externalId: input.externalId.trim(),
        label: input.label.trim(),
        location: input.location?.trim() || null,
      });
      await this.load(true);
    } catch (err) {
      this._error.set(
        err instanceof SentraHttpError
          ? err.normalized
          : {
              code: 'INTERNAL_ERROR',
              message: 'No se pudo registrar la cámara',
              requestId: 'client',
              httpStatus: 500,
            },
      );
    } finally {
      this._loading.set(false);
    }
  }
}
