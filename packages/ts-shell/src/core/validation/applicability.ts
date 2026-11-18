import { invalidSchema, type Dialect } from './contract.js';

/** Reject constraints that the admitted dialect would silently ignore. */
export function admitApplicability(schema: Record<string, unknown>, dialect: Dialect): void {
  const has = (name: string) => Object.hasOwn(schema, name);
  if ((has('then') || has('else')) && !has('if')) invalidSchema();
  if (has('if') && !has('then') && !has('else')) invalidSchema();
  if (has('additionalItems') && !Array.isArray(schema.items)) invalidSchema();
  if (dialect !== 'draft-07') {
    if ((has('minContains') || has('maxContains')) && !has('contains')) invalidSchema();
    if (has('contains') && (schema.minContains === 0 && !has('maxContains')
      || typeof schema.maxContains === 'number' && (typeof schema.minContains === 'number' ? schema.minContains : 1) > schema.maxContains)) invalidSchema();
  }
  if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)
    || !schema.patternProperties || typeof schema.patternProperties !== 'object' || Array.isArray(schema.patternProperties)) return;
  for (const [pattern, constraint] of Object.entries(schema.patternProperties)) {
    // Empty patterns impose no constraint, matching the existing admission policy.
    if (constraint === true || constraint && typeof constraint === 'object' && Object.keys(constraint).length === 0) continue;
    let expression: RegExp;
    try { expression = new RegExp(pattern, 'u'); } catch { return invalidSchema(); }
    if (Object.keys(schema.properties).some(name => expression.test(name))) invalidSchema();
  }
}
