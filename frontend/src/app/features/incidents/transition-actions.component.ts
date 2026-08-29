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
import { BACKEND_CAPABILITIES } from '../../core/config/backend-capabilities';
import {
  allowedCommands,
  COMMAND_RULES,
  type IncidentCommand,
} from '../../core/incidents/incident-state-machine';
import type { IncidentState, OperationalSeverity } from '../../core/models/enums';
import { OPERATIONAL_SEVERITIES } from '../../core/models/enums';
import { HlmButtonDirective, HlmInputDirective } from '../../shared/ui/primitives';

@Component({
  selector: 'app-transition-actions',
  standalone: true,
  imports: [FormsModule, HlmButtonDirective, HlmInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!canTransition()) {
      <p class="text-xs text-[var(--sentra-text-low)]">Solo lectura (rol sin permisos de transición).</p>
    } @else if (commands().length === 0) {
      <p class="text-xs text-[var(--sentra-text-mid)]">
        @if (caps.profile === 'convex-mvp' && state() === 'triaged') {
          Triage completado — ack/resolve/dismiss aún no están en el backend MVP.
        } @else {
          Estado terminal — sin acciones.
        }
      </p>
    } @else {
      <div class="flex flex-wrap gap-2">
        @for (cmd of commands(); track cmd) {
          <button
            type="button"
            hlmBtn
            variant="outline"
            size="sm"
            [disabled]="busy()"
            (click)="onCommand(cmd)"
          >
            {{ cmd }}
          </button>
        }
      </div>

      @if (pendingDismiss()) {
        <div class="sentra-inset mt-3 space-y-2">
          <label class="block text-xs text-muted-foreground">
            Motivo (requerido para dismiss)
            <textarea
              hlmInput
              class="mt-1 min-h-[4rem]"
              rows="2"
              maxlength="500"
              [ngModel]="dismissReason()"
              (ngModelChange)="dismissReason.set($event)"
            ></textarea>
          </label>
          <button
            type="button"
            hlmBtn
            variant="destructive"
            size="sm"
            [disabled]="!dismissReason().trim() || busy()"
            (click)="confirmDismiss()"
          >
            Confirmar dismiss
          </button>
        </div>
      }

      @if (canSeverity()) {
        <div class="sentra-inset mt-4 space-y-2">
          <div class="text-xs uppercase tracking-wide text-muted-foreground">
            Severidad operacional
          </div>
          <select
            hlmInput
            class="h-9"
            [ngModel]="severityDraft()"
            (ngModelChange)="severityDraft.set($event)"
          >
            @for (s of severities; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
          <input
            hlmInput
            placeholder="Motivo del cambio (requerido)"
            maxlength="500"
            [ngModel]="severityReason()"
            (ngModelChange)="severityReason.set($event)"
          />
          <button
            type="button"
            hlmBtn
            variant="secondary"
            size="sm"
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
  readonly caps = inject(BACKEND_CAPABILITIES);

  readonly state = input.required<IncidentState>();
  readonly severity = input.required<OperationalSeverity>();
  readonly busy = input(false);

  readonly triage = output<void>();
  readonly acknowledge = output<void>();
  readonly resolve = output<void>();
  readonly dismiss = output<string>();
  readonly severityChange = output<{ severity: OperationalSeverity; reason: string }>();

  readonly commands = computed(() =>
    allowedCommands(this.state(), this.caps.incidentCommands),
  );
  readonly canTransition = computed(() => this.permissions.can('incident:transition'));
  readonly canSeverity = computed(
    () => this.caps.incidentSeverityPatch && this.permissions.can('incident:severity'),
  );

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
