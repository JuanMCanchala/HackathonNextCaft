import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { ApiClient } from '../../core/http/api-client.service';
import { appendParam, buildListIncidentsParams } from '../../core/http/query-params';
import type { Detection } from '../../core/models/detection';
import type { EvidenceDescriptor } from '../../core/models/evidence';
import type { IncidentDetail, IncidentSummary } from '../../core/models/incident';
import type { Page } from '../../core/models/page';
import type {
  DismissRequest,
  ListIncidentsQuery,
  PatchIncidentRequest,
  TransitionRequest,
  TriageRequest,
} from '../../core/models/requests';
import {
  detectionSchema,
  evidenceDescriptorSchema,
  incidentDetailSchema,
  incidentSummarySchema,
  clampLimit,
} from '../../core/validation/schemas';
import type { IncidentRepository } from './incident.repository';

@Injectable()
export class ApiIncidentRepository implements IncidentRepository {
  private readonly api = inject(ApiClient);

  list(query: ListIncidentsQuery): Promise<Page<IncidentSummary>> {
    return this.api.getPage('/incidents', incidentSummarySchema, buildListIncidentsParams(query));
  }

  get(id: string): Promise<IncidentDetail> {
    return this.api.get(`/incidents/${id}`, incidentDetailSchema);
  }

  triage(id: string, body: TriageRequest): Promise<IncidentDetail> {
    return this.api.post(`/incidents/${id}/triage`, incidentDetailSchema, body);
  }

  acknowledge(id: string, body: TransitionRequest): Promise<IncidentDetail> {
    return this.api.post(`/incidents/${id}/acknowledge`, incidentDetailSchema, body);
  }

  resolve(id: string, body: TransitionRequest): Promise<IncidentDetail> {
    return this.api.post(`/incidents/${id}/resolve`, incidentDetailSchema, body);
  }

  dismiss(id: string, body: DismissRequest): Promise<IncidentDetail> {
    return this.api.post(`/incidents/${id}/dismiss`, incidentDetailSchema, body);
  }

  patch(id: string, body: PatchIncidentRequest): Promise<IncidentDetail> {
    return this.api.patch(`/incidents/${id}`, incidentDetailSchema, body);
  }

  listDetections(id: string, cursor?: string, limit?: number): Promise<Page<Detection>> {
    let params = new HttpParams().set('limit', String(clampLimit(limit)));
    params = appendParam(params, 'cursor', cursor);
    return this.api.getPage(`/incidents/${id}/detections`, detectionSchema, params);
  }

  listEvidence(id: string, cursor?: string, limit?: number): Promise<Page<EvidenceDescriptor>> {
    let params = new HttpParams().set('limit', String(clampLimit(limit)));
    params = appendParam(params, 'cursor', cursor);
    return this.api.getPage(`/incidents/${id}/evidence`, evidenceDescriptorSchema, params);
  }
}
