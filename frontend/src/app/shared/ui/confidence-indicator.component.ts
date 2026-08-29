import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { confidencePercent } from '../copy/labels';

/** confidence 0..1 → 0–100%. Nunca se usa como severidad. */
@Component({
  selector: 'app-confidence-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2" [attr.aria-label]="'Confianza del modelo ' + pct()">
      <div class="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--sentra-bg-panel-2)]">
        <div
          class="h-full rounded-full bg-[var(--sentra-signal-cyan)]"
          [style.width]="pct()"
        ></div>
      </div>
      <span class="font-mono text-xs text-[var(--sentra-text-mid)]">{{ pct() }}</span>
    </div>
  `,
})
export class ConfidenceIndicatorComponent {
  readonly confidence = input.required<number>();
  readonly pct = computed(() => confidencePercent(this.confidence()));
}
