import { inject, Injectable } from '@angular/core';
import { HttpClient, type HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { z } from 'zod';
import { API_VERSION_PREFIX } from '../config/api.config';
import { SENTRA_API_BASE } from '../config/injection-tokens';
import { parseOrThrow } from '../validation/parse';
import { parsePage } from './response-parsers';
import type { Page } from '../models/page';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(SENTRA_API_BASE);

  url(path: string): string {
    return `${this.apiBase}${API_VERSION_PREFIX}${path}`;
  }

  get<T>(path: string, schema: z.ZodType<T>, params?: HttpParams): Promise<T> {
    return firstValueFrom(
      this.http.get<unknown>(this.url(path), { params }),
    ).then((data) => parseOrThrow(schema, data));
  }

  getPage<T>(path: string, itemSchema: z.ZodType<T>, params?: HttpParams): Promise<Page<T>> {
    return firstValueFrom(
      this.http.get<unknown>(this.url(path), { params }),
    ).then((data) => parsePage(itemSchema, data));
  }

  post<T>(path: string, schema: z.ZodType<T>, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.post<unknown>(this.url(path), body),
    ).then((data) => parseOrThrow(schema, data));
  }

  patch<T>(path: string, schema: z.ZodType<T>, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.patch<unknown>(this.url(path), body),
    ).then((data) => parseOrThrow(schema, data));
  }
}
