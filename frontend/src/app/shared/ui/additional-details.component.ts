import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { KeyValuePipe } from '@angular/common';

/** Bloque genérico key-value para Detection.metadata (D-7). */
@Component({
  selector: 'app-additional-details',
  standalone: true,
  imports: [KeyValuePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (hasData()) {
      <div class="rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel)] p-3">
        <h3 class="mb-2 text-xs uppercase tracking-wide text-[var(--sentra-text-low)]">
          Detalles adicionales
        </h3>
        <dl class="space-y-1">
          @for (pair of metadata()! | keyvalue; track pair.key) {
            <div class="flex gap-3 text-xs">
              <dt class="font-mono text-[var(--sentra-text-low)]">{{ pair.key }}</dt>
              <dd class="text-[var(--sentra-text-hi)]">{{ format(pair.value) }}</dd>
            </div>
          }
        </dl>
      </div>
    }
  `,
})
export class AdditionalDetailsComponent {
  readonly metadata = input<Record<string, unknown> | null | undefined>(null);
  readonly hasData = computed(() => {
    const m = this.metadata();
    return !!m && Object.keys(m).length > 0;
  });

  format(value: unknown): string {
    if (value == null) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
