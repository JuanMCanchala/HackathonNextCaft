import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CAMERA_ADMIN_STATUSES,
  CAMERA_CONNECTIVITIES,
  INCIDENT_STATES,
  OPERATIONAL_SEVERITIES,
} from '../../core/models/enums';
import { HlmInputDirective } from './primitives';

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
  imports: [FormsModule, HlmInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sentra-panel flex flex-wrap items-end gap-3 p-4">
      @if (mode() === 'incidents') {
        <label class="text-xs text-muted-foreground">
          Estado
          <select
            multiple
            hlmInput
            class="mt-1 block min-h-[5rem] min-w-[140px]"
            [ngModel]="incidentFilters().state"
            (ngModelChange)="onIncident('state', $event)"
          >
            @for (s of states; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </label>
        <label class="text-xs text-muted-foreground">
          Severidad
          <select
            multiple
            hlmInput
            class="mt-1 block min-h-[5rem] min-w-[140px]"
            [ngModel]="incidentFilters().severity"
            (ngModelChange)="onIncident('severity', $event)"
          >
            @for (s of severities; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </label>
        <label class="text-xs text-muted-foreground">
          Categoría
          <input
            hlmInput
            class="mt-1 w-40"
            [ngModel]="incidentFilters().category"
            (ngModelChange)="onIncident('category', $event)"
          />
        </label>
        <label class="text-xs text-muted-foreground">
          Cámara
          <input
            hlmInput
            class="mt-1 w-40 font-mono"
            [ngModel]="incidentFilters().cameraId"
            (ngModelChange)="onIncident('cameraId', $event)"
          />
        </label>
      } @else {
        <label class="text-xs text-muted-foreground">
          Admin
          <select
            hlmInput
            class="mt-1 block min-w-[140px]"
            [ngModel]="cameraFilters().adminStatus"
            (ngModelChange)="onCamera('adminStatus', $event)"
          >
            <option value="">Todos</option>
            @for (s of adminStatuses; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </label>
        <label class="text-xs text-muted-foreground">
          Conectividad
          <select
            hlmInput
            class="mt-1 block min-w-[140px]"
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
  readonly incidentChange = output<IncidentFilterValue>();
  readonly cameraChange = output<CameraFilterValue>();

  readonly states = INCIDENT_STATES;
  readonly severities = OPERATIONAL_SEVERITIES;
  readonly adminStatuses = CAMERA_ADMIN_STATUSES;
  readonly connectivities = CAMERA_CONNECTIVITIES;

  onIncident(key: keyof IncidentFilterValue, value: string | string[]): void {
    this.incidentChange.emit({ ...this.incidentFilters(), [key]: value });
  }

  onCamera(key: keyof CameraFilterValue, value: string): void {
    this.cameraChange.emit({ ...this.cameraFilters(), [key]: value });
  }
}
