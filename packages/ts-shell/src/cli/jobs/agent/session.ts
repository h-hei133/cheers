import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { sameValue } from '../../../config/values.js';
import { replayTodosFromMessages, forgetSessionTodos } from '../../../core/commands/todoCommandRuntime.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import type { SessionMessage } from '../../../session/schema/sessionMessage.js';
import { readBoundSessionState } from '../../../session/store/bound.js';
import { readSessionFileVersion } from '../../../session/store/version.js';
import { createTranscriptEntryId } from '../../../session/sessionEventCodec.js';
import type { AgentChild, AgentCheckpoint } from '../../../workflow/jobs/agent/model.js';

/** The ordinary session owner persists the child; a fork never selects it as main. */
export class AgentSessions {
  constructor(private readonly manager: SessionManager, private readonly parent: Session) {}
  preflight(): void { this.source(); }
  private source() {
    const parent = readBoundSessionState(this.manager, this.parent);
    if (statSync(parent.layout.transcriptPath).size > 8 * 1024 * 1024) throw new Error('Compact the parent before creating another agent.');
    const session = this.manager.getSession(this.parent.id)!;
    const tail = contextTail(session.turns);
    if (Buffer.byteLength(JSON.stringify([...session.turns, ...tail])) > 2 * 1024 * 1024)
      throw new Error('Compact the parent before creating another agent; the child context exceeds its retained input limit.');
    return { parent, tail };
  }
  create(sessionId?: string): { readonly child: AgentChild; readonly checkpoint: AgentCheckpoint } {
    const { parent, tail } = this.source();
    const version = readSessionFileVersion(parent.layout);
    const session = this.manager.fork(this.parent.id, undefined, { activate: false, sessionId });
    if (readSessionFileVersion(parent.layout) !== version) throw new Error('The source conversation changed during the fork.');
    for (const message of tail) this.manager.addTurn(session.id, message);
    const bound = readBoundSessionState(this.manager, session);
    const child = { scope: bound.scope, directoryIdentity: bound.directoryIdentity };
    return { child, checkpoint: this.checkpoint(child) };
  }
  read(child: AgentChild): Session {
    const session = this.manager.getSession(child.scope.sessionId);
    if (!session || session.parentSession !== this.parent.id) throw new Error('The child conversation is unavailable.');
    const bound = readBoundSessionState(this.manager, session);
    if (!sameValue(bound.scope, child.scope) || bound.directoryIdentity !== child.directoryIdentity
      || !sameValue(bound.scope.workspace, readBoundSessionState(this.manager, this.parent).scope.workspace)) throw new Error('The child session binding changed.');
    return session;
  }
  checkpoint(child: AgentChild): AgentCheckpoint {
    const session = this.read(child); const serialized = JSON.stringify(session.turns);
    if (Buffer.byteLength(serialized) > 2 * 1024 * 1024) throw new Error('The child context exceeds its retained input limit.');
    const entryId = session.turns.at(-1)?.id; if (!entryId) throw new Error('No child checkpoint is available.');
    return { entryId, digest: createHash('sha256').update(serialized).digest('hex') };
  }
  message(child: AgentChild, message: SessionMessage): void {
    this.read(child);
    this.manager.addTurn(child.scope.sessionId, { ...message, id: message.id ?? createTranscriptEntryId('turn') });
    this.read(child);
  }
  restore(child: AgentChild): Session {
    const session = this.read(child); forgetSessionTodos(session.id); replayTodosFromMessages(session.id, session.turns); return session;
  }
}

function contextTail(turns: readonly SessionMessage[]): SessionMessage[] {
  const tail: SessionMessage[] = [];
  const lastAssistant = turns.findLastIndex(message => message.role === 'assistant');
  for (const call of turns[lastAssistant]?.tool_calls ?? []) {
    if (!turns.slice(lastAssistant + 1).some(message => message.role === 'tool' && message.tool_call_id === call.id))
      tail.push({ id: createTranscriptEntryId('turn'), role: 'tool', tool_call_id: call.id,
        content: '(Parent operation interrupted; historical context only. It was not executed by this agent.)' });
  }
  tail.push({ id: createTranscriptEntryId('turn'), role: 'user',
    content: 'The prior conversation is historical context. The parent owns that work. Focus on the explicit side-agent assignment that follows; prior approvals do not authorize new effects.',
    metadata: { source: 'agent-context', todo: [] } });
  return tail;
}
