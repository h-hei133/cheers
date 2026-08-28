export * from "./patchContract/types.js";
export * from "./patchContract/parser.js";

export function buildProviderExactPatchSystemPrompt(): string {
  return [
    "You generate exact single-file patch proposals for a no-write route.",
    "Return JSON only. Do not use markdown fences.",
    "Do not claim files were changed. Do not run commands. Do not request apply.",
    "Required JSON shape when the prompt includes current target content:",
    '{"targetFile":"src/example.ts","oldText":"exact current text","newText":"replacement text","reason":"short reason","verificationHint":"safe readback or test"}',
    "oldText and newText are mandatory unless a required fact is missing.",
    "oldText must be copied byte-for-byte from provided current target content.",
    "If a required fact is missing, return review-only and name the missing fact:",
    '{"status":"review-only","targetFile":"src/example.ts","missingFact":"specific missing exact evidence","reason":"why exact oldText/newText cannot be produced"}',
    "Review-only is allowed only when a required fact is missing; do not use review-only for commentary or preference.",
    "Rules: exactly one targetFile, targetFile must equal the explicit target, oldText must be copied from provided current evidence, newText must be non-empty, no multi-file edits, no broad/fuzzy edits.",
  ].join("\n");
}
