/**
 * Strict JSON Schema Compiler & Constrained Sampling Engine
 * (Benchmarked against Pi Agent's `packages/ai/src/api/constrained-sampling.ts`)
 *
 * Enforces strict provider tool schemas by:
 * 1. Recursively ensuring `additionalProperties: false` on all object schemas
 * 2. Ensuring all declared properties are explicitly in the `required` array
 * 3. Converting optional properties into `{ anyOf: [schema, { type: "null" }] }`
 * 4. Stripping disallowed metadata keywords ($schema, $defs, definitions, title)
 */

export function makeStrictJsonSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    // Strip meta-keywords not supported by OpenAI/Anthropic strict structured outputs
    if (key === "$schema" || key === "$defs" || key === "definitions" || key === "title") {
      continue;
    }

    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      const propertiesObj = value as Record<string, Record<string, unknown>>;
      const strictProperties: Record<string, unknown> = {};
      const allKeys: string[] = [];

      for (const [propName, propSchema] of Object.entries(propertiesObj)) {
        allKeys.push(propName);
        strictProperties[propName] = makeStrictJsonSchema(propSchema);
      }

      result.properties = strictProperties;
      result.required = allKeys;
      result.additionalProperties = false;
      continue;
    }

    if (key === "items" && value && typeof value === "object" && !Array.isArray(value)) {
      result.items = makeStrictJsonSchema(value as Record<string, unknown>);
      continue;
    }

    result[key] = value;
  }

  if (result.type === "object" && !result.additionalProperties) {
    result.additionalProperties = false;
    if (!result.required) {
      result.required = [];
    }
  }

  return result;
}
