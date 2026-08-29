import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonDirective } from '../../shared/ui/primitives';
import {
  VisionService,
  type VisionDemo,
  type VisionEvent,
  type VisionJob,
  type VisionState,
} from '../../core/vision/vision.service';

/**
 * Monitor en vivo: la sala de maquinas del sistema.
 *
 * El resto del panel ensena incidentes YA confirmados, que es lo que importa
 * al dia siguiente. Esta pagina ensena el trabajo ocurriendo: el video
 * entrando, las senales del gate subiendo frame a frame y el verificador
 * pronunciandose. En una demo es lo que convierte una tabla de filas en algo
 * que se entiende sin explicar la arquitectura.
 *
 * Se alimenta del motor local, no de Convex, porque esto solo existe mientras
 * el motor corre. Si no esta levantado la pagina lo dice y el resto del panel
 * sigue funcionando.
 *
 * Sondeo de un segundo en vez de WebSocket: el motor ya expone uno, pero para
 * la demo un `setInterval` es una pieza menos que puede fallar delante de un
 * jurado, y a esta cadencia la diferencia no se percibe.
 */
@Component({
  selector: 'app-live-page',
  standalone: true,
  imports: [HlmButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-2xl font-semibold tracking-tight text-foreground">
            Monitor en vivo
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            El motor analizando en tiempo real, antes de que un incidente llegue a Convex
          </p>
        </div>
        <div class="flex items-center gap-2 font-mono text-xs">
          <span
            class="inline-block h-2 w-2 rounded-full"
            [class.bg-emerald-500]="vision.online()"
            [class.bg-muted-foreground]="!vision.online()"
          ></span>
          <span class="text-muted-foreground">
            {{ vision.online() ? 'Motor conectado' : 'Motor no disponible' }}
          </span>
        </div>
      </div>

      @if (!vision.online()) {
        <div class="sentra-panel p-6">
          <p class="text-sm text-foreground">
            No se alcanza el motor de visión en
            <code class="font-mono text-xs">{{ baseVisible }}</code
            >.
          </p>
          <p class="mt-2 text-sm text-muted-foreground">
            Arráncalo con <code class="font-mono text-xs">./dev.ps1</code> en la raíz del
            repositorio. El resto del panel funciona sin él: lee los incidentes ya guardados
            en Convex.
          </p>
        </div>
      }

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
        <div class="space-y-4">
          <!-- Visor con barra de datos, como el OSD que las camaras queman
               sobre la imagen: identificador a la izquierda, ritmo a la derecha. -->
          <div class="overflow-hidden rounded-xl border border-border bg-black">
            <div
              class="flex items-center justify-between border-b border-border/60 px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest"
            >
              <span class="text-muted-foreground">
                CAM {{ estado()?.cameras?.[0]?.label ?? '—' }}
              </span>
              <span class="text-foreground/80">
                {{ (estado()?.fps ?? 0).toFixed(1) }} FPS · {{ estado()?.people ?? 0 }} personas
              </span>
            </div>
            @if (vision.online()) {
              <img
                [src]="stream()"
                alt="Vídeo en directo de la cámara"
                class="block w-full"
                (error)="reconectar()"
              />
            } @else {
              <div class="py-24 text-center font-mono text-sm text-muted-foreground">
                Sin señal
              </div>
            }
          </div>

          <div class="sentra-panel p-5">
            <p
              class="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
            >
              Reproducir una escena
            </p>
            @if (demos().length === 0) {
              <p class="text-sm text-muted-foreground">
                No hay clips verificados. Se preparan con
                <code class="font-mono text-xs">tools.pick_demos</code>.
              </p>
            } @else {
              <div class="flex flex-wrap gap-2">
                @for (demo of demos(); track demo.id) {
                  <button
                    type="button"
                    hlmBtn
                    variant="outline"
                    [disabled]="lanzando() === demo.id"
                    (click)="ejecutar(demo)"
                  >
                    {{ lanzando() === demo.id ? 'Analizando…' : demo.domain_label }} ·
                    {{ demo.name }}
                  </button>
                }
              </div>
              <p class="mt-3 text-xs text-muted-foreground">
                Cada clip pasa por la cascada completa: filtro geométrico y, si dispara,
                verificación con el modelo de visión.
              </p>
            }

            <!-- Subir un video propio. Es lo que convence de que no hay
                 trampa: el jurado puede traer su clip y verlo pasar por la
                 misma cascada que el directo. -->
            <div class="mt-5 border-t border-border pt-5">
              <p class="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                O analizar tu propio vídeo
              </p>
              <div class="flex flex-wrap items-center gap-3">
                <label
                  class="cursor-pointer rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {{ archivo() ? archivo()!.name : 'Elegir vídeo…' }}
                  <input
                    type="file"
                    class="hidden"
                    accept="video/mp4,video/x-msvideo,video/quicktime,video/webm,.mkv"
                    (change)="elegir($any($event).target)"
                  />
                </label>
                <button
                  type="button"
                  hlmBtn
                  variant="default"
                  [disabled]="archivo() === null || subiendo()"
                  (click)="subir()"
                >
                  {{ subiendo() ? 'Subiendo…' : 'Analizar' }}
                </button>
              </div>
              @if (errorSubida()) {
                <p class="mt-2 text-xs text-destructive">{{ errorSubida() }}</p>
              }
              <p class="mt-2 text-xs text-muted-foreground">
                mp4, avi, mov, mkv o webm. Hasta 200 MB. Un clip de 10–15 segundos tarda
                cerca de medio minuto: casi todo el tiempo se va en las verificaciones,
                no en el filtro.
              </p>
            </div>

            <!-- Sin esto se pulsa el botón y no ocurre nada visible durante
                 medio minuto: el análisis va en segundo plano y la petición
                 vuelve enseguida. La barra es también lo que hace entender la
                 cascada, porque se ve cuántas veces dispara el filtro frente a
                 cuántas confirma el verificador. -->
            @if (trabajo(); as job) {
              <div class="mt-4 rounded-lg border border-border bg-muted/30 p-4">
                <div class="flex flex-wrap items-baseline justify-between gap-3">
                  <span class="font-mono text-xs text-foreground">{{ job.name }}</span>
                  <span class="font-mono text-xs text-muted-foreground">
                    {{ etiquetaJob(job) }}
                  </span>
                </div>
                <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary transition-all duration-300"
                    [style.width.%]="job.progress * 100"
                  ></div>
                </div>
                <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-muted-foreground">
                  <span>{{ job.frames }} frames</span>
                  <span>{{ job.triggers }} disparos del filtro</span>
                  <span class="text-foreground">{{ job.incidents }} confirmados</span>
                  <span>{{ job.elapsed.toFixed(1) }}s</span>
                </div>
                @if (job.error) {
                  <p class="mt-2 text-xs text-destructive">{{ job.error }}</p>
                }
              </div>
            }
          </div>
        </div>

        <div class="space-y-4">
          <div class="sentra-panel px-5 py-1">
            @for (fila of resumen(); track fila[0]) {
              <div
                class="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0"
              >
                <span class="text-xs text-muted-foreground">{{ fila[0] }}</span>
                <span class="font-mono text-sm font-medium text-foreground">{{ fila[1] }}</span>
              </div>
            }
          </div>

          <!-- Las senales son la parte que nadie ve y que explica el 99% de
               ahorro: mientras esten bajas no se llama al verificador. -->
          <div class="sentra-panel px-5 py-1">
            <p class="border-b border-border py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Señales en curso
            </p>
            @if (pistas().length === 0) {
              <p class="py-4 text-center font-mono text-xs text-muted-foreground">
                Nadie en escena
              </p>
            } @else {
              @for (pista of pistas(); track pista.id) {
                <div class="border-b border-border py-3 last:border-b-0">
                  <div class="flex items-baseline justify-between">
                    <span class="font-mono text-xs text-muted-foreground">#{{ pista.id }}</span>
                    <span class="font-mono text-sm font-semibold text-foreground">
                      {{ pista.score.toFixed(2) }}
                    </span>
                  </div>
                  <div class="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      class="h-full rounded-full bg-primary transition-all"
                      [style.width.%]="Math.min(100, pista.score * 100)"
                    ></div>
                  </div>
                  <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
                    @for (senal of senalesDe(pista.signals); track senal[0]) {
                      <span>{{ senal[0] }} {{ senal[1].toFixed(2) }}</span>
                    }
                  </div>
                </div>
              }
            }
          </div>
        </div>
      </div>

      <div class="sentra-panel p-5">
        <p class="mb-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Lo que ha visto el motor
        </p>
        @if (eventos().length === 0) {
          <p class="py-6 text-center text-sm text-muted-foreground">
            Todavía no ha disparado nada.
          </p>
        } @else {
          <div class="space-y-3">
            @for (evento of eventos(); track evento.id) {
              <div class="flex flex-wrap items-start gap-4 rounded-lg border border-border p-4">
                @if (evento.frames.length > 0) {
                  <img
                    [src]="vision.frameUrl(evento.frames[medio(evento)] ?? '')"
                    alt=""
                    class="h-20 w-32 flex-none rounded-md border border-border object-cover"
                  />
                }
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      class="rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
                      [class]="claseEstado(evento)"
                    >
                      {{ etiquetaEstado(evento) }}
                    </span>
                    <span class="text-sm font-medium text-foreground">
                      {{ evento.verdict?.incident_type ?? 'analizando' }}
                    </span>
                    <span class="font-mono text-xs text-muted-foreground">
                      gate {{ evento.gate_score.toFixed(2) }}
                    </span>
                  </div>
                  @if (evento.verdict?.evidence) {
                    <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {{ evento.verdict?.evidence }}
                    </p>
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class LivePageComponent implements OnInit, OnDestroy {
  readonly vision = inject(VisionService);
  protected readonly Math = Math;
  readonly baseVisible = 'http://localhost:8000';

  readonly estado = signal<VisionState | null>(null);
  readonly eventos = signal<VisionEvent[]>([]);
  readonly demos = signal<VisionDemo[]>([]);
  readonly lanzando = signal<string | null>(null);
  readonly trabajo = signal<VisionJob | null>(null);
  readonly archivo = signal<File | null>(null);
  readonly subiendo = signal(false);
  readonly errorSubida = signal('');
  readonly stream = signal('');

  private temporizador?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.stream.set(this.vision.streamUrl(Date.now()));
    void this.refrescar();
    void this.vision.demos().then((r) => this.demos.set(r?.demos ?? []));
    this.temporizador = setInterval(() => void this.refrescar(), 1000);
  }

  ngOnDestroy(): void {
    if (this.temporizador !== undefined) {
      clearInterval(this.temporizador);
    }
  }

  /** El MJPEG se corta si el motor se reinicia; recargarlo lo reengancha. */
  reconectar(): void {
    this.stream.set(this.vision.streamUrl(Date.now()));
  }

  private async refrescar(): Promise<void> {
    const [estado, eventos, trabajos] = await Promise.all([
      this.vision.state(),
      this.vision.events(),
      this.vision.jobs(),
    ]);
    if (estado !== null) {
      this.estado.set(estado);
    }
    if (eventos !== null) {
      this.eventos.set(eventos.events.slice(0, 6));
    }
    if (trabajos !== null) {
      const job = trabajos.jobs[0] ?? null;
      this.trabajo.set(job);
      // El boton se libera cuando el motor termina, no cuando la peticion
      // vuelve: encolar es inmediato, analizar no.
      if (job === null || job.status === 'done' || job.status === 'error') {
        this.lanzando.set(null);
      }
    }
  }

  resumen(): Array<[string, string]> {
    const e = this.estado();
    if (e === null) {
      return [['Estado', 'sin datos']];
    }
    return [
      ['Vertical', e.domain_label],
      ['Umbral del gate', e.threshold.toFixed(2)],
      ['Personas en escena', String(e.people)],
      ['Verificaciones en curso', String(e.analyzing)],
      ['Modelo de visión', e.offline ? 'sin conexión' : 'conectado'],
    ];
  }

  pistas() {
    return this.estado()?.cameras?.[0]?.tracks ?? [];
  }

  senalesDe(signals: Record<string, number>): Array<[string, number]> {
    return Object.entries(signals);
  }

  /** El frame del medio es donde suele estar la acción. */
  medio(evento: VisionEvent): number {
    return Math.floor(evento.frames.length / 2);
  }

  etiquetaJob(job: VisionJob): string {
    if (job.status === 'queued') return 'en cola';
    if (job.status === 'running') return `analizando ${Math.round(job.progress * 100)}%`;
    if (job.status === 'error') return 'error';
    return 'terminado';
  }

  etiquetaEstado(evento: VisionEvent): string {
    if (evento.status === 'incident') return 'incidente';
    if (evento.status === 'dismissed') return 'descartado';
    if (evento.status === 'error') return 'error';
    return 'analizando';
  }

  claseEstado(evento: VisionEvent): string {
    if (evento.status === 'incident') return 'bg-destructive/15 text-destructive';
    if (evento.status === 'dismissed') return 'bg-muted text-muted-foreground';
    if (evento.status === 'error') return 'bg-amber-500/15 text-amber-600';
    return 'bg-primary/15 text-primary';
  }

  elegir(input: HTMLInputElement): void {
    this.archivo.set(input.files?.[0] ?? null);
    this.errorSubida.set('');
  }

  async subir(): Promise<void> {
    const archivo = this.archivo();
    if (archivo === null) {
      return;
    }
    this.subiendo.set(true);
    this.errorSubida.set('');
    const resultado = await this.vision.analizarVideo(archivo);
    this.subiendo.set(false);
    if (resultado.ok) {
      this.archivo.set(null);
      await this.refrescar();
    } else {
      this.errorSubida.set(resultado.detalle);
    }
  }

  async ejecutar(demo: VisionDemo): Promise<void> {
    this.lanzando.set(demo.id);
    await this.vision.runDemo(demo.domain, demo.name);
    await this.refrescar();
  }
}
