import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Page } from '../../core/models/page';

@Component({
  selector: 'app-cursor-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-x-auto rounded border border-[var(--sentra-line)]">
      <table class="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead class="bg-[var(--sentra-bg-panel-2)] text-xs uppercase tracking-wide text-[var(--sentra-text-low)]">
          <tr>
            <ng-content select="[header]" />
          </tr>
        </thead>
        <tbody>
          <ng-content />
        </tbody>
      </table>
    </div>
    <div class="mt-3 flex items-center justify-between">
      <span class="font-mono text-xs text-[var(--sentra-text-low)]">
        {{ page().items.length }} ítems · limit {{ limit() }}
      </span>
      <button
        type="button"
        class="rounded border border-[var(--sentra-line)] px-3 py-1.5 text-xs text-[var(--sentra-text-hi)] disabled:opacity-40"
        [disabled]="!page().hasMore || loading()"
        (click)="loadMore.emit(page().nextCursor)"
      >
        Cargar más
      </button>
    </div>
  `,
})
export class CursorTableComponent<T> {
  readonly page = input.required<Page<T>>();
  readonly limit = input(25);
  readonly loading = input(false);
  readonly loadMore = output<string | null>();
}
