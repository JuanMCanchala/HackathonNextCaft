import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';

@Component({
  selector: 'app-workspace-select-page',
  standalone: true,
  template: `
    <div class="flex min-h-screen items-center justify-center bg-[var(--sentra-bg-void)] p-6">
      <div class="w-full max-w-md rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel)] p-8">
        <h1 class="mb-2 font-[family-name:var(--sentra-font-display)] text-xl text-[var(--sentra-text-hi)]">
          Seleccionar workspace
        </h1>
        <p class="mb-6 text-sm text-[var(--sentra-text-mid)]">
          Elige el workspace activo para esta sesión.
        </p>
        <label class="mb-4 block text-xs uppercase tracking-wide text-[var(--sentra-text-low)]">
          Workspace
          <select
            class="mt-2 w-full rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel-2)] px-3 py-2 text-[var(--sentra-text-hi)]"
            [value]="selectedId()"
            (change)="onSelect($any($event).target.value)"
          >
            <option value="" disabled>Selecciona…</option>
            @for (ws of workspaces(); track ws.id) {
              <option [value]="ws.id">{{ ws.name }}</option>
            }
          </select>
        </label>
        <button
          type="button"
          class="w-full rounded bg-[var(--sentra-signal-cyan)] px-4 py-2 font-medium text-[var(--sentra-bg-void)] disabled:opacity-40"
          [disabled]="!selectedId()"
          (click)="continue()"
        >
          Continuar al dashboard
        </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSelectPageComponent {
  private readonly workspace = inject(WorkspaceContextService);
  private readonly router = inject(Router);

  readonly workspaces = this.workspace.workspaces;
  readonly selectedId = signal('');

  constructor() {
    void this.workspace.resolve();
  }

  onSelect(value: string): void {
    this.selectedId.set(value);
  }

  continue(): void {
    const id = this.selectedId();
    if (!id) return;
    this.workspace.setWorkspace(id);
    void this.router.navigate(['/']);
  }
}
