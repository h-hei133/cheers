import { renderActivity } from "../transcript/live.js";
import { renderBand } from "../chrome/band.js";
import { renderComposer } from "../chrome/composer.js";
import { renderHints, type AmbientContext, type HintContext } from "../chrome/hints.js";
import type { Editor } from "../editor.js";
import type { ViewComponent } from "./contract.js";
import type { SessionFacts } from "./model.js";

export class StatusBar implements ViewComponent {
  private facts: SessionFacts;

  constructor(facts: SessionFacts) {
    this.facts = facts;
  }

  setFacts(facts: SessionFacts): void {
    this.facts = facts;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safe = Math.max(1, Math.floor(width));
    return [
      ...renderActivity(this.facts.activity, Date.now(), safe),
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
}

export class Composer implements ViewComponent {
  focused = true;
  private readonly editor: Editor;
  private facts: ComposerFacts;

  constructor(editor: Editor, facts: ComposerFacts) {
    this.editor = editor;
    this.facts = facts;
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
      };
      return [
        ...renderComposer(this.editor, { busy: this.facts.busy }, safe),
        ...renderHints(context, this.facts.ambient, safe),
      ];
    } finally {
      this.editor.focused = previous;
    }
  }
}
