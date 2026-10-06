import type { ComposerShapeId, StatusAttachment } from "./contract.js";
export type { ComposerShapeId } from "./contract.js";

export interface ComposerShape {
  readonly id: ComposerShapeId;
  readonly label: string;
  readonly statusAttachment: StatusAttachment;
  readonly bottomBar: "none" | "left" | "full";
  readonly gap: boolean;
  readonly gutter: string;
  readonly side: "none" | "caps" | "rail" | "round";
  readonly top: "none" | "rule" | "band" | "round";
  readonly bottom: "none" | "rule" | "merge";
  readonly filled: boolean;
}

/** Pure geometry metadata shared by runtime layout, configuration and settings. */
export const COMPOSER_SHAPES: Readonly<Record<ComposerShapeId, ComposerShape>> = {
  default: { id: "default", label: "Default", statusAttachment: "top-rule-chip", bottomBar: "left", gap: false, gutter: "❯ ", side: "none", top: "rule", bottom: "rule", filled: false },
  band: { id: "band", label: "Band", statusAttachment: "top-band", bottomBar: "none", gap: false, gutter: "╰─ ", side: "none", top: "band", bottom: "none", filled: false },
  borderless: { id: "borderless", label: "Borderless", statusAttachment: "none", bottomBar: "full", gap: false, gutter: "❯ ", side: "none", top: "none", bottom: "none", filled: false },
  "top-rule": { id: "top-rule", label: "Top rule", statusAttachment: "top-rule-chip", bottomBar: "left", gap: true, gutter: "❯ ", side: "none", top: "rule", bottom: "none", filled: false },
  "padded-rules": { id: "padded-rules", label: "Padded rules", statusAttachment: "none", bottomBar: "full", gap: false, gutter: "", side: "none", top: "rule", bottom: "rule", filled: false },
  field: { id: "field", label: "Field", statusAttachment: "none", bottomBar: "full", gap: true, gutter: "", side: "caps", top: "none", bottom: "none", filled: true },
  rail: { id: "rail", label: "Rail", statusAttachment: "none", bottomBar: "full", gap: true, gutter: "", side: "rail", top: "none", bottom: "none", filled: true },
  box: { id: "box", label: "Box", statusAttachment: "top-border", bottomBar: "none", gap: false, gutter: "", side: "round", top: "round", bottom: "merge", filled: false },
};

export function isComposerShape(value: unknown): value is ComposerShapeId {
  return typeof value === "string" && Object.hasOwn(COMPOSER_SHAPES, value);
}
