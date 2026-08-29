import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkspaceContextService } from '../core/workspace/workspace-context.service';

@Component({
  selector: 'app-workspace-switcher',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (workspace.hasMultiple()) {
      <label class="flex items-center gap-2 text-xs text-[var(--sentra-text-low)]">
        Workspace
        <select
          class="rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel-2)] px-2 py-1 text-sm text-[var(--sentra-text-hi)]"
          [ngModel]="workspace.workspaceId()"
          (ngModelChange)="onChange($event)"
        >
          @for (ws of workspace.workspaces(); track ws.id) {
            <option [value]="ws.id">{{ ws.name }}</option>
          }
        </select>
      </label>
    } @else if (workspace.activeWorkspace(); as ws) {
      <span class="text-xs text-[var(--sentra-text-mid)]">{{ ws.name }}</span>
    }
  `,
})
export class WorkspaceSwitcherComponent {
  readonly workspace = inject(WorkspaceContextService);

  onChange(id: string): void {
    this.workspace.setWorkspace(id);
  }
}
