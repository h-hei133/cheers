import { applyDefaultTheme, applyTheme, currentTheme } from "./theme.js";

let selection = "dark";
let appearance: "dark" | "light" = "dark";

/** User intent stays separate from the palette resolved for the current device. */
export function selectedTheme(): string {
  return selection;
}

export function selectTheme(name: string, workspaceRoot?: string, extraPaths: readonly string[] = []): void {
  if (name === "auto") applyDefaultTheme(appearance);
  else applyTheme(name, workspaceRoot, extraPaths);
  // A failed load leaves both the selection and the working palette intact.
  selection = name;
}

/** Keep reports for a later auto selection, without overriding explicit choices. */
export function updateAppearance(next: "dark" | "light"): boolean {
  appearance = next;
  if (selection !== "auto" || currentTheme() === next) return false;
  applyDefaultTheme(next);
  return true;
}
