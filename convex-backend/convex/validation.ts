const MAX_MESSAGE_LENGTH = 8_000;

export function normalizeMessage(message: string): string {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new Error("Message cannot be empty.");
  }
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`);
  }
  return normalized;
}
