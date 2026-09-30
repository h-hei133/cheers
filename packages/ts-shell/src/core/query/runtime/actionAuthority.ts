import type { ToolActionKind } from "../../../tools/policy/strategy.js";

export interface RuntimeActionBlock {
  readonly action: ToolActionKind;
  readonly reason: string;
  readonly targetFiles: readonly string[];
}
