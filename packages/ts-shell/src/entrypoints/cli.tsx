import * as readline from 'node:readline'
import process from 'node:process'
import {
  createComponentLogger,
  createTraceContext,
  recordCount,
  setGlobalTraceContext,
} from '../observability/index.js'
import { getRuntimeConfig } from '../config/runtimeConfig.js'
import { isRustDaemonEnabled } from '../daemon/client.js'
import { StreamingRenderer } from '../renderer/StreamingRenderer.js'
import { SessionManager } from '../session/SessionManager.js'
import { streamMvpIntegratedFlow } from '../orchestration/runMvpIntegratedFlow.js'
import { getWorkflowGitContext } from '../workflow/gitContext.js'
import { routeSlashCommand } from '../core/commands/slashRouter.js'
import { ShellSessionRuntime } from '../core/shell/sessionRuntime.js'
import { bootstrapShellRuntime } from '../core/shell/bootstrap.js'
import { handleShellClose, handleShellSigint } from '../core/shell/signalHandlers.js'
import { resumeShellSession } from '../core/shell/recovery.js'
import { CoreMcpGateway } from '../core/mcp/gateway.js'
import type { QueryRuntimeStateSeed } from '../core/query/runtimeState.js'

interface CliOptions {
  sessionId?: string
}

async function main(): Promise<void> {
  setGlobalTraceContext(createTraceContext())
  const logger = createComponentLogger('cli')
  const args = process.argv.slice(2)
  const runtimeConfig = getRuntimeConfig(process.cwd())
  const gitContext = getWorkflowGitContext(process.cwd())

  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v' || args[0] === '-V')) {
    console.log('0.1.0 (ts-shell MVP)')
    return
  }

  if (args.includes('--doctor')) {
    printCliDoctor()
    return
  }

  const options: CliOptions = {}
  const sessionIdIdx = args.indexOf('--session-id')
  if (sessionIdIdx !== -1 && args[sessionIdIdx + 1]) {
    options.sessionId = args[sessionIdIdx + 1]
  }

  const sessionManager = new SessionManager()
  const renderer = new StreamingRenderer()
  const recoveryCandidate = !options.sessionId ? sessionManager.getSuggestedRecoverySession() : null
  const bootstrap = bootstrapShellRuntime({
    cwd: process.cwd(),
    runtimeConfig,
    gitContext,
    sessionManager,
    renderer,
    requestedSessionId: options.sessionId,
  })
  const runtimeContext = bootstrap.context

  renderer.renderLine('🤖 Private Coding Agents Shell (ts-shell MVP)')
  renderer.renderLine(`Session: ${runtimeContext.session.id}`)
  renderer.renderLine(`Execution path: ${isRustDaemonEnabled() ? 'rust-daemon' : 'ts-local'}`)
  renderer.renderLine(`Workspace: ${runtimeContext.cwd}`)
  if (runtimeContext.gitContext.insideGit) {
    renderer.renderLine(`Git branch: ${runtimeContext.gitContext.branch ?? 'unknown'}`)
    renderer.renderLine(`Workspace clean: ${runtimeContext.gitContext.isClean ? 'yes' : 'no'}`)
  }
  renderer.renderLine(`Provider: ${runtimeContext.runtimeConfig.provider}`)
  renderer.renderLine(`Max turns: ${runtimeContext.runtimeConfig.maxTurns}`)
  if (recoveryCandidate) {
    renderer.renderLine(
      `Recovery available: rerun with --session-id ${recoveryCandidate.id} to continue the latest interrupted session`,
    )
  }
  renderer.renderLine('Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit\n')
  logger.info('CLI session initialized', {
    sessionId: runtimeContext.session.id,
    phases: bootstrap.phases.join(' -> '),
  })

  const sessionRuntime = new ShellSessionRuntime({
    sessionManager,
    renderer,
    runPrompt: (prompt, signal, runtimeSeed) =>
      streamOrchestratedResponse(prompt, runtimeContext.session.id, signal, runtimeContext.runtimeConfig.maxTurns, runtimeSeed),
  })

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  })

  process.on('SIGINT', () => {
    handleShellSigint({
      sessionRuntime,
      renderer,
      runtimeContext,
      readline: rl,
      exit: process.exit,
    })
  })

  rl.on('line', async input => {
    const trimmed = input.trim()
    if (!trimmed) {
      rl.prompt()
      return
    }

    const slashResult = await routeSlashCommand(trimmed, { cwd: process.cwd() })
    if (slashResult?.kind === 'local') {
      renderer.renderLine(`\n${slashResult.output}\n`)
      rl.prompt()
      return
    }

    if (slashResult?.kind === 'shell-action' && slashResult.action === 'resume-session') {
      await resumeShellSession({
        requestedSessionId: slashResult.sessionId,
        fallbackSessionId: recoveryCandidate?.id,
        sessionManager,
        runtimeContext,
        sessionRuntime,
        renderer,
      })

      rl.prompt()
      return
    }

    if (slashResult?.kind === 'shell-action' && slashResult.action === 'cancel-run') {
      sessionRuntime.cancelCurrentRun()
      renderer.renderLine('\nRequested cancellation for the current run.\n')
      rl.prompt()
      return
    }

    if (slashResult?.kind === 'shell-action' && slashResult.action === 'list-sessions') {
      const sessions = sessionManager.listRecentSessions(5)
      renderer.renderLine(`\nRecent sessions:`)
      for (const session of sessions) {
        renderer.renderLine(`- ${session.id} [${session.status}]`)
      }
      renderer.renderLine('')
      rl.prompt()
      return
    }

    if (slashResult?.kind === 'shell-action' && slashResult.action === 'show-mcp') {
      const snapshot = await new CoreMcpGateway(process.cwd()).snapshot()
      renderer.renderLine(`\nMCP clients=${snapshot.clients.length} tools=${snapshot.tools.length}`)
      for (const client of snapshot.clients) {
        renderer.renderLine(`- ${client.name}: ${client.type}`)
      }
      renderer.renderLine('')
      rl.prompt()
      return
    }

    if (slashResult?.kind === 'shell-action' && slashResult.action === 'show-help') {
      renderer.renderLine('\nAvailable shell actions: /resume, /cancel, /sessions, /mcp, /help\n')
      rl.prompt()
      return
    }

    if (slashResult?.kind === 'prompt') {
      renderer.renderLine(`\n↪ Slash command expanded into prompt:\n${slashResult.prompt}\n`)
    }

    const effectivePrompt = slashResult?.kind === 'prompt' ? slashResult.prompt : trimmed

    try {
      logger.info('CLI prompt received', { sessionId: runtimeContext.session.id, promptLength: effectivePrompt.length })
      recordCount('cli.prompts', 1, { sessionId: runtimeContext.session.id })
      await sessionRuntime.executePrompt(runtimeContext.session.id, effectivePrompt)
      logger.info('CLI run completed', { sessionId: runtimeContext.session.id, shellState: sessionRuntime.getState() })
    } catch (error) {
      if (sessionRuntime.getState() !== 'interrupted') {
        renderer.renderLine(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`)
        logger.error('CLI run failed', {
          sessionId: runtimeContext.session.id,
          error: error instanceof Error ? error.message : String(error),
          shellState: sessionRuntime.getState(),
        })
      }
    }

    rl.prompt()
  })

  rl.on('close', () => {
    handleShellClose({
      sessionRuntime,
      renderer,
      runtimeContext,
      readline: rl,
      exit: process.exit,
    })
  })

  rl.prompt()
}

function printCliDoctor(): void {
  const runtimeConfig = getRuntimeConfig(process.cwd())
  const gitContext = getWorkflowGitContext(process.cwd())
  console.log('Private Coding Agents CLI Doctor')
  console.log(`Node: ${process.version}`)
  console.log(`Execution path: ${isRustDaemonEnabled() ? 'rust-daemon' : 'ts-local'}`)
  console.log(`Provider: ${runtimeConfig.provider}`)
  console.log(`Max turns: ${runtimeConfig.maxTurns}`)
  console.log(`Config sources: ${runtimeConfig.configSources.join(', ') || 'none'}`)
  console.log(`Workspace: ${process.cwd()}`)
  if (gitContext.insideGit) {
    console.log(`Git branch: ${gitContext.branch ?? 'unknown'}`)
    console.log(`Workspace clean: ${gitContext.isClean ? 'yes' : 'no'}`)
    console.log(`Git root: ${gitContext.root ?? 'unknown'}`)
  }
  console.log('Tip: run `npm run doctor` from the repo root for full environment diagnostics.')
}

async function* streamOrchestratedResponse(
  prompt: string,
  sessionId: string,
  signal: AbortSignal,
  maxTurns: number,
  runtimeSeed?: QueryRuntimeStateSeed,
){
  for await (const event of streamMvpIntegratedFlow({
    sessionId,
    prompt,
    workspaceRoot: process.cwd(),
    escalationDecision: /forbidden|deny/i.test(prompt) ? 'deny' : 'allow-once',
    maxTurns,
    runtimeSeed,
  })) {
    if (signal.aborted) {
      throw new Error('Aborted')
    }

    yield event
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
