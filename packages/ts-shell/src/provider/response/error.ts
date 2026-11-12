import { classifyProviderFailure, type ProviderFailureClass } from '../registry/provider.js';

/** A decoder reached EOF without the endpoint's completion evidence. */
export class IncompleteStreamError extends Error {
  readonly failureClass = 'provider_stream_protocol_error';

  constructor() {
    super('Provider stream ended before it reported the message was complete');
    this.name = 'IncompleteStreamError';
  }
}

/** An in-band API refusal; only its closed category crosses the response boundary. */
export class ProviderResponseError extends Error {
  constructor(readonly failureClass: ProviderFailureClass) {
    super('Provider reported an error: ' + failureClass + '. Response details withheld.');
    this.name = 'ProviderResponseError';
  }
}

/** Inspect provider detail privately, without retaining its frame, message or cause. */
export function providerResponseError(error: unknown): ProviderResponseError {
  const detail = error && typeof error === 'object' && !Array.isArray(error)
    ? error as Record<string, unknown> : {};
  const tags = [detail.type, detail.code].filter((value): value is string => typeof value === 'string');
  const message = [...tags, typeof detail.message === 'string' ? detail.message : ''].join(' ');
  let failureClass = classifyProviderFailure({ message });
  if (tags.some(tag => /^(?:authentication_error|invalid_api_key|permission_error)$/i.test(tag))) {
    failureClass = 'provider_auth';
  } else if (tags.some(tag => /^(?:rate_limit_error|rate_limit_exceeded|rate_limited)$/i.test(tag))) {
    failureClass = 'provider_rate_limited';
  } else if (failureClass !== 'provider_safety_block' && failureClass !== 'provider_rate_limited') {
    // An explicit API error is endpoint evidence, even when its prose mentions
    // capacity, sockets or an HTTP number. None of those creates HTTP metadata.
    failureClass = 'provider_endpoint';
  }
  return new ProviderResponseError(failureClass);
}
