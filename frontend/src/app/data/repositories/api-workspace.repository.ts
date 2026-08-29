import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { ApiClient } from '../../core/http/api-client.service';
import { appendParam } from '../../core/http/query-params';
import type { Page } from '../../core/models/page';
import type { CreateWorkspaceRequest, ListQuery } from '../../core/models/requests';
import type { WorkspaceDetail, WorkspaceSummary } from '../../core/models/workspace';
import {
  workspaceDetailSchema,
  workspaceSummarySchema,
  clampLimit,
} from '../../core/validation/schemas';
import type { WorkspaceRepository } from './workspace.repository';

@Injectable()
export class ApiWorkspaceRepository implements WorkspaceRepository {
  private readonly api = inject(ApiClient);

  list(query?: ListQuery): Promise<Page<WorkspaceSummary>> {
    let params = new HttpParams().set('limit', String(clampLimit(query?.limit)));
    params = appendParam(params, 'cursor', query?.cursor);
    return this.api.getPage('/workspaces', workspaceSummarySchema, params);
  }

  get(id: string): Promise<WorkspaceDetail> {
    return this.api.get(`/workspaces/${id}`, workspaceDetailSchema);
  }

  create(request: CreateWorkspaceRequest): Promise<WorkspaceDetail> {
    return this.api.post('/workspaces', workspaceDetailSchema, request);
  }
}
