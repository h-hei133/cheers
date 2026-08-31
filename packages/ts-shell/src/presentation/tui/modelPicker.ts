import { SelectList, type SelectListItem } from "./selectList.js";

export const AVAILABLE_MODELS: readonly SelectListItem[] = [
  { value: "claude-3-5-sonnet", label: "claude-3-5-sonnet", description: "Default coding model" },
  { value: "claude-3-5-haiku", label: "claude-3-5-haiku", description: "Fast lightweight model" },
  { value: "gpt-4o", label: "gpt-4o", description: "High capability model" },
  { value: "gpt-4o-mini", label: "gpt-4o-mini", description: "Fast compact model" },
  { value: "gemini-2.0-flash", label: "gemini-2.0-flash", description: "High speed multimodal model" },
  { value: "deepseek-chat", label: "deepseek-chat", description: "Efficient reasoning model" },
];

/**
 * Interactive Model Picker Component
 * Provides a floating dropdown menu for selecting and switching active models.
 */
export class ModelPicker {
  private readonly list = new SelectList();
  private active = false;

  constructor() {
    this.list.setItems(AVAILABLE_MODELS);
  }

  open(): void {
    this.active = true;
  }

  close(): void {
    this.active = false;
  }

  isOpen(): boolean {
    return this.active;
  }

  moveUp(): void {
    this.list.moveUp();
  }

  moveDown(): void {
    this.list.moveDown();
  }

  getSelectedModel(): SelectListItem | undefined {
    return this.list.getSelectedItem();
  }

  render(width: number = 60): string[] {
    if (!this.active) return [];
    return this.list.render(width);
  }
}
