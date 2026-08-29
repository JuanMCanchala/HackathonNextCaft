import { Injectable, signal } from '@angular/core';
import type { NormalizedError } from '../models/errors';

export interface ToastMessage {
  id: string;
  kind: 'error' | 'info' | 'success';
  message: string;
  requestId?: string;
  leaving?: boolean;
}

/** Máximo activo; al llegar una nueva se descarta la más antigua (FIFO). */
const MAX_VISIBLE_TOASTS = 3;

const AUTO_DISMISS_MS: Record<ToastMessage['kind'], number> = {
  info: 5_000,
  success: 4_000,
  error: 8_000,
};

/** Duración de la animación de salida (debe coincidir con CSS). */
export const TOAST_LEAVE_MS = 320;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<ToastMessage[]>([]);
  private readonly dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    this.clearTimer(id);
    this.beginLeave(id);
  }

  private push(toast: ToastMessage): void {
    const active = this._toasts().filter((t) => !t.leaving);
    if (active.length >= MAX_VISIBLE_TOASTS) {
      const oldest = active[0];
      if (oldest) this.beginLeave(oldest.id);
    }

    this._toasts.update((list) => [...list, toast]);
    this.scheduleAutoDismiss(toast.id, toast.kind);
  }

  private beginLeave(id: string): void {
    if (this.leaveTimers.has(id)) return;

    const toast = this._toasts().find((t) => t.id === id);
    if (!toast || toast.leaving) return;

    this._toasts.update((list) =>
      list.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );

    const timer = setTimeout(() => this.remove(id), TOAST_LEAVE_MS);
    this.leaveTimers.set(id, timer);
  }

  private remove(id: string): void {
    this.clearLeaveTimer(id);
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private scheduleAutoDismiss(id: string, kind: ToastMessage['kind']): void {
    this.clearTimer(id);
    const timer = setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS[kind]);
    this.dismissTimers.set(id, timer);
  }

  private clearTimer(id: string): void {
    const timer = this.dismissTimers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.dismissTimers.delete(id);
  }

  private clearLeaveTimer(id: string): void {
    const timer = this.leaveTimers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.leaveTimers.delete(id);
  }
}
