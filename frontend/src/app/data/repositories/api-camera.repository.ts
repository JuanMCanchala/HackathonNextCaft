import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { ApiClient } from '../../core/http/api-client.service';
import { appendParam } from '../../core/http/query-params';
import type { Camera } from '../../core/models/camera';
import type { ListCamerasQuery } from '../../core/models/requests';
import type { Page } from '../../core/models/page';
import { cameraSchema } from '../../core/validation/schemas';
import { clampLimit } from '../../core/validation/schemas';
import type { CameraRepository } from './camera.repository';

@Injectable()
export class ApiCameraRepository implements CameraRepository {
  private readonly api = inject(ApiClient);

  list(query: ListCamerasQuery): Promise<Page<Camera>> {
    let params = new HttpParams()
      .set('workspaceId', query.workspaceId)
      .set('limit', String(clampLimit(query.limit)));
    params = appendParam(params, 'adminStatus', query.adminStatus);
    params = appendParam(params, 'connectivity', query.connectivity);
    params = appendParam(params, 'cursor', query.cursor);
    return this.api.getPage('/cameras', cameraSchema, params);
  }

  get(id: string): Promise<Camera> {
    return this.api.get(`/cameras/${id}`, cameraSchema);
  }
}
