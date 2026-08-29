import type { Doc } from "../../_generated/dataModel";
import { toRfc3339 } from "../time";

export type WorkspaceSummaryDto = {
  id: string;
  name: string;
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceDetailDto = WorkspaceSummaryDto & {
  settings: {
    groupingWindowSeconds: number;
    retentionDays: number;
    timezone: string;
  };
};

export function toWorkspaceSummary(doc: Doc<"workspaces">): WorkspaceSummaryDto {
  return {
    id: doc._id,
    name: doc.name,
    status: doc.status,
    createdAt: toRfc3339(doc.createdAt),
    updatedAt: toRfc3339(doc.updatedAt),
  };
}

export function toWorkspaceDetail(doc: Doc<"workspaces">): WorkspaceDetailDto {
  return {
    ...toWorkspaceSummary(doc),
    settings: {
      groupingWindowSeconds: doc.settings.groupingWindowSeconds,
      retentionDays: doc.settings.retentionDays,
      timezone: doc.settings.timezone,
    },
  };
}
