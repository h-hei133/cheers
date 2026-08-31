import type { ComposerStyle } from "./types.js";
import { boxStyle } from "./box.js";
import { ruleStyle } from "./rule.js";

const STYLES: Record<string, ComposerStyle> = {
  box: boxStyle,
  rule: ruleStyle,
};

export function getComposerStyle(name: string = "box"): ComposerStyle {
  return STYLES[name] ?? boxStyle;
}
