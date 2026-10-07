export type AtlasenderErrorCode =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "NO_CREDITS"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "UPSTREAM_ERROR";

export class AtlasenderError extends Error {
  constructor(
    readonly code: AtlasenderErrorCode,
    readonly upstreamStatus?: number,
  ) {
    super(code);
    this.name = "AtlasenderError";
  }
}

export function codeFromStatus(status: number): AtlasenderErrorCode {
  if (status === 404) return "NOT_FOUND";
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 402) return "NO_CREDITS";
  if (status === 429) return "RATE_LIMITED";
  return "UPSTREAM_ERROR";
}
