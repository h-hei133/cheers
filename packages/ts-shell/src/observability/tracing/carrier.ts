import type { TelemetryCarrier } from './types.js';

const TRACE_ID = 'cheers-trace-id';
const SPAN_ID = 'cheers-span-id';

export function traceIdentity(carrier: TelemetryCarrier | undefined): { traceId: string; spanId: string } | undefined {
  try {
    const traceId = carrier?.[TRACE_ID];
    const spanId = carrier?.[SPAN_ID];
    if (typeof traceId !== 'string' || !/^[a-f0-9]{32}$/.test(traceId) || traceId.length !== 32 || /^0+$/.test(traceId)
      || typeof spanId !== 'string' || !/^[a-f0-9]{16}$/.test(spanId) || spanId.length !== 16 || /^0+$/.test(spanId)) return undefined;
    return { traceId, spanId };
  } catch { return undefined; }
}

/** Decode the W3C version 00 wire format. Only correlation identifiers enter the recorder. */
export function traceParentCarrier(value: unknown): TelemetryCarrier | undefined {
  if (typeof value !== 'string' || value.length !== 55) return undefined;
  const match = /^00-([a-f0-9]{32})-([a-f0-9]{16})-[a-f0-9]{2}$/.exec(value);
  if (!match) return undefined;
  const carrier = { [TRACE_ID]: match[1]!, [SPAN_ID]: match[2]! };
  return traceIdentity(carrier) ? carrier : undefined;
}
