import type { Camera } from '../../core/models/camera';
import type { CreateCameraRequest, ListCamerasQuery } from '../../core/models/requests';
import type { Page } from '../../core/models/page';
import { MOCK_CAMERAS } from '../mock/fixtures';
import type { CameraRepository } from './camera.repository';

export class MockCameraRepository implements CameraRepository {
  list(query: ListCamerasQuery): Promise<Page<Camera>> {
    let items = MOCK_CAMERAS.filter((c) => c.workspaceId === query.workspaceId);
    if (query.adminStatus) items = items.filter((c) => c.adminStatus === query.adminStatus);
    if (query.connectivity) items = items.filter((c) => c.connectivity === query.connectivity);
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }

  get(id: string): Promise<Camera> {
    const cam = MOCK_CAMERAS.find((c) => c.id === id);
    if (!cam) return Promise.reject(new Error('NOT_FOUND'));
    return Promise.resolve(cam);
  }

  create(request: CreateCameraRequest): Promise<Camera> {
    const now = new Date().toISOString();
    const cam: Camera = {
      id: `cam_${Date.now()}`,
      workspaceId: request.workspaceId,
      externalId: request.externalId,
      label: request.label,
      location: request.location ?? null,
      adminStatus: request.adminStatus ?? 'active',
      connectivity: 'unknown',
      lastHeartbeatAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    return Promise.resolve(cam);
  }
}
