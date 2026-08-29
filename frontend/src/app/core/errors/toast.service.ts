import { Injectable, signal } from '@angular/core';
import type { NormalizedError } from '../models/errors';

export interface ToastMessage {
  id: string;
  kind: 'error' | 'info' | 'success';
  message: string;
  requestId?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<ToastMessage[]>([]);
  readonly toasts = this._toasts.asReadonly();

  showError(error: NormalizedError): void {
    this.push({
      id: crypto.randomUUID(),
      kind: 'error',
      message: error.message,
      requestId: error.code === 'INTERNAL_ERROR' ? error.requestId : undefined,
    });
  }

  showInfo(message: string): void {
    this.push({ id: crypto.randomUUID(), kind: 'info', message });
  }

  dismiss(id: string): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(toast: ToastMessage): void {
    this._toasts.update((list) => [...list, toast]);
  }
}
