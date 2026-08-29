import { HttpParams } from '@angular/common/http';
import type { ListIncidentsQuery } from '../models/requests';
import { clampLimit } from '../validation/schemas';

export function appendParam(
  params: HttpParams,
  key: string,
  value: string | number | boolean | undefined | null,
): HttpParams {
  if (value === undefined || value === null || value === '') return params;
  return params.append(key, String(value));
}

export function appendMulti(
  params: HttpParams,
  key: string,
  values: string | string[] | undefined,
): HttpParams {
  if (!values) return params;
  const list = Array.isArray(values) ? values : [values];
  return list.reduce((p, v) => p.append(key, v), params);
}

export function buildListIncidentsParams(query: ListIncidentsQuery): HttpParams {
  let params = new HttpParams()
    .set('workspaceId', query.workspaceId)
    .set('limit', String(clampLimit(query.limit)));

  params = appendParam(params, 'cameraId', query.cameraId);
  params = appendParam(params, 'category', query.category);
  params = appendParam(params, 'from', query.from);
  params = appendParam(params, 'to', query.to);
  params = appendParam(params, 'cursor', query.cursor);
  params = appendMulti(params, 'state', query.state);
  params = appendMulti(params, 'severity', query.severity);

  return params;
}
