import { createHash } from 'node:crypto';

/** Summaries may omit fields or truncate strings; they cannot identify a call. */
export function approvalCallBinding(toolName: string, args: Record<string, unknown>, preparation?: {
  readonly permissionArgs?: Record<string, unknown>;
  readonly preview: string;
}): string | undefined {
  if (!['task', 'team', 'browser', 'ssh'].includes(toolName)) return undefined;
  // Prepared requests may capture the command, document or selected authority in
  // their reviewed preview rather than in the model's original arguments.
  const serialized = canonical([args, preparation?.permissionArgs ?? null, preparation?.preview ?? null], 0);
  return createHash('sha256').update(serialized).digest('hex');
}

/** JSON field order is irrelevant; array order and every literal string byte matter. */
function canonical(value: unknown, depth: number): string {
  if (depth > 64) throw new Error('Approval arguments exceed the supported JSON depth.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, item => canonical(item, depth + 1)).join(',')}]`;
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key], depth + 1)}`).join(',')}}`;
  }
  // Refuse non-JSON values rather than collapse undefined, NaN or custom objects.
  throw new Error('Approval arguments must contain only JSON values.');
}
