import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CAMERA_ADMIN_STATUSES,
  CAMERA_CONNECTIVITIES,
  INCIDENT_STATES,
  OPERATIONAL_SEVERITIES,
} from '../../core/models/enums';
import { severityLabel, stateLabel } from '../copy/labels';
import { HlmButtonDirective, HlmInputDirective } from './primitives';

export type FilterBarMode = 'incidents' | 'cameras';

export interface IncidentFilterValue {
  state: string[];
  severity: string[];
  category: string;
  cameraId: string;
}

export interface CameraFilterValue {
  adminStatus: string;
  connectivity: string;
}

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule, HlmInputDirective, HlmButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sentra-panel space-y-4 p-4">
      @if (mode() === 'incidents') {
        <div class="space-y-2">
          <div class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Estado
          </div>
          <div class="flex flex-wrap gap-2">
            @for (s of states; track s) {
              <button
                type="button"
                hlmBtn
                size="sm"
                [variant]="isSelected('state', s) ? 'default' : 'outline'"
                class="capitalize"
                (click)="toggleIncident('state', s)"
              >
                {{ stateLabel(s) }}
              </button>
            }
          </div>
        </div>

        <div class="space-y-2">
          <div class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Severidad
          </div>
          <div class="flex flex-wrap gap-2">
            @for (s of severities; track s) {
              <button
                type="button"
                hlmBtn
                size="sm"
                [variant]="isSelected('severity', s) ? 'default' : 'outline'"
                class="capitalize"
                (click)="toggleIncident('severity', s)"
              >
                {{ severityLabel(s) }}
              </button>
            }
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block text-xs text-muted-foreground">
            Categoría
            <input
              hlmInput
              class="mt-2"
              placeholder="intrusion, fall…"
              [ngModel]="incidentFilters().category"
              (ngModelChange)="onIncident('category', $event)"
            />
          </label>
          <label class="block text-xs text-muted-foreground">
            Cámara
            <input
              hlmInput
              class="mt-2 font-mono"
              placeholder="ID de cámara"
              [ngModel]="incidentFilters().cameraId"
              (ngModelChange)="onIncident('cameraId', $event)"
            />
          </label>
        </div>

        @if (hasIncidentFilters()) {
          <button type="button" hlmBtn variant="ghost" size="sm" (click)="clearIncidentFilters()">
            Limpiar filtros
          </button>
        }
      } @else {
        <div class="grid gap-4" [class.sm:grid-cols-2]="showCameraConnectivity()">
          <label class="block text-xs text-muted-foreground">
            Admin
            <select
              hlmInput
              class="mt-2"
              [ngModel]="cameraFilters().adminStatus"
              (ngModelChange)="onCamera('adminStatus', $event)"
            >
              <option value="">Todos</option>
              @for (s of adminStatuses; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </label>
          @if (showCameraConnectivity()) {
            <label class="block text-xs text-muted-foreground">
              Conectividad
              <select
                hlmInput
                class="mt-2"
                [ngModel]="cameraFilters().connectivity"
                (ngModelChange)="onCamera('connectivity', $event)"
              >
                <option value="">Todos</option>
                @for (s of connectivities; track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>
            </label>
          }
        </div>
      }
    </div>
  `,
})
export class FilterBarComponent {
  readonly mode = input.required<FilterBarMode>();
  readonly incidentFilters = input<IncidentFilterValue>({
    state: [],
    severity: [],
    category: '',
    cameraId: '',
  });
  readonly cameraFilters = input<CameraFilterValue>({ adminStatus: '', connectivity: '' });
  readonly showCameraConnectivity = input(true);
  readonly incidentChange = output<IncidentFilterValue>();
  readonly cameraChange = output<CameraFilterValue>();

  readonly states = INCIDENT_STATES;
  readonly severities = OPERATIONAL_SEVERITIES;
  readonly adminStatuses = CAMERA_ADMIN_STATUSES;
  readonly connectivities = CAMERA_CONNECTIVITIES;

  readonly stateLabel = stateLabel;
  readonly severityLabel = severityLabel;

  isSelected(key: 'state' | 'severity', value: string): boolean {
    return this.incidentFilters()[key].includes(value);
  }

  toggleIncident(key: 'state' | 'severity', value: string): void {
    const current = [...this.incidentFilters()[key]];
    const idx = current.indexOf(value);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(value);
    this.onIncident(key, current);
  }

  hasIncidentFilters(): boolean {
    const f = this.incidentFilters();
    return (
      f.state.length > 0 ||
      f.severity.length > 0 ||
      f.category.trim().length > 0 ||
      f.cameraId.trim().length > 0
    );
  }

  clearIncidentFilters(): void {
    this.incidentChange.emit({ state: [], severity: [], category: '', cameraId: '' });
  }

  onIncident(key: keyof IncidentFilterValue, value: string | string[]): void {
    this.incidentChange.emit({ ...this.incidentFilters(), [key]: value });
  }

  onCamera(key: keyof CameraFilterValue, value: string): void {
    this.cameraChange.emit({ ...this.cameraFilters(), [key]: value });
  }
}
