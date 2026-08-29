import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowRight, LucideShieldAlert } from '@lucide/angular';
import { clerkConfig } from '../../../environments/clerk.config';
import { HlmBadgeDirective, HlmButtonDirective } from '../../shared/ui/primitives';

const PIPELINE = [
  { step: '01', label: 'Captura', detail: 'Cámaras IP, webcam o archivo de video en el edge' },
  { step: '02', label: 'Cascada IA', detail: 'Filtro geométrico → confirmación VLM → solo lo que importa' },
  { step: '03', label: 'Intake', detail: 'Incidentes confirmados entran a Convex con idempotencia' },
  { step: '04', label: 'SOC', detail: 'Operadores clasifican, priorizan y dan seguimiento' },
] as const;

/* Taxonomía — oculto en landing (reactivar cuando convenga)
const CATEGORIES = [
  { key: 'fall', label: 'Posible caída', severity: 'critical' },
  { key: 'violence', label: 'Posible altercado', severity: 'critical' },
  { key: 'smoke', label: 'Posible humo / incendio', severity: 'high' },
  { key: 'intrusion', label: 'Posible intrusión', severity: 'high' },
  { key: 'theft', label: 'Comportamiento sospechoso', severity: 'medium' },
  { key: 'ppe_missing', label: 'Posible falta de EPP', severity: 'low' },
] as const;
*/

const FEED = [
  { time: '14:02:11', cam: 'ENTRADA-N', cat: 'intrusion', sev: 'high', conf: '94%' },
  { time: '14:01:48', cam: 'ALMACÉN-2', cat: 'ppe_missing', sev: 'low', conf: '87%' },
  { time: '13:58:03', cam: 'PASILLO-B', cat: 'fall', sev: 'critical', conf: '91%' },
  { time: '13:55:22', cam: 'CAJA-01', cat: 'theft', sev: 'medium', conf: '89%' },
  { time: '13:52:07', cam: 'ENTRADA-N', cat: 'violence', sev: 'critical', conf: '96%' },
] as const;

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink, LucideShieldAlert, LucideArrowRight, HlmButtonDirective, HlmBadgeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      --landing-grid: var(--sentra-landing-grid);
    }

    .landing-grid-bg {
      background-image:
        linear-gradient(var(--landing-grid) 1px, transparent 1px),
        linear-gradient(90deg, var(--landing-grid) 1px, transparent 1px);
      background-size: 48px 48px;
      mask-image: radial-gradient(ellipse 80% 70% at 70% 20%, black 20%, transparent 75%);
    }

    .hero-clip {
      clip-path: polygon(0 0, 100% 0, 100% 92%, 0 100%);
    }

    .scanlines::after {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.12) 2px,
        rgba(0, 0, 0, 0.12) 4px
      );
      opacity: var(--sentra-scanline-opacity);
    }

    @keyframes feed-scroll {
      0% {
        transform: translateY(0);
      }
      100% {
        transform: translateY(-50%);
      }
    }

    .feed-track {
      animation: feed-scroll 22s linear infinite;
    }

    .feed-track:hover {
      animation-play-state: paused;
    }

    .pipeline-line {
      background: linear-gradient(
        90deg,
        transparent,
        var(--sentra-signal-cyan) 20%,
        var(--sentra-signal-cyan) 80%,
        transparent
      );
      height: 1px;
    }

    .severity-critical {
      color: var(--sentra-severity-critical);
    }
    .severity-high {
      color: var(--sentra-severity-high);
    }
    .severity-medium {
      color: var(--sentra-severity-medium);
    }
    .severity-low {
      color: var(--sentra-severity-low);
    }
  `,
  template: `
    <div class="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div class="landing-grid-bg pointer-events-none absolute inset-0" aria-hidden="true"></div>

      <!-- Nav -->
      <header
        class="relative z-10 flex items-center justify-between border-b border-border/60 px-6 py-4 backdrop-blur-sm lg:px-12"
      >
        <a routerLink="/" class="flex items-center gap-3 no-underline">
          <span
            class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary"
            aria-hidden="true"
          >
            <svg lucideShieldAlert [size]="18"></svg>
          </span>
          <span class="font-display text-lg font-semibold tracking-tight text-foreground">
            SENT<span class="text-primary">RA</span>
          </span>
        </a>
        <div class="flex items-center gap-2">
          <a hlmBtn variant="ghost" size="sm" [routerLink]="signInUrl">Iniciar sesión</a>
          <a hlmBtn variant="default" size="sm" [routerLink]="signUpUrl">
            Acceder al SOC
            <svg lucideArrowRight [size]="14" class="opacity-80"></svg>
          </a>
        </div>
      </header>

      <!-- Hero asimétrico -->
      <section class="hero-clip relative border-b border-border/50 pb-16 pt-10 lg:pb-24 lg:pt-16">
        <div
          class="pointer-events-none absolute -right-24 top-8 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
          aria-hidden="true"
        ></div>
        <div
          class="pointer-events-none absolute bottom-0 left-0 h-48 w-48 rounded-full bg-[var(--sentra-severity-critical)]/10 blur-3xl"
          aria-hidden="true"
        ></div>

        <div class="relative mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-8 lg:px-12">
          <div class="max-w-xl">
            <p class="mb-4 font-mono text-[11px] uppercase tracking-[0.35em] text-primary">
              SOC · visión por computadora · multi-tenant
            </p>
            <h1 class="font-display text-[clamp(2.5rem,6vw,4.25rem)] font-bold leading-[0.95] tracking-tight">
              Ve el riesgo
              <span class="block text-muted-foreground">antes de que escale.</span>
            </h1>
            <p class="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
              Sentra conecta tus cámaras con una cascada de IA en el edge y una consola de operaciones en
              tiempo real. Solo los incidentes confirmados llegan al equipo — sin ruido, sin falsos positivos
              masivos.
            </p>
            <div class="mt-8 flex flex-wrap items-center gap-3">
              <a hlmBtn variant="default" [routerLink]="signUpUrl">Crear cuenta</a>
              <a hlmBtn variant="outline" [routerLink]="signInUrl">Ya tengo acceso</a>
            </div>
            <dl class="mt-10 grid grid-cols-3 gap-4 border-t border-border/60 pt-8">
              <div>
                <dt class="font-mono text-2xl font-semibold text-foreground">3</dt>
                <dd class="mt-1 text-xs text-muted-foreground">etapas de filtrado IA</dd>
              </div>
              <div>
                <dt class="font-mono text-2xl font-semibold text-foreground">6</dt>
                <dd class="mt-1 text-xs text-muted-foreground">categorías de incidente</dd>
              </div>
              <div>
                <dt class="font-mono text-2xl font-semibold text-primary">24/7</dt>
                <dd class="mt-1 text-xs text-muted-foreground">monitoreo continuo</dd>
              </div>
            </dl>
          </div>

          <!-- Terminal feed mock -->
          <div class="scanlines relative sentra-panel overflow-hidden lg:translate-y-4">
            <div class="flex items-center justify-between border-b border-border bg-[var(--sentra-bg-panel-2)] px-4 py-2.5">
              <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                live.intake · adamant-mouse-956
              </span>
              <span hlmBadge variant="outline" class="font-mono text-[10px]">streaming</span>
            </div>
            <div class="relative h-[320px] overflow-hidden bg-[var(--sentra-bg-void)] p-4 font-mono text-xs">
              <div class="feed-track space-y-2">
                @for (row of feedDoubled; track $index) {
                  <div
                    class="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 rounded border border-border/50 bg-card/40 px-3 py-2"
                  >
                    <span class="text-muted-foreground">{{ row.time }}</span>
                    <span>
                      <span class="text-foreground">{{ row.cam }}</span>
                      <span class="text-muted-foreground"> · {{ row.cat }}</span>
                    </span>
                    <span class="text-right">
                      <span [class]="'severity-' + row.sev">{{ row.sev }}</span>
                      <span class="ml-2 text-primary">{{ row.conf }}</span>
                    </span>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Pipeline -->
      <section class="relative border-b border-border/50 py-20 lg:py-28">
        <div class="mx-auto max-w-7xl px-6 lg:px-12">
          <div class="mb-14 max-w-lg">
            <p class="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Arquitectura</p>
            <h2 class="mt-3 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
              Del frame al operador, en cuatro saltos.
            </h2>
          </div>

          <div class="relative grid gap-8 lg:grid-cols-4 lg:gap-6">
            <div class="pipeline-line absolute left-0 right-0 top-8 hidden lg:block" aria-hidden="true"></div>
            @for (item of pipeline; track item.step) {
              <article class="relative">
                <div
                  class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 font-mono text-lg font-semibold text-primary"
                >
                  {{ item.step }}
                </div>
                <h3 class="font-display text-lg font-semibold">{{ item.label }}</h3>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ item.detail }}</p>
              </article>
            }
          </div>
        </div>
      </section>

      <!-- Capacidades bento -->
      <section class="border-b border-border/50 py-20 lg:py-28">
        <div class="mx-auto max-w-7xl px-6 lg:px-12">
          <div class="grid gap-6 lg:grid-cols-12 lg:grid-rows-2">
            <article class="sentra-panel lg:col-span-7 lg:row-span-2 p-8 lg:p-10">
              <p class="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">Consola SOC</p>
              <h2 class="mt-4 font-display text-2xl font-semibold lg:text-3xl">
                Dashboard, cámaras e incidentes en un solo workspace.
              </h2>
              <p class="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
                KPIs de las últimas 24 horas, conectividad de cámaras, feed de actividad reciente y
                clasificación de incidentes con copy no acusatorio — diseñado para operadores, no para
                alarmismo.
              </p>
              <ul class="mt-8 space-y-3 text-sm text-muted-foreground">
                <li class="flex gap-2">
                  <span class="text-primary">→</span> Workspaces multi-tenant con Clerk + Convex
                </li>
                <li class="flex gap-2">
                  <span class="text-primary">→</span> Triage y estados del ciclo de vida del incidente
                </li>
                <li class="flex gap-2">
                  <span class="text-primary">→</span> Filtros por severidad, categoría y estado
                </li>
              </ul>
            </article>

            <article class="sentra-panel-elevated lg:col-span-5 p-6">
              <h3 class="font-display font-semibold">Catálogo de cámaras</h3>
              <p class="mt-2 text-sm text-muted-foreground">
                Registra cámaras con externalId, etiqueta y ubicación. El pipeline Python mapea cada fuente de
                video al ID de Convex para asociar detecciones correctamente.
              </p>
            </article>

            <article class="sentra-panel-elevated lg:col-span-5 p-6">
              <h3 class="font-display font-semibold">Intake idempotente</h3>
              <p class="mt-2 text-sm text-muted-foreground">
                Solo incidentes confirmados por el VLM cruzan el puente HTTP hacia Convex. Reintentos con el
                mismo sourceEventId no duplican registros.
              </p>
            </article>
          </div>
        </div>
      </section>

      <!-- Categorías (oculto)
      <section class="py-20 lg:py-28">
        <div class="mx-auto max-w-7xl px-6 lg:px-12">
          <div class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div class="max-w-md">
              <p class="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                Taxonomía alineada
              </p>
              <h2 class="mt-3 font-display text-3xl font-semibold tracking-tight">
                Seis categorías. Cuatro niveles de severidad.
              </h2>
            </div>
            <p class="max-w-sm text-sm text-muted-foreground">
              Python y Convex comparten la misma allowlist — un robo confirmado por el VLM siempre tiene
              destino en la base de datos.
            </p>
          </div>

          <div class="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            @for (cat of categories; track cat.key) {
              <div
                class="group flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-card/50 px-4 py-4 transition hover:border-primary/40 hover:bg-card"
              >
                <div>
                  <p class="text-sm font-medium text-foreground">{{ cat.label }}</p>
                  <p class="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {{ cat.key }}
                  </p>
                </div>
                <span hlmBadge variant="outline" [class]="'severity-' + cat.severity + ' border-current/30'">
                  {{ cat.severity }}
                </span>
              </div>
            }
          </div>
        </div>
      </section>
      -->

      <!-- CTA -->
      <section class="border-t border-border/60 bg-[var(--sentra-bg-panel)] py-16 lg:py-20">
        <div class="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-6 lg:flex-row lg:items-center lg:px-12">
          <div>
            <h2 class="font-display text-2xl font-semibold lg:text-3xl">Listo para operar.</h2>
            <p class="mt-2 max-w-md text-sm text-muted-foreground">
              Crea tu workspace, registra cámaras y conecta el pipeline de visión. La consola ya está
              esperando tus incidentes.
            </p>
          </div>
          <div class="flex flex-wrap gap-3">
            <a hlmBtn variant="default" size="lg" [routerLink]="signUpUrl">Empezar ahora</a>
            <a hlmBtn variant="outline" size="lg" [routerLink]="signInUrl">Iniciar sesión</a>
          </div>
        </div>
      </section>

      <footer class="border-t border-border/40 px-6 py-6 text-center text-xs text-muted-foreground lg:px-12">
        Sentra · consola SOC para equipos de seguridad y operaciones
      </footer>
    </div>
  `,
})
export class LandingPageComponent {
  readonly signInUrl = clerkConfig.signInUrl;
  readonly signUpUrl = clerkConfig.signUpUrl;
  readonly pipeline = PIPELINE;
  // readonly categories = CATEGORIES;
  readonly feedDoubled = [...FEED, ...FEED];
}
