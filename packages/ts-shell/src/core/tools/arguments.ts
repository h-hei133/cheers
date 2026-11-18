import { compileValidator } from '../validation/compiler.js';
import { captureSchema } from '../validation/capture.js';
import type { CompiledValidator } from '../validation/contract.js';
const cache = new WeakMap<object, { source: string; validate: CompiledValidator }>();
export function validateToolArguments(schema: Record<string, unknown>, args: unknown): asserts args is Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid tool arguments: expected an object.');
  let validate: CompiledValidator;
  try {
    const captured = captureSchema(schema), current = cache.get(schema);
    if (current?.source === captured.source) validate = current.validate;
    else { validate = compileValidator(captured.schema); cache.set(schema, { source: captured.source, validate }); }
  } catch { throw new Error('Tool argument schema is invalid or unsupported; execution blocked.'); }
  if (!validate(args)) throw new Error('Invalid tool arguments: ' + (validate.errors?.[0]?.keyword ?? 'schema') + ' constraint failed.');
}
