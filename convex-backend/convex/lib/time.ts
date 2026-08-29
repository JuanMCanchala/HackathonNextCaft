/** Convert epoch milliseconds to RFC 3339 UTC. */
export function toRfc3339(epochMs: number): string {
  return new Date(epochMs).toISOString();
}
