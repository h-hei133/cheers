import {
  getSlashCommandSuggestions,
  renderSlashAutocompleteMenu,
  type SlashCommandSuggestion,
} from "./slashAutocomplete.js";
import type { TextEditor } from "./textEditor.js";
import type { ParsedKeyEvent } from "./input/keys.js";

/**
 * Autocomplete Controller & Key Interception Lifecycle
 *
 * Manages:
 * 1. Automatic activation when prompt text begins with `/`
 * 2. Key interception (Up/Down moves selection, Tab/Enter completes, Esc dismisses)
 * 3. Menu rendering and active index tracking
 */

export class AutocompleteController {
  private active = false;
  private suggestions: SlashCommandSuggestion[] = [];
  private selectedIndex = 0;

  update(editorText: string): void {
    const matched = getSlashCommandSuggestions(editorText);
    if (matched && matched.length > 0) {
      this.suggestions = matched;
      this.selectedIndex = Math.min(this.selectedIndex, matched.length - 1);
      this.active = true;
    } else {
      this.dismiss();
    }
  }

  isActive(): boolean {
    return this.active && this.suggestions.length > 0;
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  getSelectedSuggestion(): SlashCommandSuggestion | undefined {
    return this.suggestions[this.selectedIndex];
  }

  dismiss(): void {
    this.active = false;
    this.suggestions = [];
    this.selectedIndex = 0;
  }

  /**
   * Attempts to handle a key event. Returns true if consumed (intercepted), false otherwise.
   */
  handleKey(event: ParsedKeyEvent, editor: TextEditor): boolean {
    if (!this.isActive()) return false;

    if (event.keyId === "escape") {
      this.dismiss();
      return true;
    }

    if (event.keyId === "up") {
      this.selectedIndex =
        this.selectedIndex > 0 ? this.selectedIndex - 1 : this.suggestions.length - 1;
      return true;
    }

    if (event.keyId === "down") {
      this.selectedIndex =
        this.selectedIndex < this.suggestions.length - 1 ? this.selectedIndex + 1 : 0;
      return true;
    }

    if (event.keyId === "tab" || event.keyId === "enter") {
      const chosen = this.getSelectedSuggestion();
      if (chosen) {
        editor.setText(`${chosen.name} `);
        this.dismiss();
        return true;
      }
    }

    return false;
  }

  renderMenu(width: number = 60): string[] {
    if (!this.isActive()) return [];
    return renderSlashAutocompleteMenu(this.suggestions, this.selectedIndex, width);
  }
}
