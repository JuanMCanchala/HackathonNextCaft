import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { REALTIME_SERVICE } from '../core/config/injection-tokens';
import { WorkspaceContextService } from '../core/workspace/workspace-context.service';
import { ToastHostComponent } from '../shared/ui/toast-host.component';
import { SidenavComponent } from './sidenav.component';
import { TopbarComponent } from './topbar.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidenavComponent, TopbarComponent, ToastHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-screen overflow-hidden bg-background">
      <app-sidenav />
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <app-topbar />
        <main class="min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
          <div class="mx-auto w-full max-w-7xl">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>
    <app-toast-host />
  `,
})
export class ShellComponent {
  private readonly workspace = inject(WorkspaceContextService);
  private readonly realtime = inject(REALTIME_SERVICE);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      const id = this.workspace.workspaceId();
      if (id) {
        this.realtime.connect(id);
      } else {
        this.realtime.disconnect();
      }
    });

    this.destroyRef.onDestroy(() => this.realtime.disconnect());
  }
}
