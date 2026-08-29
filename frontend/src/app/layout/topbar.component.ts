import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ClerkUserButtonComponent } from 'ngx-clerk';
import { WorkspaceContextService } from '../core/workspace/workspace-context.service';
import { WorkspaceSwitcherComponent } from './workspace-switcher.component';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [WorkspaceSwitcherComponent, ClerkUserButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header
      class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/80 px-6 py-4 backdrop-blur-md"
    >
      <div>
        <h1 class="font-display text-xl font-semibold tracking-tight text-foreground">{{ title() }}</h1>
        @if (workspaceName(); as name) {
          <p class="mt-1 text-sm text-muted-foreground">{{ name }}</p>
        }
      </div>
      <div class="flex items-center gap-3">
        @if (workspace.hasMultiple()) {
          <app-workspace-switcher />
        }
        <clerk-user-button
          [props]="{
            userProfileMode: 'navigation',
            userProfileUrl: '/app/settings',
          }"
        />
      </div>
    </header>
  `,
})
export class TopbarComponent {
  readonly workspace = inject(WorkspaceContextService);
  readonly title = input('Centro de operaciones');

  readonly workspaceName = computed(() => this.workspace.activeWorkspace()?.name ?? null);
}
