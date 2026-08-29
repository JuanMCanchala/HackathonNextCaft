import type { Page } from '../../core/models/page';
import type { WorkspaceDetail, WorkspaceSummary } from '../../core/models/workspace';
import { MOCK_WORKSPACES, getWorkspaceDetail } from '../mock/fixtures';
import type { WorkspaceRepository } from './workspace.repository';

function page<T>(items: T[], cursor?: string, limit = 25): Page<T> {
  const start = cursor ? items.findIndex((i) => (i as { id: string }).id === cursor) + 1 : 0;
  const slice = items.slice(Math.max(0, start), Math.max(0, start) + limit);
  const hasMore = start + limit < items.length;
  return {
    items: slice,
    nextCursor: hasMore && slice.length ? (slice[slice.length - 1] as { id: string }).id : null,
    hasMore,
  };
}

export class MockWorkspaceRepository implements WorkspaceRepository {
  list(query?: { cursor?: string; limit?: number }): Promise<Page<WorkspaceSummary>> {
    const summaries = MOCK_WORKSPACES.map(({ settings: _s, ...ws }) => ws);
    return Promise.resolve(page(summaries, query?.cursor, query?.limit));
  }

  get(id: string): Promise<WorkspaceDetail> {
    const detail = getWorkspaceDetail(id);
    if (!detail) return Promise.reject(new Error('NOT_FOUND'));
    return Promise.resolve(detail);
  }
}
