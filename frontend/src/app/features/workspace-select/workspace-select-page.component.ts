import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { Router } from '@angular/router';

import { BACKEND_CAPABILITIES } from '../../core/config/backend-capabilities';

import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';

import {

  HlmButtonDirective,

  HlmCardComponent,

  HlmCardContentComponent,

  HlmCardDescriptionComponent,

  HlmCardHeaderComponent,

  HlmCardTitleComponent,

  HlmInputDirective,

} from '../../shared/ui/primitives';



@Component({

  selector: 'app-workspace-select-page',

  standalone: true,

  imports: [

    HlmCardComponent,

    HlmCardHeaderComponent,

    HlmCardTitleComponent,

    HlmCardDescriptionComponent,

    HlmCardContentComponent,

    HlmButtonDirective,

    HlmInputDirective,

  ],

  changeDetection: ChangeDetectionStrategy.OnPush,

  template: `

    <div class="flex min-h-screen items-center justify-center bg-background p-6">

      <hlm-card class="w-full max-w-md gap-6 p-8">

        <hlm-card-header>

          <div class="mb-2 font-display text-sm tracking-widest text-primary">SENTRA</div>

          @if (isEmpty()) {

            <hlm-card-title>Crear workspace</hlm-card-title>

            <hlm-card-description>

              Aún no tienes un workspace. Crea uno para empezar a operar.

            </hlm-card-description>

          } @else {

            <hlm-card-title>Seleccionar workspace</hlm-card-title>

            <hlm-card-description>

              Elige el workspace activo para esta sesión.

            </hlm-card-description>

          }

        </hlm-card-header>

        <hlm-card-content class="space-y-6">

          @if (!isEmpty()) {

            <label class="block text-xs uppercase tracking-wide text-muted-foreground">

              Workspace

              <select

                hlmInput

                class="mt-2"

                [value]="selectedId()"

                (change)="onSelect($any($event).target.value)"

              >

                <option value="" disabled>Selecciona…</option>

                @for (ws of workspaces(); track ws.id) {

                  <option [value]="ws.id">{{ ws.name }}</option>

                }

              </select>

            </label>

            <button

              type="button"

              hlmBtn

              variant="default"

              class="w-full"

              [disabled]="!selectedId()"

              (click)="continue()"

            >

              Continuar al dashboard

            </button>

          }



          @if (canCreate()) {

            @if (!isEmpty()) {

              <div class="relative py-2 text-center text-xs uppercase tracking-wide text-muted-foreground">

                <span class="bg-card px-2">o crear uno nuevo</span>

              </div>

            }

            <label class="block text-xs uppercase tracking-wide text-muted-foreground">

              Nombre del workspace

              <input

                hlmInput

                class="mt-2"

                type="text"

                maxlength="128"

                placeholder="Ej. Planta Norte"

                [value]="newName()"

                (input)="onNameInput($any($event).target.value)"

              />

            </label>

            @if (errorMessage()) {

              <p class="text-sm text-destructive">{{ errorMessage() }}</p>

            }

            <button

              type="button"

              hlmBtn

              [variant]="isEmpty() ? 'default' : 'outline'"

              class="w-full"

              [disabled]="!canSubmitCreate()"

              (click)="createWorkspace()"

            >

              {{ creating() ? 'Creando…' : 'Crear workspace' }}

            </button>

          }

        </hlm-card-content>

      </hlm-card>

    </div>

  `,

})

export class WorkspaceSelectPageComponent {

  private readonly workspace = inject(WorkspaceContextService);

  private readonly router = inject(Router);

  private readonly caps = inject(BACKEND_CAPABILITIES);



  readonly workspaces = this.workspace.workspaces;

  readonly creating = this.workspace.creating;

  readonly isEmpty = this.workspace.isEmpty;

  readonly canCreate = computed(() => this.caps.workspaceCreate);

  readonly selectedId = signal('');

  readonly newName = signal('');

  readonly errorMessage = signal('');



  constructor() {

    void this.bootstrap();

  }



  private async bootstrap(): Promise<void> {

    if (this.workspace.workspaces().length === 0) {

      await this.workspace.refresh();

    }

  }



  canSubmitCreate(): boolean {

    return this.newName().trim().length > 0 && !this.creating();

  }



  onSelect(value: string): void {

    this.selectedId.set(value);

  }



  onNameInput(value: string): void {

    this.newName.set(value);

    this.errorMessage.set('');

  }



  continue(): void {

    const id = this.selectedId();

    if (!id) return;

    this.workspace.setWorkspace(id);

    void this.router.navigate(['/']);

  }



  async createWorkspace(): Promise<void> {

    const name = this.newName().trim();

    if (!name) return;



    this.errorMessage.set('');

    try {

      await this.workspace.create({ name, timezone: 'America/Bogota' });

      void this.router.navigate(['/']);

    } catch (err) {

      const message = err instanceof Error ? err.message : 'No se pudo crear el workspace';

      this.errorMessage.set(message);

    }

  }

}


