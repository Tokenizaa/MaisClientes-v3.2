export const MIN_SESSION_TTL_MS = 10_000;
export const MAX_SESSION_TTL_MS = 1_200_000;
export const DEFAULT_SESSION_TTL_MS = 600_000;

export function parseSessionTtl(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_SESSION_TTL_MS;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("keepAliveMs must be an integer number of milliseconds.");
  }
  if (value < MIN_SESSION_TTL_MS || value > MAX_SESSION_TTL_MS) {
    throw new Error(`keepAliveMs must be between ${MIN_SESSION_TTL_MS} and ${MAX_SESSION_TTL_MS}.`);
  }
  return value;
}

export function isValidSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
