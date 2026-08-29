import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { IncidentTimelineEntry } from '../../core/models/incident';

@Component({
  selector: 'app-timeline-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="space-y-3 border-l border-[var(--sentra-line)] pl-4">
      @for (entry of ordered(); track entry.id) {
        <li class="relative">
          <span
            class="absolute -left-[1.35rem] top-1 h-2.5 w-2.5 rounded-full bg-[var(--sentra-signal-cyan)]"
            aria-hidden="true"
          ></span>
          <div class="font-mono text-[10px] text-[var(--sentra-text-low)]">{{ entry.at }}</div>
          <div class="text-sm text-[var(--sentra-text-hi)]">
            {{ entry.type }}
            @if (entry.from || entry.to) {
              <span class="text-[var(--sentra-text-mid)]">
                · {{ entry.from ?? '—' }} → {{ entry.to ?? '—' }}
              </span>
            }
          </div>
          <div class="text-xs text-[var(--sentra-text-mid)]">
            {{ entry.actorKind }}{{ entry.actorId ? ' · ' + entry.actorId : '' }}
          </div>
          @if (entry.message) {
            <p class="mt-1 text-xs text-[var(--sentra-text-low)]">{{ entry.message }}</p>
          }
        </li>
      }
    </ol>
  `,
})
export class TimelineViewComponent {
  readonly entries = input.required<IncidentTimelineEntry[]>();
  readonly ordered = computed(() =>
    [...this.entries()].sort((a, b) => a.at.localeCompare(b.at)),
  );
}
