import { defaultTheme } from '../../../presentation/theme/theme.js';
import { modalBody } from '../../../presentation/tui/chrome/modal.js';
import { CURSOR_MARKER } from '../../../presentation/tui/render/paint.js';
import { truncateToWidth } from '../../../presentation/tui/text/layout.js';

/** Render the host's denial draft without owning approval or submission. */
export function renderDenial(state: { readonly modal: boolean; readonly title: string; readonly draft: string }, width: number, height: number): string[] {
  if (state.modal) {
    const inner = Math.max(20, width - 2);
    const title = defaultTheme.bold(defaultTheme.fg('warning', ' Deny Permission '));
    const fill = Math.max(0, inner - 19);
    const rows: string[] = [
      defaultTheme.fg('border', '┌') + title + defaultTheme.fg('border', `${'─'.repeat(fill)}┐`),
      modalBody('', inner),
      modalBody(defaultTheme.bold('Explain why this was denied (optional):'), inner),
      modalBody('', inner),
      modalBody(`  > ${defaultTheme.fg('accent', state.draft)}${CURSOR_MARKER}█`, inner),
      modalBody('', inner),
      modalBody(`  ${defaultTheme.fg('success', '[Enter] Submit')}    ${defaultTheme.fg('muted', '[Esc] Skip (no reason)')}`, inner),
      modalBody('', inner),
    ];
    while (rows.length < height - 1) rows.push(modalBody('', inner));
    rows.push(defaultTheme.fg('border', `└${'─'.repeat(inner)}┘`));
    return rows.slice(0, height);
  }
  const title = defaultTheme.bold(`  Permission Denied: ${state.title.replace(/^Permission:\s*/, '')}`);
  const prompt = defaultTheme.dim('  Explain why this was denied (optional, press Enter to skip):');
  const input = `  > ${defaultTheme.fg('accent', state.draft)}${CURSOR_MARKER}█`;
  const hints = defaultTheme.dim('  [Enter] Submit reason    [Esc] Deny without reason');
  return [
    truncateToWidth(title, width),
    truncateToWidth(prompt, width),
    truncateToWidth(input, width),
    truncateToWidth(hints, width),
  ];
}
