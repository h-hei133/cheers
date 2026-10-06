import { applyDefaultTheme, currentTheme, defaultTheme, prepareDefaultTheme, prepareTheme } from "./theme.js";

let selection = "dark";
let appearance: "dark" | "light" = "dark";
let generation = 0;
let preview: { name: string; revoke(): void } | undefined;

export interface ThemePreview {
  /** False means this lease was superseded; it can never change colors again. */
  show(name: string): boolean;
  end(): void;
}

export function isThemePreviewActive(): boolean { return preview !== undefined; }
export function themeSelectionRevision(): number { return generation; }

/** Preview owns only the displayed palette. Accepted intent changes revoke it. */
export function beginThemePreview(options: {
  readonly workspaceRoot?: string;
  readonly extraPaths?: readonly string[];
  readonly onEnd: () => void;
  readonly expectedRevision?: number;
}): ThemePreview {
  if (options.expectedRevision !== undefined && options.expectedRevision !== generation) return { show: () => false, end: () => {} };
  preview?.revoke();
  const baseline = defaultTheme.snapshot();
  const accepted = generation;
  let ended = false;
  const revoke = (): void => {
    if (ended) return;
    ended = true;
    preview = undefined;
    if (accepted === generation) {
      if (selection === 'auto') applyDefaultTheme(appearance);
      else baseline();
    }
    options.onEnd();
  };
  const intent = { name: selection, revoke };
  preview = intent;
  return {
    show(name) {
      if (ended || accepted !== generation) return false;
      const commit = name === 'auto' ? prepareDefaultTheme(appearance) : prepareTheme(name, options.workspaceRoot, options.extraPaths);
      commit();
      intent.name = name;
      return true;
    },
    end: revoke,
  };
}

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
  return () => {
    commit(); selection = name; generation += 1;
    preview?.revoke();
  };
}

/** Keep reports for a later auto selection, without overriding explicit choices. */
export function updateAppearance(next: "dark" | "light"): boolean {
  appearance = next;
  if ((preview?.name ?? selection) !== "auto" || currentTheme() === next) return false;
  applyDefaultTheme(next);
  return true;
}
