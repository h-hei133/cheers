import type { ProductSurfaceFact } from "./types.js";

export function sanitizeFactValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "none";
  }
  if (typeof value === "string") {
    return value.slice(0, 120);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 5).map(String).join(", ");
  }
  return JSON.stringify(value).slice(0, 120);
}

export function buildFact(
  label: string,
  value: unknown,
  sourceEvidenceId?: string,
): ProductSurfaceFact {
  return {
    label,
    value: sanitizeFactValue(value),
    ...(sourceEvidenceId ? { sourceEvidenceId } : {}),
  };
}
