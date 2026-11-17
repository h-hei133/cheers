import { toCodemodeIdentifier } from './declarations.js'

export interface CallableTool {
  readonly name: string
  /** Present only when the identifier cannot resolve to another raw tool. */
  readonly alias?: string
  readonly expression: string
}

export interface CallableCatalog {
  readonly tools: readonly CallableTool[]
  /** Raw names and admitted aliases resolve to the same captured raw name. */
  readonly lookup: Readonly<Record<string, string>>
}

/** Inert spelling projection of the caller's catalog; no registration or execution. */
export function projectCallableCatalog(names: readonly string[]): CallableCatalog {
  const rawNames = new Set(names)
  const aliases = new Map<string, Set<string>>()
  for (const name of rawNames) {
    const alias = toCodemodeIdentifier(name)
    const owners = aliases.get(alias) ?? new Set<string>()
    owners.add(name)
    aliases.set(alias, owners)
  }

  const lookup = Object.create(null) as Record<string, string>
  for (const name of rawNames) lookup[name] = name
  const tools: CallableTool[] = []
  for (const name of rawNames) {
    const alias = toCodemodeIdentifier(name)
    const unique = aliases.get(alias)!.size === 1 && (!rawNames.has(alias) || alias === name)
    if (unique) lookup[alias] = name
    tools.push(Object.freeze({
      name,
      ...(unique ? { alias } : {}),
      expression: unique ? `tools.${alias}` : `tools[${JSON.stringify(name)}]`,
    }))
  }
  return Object.freeze({ tools: Object.freeze(tools), lookup: Object.freeze(lookup) })
}
