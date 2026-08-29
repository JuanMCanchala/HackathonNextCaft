import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { WorkspaceContextService } from '../core/workspace/workspace-context.service';
import { REALTIME_SERVICE } from '../core/config/injection-tokens';
import { WorkspaceSwitcherComponent } from './workspace-switcher.component';
import { HlmBadgeDirective } from '../shared/ui/primitives';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [WorkspaceSwitcherComponent, HlmBadgeDirective],
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
        <span hlmBadge [variant]="statusVariant()" class="gap-2 capitalize">
          <span class="h-1.5 w-1.5 rounded-full" [class]="statusDotClass()" aria-hidden="true"></span>
          {{ realtime.status()() }}
        </span>
        <app-workspace-switcher />
      </div>
    </header>
  `,
})
export class TopbarComponent {
  readonly workspace = inject(WorkspaceContextService);
  readonly realtime = inject(REALTIME_SERVICE);
  readonly title = input('Centro de operaciones');

  readonly workspaceName = computed(() => this.workspace.activeWorkspace()?.name ?? null);

  readonly statusVariant = computed(() => {
    const s = this.realtime.status()();
    if (s === 'live') return 'success' as const;
    if (s === 'connecting') return 'warning' as const;
    return 'muted' as const;
  });

  readonly statusDotClass = computed(() => {
    const s = this.realtime.status()();
    if (s === 'live') return 'bg-[var(--sentra-ok)] shadow-[0_0_8px_var(--sentra-ok)]';
    if (s === 'connecting') return 'bg-[var(--sentra-warn)] animate-pulse';
    return 'bg-muted-foreground';
  });
}
