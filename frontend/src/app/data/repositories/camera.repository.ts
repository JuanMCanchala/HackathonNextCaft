import type { Camera } from '../../core/models/camera';
import type { Page } from '../../core/models/page';
import type { CreateCameraRequest, ListCamerasQuery } from '../../core/models/requests';

export interface CameraRepository {
  list(query: ListCamerasQuery): Promise<Page<Camera>>;
  get(id: string): Promise<Camera>;
  create(request: CreateCameraRequest): Promise<Camera>;
}
