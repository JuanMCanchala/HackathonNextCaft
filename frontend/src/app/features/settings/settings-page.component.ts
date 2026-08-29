import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ClerkService, ClerkUserProfileComponent } from 'ngx-clerk';
import { BACKEND_CAPABILITIES } from '../../core/config/backend-capabilities';
import { AUTH_SERVICE, WORKSPACE_REPOSITORY } from '../../core/config/injection-tokens';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import type { WorkspaceDetail } from '../../core/models/workspace';
import type { NormalizedError } from '../../core/models/errors';
import { clerkProfileAppearance } from '../../../environments/clerk-appearance';
import { environment } from '../../../environments/environment';
import { LoadingStateComponent } from '../../shared/ui/loading-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import {
  HlmBadgeDirective,
  HlmButtonDirective,
  HlmCardComponent,
  HlmCardContentComponent,
  HlmCardDescriptionComponent,
  HlmCardHeaderComponent,
  HlmCardTitleComponent,
} from '../../shared/ui/primitives';

type SettingsTab = 'account' | 'workspace';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    ClerkUserProfileComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    HlmCardComponent,
    HlmCardHeaderComponent,
    HlmCardTitleComponent,
    HlmCardDescriptionComponent,
    HlmCardContentComponent,
    HlmButtonDirective,
    HlmBadgeDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="font-display text-2xl font-semibold tracking-tight text-foreground">Ajustes</h1>
        <p class="mt-1 text-sm text-muted-foreground">Cuenta, workspace y conexión del sistema</p>
      </div>

      <div class="flex flex-wrap gap-2 border-b border-border pb-1">
        <button
          type="button"
          hlmBtn
          size="sm"
          [variant]="tab() === 'account' ? 'default' : 'ghost'"
          (click)="tab.set('account')"
        >
          Cuenta
        </button>
        <button
          type="button"
          hlmBtn
          size="sm"
          [variant]="tab() === 'workspace' ? 'default' : 'ghost'"
          (click)="tab.set('workspace')"
        >
          Workspace
        </button>
      </div>

      @if (tab() === 'account') {
        <div class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <hlm-card class="gap-4 p-6">
            <hlm-card-header>
              <hlm-card-title class="text-base">Sesión actual</hlm-card-title>
              <hlm-card-description>Identidad gestionada por Clerk</hlm-card-description>
            </hlm-card-header>
            <hlm-card-content class="space-y-4">
              @if (clerk.user(); as user) {
                <div class="flex items-center gap-3">
                  @if (user.imageUrl) {
                    <img
                      [src]="user.imageUrl"
                      alt=""
                      class="h-12 w-12 rounded-full border border-border object-cover"
                    />
                  } @else {
                    <span
                      class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 font-display text-lg text-primary"
                    >
                      {{ userInitials(user) }}
                    </span>
                  }
                  <div class="min-w-0">
                    <div class="truncate font-medium text-foreground">
                      {{ user.fullName || 'Usuario' }}
                    </div>
                    <div class="truncate text-sm text-muted-foreground">
                      {{ primaryEmail(user) }}
                    </div>
                  </div>
                </div>
                <dl class="space-y-2 text-sm">
                  <div class="flex justify-between gap-4">
                    <dt class="text-muted-foreground">ID</dt>
                    <dd class="truncate font-mono text-xs">{{ clerk.userId() }}</dd>
                  </div>
                </dl>
              } @else {
                <p class="text-sm text-muted-foreground">Cargando perfil…</p>
              }
              <button type="button" hlmBtn variant="outline" class="w-full" (click)="logout()">
                Cerrar sesión
              </button>
            </hlm-card-content>
          </hlm-card>

          <div
            class="sentra-clerk-profile min-w-0 overflow-hidden rounded-[var(--sentra-radius-lg)] border border-border bg-card"
          >
            <clerk-user-profile
              [props]="{ routing: 'hash', appearance: clerkProfileAppearance }"
            />
          </div>
        </div>
      } @else {
        @if (loading()) {
          <app-loading-state message="Cargando workspace…" />
        } @else if (error(); as err) {
          <app-error-state [error]="err" (retry)="loadWorkspace()" />
        } @else if (detail(); as ws) {
          <div class="grid gap-6 lg:grid-cols-2">
            <hlm-card class="gap-4 p-6">
              <hlm-card-header>
                <hlm-card-title class="text-base">{{ ws.name }}</hlm-card-title>
                <hlm-card-description>Configuración del workspace activo</hlm-card-description>
              </hlm-card-header>
              <hlm-card-content class="space-y-4">
                <dl class="space-y-3 text-sm">
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-muted-foreground">Estado</dt>
                    <dd><span hlmBadge variant="outline" class="capitalize">{{ ws.status }}</span></dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-muted-foreground">Zona horaria</dt>
                    <dd class="font-mono text-xs">{{ ws.settings.timezone }}</dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-muted-foreground">Ventana de agrupación</dt>
                    <dd class="font-mono text-xs">{{ ws.settings.groupingWindowSeconds }}s</dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-muted-foreground">Retención</dt>
                    <dd class="font-mono text-xs">{{ ws.settings.retentionDays }} días</dd>
                  </div>
                </dl>
                <p class="text-xs text-muted-foreground">
                  La edición de políticas del workspace llegará cuando el backend exponga
                  <code class="font-mono">workspaces.update</code>.
                </p>
              </hlm-card-content>
            </hlm-card>

            <hlm-card class="gap-4 p-6">
              <hlm-card-header>
                <hlm-card-title class="text-base">Integración</hlm-card-title>
                <hlm-card-description>IDs para el pipeline Python y Convex</hlm-card-description>
              </hlm-card-header>
              <hlm-card-content class="space-y-4">
                <div class="sentra-inset space-y-2">
                  <div class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    CONVEX_WORKSPACE_ID
                  </div>
                  <div class="flex items-center gap-2">
                    <code class="min-w-0 flex-1 truncate font-mono text-xs">{{ ws.id }}</code>
                    <button type="button" hlmBtn variant="outline" size="sm" (click)="copy(ws.id)">
                      Copiar
                    </button>
                  </div>
                </div>

                <dl class="space-y-3 text-sm">
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-muted-foreground">Perfil backend</dt>
                    <dd class="font-mono text-xs">{{ caps.profile }}</dd>
                  </div>
                  <div class="flex items-start justify-between gap-4">
                    <dt class="text-muted-foreground">Convex URL</dt>
                    <dd class="max-w-[14rem] truncate font-mono text-xs" [title]="convexUrl">
                      {{ convexUrl }}
                    </dd>
                  </div>
                </dl>

                @if (copied()) {
                  <p class="text-xs text-[var(--sentra-ok)]">Copiado al portapapeles</p>
                }
              </hlm-card-content>
            </hlm-card>
          </div>
        }
      }
    </div>
  `,
})
export class SettingsPageComponent implements OnInit {
  readonly clerk = inject(ClerkService);
  private readonly auth = inject(AUTH_SERVICE);
  private readonly workspace = inject(WorkspaceContextService);
  private readonly repo = inject(WORKSPACE_REPOSITORY);
  readonly caps = inject(BACKEND_CAPABILITIES);

  readonly tab = signal<SettingsTab>('account');
  readonly detail = signal<WorkspaceDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal<NormalizedError | null>(null);
  readonly copied = signal(false);

  readonly convexUrl = environment.convexUrl;
  readonly clerkProfileAppearance = clerkProfileAppearance;

  ngOnInit(): void {
    void this.loadWorkspace();
  }

  async loadWorkspace(): Promise<void> {
    const id = this.workspace.workspaceId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);
    try {
      this.detail.set(await this.repo.get(id));
    } catch {
      this.error.set({
        code: 'INTERNAL_ERROR',
        message: 'No se pudo cargar el workspace',
        requestId: 'client',
        httpStatus: 500,
      });
    } finally {
      this.loading.set(false);
    }
  }

  logout(): void {
    this.auth.logout();
  }

  primaryEmail(user: { primaryEmailAddress?: { emailAddress: string } | null }): string {
    return user.primaryEmailAddress?.emailAddress ?? '—';
  }

  userInitials(user: { firstName?: string | null; lastName?: string | null }): string {
    const a = user.firstName?.[0] ?? '';
    const b = user.lastName?.[0] ?? '';
    return (a + b).toUpperCase() || '?';
  }

  async copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }
}
