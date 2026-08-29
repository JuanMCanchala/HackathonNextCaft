import { ChangeDetectionStrategy, Component, inject, input, OnChanges } from '@angular/core';
import type { EvidenceDescriptor } from '../../core/models/evidence';
import { EvidenceService } from './evidence.service';

@Component({
  selector: 'app-evidence-viewer',
  standalone: true,
  providers: [EvidenceService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel)] p-3">
      <div class="mb-2 flex items-center justify-between text-xs text-[var(--sentra-text-low)]">
        <span class="font-mono">{{ descriptor().id }}</span>
        <span>{{ descriptor().status }} · {{ descriptor().kind }}</span>
      </div>

      @switch (svc.status()) {
        @case ('idle') {
          <button
            type="button"
            class="rounded border border-[var(--sentra-line)] px-3 py-1.5 text-sm"
            (click)="svc.open(descriptor())"
          >
            Ver evidencia
          </button>
        }
        @case ('loading') {
          <p class="text-sm text-[var(--sentra-text-mid)]">Solicitando acceso…</p>
        }
        @case ('ready') {
          <div class="space-y-2">
            <p class="font-mono text-[10px] break-all text-[var(--sentra-text-low)]">
              URL efímera (no se cachea ni registra)
            </p>
            <div
              class="flex h-40 items-center justify-center rounded bg-[var(--sentra-bg-panel-2)] text-xs text-[var(--sentra-text-mid)]"
            >
              Snapshot placeholder · {{ descriptor().contentType }}
            </div>
          </div>
        }
        @case ('unavailable') {
          <p class="text-sm text-[var(--sentra-severity-medium)]">Evidencia no disponible</p>
        }
        @case ('error') {
          <p class="text-sm text-[var(--sentra-severity-critical)]">
            {{ svc.error()?.message || 'Error' }}
          </p>
        }
      }
    </div>
  `,
})
export class EvidenceViewerComponent implements OnChanges {
  readonly descriptor = input.required<EvidenceDescriptor>();
  readonly svc = inject(EvidenceService);

  ngOnChanges(): void {
    this.svc.clear();
  }
}
