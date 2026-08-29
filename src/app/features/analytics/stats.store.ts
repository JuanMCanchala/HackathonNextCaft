import { Injectable, inject, signal } from '@angular/core';
import { STATS_REPOSITORY } from '../../core/config/injection-tokens';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import type { StatsResponse } from '../../core/models/stats';
import type { NormalizedError } from '../../core/models/errors';
import { SentraHttpError } from '../../core/http/error.interceptor';

export type StatsPreset = '24h' | '7d' | '30d';

@Injectable()
export class StatsStore {
  private readonly repo = inject(STATS_REPOSITORY);
  private readonly workspace = inject(WorkspaceContextService);

  private readonly _stats = signal<StatsResponse | null>(null);
  private readonly _preset = signal<StatsPreset>('24h');
  private readonly _loading = signal(false);
  private readonly _error = signal<NormalizedError | null>(null);

  readonly stats = this._stats.asReadonly();
  readonly preset = this._preset.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  setPreset(preset: StatsPreset): void {
    this._preset.set(preset);
    void this.load();
  }

  async load(): Promise<void> {
    const workspaceId = this.workspace.workspaceId();
    if (!workspaceId) return;

    this._loading.set(true);
    this._error.set(null);
    const { from, to } = this.rangeFor(this._preset());

    try {
      this._stats.set(await this.repo.get(workspaceId, { from, to }));
    } catch (err) {
      this._error.set(
        err instanceof SentraHttpError
          ? err.normalized
          : {
              code: 'INTERNAL_ERROR',
              message: 'Error al cargar stats',
              requestId: 'client',
              httpStatus: 500,
            },
      );
    } finally {
      this._loading.set(false);
    }
  }

  private rangeFor(preset: StatsPreset): { from: string; to: string } {
    const to = new Date();
    const ms =
      preset === '24h'
        ? 24 * 60 * 60 * 1000
        : preset === '7d'
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;
    return { from: new Date(to.getTime() - ms).toISOString(), to: to.toISOString() };
  }
}
