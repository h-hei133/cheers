import type { CompactContinuityPacket } from "../continuity/compactContinuityPacket.js";

export interface CompactRedactionPolicyInput {
  readonly packet: CompactContinuityPacket;
  readonly unsafeInputs?: Record<string, unknown>;
  readonly secretValues?: readonly string[];
}

export interface CompactRedactionPolicyResult {
  readonly packet: CompactContinuityPacket;
  readonly redactions: CompactContinuityPacket["redactions"];
  readonly warnings: CompactContinuityPacket["warnings"];
}

const SENSITIVE_KEY_PATTERNS = [
  /raw.*content/i,
  /original.*content/i,
  /recovery.*authority.*content/i,
  /full.*command.*output/i,
  /hidden.*chain.*thought/i,
  /chain.*of.*thought/i,
  /secret/i,
  /credential/i,
  /authorization/i,
  /api.*key/i,
  /^token$/i,
  /provider.*config/i,
  /^headers$/i,
];

const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\b[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
];

export function applyCompactRedactionPolicy(
  input: CompactRedactionPolicyInput,
): CompactRedactionPolicyResult {
  const redactions = [...input.packet.redactions];
  const warnings = [...input.packet.warnings];
  const secretValues = normalizeSecretValues(input.secretValues ?? []);
  const unsafeRedactions = collectUnsafeInputRedactions(input.unsafeInputs ?? {});
  redactions.push(...unsafeRedactions);

  const sanitized = sanitizeValue(input.packet, {
    path: "packet",
    redactions,
    warnings,
    secretValues,
  }) as CompactContinuityPacket;

  return {
    packet: {
      ...sanitized,
      redactions: dedupeRedactions(redactions),
      warnings: dedupeWarnings(warnings),
    },
    redactions: dedupeRedactions(redactions),
    warnings: dedupeWarnings(warnings),
  };
}

function sanitizeValue(
  value: unknown,
  context: {
    readonly path: string;
    readonly redactions: CompactContinuityPacket["redactions"] extends readonly (infer R)[] ? R[] : never;
    readonly warnings: CompactContinuityPacket["warnings"] extends readonly (infer W)[] ? W[] : never;
    readonly secretValues: readonly string[];
  },
): unknown {
  if (typeof value === "string") {
    return redactStringValue(value, context);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      sanitizeValue(entry, {
        ...context,
        path: `${context.path}[${index}]`,
      }),
    );
  }

  const output: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    const nextPath = `${context.path}.${key}`;
    if (isSensitiveKey(key)) {
      context.redactions.push({
        inputField: nextPath,
        reason: "sensitive or raw compact input removed",
      });
      continue;
    }
    output[key] = sanitizeValue(entryValue, {
      ...context,
      path: nextPath,
    });
  }
  return output;
}

function redactStringValue(
  value: string,
  context: {
    readonly path: string;
    readonly redactions: CompactContinuityPacket["redactions"] extends readonly (infer R)[] ? R[] : never;
    readonly warnings: CompactContinuityPacket["warnings"] extends readonly (infer W)[] ? W[] : never;
    readonly secretValues: readonly string[];
  },
): string {
  let next = value;
  for (const secret of context.secretValues) {
    if (secret && next.includes(secret)) {
      next = next.split(secret).join("[redacted]");
      context.redactions.push({
        inputField: context.path,
        reason: "explicit secret value redacted",
      });
    }
  }
  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(next)) {
      next = next.replace(pattern, "[redacted]");
      context.redactions.push({
        inputField: context.path,
        reason: "secret-looking value redacted",
      });
    }
    pattern.lastIndex = 0;
  }
  if (next !== value) {
    context.warnings.push({
      id: "compact-redaction-applied",
      message: "Compact v2 packet contained secret-like text; the value was redacted.",
    });
  }
  return next;
}

function collectUnsafeInputRedactions(
  value: Record<string, unknown>,
): CompactContinuityPacket["redactions"] {
  const redactions: Array<{ inputField: string; reason: string }> = [];
  const visit = (entry: unknown, path: string): void => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(entry)) {
      const childPath = `${path}.${key}`;
      if (isSensitiveKey(key)) {
        redactions.push({
          inputField: childPath,
          reason: "unsafe input field excluded from compact packet",
        });
        continue;
      }
      visit(child, childPath);
    }
  };
  visit(value, "unsafeInputs");
  return redactions;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function normalizeSecretValues(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function dedupeRedactions(
  redactions: CompactContinuityPacket["redactions"],
): CompactContinuityPacket["redactions"] {
  const seen = new Set<string>();
  return redactions.filter((entry) => {
    const key = `${entry.inputField}\0${entry.reason}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeWarnings(
  warnings: CompactContinuityPacket["warnings"],
): CompactContinuityPacket["warnings"] {
  const seen = new Set<string>();
  return warnings.filter((entry) => {
    const key = `${entry.id}\0${entry.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

