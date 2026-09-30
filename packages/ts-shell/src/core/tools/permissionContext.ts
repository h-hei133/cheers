import path from 'node:path'

export function resolveToolTarget(
  args: Record<string, unknown>,
  key: string,
  workspaceRoot: string,
): string {
  const raw = args[key]
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`${key} must be a non-empty string`)
  }

  return path.isAbsolute(raw) ? raw : path.join(workspaceRoot, raw)
}
