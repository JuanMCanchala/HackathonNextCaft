import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { NormalizedError } from '../../core/models/errors';
import { HlmButtonDirective, HlmCardComponent, HlmCardContentComponent } from './primitives';

@Component({
  selector: 'app-error-state',
  standalone: true,
  imports: [HlmCardComponent, HlmCardContentComponent, HlmButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-card
      class="border-destructive/40 bg-destructive/10 shadow-none"
      role="alert"
    >
      <hlm-card-content class="flex flex-col items-center gap-3 py-10 text-center">
        <div class="text-sm font-medium text-destructive">{{ heading() }}</div>
        <p class="text-xs text-muted-foreground">{{ error().message }}</p>
        @if (showRequestId()) {
          <code class="font-mono text-[10px] text-muted-foreground">
            requestId: {{ error().requestId }}
          </code>
        }
        <button type="button" hlmBtn variant="outline" size="sm" class="mt-2" (click)="retry.emit()">
          Reintentar
        </button>
      </hlm-card-content>
    </hlm-card>
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
