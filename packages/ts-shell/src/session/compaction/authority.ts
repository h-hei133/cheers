import fs from 'node:fs';
import { loadInstructionFiles, loadAppendedInstructionFiles } from '../../context/instructions/projectInstructions.js';
import { messageToText } from '../../model-adapters/multimodal.js';
import type { AgentMessage } from '../../core/agent/state.js';
import type { CompactionAuthority, CompactionCommitInput, CompactionCommit, CompactionSource } from './contract.js';
import { digest } from './state.js';

function instructionIdentity(cwd: string, includeFreshness = true): string {
  const loaded = [loadInstructionFiles({ cwd }), loadAppendedInstructionFiles({ cwd })];
  return digest(loaded.map(result => ({ ...result, files: result.files.map(file => {
    const stat = fs.statSync(file.filePath);
    return includeFreshness ? [file.filePath, file.content, stat.dev, stat.ino, stat.mtimeMs, stat.ctimeMs]
      : [file.filePath, file.content];
  }) })));
}

function matchesHistory(source: CompactionSource, messages: readonly AgentMessage[]): boolean {
  const actual = messages[0]?.role === 'system' ? messages.slice(1) : messages;
  if (actual.length !== source.history.length) return false;
  return actual.every((message, index) => {
    const stored = source.history[index]!;
    if (message.role !== stored.role || digest(message.tool_calls) !== digest(stored.tool_calls)
      || message.tool_call_id !== stored.tool_call_id || digest(message.reasoning) !== digest(stored.reasoning)) return false;
    if (digest(message.content) === digest(stored.content)) return true;
    // The current opening includes the runtime environment before its persisted user text.
    const text = messageToText(stored.content);
    const images = (content: AgentMessage['content']) => typeof content === 'string' ? [] : content.filter(block => block.type !== 'text');
    return stored.id === source.promptEntryId && text.length > 0 && message.role === 'user' && !('id' in message)
      && digest(images(message.content)) === digest(images(stored.content))
      && messageToText(message.content).endsWith(`\n\n${text}`);
  });
}

/** Capture instruction and publication identity once; verification cannot adopt a newer value. */
export function sessionCompactionAuthority(input: {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly admission: () => string | undefined;
  readonly isCurrent: () => boolean;
  readonly capture: () => CompactionSource;
  readonly commit: (record: CompactionCommitInput) => CompactionCommit;
}): CompactionAuthority {
  const instructions = instructionIdentity(input.workspaceRoot);
  return {
    // Publication counters and inode timestamps are freshness fences, not new billable operations.
    identity: digest([input.workspaceRoot, instructionIdentity(input.workspaceRoot, false)]),
    capture: messages => {
      const source = input.capture();
      if (messages && !matchesHistory(source, messages)) throw new Error('Compaction context no longer matches its stored history.');
      return source;
    },
    commit: input.commit,
    admission: () => {
      const blocked = input.admission();
      if (blocked) return blocked;
      if (!input.isCurrent()) return 'Configuration changed while the summary was generated.';
      try { if (instructionIdentity(input.workspaceRoot) !== instructions) return 'Project instructions changed while the summary was generated.'; }
      catch { return 'Project instructions could not be verified.'; }
      return undefined;
    },
  };
}
