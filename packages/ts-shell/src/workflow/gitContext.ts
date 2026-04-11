import { spawnSync } from 'node:child_process'

export interface WorkflowGitContext {
  readonly insideGit: boolean
  readonly branch: string | null
  readonly isClean: boolean | null
  readonly root: string | null
}

function runGit(args: string[], cwd: string) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
  })

  return {
    ok: !result.error && result.status === 0,
    stdout: (result.stdout || '').trim(),
  }
}

export function getWorkflowGitContext(cwd: string = process.cwd()): WorkflowGitContext {
  const inside = runGit(['rev-parse', '--is-inside-work-tree'], cwd)
  if (!inside.ok || inside.stdout !== 'true') {
    return {
      insideGit: false,
      branch: null,
      isClean: null,
      root: null,
    }
  }

  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  const status = runGit(['status', '--short'], cwd)
  const root = runGit(['rev-parse', '--show-toplevel'], cwd)

  return {
    insideGit: true,
    branch: branch.ok ? branch.stdout : null,
    isClean: status.ok ? status.stdout.length === 0 : null,
    root: root.ok ? root.stdout : null,
  }
}
