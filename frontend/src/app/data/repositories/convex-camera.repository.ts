import { Injectable, inject } from '@angular/core';
import { ConvexClientService } from '../../core/convex/convex-client.service';
import type { Camera } from '../../core/models/camera';
import type { Page } from '../../core/models/page';
import type { CreateCameraRequest, ListCamerasQuery } from '../../core/models/requests';
import { cameraSchema, clampLimit, pageSchema } from '../../core/validation/schemas';
import { parseOrThrow } from '../../core/validation/parse';
import type { CameraRepository } from './camera.repository';

@Injectable()
export class ConvexCameraRepository implements CameraRepository {
  private readonly convex = inject(ConvexClientService);

  async list(query: ListCamerasQuery): Promise<Page<Camera>> {
    const raw = await this.convex.query<unknown>('cameras:list', {
      workspaceId: query.workspaceId,
      paginationOpts: {
        cursor: query.cursor ?? null,
        numItems: clampLimit(query.limit),
      },
    });
    return parseOrThrow(pageSchema(cameraSchema), raw);
  }

  async get(id: string): Promise<Camera> {
    const raw = await this.convex.query<unknown>('cameras:get', { cameraId: id });
    return parseOrThrow(cameraSchema, raw);
  }

  async create(request: CreateCameraRequest): Promise<Camera> {
    const raw = await this.convex.mutation<unknown>('cameras:create', {
      workspaceId: request.workspaceId,
      externalId: request.externalId,
      label: request.label,
      ...(request.location !== undefined ? { location: request.location } : {}),
      ...(request.adminStatus !== undefined ? { adminStatus: request.adminStatus } : {}),
    });
    return parseOrThrow(cameraSchema, raw);
  }
}
