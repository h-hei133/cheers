import type { CommandContext, LocalCommandResult } from '../../../core/commands/types.js';
import { parseSyntax } from '../../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../../core/commands/syntax/projection.js';
import { undoSyntax } from '../../../core/commands/undo/syntax.js';
import { reportText } from '../../../core/commands/report/projection.js';
import type { CommandReport } from '../../../core/commands/report/contract.js';
import { contentHashPattern, safeRecoveryId } from '../record.js';
import { executeUndo, operationsForTurn, prepareUndo, readUndoHistoryPage, undoAccess, undoHistory } from './service.js';
import { validUndoHistoryCursor } from './history.js';
import { turnRestoreReport, undoNotice, undoPreviewReport, undoResultReport, undoStatusReport } from './report.js';
import { restoreTurn } from './turnRestore.js';

export async function runUndoCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  if (args[0] === '--hard' || args[0] === '--discard') return { kind: 'local', output:
    '`--hard` is gone. It discarded the whole working tree, including files this session never touched. Use /undo to review a recorded file operation.' };
  const parsed = parseSyntax(undoSyntax, args);
  const invalid = !parsed.ok ? parsed.reason : parsed.args[0] && !safeRecoveryId(parsed.args[0]) ? 'Invalid operation identity.'
    : parsed.action.name === 'execute' && !contentHashPattern.test(parsed.args[1]!) ? 'Invalid preview revision.'
    : parsed.flags.has('cursor') && !validUndoHistoryCursor(parsed.flags.get('cursor')) ? 'Invalid saved-results cursor.' : undefined;
  if (invalid || !parsed.ok) return { kind: 'local', output: `Invalid /undo arguments: ${invalid}\n${syntaxHelp(undoSyntax)}` };
  if (parsed.action.name === 'help') return { kind: 'local', output: syntaxHelp(undoSyntax) };
  if ((parsed.action.name === 'execute' || parsed.action.name === 'restore-turn') && !parsed.flags.has('execute')) {
    return local(undoNotice('Explicit --execute confirmation is required. Nothing was written.', 'permission-pending'));
  }
  let executionStarted = false;
  try {
    if (parsed.action.name === 'restore-turn') {
      const executeTurn = parsed.args[0]!;
      const outcome = await restoreTurn({ context: () => context }, executeTurn, true, undoAccess(context));
      return { ...local(turnRestoreReport(outcome, executeTurn)), state: outcome.complete
        ? { fileUndo: { operationId: `turn:${executeTurn}`, status: 'restored-verified',
          files: outcome.steps.flatMap(step => step.files.map(file => ({ ...file }))) } }
        : undefined };
    }
    if (parsed.action.name === 'status') {
      // Selecting by turn is a view over the same ledger: the operations it
      // lists are the ones the ordinary preview would restore, one at a time.
      const turn = parsed.flags.get('turn');
      if (typeof turn === 'string') {
        const operations = operationsForTurn(context, turn);
        return local(operations.length ? undoStatusReport(operations)
          : undoNotice(`No recorded operation belongs to turn \`${turn}\`.`, 'empty'));
      }
      if (parsed.args[0]) {
        const selected = undoHistory(context, parsed.args[0]);
        return local(selected.length ? undoStatusReport(selected) : undoNotice('No recorded operation was found in this session and workspace.', 'empty'));
      }
      const page = readUndoHistoryPage(context, parsed.flags.get('cursor') as string | undefined);
      if (!page) return local(undoNotice('Saved operation results changed. Start again with /undo status.', 'stale'));
      return local(page.receipts.length ? undoStatusReport(page.receipts, page)
        : undoNotice('No recorded operation was found in this session and workspace.', 'empty'));
    }
    const selection = await prepareUndo(context);
    if (!selection.preview) return local(undoNotice(selection.note, 'empty'));
    const preview = selection.preview;
    if (parsed.action.name === 'preview') return local(undoPreviewReport(preview));
    if (parsed.args[0] !== preview.receipt.operationId || parsed.args[1] !== preview.revision) return local(undoNotice('The selected operation or preview changed. Preview it again before confirming.'));
    executionStarted = true;
    const { result, warning } = await executeUndo({ context: () => context }, preview, true);
    return { ...local(undoResultReport(result, preview.receipt, warning)), state: { fileUndo: { operationId: result.operationId, status: result.status, files: result.files } },
      stateFailureWarning: 'File results remain in the operation receipt; the model context update could not be confirmed.' };
  } catch {
    if (executionStarted) return { kind: 'local', output: 'The undo result could not be displayed. Inspect /undo status before retrying; file writes may have occurred.',
      state: { fileUndo: { operationId: parsed.args[0], status: 'unknown' } } };
    return local(undoNotice('The operation ledger or current workspace could not be verified. No restoration was started.'));
  }
}

function local(report: CommandReport): LocalCommandResult { return { kind: 'local', output: reportText(report), report }; }
