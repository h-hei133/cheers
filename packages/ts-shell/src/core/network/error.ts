export type NetworkFailure = 'cancelled' | 'timeout' | 'response_limit' | 'invalid_response'
  | 'rate_limited' | 'denied' | 'http_error' | 'network_error' | 'redirect_limit';

/** Safe fields only. Response bodies, status text, URLs and native errors stay out. */
export class NetworkError extends Error {
  constructor(readonly code: NetworkFailure, readonly status?: number) {
    super(code);
    this.name = 'NetworkError';
  }
}

export function httpError(status: number): NetworkError {
  return new NetworkError(status === 429 ? 'rate_limited'
    : status === 401 || status === 403 ? 'denied' : 'http_error', status);
}

export function networkFailure(error: unknown): { code: NetworkFailure; status?: number } {
  return error instanceof NetworkError
    ? { code: error.code, ...(error.status === undefined ? {} : { status: error.status }) }
    : { code: 'network_error' };
}
