import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideShieldAlert } from '@lucide/angular';
import { cn } from '../shared/design/cn';
import { HlmButtonDirective } from '../shared/ui/primitives';

@Component({
  selector: 'app-sidenav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideShieldAlert, HlmButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      aria-label="Navegación principal"
    >
      <div class="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
        <span
          class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-inner"
          aria-hidden="true"
        >
          <svg lucideShieldAlert [size]="18" aria-hidden="true"></svg>
        </span>
        <div>
          <div class="font-display text-lg font-semibold tracking-tight">
            SENT<span class="text-primary">RA</span>
          </div>
          <div class="text-[10px] uppercase tracking-widest text-muted-foreground">SOC Console</div>
        </div>
      </div>

      <div class="flex-1 space-y-6 px-3 py-4">
        <div>
          <div class="mb-2 px-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Monitoreo
          </div>
          <div class="flex flex-col gap-1">
            @for (link of links; track link.path) {
              <a
                hlmBtn
                variant="ghost"
                [routerLink]="link.path"
                routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
                [routerLinkActiveOptions]="{ exact: link.exact }"
                [class]="navLinkClass"
              >
                <span class="w-4 text-center text-xs opacity-60" aria-hidden="true">{{ link.glyph }}</span>
                {{ link.label }}
              </a>
            }
          </div>
        </div>

        <div>
          <div class="mb-2 px-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Sistema
          </div>
          <a
            hlmBtn
            variant="ghost"
            routerLink="/app/settings"
            routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
            [class]="navLinkClass"
          >
            <span class="w-4 text-center text-xs opacity-60" aria-hidden="true">⚙</span>
            Ajustes
          </a>
        </div>
      </div>
    </nav>
  `,
})
export class SidenavComponent {
  readonly navLinkClass = cn('h-9 w-full justify-start px-3 text-muted-foreground hover:text-foreground');

  readonly links = [
    { path: '/app', label: 'Dashboard', glyph: '◆', exact: true },
    { path: '/app/live', label: 'En vivo', glyph: '◉', exact: false },
    { path: '/app/cameras', label: 'Cámaras', glyph: '▣', exact: false },
    { path: '/app/incidents', label: 'Incidentes', glyph: '≡', exact: false },
    { path: '/app/analytics', label: 'Analítica', glyph: '▤', exact: false },
  ] as const;
}
