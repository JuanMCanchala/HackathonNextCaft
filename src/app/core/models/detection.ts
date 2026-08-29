import type { Category } from './enums';

export interface Detection {
  id: string;
  workspaceId: string;
  cameraId: string;
  incidentId: string | null;
  occurredAt: string;
  receivedAt: string;
  category: Category;
  suggestedCategory: Category;
  /** 0..1 inclusive. Display-only; never operational severity. */
  confidence: number;
  modelVersion: string;
  detectorVersion: string;
  evidenceIds: string[];
  /** Additive (D-7): shown as generic key-value if present. */
  metadata?: Record<string, unknown>;
}
