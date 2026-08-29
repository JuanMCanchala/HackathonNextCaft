import { Injectable, inject } from '@angular/core';
import { ConvexClientService } from '../../core/convex/convex-client.service';
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
  clampLimit,
  incidentDetailSchema,
  incidentSummarySchema,
  pageSchema,
} from '../../core/validation/schemas';
import { parseOrThrow } from '../../core/validation/parse';
import { SentraHttpError } from '../../core/http/error.interceptor';
import type { IncidentRepository } from './incident.repository';

const emptyPage = <T>(): Page<T> => ({ items: [], nextCursor: null, hasMore: false });

@Injectable()
export class ConvexIncidentRepository implements IncidentRepository {
  private readonly convex = inject(ConvexClientService);

  async list(query: ListIncidentsQuery): Promise<Page<IncidentSummary>> {
    // Convex MVP: un solo `state` opcional (no multi, no severity/from/to/cameraId).
    const state = Array.isArray(query.state) ? query.state[0] : query.state;
    const raw = await this.convex.query<unknown>('incidents:list', {
      workspaceId: query.workspaceId,
      paginationOpts: {
        cursor: query.cursor ?? null,
        numItems: clampLimit(query.limit),
      },
      ...(state ? { state } : {}),
    });
    return parseOrThrow(pageSchema(incidentSummarySchema), raw);
  }

  async get(id: string): Promise<IncidentDetail> {
    const raw = await this.convex.query<unknown>('incidents:get', { incidentId: id });
    return parseOrThrow(incidentDetailSchema, raw);
  }

  async triage(id: string, body: TriageRequest): Promise<IncidentDetail> {
    const raw = await this.convex.mutation<unknown>('incidents:triage', {
      incidentId: id,
      expectedVersion: body.expectedVersion,
      idempotencyKey: crypto.randomUUID(),
      notes: body.notes ?? null,
      assignedToSubjectId: body.assignedToSubjectId ?? null,
      category: body.category ?? null,
    });
    return parseOrThrow(incidentDetailSchema, raw);
  }

  acknowledge(_id: string, _body: TransitionRequest): Promise<IncidentDetail> {
    return Promise.reject(this.unavailable('acknowledge'));
  }

  resolve(_id: string, _body: TransitionRequest): Promise<IncidentDetail> {
    return Promise.reject(this.unavailable('resolve'));
  }

  dismiss(_id: string, _body: DismissRequest): Promise<IncidentDetail> {
    return Promise.reject(this.unavailable('dismiss'));
  }

  patch(_id: string, _body: PatchIncidentRequest): Promise<IncidentDetail> {
    return Promise.reject(this.unavailable('patch severity'));
  }

  /** Convex MVP no expone listado nested; IDs vienen en IncidentDetail. */
  listDetections(_id: string): Promise<Page<Detection>> {
    return Promise.resolve(emptyPage());
  }

  listEvidence(_id: string): Promise<Page<EvidenceDescriptor>> {
    return Promise.resolve(emptyPage());
  }

  private unavailable(op: string): SentraHttpError {
    return new SentraHttpError({
      code: 'CONFLICT',
      message: `${op} is unavailable in MVP`,
      requestId: 'convex-mvp',
      httpStatus: 409,
    });
  }
}
