import { getDefaultThemeInstance, type ThemeColorToken } from "../../theme/theme.js";

export type ComponentStyle = (text: string) => string;

export interface ComponentTheme {
  readonly user: ComponentStyle;
  readonly assistant: ComponentStyle;
  readonly thinking: ComponentStyle;
  readonly toolTitle: ComponentStyle;
  readonly toolOutput: ComponentStyle;
  readonly added: ComponentStyle;
  readonly removed: ComponentStyle;
  readonly accent: ComponentStyle;
  readonly muted: ComponentStyle;
  readonly error: ComponentStyle;
  readonly warning: ComponentStyle;
  readonly success: ComponentStyle;
  readonly border: ComponentStyle;
  readonly selected: ComponentStyle;
  readonly userBackground: ComponentStyle;
}

function style(token: ThemeColorToken): ComponentStyle {
  return (text: string) => getDefaultThemeInstance().fg(token, text);
}

function background(token: ThemeColorToken): ComponentStyle {
  return (text: string) => getDefaultThemeInstance().bg(token, text);
}

export function componentTheme(): ComponentTheme {
  return {
    user: style("userMessageText"),
    assistant: style("assistantText"),
    thinking: style("thinkingText"),
    toolTitle: style("toolTitle"),
    toolOutput: style("toolOutput"),
    added: style("diffAdded"),
    removed: style("diffRemoved"),
    accent: style("accent"),
    muted: style("muted"),
    error: style("error"),
    warning: style("warning"),
    success: style("success"),
    border: style("border"),
    selected: style("selectedBg"),
    userBackground: background("userMessageBg"),
  };
}

let current: ComponentTheme = componentTheme();

export function getComponentTheme(): ComponentTheme {
  return current;
}

export function resetComponentTheme(): void {
  current = componentTheme();
}
