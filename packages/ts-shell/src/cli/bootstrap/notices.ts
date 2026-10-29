import type { SessionManager } from '../../session/SessionManager.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { StructuredLogger } from '../../observability/structuredLogger.js';
import { getSessionUsage } from '../../observability/usageTelemetry.js';
import { createStartupNoticeRouter } from './startupNotice.js';
import { createStartupRecoveryHint } from './recoveryHint.js';

/** Startup messages share the owning terminal route and first-frame lifetime. */
export function createCliStartupNotices(input: {
  readonly context: ShellRuntimeContext;
  readonly sessionManager: Pick<SessionManager, 'getRecoveryHintAsync'>;
  readonly renderer: Pick<StreamingRenderer, 'renderLine'>;
  readonly logger: Pick<StructuredLogger, 'warn'>;
  readonly lifecycleNotices: readonly string[];
}) {
  const { context } = input;
  const router = createStartupNoticeRouter(input);
  const recovery = createStartupRecoveryHint({
    sessionManager: input.sessionManager,
    preferredProjectRoot: context.projectRoot,
    currentSessionId: context.session.id,
    generation: () => JSON.stringify({ sessionId: context.session.id,
      sessionCreatedAt: context.session.createdAt, projectRoot: context.projectRoot,
      configRevision: context.configuration.current.revision }),
    publish: hint => {
      if (hint.candidate && hint.summary) router.publish(
        `- Recovery hint: /resume or --session-id ${hint.candidate.id} (${hint.summary.resumeDisposition})`);
      else if (hint.blocked) router.publish(
        `- Recovery boundary: ${hint.blocked.detail.slice(0, 180)}${hint.blocked.detail.length > 180 ? '...' : ''}`);
    },
    logger: input.logger,
  });
  let fullScreenHost = false;
  let eligible = false;
  let firstFrameSeen = false;
  return {
    configure(fullScreen: boolean, recoveryEligible: boolean): void {
      fullScreenHost = fullScreen;
      eligible = recoveryEligible;
      router.setFullScreenHost(fullScreen);
    },
    onFirstFrame(): void {
      if (firstFrameSeen) return;
      firstFrameSeen = true;
      if (eligible) void recovery.start();
    },
    onUserIntent: recovery.noteUserIntent,
    cancel: recovery.cancel,
    setTranscriptWriter(writer: ((line: string) => void) | undefined): void {
      router.setTranscriptWriter(writer);
      if (!writer) return;
      if (fullScreenHost) for (const notice of input.lifecycleNotices) router.publish(notice);
      if (getSessionUsage(context.session.id).usageHealth) router.publish(
        'Persisted usage is incomplete; recovered counts and cost estimates exclude unreadable records. Inspect /cost.');
    },
  };
}
