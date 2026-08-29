import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { NormalizedError } from '../../core/models/errors';

@Component({
  selector: 'app-error-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col items-center gap-3 rounded border border-[var(--sentra-severity-critical)]/40 bg-[var(--sentra-severity-critical-dim)] px-6 py-10 text-center"
      role="alert"
    >
      <div class="text-sm font-medium text-[var(--sentra-severity-critical)]">{{ heading() }}</div>
      <p class="text-xs text-[var(--sentra-text-mid)]">{{ error().message }}</p>
      @if (showRequestId()) {
        <code class="font-mono text-[10px] text-[var(--sentra-text-low)]">
          requestId: {{ error().requestId }}
        </code>
      }
      <button
        type="button"
        class="mt-2 rounded border border-[var(--sentra-line)] px-3 py-1.5 text-xs text-[var(--sentra-text-hi)]"
        (click)="retry.emit()"
      >
        Reintentar
      </button>
    </div>
  `,
})
export class ErrorStateComponent {
  readonly error = input.required<NormalizedError>();
  readonly retry = output<void>();

  readonly heading = computed(() => {
    const map: Record<string, string> = {
      UNAUTHENTICATED: 'Sesión requerida',
      FORBIDDEN: 'Sin permiso',
      NOT_FOUND: 'No encontrado',
      VALIDATION_ERROR: 'Datos inválidos',
      CONFLICT: 'Conflicto',
      IDEMPOTENCY_CONFLICT: 'Conflicto de idempotencia',
      RATE_LIMITED: 'Límite de tasa',
      EVIDENCE_UNAVAILABLE: 'Evidencia no disponible',
      INTERNAL_ERROR: 'Error interno',
    };
    return map[this.error().code] ?? 'Error';
  });

  readonly showRequestId = computed(() => this.error().code === 'INTERNAL_ERROR');
}
