import { Injectable, inject } from '@angular/core';
import { ConvexClientService } from '../../core/convex/convex-client.service';
import type { Page } from '../../core/models/page';
import type { CreateWorkspaceRequest, ListQuery } from '../../core/models/requests';
import type { WorkspaceDetail, WorkspaceSummary } from '../../core/models/workspace';
import {
  clampLimit,
  pageSchema,
  workspaceDetailSchema,
  workspaceSummarySchema,
} from '../../core/validation/schemas';
import { parseOrThrow } from '../../core/validation/parse';
import type { WorkspaceRepository } from './workspace.repository';

@Injectable()
export class ConvexWorkspaceRepository implements WorkspaceRepository {
  private readonly convex = inject(ConvexClientService);

  async list(query?: ListQuery): Promise<Page<WorkspaceSummary>> {
    const raw = await this.convex.query<unknown>('workspaces:list', {
      paginationOpts: {
        cursor: query?.cursor ?? null,
        numItems: clampLimit(query?.limit),
      },
    });
    return parseOrThrow(pageSchema(workspaceSummarySchema), raw);
  }

  async get(id: string): Promise<WorkspaceDetail> {
    const raw = await this.convex.query<unknown>('workspaces:get', { workspaceId: id });
    return parseOrThrow(workspaceDetailSchema, raw);
  }

  async create(request: CreateWorkspaceRequest): Promise<WorkspaceDetail> {
    const raw = await this.convex.mutation<unknown>('workspaces:create', {
      name: request.name,
      ...(request.groupingWindowSeconds !== undefined
        ? { groupingWindowSeconds: request.groupingWindowSeconds }
        : {}),
      ...(request.retentionDays !== undefined ? { retentionDays: request.retentionDays } : {}),
      ...(request.timezone !== undefined ? { timezone: request.timezone } : {}),
    });
    return parseOrThrow(workspaceDetailSchema, raw);
  }
}
