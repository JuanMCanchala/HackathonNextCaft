import type { WebhookDeliveryState, WebhookStatus } from './enums';

export interface WebhookSubscription {
  id: string;
  workspaceId: string;
  endpointUrl: string;
  eventTypes: string[];
  status: WebhookStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  eventId: string;
  eventType: string;
  state: WebhookDeliveryState;
  attempts: number;
  lastResponseStatus: number | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}
