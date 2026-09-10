import { renderActivity } from "../transcript/live.js";
import { renderBand } from "../chrome/band.js";
import { renderComposer } from "../chrome/composer.js";
import { renderHints, type AmbientContext, type HintContext } from "../chrome/hints.js";
import type { Editor } from "../editor.js";
import type { SuggestionList } from "../chrome/suggestions.js";
import type { ViewComponent } from "./contract.js";
import type { SessionFacts } from "./model.js";

/**
 * Activity row, an optional panel (an inline picker), then the band. The panel
 * sits above the band so the prompt stays where the user's attention already is.
 */
export class StatusBar implements ViewComponent {
  private facts: SessionFacts;
  private readonly panel: ViewComponent | undefined;

  constructor(facts: SessionFacts, panel?: ViewComponent) {
    this.facts = facts;
    this.panel = panel;
  }

  setFacts(facts: SessionFacts): void {
    this.facts = facts;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safe = Math.max(1, Math.floor(width));
    return [
      ...renderActivity(this.facts.activity, this.facts.now ?? Date.now(), safe),
      ...(this.panel?.render(safe) ?? []),
      renderBand(this.facts.facts, this.facts.items, safe),
    ];
  }
}

export interface ComposerFacts {
  readonly busy: boolean;
  readonly suggesting: boolean;
  readonly cancelArmed: boolean;
  readonly queued: number;
  readonly newlineKey: string;
  readonly ambient: AmbientContext;
  readonly maxRows?: number;
  /** Transient status notification shown in place of the hint row. */
  readonly toast?: string;
}

/**
 * The prompt area: the draft, the completion list while one is open, and the
 * hint row. The list sits between the two because it completes the draft above
 * it and the hints below describe how to use the list.
 */
export class Composer implements ViewComponent {
  focused = true;
  private readonly editor: Editor;
  private readonly suggestions: SuggestionList | undefined;
  private facts: ComposerFacts;

  constructor(editor: Editor, facts: ComposerFacts, suggestions?: SuggestionList) {
    this.editor = editor;
    this.facts = facts;
    this.suggestions = suggestions;
  }

  setFacts(facts: ComposerFacts): void {
    this.facts = facts;
  }

  handleInput(data: string): void {
    // Same boundary as PromptEditor: the component layer only takes
    // printable single characters. Newlines, kills, and escape sequences
    // belong to the keymap above, which sees parsed key events.
    if (data.length === 1 && data >= " " && data !== "\u007f" && !this.facts.busy) {
      this.editor.insert(data);
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safe = Math.max(1, Math.floor(width));
    const previous = this.editor.focused;
    this.editor.focused = this.focused;
    try {
      const context: HintContext = {
        busy: this.facts.busy,
        suggesting: this.facts.suggesting,
        cancelArmed: this.facts.cancelArmed,
        queued: this.facts.queued,
        newlineKey: this.facts.newlineKey,
        toast: this.facts.toast,
      };
      const rows = renderComposer(this.editor, { busy: this.facts.busy }, safe, this.facts.maxRows);
      if (this.facts.suggesting && this.suggestions) rows.push(...this.suggestions.render(safe));
      rows.push(...renderHints(context, this.facts.ambient, safe));
      return rows;
    } finally {
      this.editor.focused = previous;
    }
  }
}
