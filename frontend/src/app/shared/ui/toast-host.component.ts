import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/errors/toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @keyframes toast-enter {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes toast-leave {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
    }

    .toast-item {
      animation: toast-enter 0.28s ease-out both;
    }

    .toast-item--leaving {
      animation: toast-leave 0.32s ease-in forwards;
      pointer-events: none;
    }
  `,
  template: `
    <div
      class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      @for (t of toasts(); track t.id) {
        <div
          class="toast-item pointer-events-auto rounded border px-3 py-2 text-sm shadow-lg transition-shadow"
          [class.toast-item--leaving]="t.leaving"
          [class.border-[var(--sentra-severity-critical)]]="t.kind === 'error'"
          [class.bg-[var(--sentra-bg-panel)]]="true"
          [class.border-[var(--sentra-line)]]="t.kind !== 'error'"
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-[var(--sentra-text-hi)]">{{ t.message }}</div>
              @if (t.requestId) {
                <div class="mt-1 font-mono text-[10px] text-[var(--sentra-text-low)]">
                  {{ t.requestId }}
                </div>
              }
            </div>
            <button
              type="button"
              class="text-[var(--sentra-text-low)] hover:text-[var(--sentra-text-hi)]"
              (click)="dismiss(t.id)"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  private readonly toast = inject(ToastService);
  readonly toasts = this.toast.toasts;

  dismiss(id: string): void {
    this.toast.dismiss(id);
  }
}
