import { Injectable } from '@angular/core';
import type { Category } from './enums';

/** Allowlist mock fija (D-9). Un solo servicio; reemplazable por endpoint de taxonomía. */
export const MOCK_CATEGORY_ALLOWLIST = [
  'fall',
  'intrusion',
  'sin casco',
  'posible robo',
  'posible altercado',
] as const satisfies readonly Category[];

@Injectable({ providedIn: 'root' })
export class CategoryTaxonomyService {
  allowlist(): readonly Category[] {
    return MOCK_CATEGORY_ALLOWLIST;
  }

  isAllowed(category: string): boolean {
    return (MOCK_CATEGORY_ALLOWLIST as readonly string[]).includes(category);
  }
}
