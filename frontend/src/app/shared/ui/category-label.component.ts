import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { categoryLabel } from '../copy/labels';

@Component({
  selector: 'app-category-label',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="text-sm text-[var(--sentra-text-hi)]" [attr.title]="raw()">
      {{ display() }}
    </span>
  `,
})
export class CategoryLabelComponent {
  readonly category = input.required<string>();
  readonly raw = computed(() => this.category());
  readonly display = computed(() => categoryLabel(this.category()));
}
