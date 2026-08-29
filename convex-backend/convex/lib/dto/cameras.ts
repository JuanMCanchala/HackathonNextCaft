import type { Doc } from "../../_generated/dataModel";
import { toRfc3339 } from "../time";

export type CameraDto = {
  id: string;
  workspaceId: string;
  externalId: string;
  label: string;
  location: string | null;
  adminStatus: "active" | "paused" | "disabled";
  connectivity: "online" | "offline" | "degraded" | "unknown";
  lastHeartbeatAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export function toCamera(doc: Doc<"cameras">): CameraDto {
  return {
    id: doc._id,
    workspaceId: doc.workspaceId,
    externalId: doc.externalId,
    label: doc.label,
    location: doc.location,
    adminStatus: doc.adminStatus,
    connectivity: doc.connectivity,
    lastHeartbeatAt:
      doc.lastHeartbeatAt === null ? null : toRfc3339(doc.lastHeartbeatAt),
    version: doc.version,
    createdAt: toRfc3339(doc.createdAt),
    updatedAt: toRfc3339(doc.updatedAt),
  };
}
