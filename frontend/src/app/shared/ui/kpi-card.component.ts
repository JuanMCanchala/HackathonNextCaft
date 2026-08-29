import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel)] p-4"
      [attr.aria-label]="label() + ': ' + value()"
    >
      <div class="text-xs uppercase tracking-wide text-[var(--sentra-text-low)]">{{ label() }}</div>
      <div class="mt-2 font-display text-2xl text-[var(--sentra-text-hi)]" [style.color]="accent() || null">
        {{ value() }}
      </div>
      @if (hint()) {
        <div class="mt-1 font-mono text-[10px] text-[var(--sentra-text-low)]">{{ hint() }}</div>
      }
    </div>
  `,
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string | null>(null);
  readonly accent = input<string | null>(null);
}
