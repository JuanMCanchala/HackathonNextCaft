import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WORKSPACE_REPOSITORY } from '../config/injection-tokens';
import type { CreateWorkspaceRequest } from '../models/requests';
import type { WorkspaceDetail, WorkspaceSummary } from '../models/workspace';

@Injectable({ providedIn: 'root' })
export class WorkspaceContextService {
  private readonly repo = inject(WORKSPACE_REPOSITORY);
  private readonly router = inject(Router);

  private readonly _workspaceId = signal<string | null>(null);
  private readonly _workspaces = signal<WorkspaceSummary[]>([]);
  private readonly _loading = signal(false);
  private readonly _creating = signal(false);
  private readonly _resolved = signal(false);

  readonly workspaceId = this._workspaceId.asReadonly();
  readonly workspaces = this._workspaces.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly creating = this._creating.asReadonly();
  readonly resolved = this._resolved.asReadonly();
  readonly hasMultiple = computed(() => this._workspaces().length > 1);
  readonly isEmpty = computed(() => this._workspaces().length === 0);
  readonly activeWorkspace = computed(() =>
    this._workspaces().find((w) => w.id === this._workspaceId()) ?? null,
  );

  async resolve(): Promise<void> {
    if (this._resolved()) return;

    this._loading.set(true);
    try {
      const page = await this.repo.list();
      this._workspaces.set(page.items);

      if (page.items.length === 0) {
        this._resolved.set(false);
        await this.router.navigate(['/select-workspace']);
      } else if (page.items.length === 1) {
        this._workspaceId.set(page.items[0].id);
        this._resolved.set(true);
      } else if (!this._workspaceId()) {
        this._resolved.set(false);
        await this.router.navigate(['/select-workspace']);
      } else {
        this._resolved.set(true);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async refresh(): Promise<void> {
    const page = await this.repo.list();
    this._workspaces.set(page.items);
  }

  /**
   * Se apunta al workspace de demostracion si el backend lo permite.
   *
   * Los incidentes de la demo los sembro el pipeline con un identificador de
   * servicio, no con una cuenta de Clerk: sin esto, quien inicia sesion por
   * primera vez no es miembro de nada y ve una pantalla vacia con datos reales
   * al otro lado. Si el backend no ofrece la entrada, o esta apagada, devuelve
   * null y la pantalla sigue pidiendo crear uno.
   */
  async tryJoinDemo(): Promise<string | null> {
    if (this.repo.joinDemo === undefined) {
      return null;
    }
    try {
      const workspaceId = await this.repo.joinDemo();
      if (workspaceId !== null) {
        await this.refresh();
      }
      return workspaceId;
    } catch {
      // Que falle no puede impedir crear un workspace a mano.
      return null;
    }
  }

  async create(request: CreateWorkspaceRequest): Promise<WorkspaceDetail> {
    this._creating.set(true);
    try {
      const detail = await this.repo.create(request);
      const summary: WorkspaceSummary = {
        id: detail.id,
        name: detail.name,
        status: detail.status,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      };
      this._workspaces.update((items) => [...items, summary]);
      this._workspaceId.set(detail.id);
      this._resolved.set(true);
      return detail;
    } finally {
      this._creating.set(false);
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
