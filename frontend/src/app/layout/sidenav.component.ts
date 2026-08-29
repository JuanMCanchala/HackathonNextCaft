import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { REALTIME_SERVICE } from '../core/config/injection-tokens';

@Component({
  selector: 'app-sidenav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="flex h-full w-[236px] shrink-0 flex-col gap-7 border-r border-[var(--sentra-line)] bg-[var(--sentra-bg-panel)] px-4 py-5"
      aria-label="Navegación principal"
    >
      <div class="flex items-center gap-2.5 px-1.5">
        <span
          class="h-2.5 w-2.5 rounded-full bg-[var(--sentra-signal-cyan)]"
          aria-hidden="true"
        ></span>
        <span class="font-display text-lg tracking-wide text-[var(--sentra-text-hi)]">
          SENT<span class="text-[var(--sentra-signal-cyan)]">RA</span>
        </span>
      </div>

      <div>
        <div class="mb-2 px-1.5 text-[10px] uppercase tracking-widest text-[var(--sentra-text-low)]">
          Monitoreo
        </div>
        <div class="flex flex-col gap-0.5">
          @for (link of links; track link.path) {
            <a
              [routerLink]="link.path"
              routerLinkActive="bg-[var(--sentra-signal-cyan-dim)] text-[var(--sentra-signal-cyan)]"
              [routerLinkActiveOptions]="{ exact: link.exact }"
              class="rounded px-2.5 py-2 text-sm text-[var(--sentra-text-mid)] transition hover:bg-[var(--sentra-bg-panel-2)] hover:text-[var(--sentra-text-hi)]"
            >
              <span class="mr-2 text-[var(--sentra-text-low)]" aria-hidden="true">{{ link.icon }}</span>
              {{ link.label }}
            </a>
          }
        </div>
      </div>

      <div class="mt-auto space-y-1 px-1.5 text-[11px] text-[var(--sentra-text-low)]">
        <div>
          Realtime:
          <span class="font-mono text-[var(--sentra-text-mid)]">{{ realtime.status()() }}</span>
        </div>
        <div>Operador · turno demo</div>
      </div>
    </nav>
  `,
})
export class SidenavComponent {
  readonly realtime = inject(REALTIME_SERVICE);

  readonly links = [
    { path: '/', label: 'Dashboard', icon: '◆', exact: true },
    { path: '/cameras', label: 'Cámaras', icon: '▣', exact: false },
    { path: '/incidents', label: 'Incidentes', icon: '≡', exact: false },
    { path: '/analytics', label: 'Analítica', icon: '▤', exact: false },
  ] as const;
}
