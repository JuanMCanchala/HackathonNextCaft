import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { WorkspaceContextService } from '../core/workspace/workspace-context.service';
import { REALTIME_SERVICE } from '../core/config/injection-tokens';
import { WorkspaceSwitcherComponent } from './workspace-switcher.component';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [WorkspaceSwitcherComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header
      class="flex items-center justify-between border-b border-[var(--sentra-line)] bg-[var(--sentra-bg-panel)]/80 px-6 py-4 backdrop-blur"
    >
      <div>
        <h1 class="font-display text-xl text-[var(--sentra-text-hi)]">{{ title() }}</h1>
        <div class="mt-0.5 font-mono text-[11px] text-[var(--sentra-text-low)]">
          {{ clock }} · {{ workspace.workspaceId() || '—' }}
        </div>
      </div>
      <div class="flex items-center gap-4">
        <span class="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-[var(--sentra-text-mid)]">
          <span
            class="h-1.5 w-1.5 rounded-full"
            [style.background]="
              realtime.status()() === 'live'
                ? 'var(--sentra-ok)'
                : realtime.status()() === 'connecting'
                  ? 'var(--sentra-warn)'
                  : 'var(--sentra-text-low)'
            "
            aria-hidden="true"
          ></span>
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
  readonly clock = new Date().toISOString().slice(0, 19) + 'Z';
}
