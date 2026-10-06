import { applyDefaultTheme, currentTheme, prepareDefaultTheme, prepareTheme } from "./theme.js";

let selection = "dark";
let appearance: "dark" | "light" = "dark";

/** User intent stays separate from the palette resolved for the current device. */
export function selectedTheme(): string {
  return selection;
}

export function selectTheme(name: string, workspaceRoot?: string, extraPaths: readonly string[] = []): void {
  prepareThemeSelection(name, workspaceRoot, extraPaths)();
}

/** A failed preparation leaves both intent and the rendered palette untouched. */
export function prepareThemeSelection(name: string, workspaceRoot?: string, extraPaths: readonly string[] = []): () => void {
  const commit = name === 'auto' ? prepareDefaultTheme(appearance) : prepareTheme(name, workspaceRoot, extraPaths);
  return () => { commit(); selection = name; };
}

/** Keep reports for a later auto selection, without overriding explicit choices. */
export function updateAppearance(next: "dark" | "light"): boolean {
  appearance = next;
  if (selection !== "auto" || currentTheme() === next) return false;
  applyDefaultTheme(next);
  return true;
}
