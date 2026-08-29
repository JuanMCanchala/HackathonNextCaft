import type { ListQuery, CreateWorkspaceRequest } from '../../core/models/requests';
import type { Page } from '../../core/models/page';
import type { WorkspaceDetail, WorkspaceSummary } from '../../core/models/workspace';

export interface WorkspaceRepository {
  list(query?: ListQuery): Promise<Page<WorkspaceSummary>>;
  get(id: string): Promise<WorkspaceDetail>;
  create(request: CreateWorkspaceRequest): Promise<WorkspaceDetail>;
  /**
   * Entrada rapida al workspace de demostracion, si el backend la ofrece.
   * Opcional: los backends de mock y el HTTP antiguo no la tienen, y no pasa
   * nada porque solo la usa la pantalla de seleccion cuando no hay ninguno.
   */
  joinDemo?(): Promise<string | null>;
}
