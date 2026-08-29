import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WORKSPACE_REPOSITORY } from '../config/injection-tokens';
import type { WorkspaceSummary } from '../models/workspace';

@Injectable({ providedIn: 'root' })
export class WorkspaceContextService {
  private readonly repo = inject(WORKSPACE_REPOSITORY);
  private readonly router = inject(Router);

  private readonly _workspaceId = signal<string | null>(null);
  private readonly _workspaces = signal<WorkspaceSummary[]>([]);
  private readonly _loading = signal(false);
  private readonly _resolved = signal(false);

  readonly workspaceId = this._workspaceId.asReadonly();
  readonly workspaces = this._workspaces.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly resolved = this._resolved.asReadonly();
  readonly hasMultiple = computed(() => this._workspaces().length > 1);
  readonly activeWorkspace = computed(() =>
    this._workspaces().find((w) => w.id === this._workspaceId()) ?? null,
  );

  async resolve(): Promise<void> {
    if (this._resolved()) return;

    this._loading.set(true);
    try {
      const page = await this.repo.list();
      this._workspaces.set(page.items);

      if (page.items.length === 1) {
        this._workspaceId.set(page.items[0].id);
        this._resolved.set(true);
      } else if (page.items.length > 1 && !this._workspaceId()) {
        this._resolved.set(false);
        await this.router.navigate(['/select-workspace']);
      } else {
        this._resolved.set(!!this._workspaceId());
      }
    } finally {
      this._loading.set(false);
    }
  }

  setWorkspace(id: string): void {
    const exists = this._workspaces().some((w) => w.id === id);
    if (!exists) return;
    this._workspaceId.set(id);
    this._resolved.set(true);
  }

  clear(): void {
    this._workspaceId.set(null);
    this._resolved.set(false);
  }
}
