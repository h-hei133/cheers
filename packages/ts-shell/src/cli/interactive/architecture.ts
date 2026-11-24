import type { ArchitectureCheck } from '../../core/hooks/stop/model.js';
import type { QueryEvent } from '../../core/query/runtime/events.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';

type Binding = Pick<ShellRuntimeContext, 'cwd' | 'workspaceRevision' | 'configuration' | 'session' | 'workspaceIssue'>;

/** Only a successful check from the current turn and workspace can update the band. */
export class ArchitectureStatus {
  private pending?: { readonly attemptId: string; readonly check: ArchitectureCheck; readonly generation: string };
  private verdict?: { readonly check: ArchitectureCheck; readonly generation: string };

  observe(event: QueryEvent, current: Binding): boolean {
    switch (event.type) {
      case 'query.started': case 'query.failed': case 'query.completed_unproven': case 'lifecycle.cancelled': case 'lifecycle.error': {
        this.pending = undefined;
        const changed = this.verdict !== undefined;
        this.verdict = undefined;
        return changed;
      }
      case 'lifecycle.record': {
        if (event.kind === 'stop_state' && event.state === 'checking') this.pending = undefined;
        if (event.kind === 'hook_result' && event.result.architecture && currentCheck(event.result.architecture, current)) {
          const previous = this.pending?.attemptId === event.attemptId ? this.pending.check : undefined;
          const check = previous?.verdict === 'partial' ? previous : event.result.architecture;
          this.pending = { attemptId: event.attemptId, check, generation: generation(current) };
        }
        return false;
      }
      case 'query.completed': {
        const pending = this.pending;
        this.pending = undefined;
        if (!pending || event.result.status !== 'completed' || pending.generation !== generation(current)
          || !currentCheck(pending.check, current)) return false;
        this.verdict = pending;
        return true;
      }
      default: return false;
    }
  }

  read(current: Binding): ArchitectureCheck['verdict'] | undefined {
    const verdict = this.verdict;
    return verdict?.generation === generation(current) && currentCheck(verdict.check, current) ? verdict.check.verdict : undefined;
  }
}

function generation(current: Binding): string {
  return JSON.stringify([current.cwd, current.workspaceRevision, current.configuration.current.revision]);
}

function currentCheck(check: ArchitectureCheck, current: Binding): boolean {
  if (check.sessionId !== current.session.id || current.workspaceIssue) return false;
  try { return captureWorkspaceRoot(current.cwd, current.cwd, 'read').identity === check.workspaceIdentity; }
  catch { return false; }
}
