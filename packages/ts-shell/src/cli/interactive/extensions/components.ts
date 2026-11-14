import { SelectList } from '../../../presentation/tui/chrome/selectList.js';
import { SingleLineInput, wrapOverlayBox } from '../../../presentation/tui/chrome/overlayWidgets.js';
import type { OverlayComponent } from '../../../presentation/tui/render/overlayStack.js';
import { wrapToWidth } from '../../../presentation/tui/text/layout.js';
import { acceptInsertion, captureChoices, dialogText, MAX_UI_CHOICE_BYTES, MAX_UI_EDITOR_BYTES, MAX_UI_TEXT_BYTES, singleLine } from './limits.js';
import { BoundedEditor, editDialogKey } from './editor.js';

export interface DialogComponent {
  readonly component: OverlayComponent;
  connect(accept: (value: string) => void, cancel: () => void): void;
}

export function selectionDialog(title: string, choices: readonly string[], message?: string): DialogComponent {
  const captured = captureChoices(choices);
  const heading = singleLine(title);
  const body = message === undefined ? '' : dialogText(message).replace(/\t/g, ' ');
  const items = captured.map((label, index) => ({ value: String(index), label: singleLine(label, MAX_UI_CHOICE_BYTES) }));
  let list = new SelectList(items);
  let maxVisible = 8;
  let prefixRows = 0;
  let borderRows = 1;
  let accept: (value: string) => void = () => {};
  let cancel: () => void = () => {};
  const component: OverlayComponent = {
    focused: false,
    render(width, maxRows = 12) {
      const budget = Math.max(1, maxRows - 2);
      const allPrefix = body ? body.split('\n').flatMap(line => wrapToWidth(line, Math.max(1, width - 4))) : [];
      const choiceRows = Math.min(captured.length, budget);
      const prefix = allPrefix.slice(0, Math.max(0, budget - choiceRows));
      const nextMaxVisible = Math.max(1, budget - prefix.length - Number(captured.length > budget - prefix.length));
      if (nextMaxVisible !== maxVisible) {
        const selected = list.getSelectedItem();
        list = new SelectList(items, nextMaxVisible);
        list.setSelectedIndex(selected ? Number(selected.value) : 0);
        maxVisible = nextMaxVisible;
      }
      list.onSelect = item => accept(captured[Number(item.value)]!);
      list.onCancel = cancel;
      list.focused = component.focused ?? false;
      prefixRows = prefix.length;
      const content = [...prefix, ...list.render(Math.max(1, width - 4))].slice(0, budget);
      borderRows = maxRows < 3 ? 0 : 1;
      if (maxRows < 3) return content.slice(0, maxRows);
      return wrapOverlayBox(content, width, heading, 'enter select · esc cancel');
    },
    handleKey: event => list.handleKey(event),
    handlePointer(report, bounds) {
      if (report.kind !== 'wheel' && (report.row < bounds.row + borderRows + prefixRows || report.row >= bounds.row + bounds.height - borderRows)) return true;
      return list.handlePointer(report, { ...bounds, row: bounds.row + borderRows + prefixRows, col: bounds.col + 2, width: Math.max(1, bounds.width - 4) });
    },
  };
  return { component, connect(onAccept, onCancel) { accept = onAccept; cancel = onCancel; list.onSelect = item => accept(captured[Number(item.value)]!); list.onCancel = cancel; } };
}
export function inputDialog(title: string, placeholder: string | undefined, notice: () => void): DialogComponent {
  const heading = singleLine(title);
  const input = new SingleLineInput(singleLine(placeholder ?? ''));
  const component: OverlayComponent = {
    focused: false,
    render(width, maxRows = 3) {
      input.focused = component.focused ?? false;
      const rows = input.render(Math.max(1, width - 4));
      return maxRows < 3 ? rows : wrapOverlayBox(rows, width, heading, 'enter accept · esc cancel');
    },
    handleKey(event) {
      if (!event.text) return input.handleKey(event);
      if (!acceptInsertion(input.getValue(), event.text, MAX_UI_TEXT_BYTES, notice)) return true;
      return input.handleKey({ ...event, text: singleLine(event.text) });
    },
    handlePaste(text) {
      if (acceptInsertion(input.getValue(), text, MAX_UI_TEXT_BYTES, notice)) input.handlePaste(singleLine(text));
      return true;
    },
  };
  return { component, connect(accept, cancel) { input.onSubmit = accept; input.onCancel = cancel; } };
}

export function editorDialog(title: string, prefill: string | undefined, notice: () => void): DialogComponent {
  const heading = singleLine(title);
  const editor = new BoundedEditor(notice);
  editor.setDraftText(dialogText(prefill ?? '', MAX_UI_EDITOR_BYTES));
  let accept: (value: string) => void = () => {};
  let cancel: () => void = () => {};
  const component: OverlayComponent = {
    focused: false,
    render(width, maxRows = 10) {
      editor.focused = component.focused ?? false;
      const rows = editor.render(Math.max(1, width - 4), Math.max(1, maxRows - 2));
      return maxRows < 3 ? rows : wrapOverlayBox(rows, width, heading, 'ctrl+s accept · esc cancel');
    },
    handleKey(event) {
      if (event.keyId === 'escape' || event.keyId === 'ctrl+c') { cancel(); return true; }
      if (event.keyId === 'ctrl+enter' || event.keyId === 'ctrl+s') { accept(editor.getText()); return true; }
      return editDialogKey(editor, event);
    },
    handlePaste(text) {
      if (acceptInsertion(editor.getText(), text, MAX_UI_EDITOR_BYTES, notice)) editor.insert(dialogText(text, MAX_UI_EDITOR_BYTES));
      return true;
    },
  };
  return { component, connect(onAccept, onCancel) { accept = onAccept; cancel = onCancel; } };
}
