import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkspaceContextService } from '../core/workspace/workspace-context.service';
import { HlmInputDirective } from '../shared/ui/primitives';

@Component({
  selector: 'app-workspace-switcher',
  standalone: true,
  imports: [FormsModule, HlmInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (workspace.hasMultiple()) {
      <label class="flex items-center gap-2 text-xs text-muted-foreground">
        Workspace
        <select
          hlmInput
          class="h-8 min-w-[10rem]"
          [ngModel]="workspace.workspaceId()"
          (ngModelChange)="onChange($event)"
        >
          @for (ws of workspace.workspaces(); track ws.id) {
            <option [value]="ws.id">{{ ws.name }}</option>
          }
        </select>
      </label>
    } @else if (workspace.activeWorkspace(); as ws) {
      <span class="text-xs text-muted-foreground">{{ ws.name }}</span>
    }
  `,
})
export class WorkspaceSwitcherComponent {
  readonly workspace = inject(WorkspaceContextService);

  onChange(id: string): void {
    this.workspace.setWorkspace(id);
  }
}
