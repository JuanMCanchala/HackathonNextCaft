/** Convert RFC 3339 / ISO-8601 timestamp to epoch milliseconds. */
export function fromRfc3339(value: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid RFC3339 timestamp: ${value}`);
  }
  return ms;
}

/** Convert epoch milliseconds to RFC 3339 UTC. */
export function toRfc3339(epochMs: number): string {
  return new Date(epochMs).toISOString();
}
