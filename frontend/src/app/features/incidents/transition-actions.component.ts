import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PermissionService } from '../../core/permissions/permission.service';
import {
  allowedCommands,
  COMMAND_RULES,
  type IncidentCommand,
} from '../../core/incidents/incident-state-machine';
import type { IncidentState, OperationalSeverity } from '../../core/models/enums';
import { OPERATIONAL_SEVERITIES } from '../../core/models/enums';

@Component({
  selector: 'app-transition-actions',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!canTransition()) {
      <p class="text-xs text-[var(--sentra-text-low)]">Solo lectura (rol sin permisos de transición).</p>
    } @else if (commands().length === 0) {
      <p class="text-xs text-[var(--sentra-text-mid)]">Estado terminal — sin acciones.</p>
    } @else {
      <div class="flex flex-wrap gap-2">
        @for (cmd of commands(); track cmd) {
          <button
            type="button"
            class="rounded border border-[var(--sentra-line)] px-3 py-1.5 text-sm text-[var(--sentra-text-hi)] hover:border-[var(--sentra-signal-cyan)]"
            [disabled]="busy()"
            (click)="onCommand(cmd)"
          >
            {{ cmd }}
          </button>
        }
      </div>

      @if (pendingDismiss()) {
        <div class="mt-3 space-y-2 rounded border border-[var(--sentra-line)] p-3">
          <label class="block text-xs text-[var(--sentra-text-low)]">
            Motivo (requerido para dismiss)
            <textarea
              class="mt-1 w-full rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel-2)] p-2 text-sm"
              rows="2"
              maxlength="500"
              [ngModel]="dismissReason()"
              (ngModelChange)="dismissReason.set($event)"
            ></textarea>
          </label>
          <button
            type="button"
            class="rounded bg-[var(--sentra-severity-critical)] px-3 py-1.5 text-sm text-white disabled:opacity-40"
            [disabled]="!dismissReason().trim() || busy()"
            (click)="confirmDismiss()"
          >
            Confirmar dismiss
          </button>
        </div>
      }

      @if (canSeverity()) {
        <div class="mt-4 space-y-2 rounded border border-[var(--sentra-line)] p-3">
          <div class="text-xs uppercase tracking-wide text-[var(--sentra-text-low)]">
            Severidad operacional
          </div>
          <select
            class="rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel-2)] px-2 py-1.5 text-sm"
            [ngModel]="severityDraft()"
            (ngModelChange)="severityDraft.set($event)"
          >
            @for (s of severities; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
          <input
            class="w-full rounded border border-[var(--sentra-line)] bg-[var(--sentra-bg-panel-2)] px-2 py-1.5 text-sm"
            placeholder="Motivo del cambio (requerido)"
            maxlength="500"
            [ngModel]="severityReason()"
            (ngModelChange)="severityReason.set($event)"
          />
          <button
            type="button"
            class="rounded border border-[var(--sentra-line)] px-3 py-1.5 text-sm disabled:opacity-40"
            [disabled]="!severityReason().trim() || severityDraft() === severity() || busy()"
            (click)="confirmSeverity()"
          >
            Actualizar severidad
          </button>
        </div>
      }
    }
  `,
})
export class TransitionActionsComponent {
  private readonly permissions = inject(PermissionService);

  readonly state = input.required<IncidentState>();
  readonly severity = input.required<OperationalSeverity>();
  readonly busy = input(false);

  readonly triage = output<void>();
  readonly acknowledge = output<void>();
  readonly resolve = output<void>();
  readonly dismiss = output<string>();
  readonly severityChange = output<{ severity: OperationalSeverity; reason: string }>();

  readonly commands = computed(() => allowedCommands(this.state()));
  readonly canTransition = computed(() => this.permissions.can('incident:transition'));
  readonly canSeverity = computed(() => this.permissions.can('incident:severity'));

  readonly severities = OPERATIONAL_SEVERITIES;
  readonly requiresReason = COMMAND_RULES.dismiss.requiresReason;

  readonly dismissReason = signal('');
  readonly severityReason = signal('');
  readonly severityDraft = signal<OperationalSeverity>('medium');
  readonly pendingDismiss = signal(false);

  onCommand(cmd: IncidentCommand): void {
    if (cmd === 'dismiss') {
      this.pendingDismiss.set(true);
      return;
    }
    if (cmd === 'triage') this.triage.emit();
    if (cmd === 'acknowledge') this.acknowledge.emit();
    if (cmd === 'resolve') this.resolve.emit();
  }

  confirmDismiss(): void {
    const reason = this.dismissReason().trim();
    if (!reason) return;
    this.dismiss.emit(reason);
    this.pendingDismiss.set(false);
    this.dismissReason.set('');
  }

  confirmSeverity(): void {
    const reason = this.severityReason().trim();
    const next = this.severityDraft();
    if (!reason || next === this.severity()) return;
    this.severityChange.emit({ severity: next, reason });
    this.severityReason.set('');
  }
}
