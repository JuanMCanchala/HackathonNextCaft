import { Injectable, inject, signal } from '@angular/core';
import { EVIDENCE_REPOSITORY } from '../../core/config/injection-tokens';
import type { EvidenceAccessGrant, EvidenceDescriptor } from '../../core/models/evidence';
import type { NormalizedError } from '../../core/models/errors';
import { SentraHttpError } from '../../core/http/error.interceptor';

@Injectable()
export class EvidenceService {
  private readonly repo = inject(EVIDENCE_REPOSITORY);
  private grant: EvidenceAccessGrant | null = null;

  private readonly _url = signal<string | null>(null);
  private readonly _status = signal<'idle' | 'loading' | 'ready' | 'unavailable' | 'error'>('idle');
  private readonly _error = signal<NormalizedError | null>(null);

  readonly url = this._url.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();

  async open(descriptor: EvidenceDescriptor, purpose = 'incident-detail'): Promise<void> {
    if (descriptor.status === 'unavailable' || descriptor.status === 'failed') {
      this._status.set('unavailable');
      return;
    }
    if (descriptor.status === 'expired') {
      this._status.set('unavailable');
      return;
    }

    if (this.grant && this.grant.evidenceId === descriptor.id && Date.now() < Date.parse(this.grant.expiresAt)) {
      this._url.set(this.grant.url);
      this._status.set('ready');
      return;
    }

    this._status.set('loading');
    try {
      const grant = await this.repo.requestAccess(descriptor.id, { purpose, ttlSeconds: 120 });
      this.grant = grant;
      this._url.set(grant.url);
      this._status.set('ready');
    } catch (err) {
      if (err instanceof SentraHttpError && err.normalized.code === 'EVIDENCE_UNAVAILABLE') {
        this._status.set('unavailable');
      } else {
        this._status.set('error');
        this._error.set(
          err instanceof SentraHttpError
            ? err.normalized
            : {
                code: 'INTERNAL_ERROR',
                message: 'No se pudo obtener evidencia',
                requestId: 'client',
                httpStatus: 500,
              },
        );
      }
    }
  }

  /** Call before display; refreshes if past expiresAt. */
  async ensureFresh(descriptor: EvidenceDescriptor): Promise<void> {
    if (!this.grant || Date.now() >= Date.parse(this.grant.expiresAt)) {
      await this.open(descriptor);
    }
  }

  clear(): void {
    this.grant = null;
    this._url.set(null);
    this._status.set('idle');
  }
}
