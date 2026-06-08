export type RuntimeSourceFactConfidence = 'high' | 'medium' | 'low'

export interface RuntimeSourceFact {
  readonly factId: string
  readonly path: string
  readonly summary: string
  readonly confidence: RuntimeSourceFactConfidence
}

export function contextResultSourceFacts(input: {
  readonly toolId: string
  readonly paths: readonly string[]
  readonly diagnosticSummary?: string
  readonly sourceFacts?: readonly RuntimeSourceFact[]
}): readonly RuntimeSourceFact[] {
  if (input.sourceFacts !== undefined) {
    return normalizeRuntimeSourceFacts(input.sourceFacts)
  }
  return []
}

export function normalizeRuntimeSourceFacts(
  facts: readonly RuntimeSourceFact[],
): readonly RuntimeSourceFact[] {
  const byId = new Map<string, RuntimeSourceFact>()
  for (const fact of facts) {
    const path = compactPath(fact.path)
    const summary = compact(fact.summary)
    const factId = compact(fact.factId || `source:${path}`)
    if (!factId || !path || !summary) continue
    byId.set(factId, Object.freeze({
      factId,
      path,
      summary,
      confidence: fact.confidence,
    }))
  }
  return Object.freeze([...byId.values()])
}

export function sourceFactsForTargets(input: {
  readonly facts: readonly RuntimeSourceFact[]
  readonly targetFiles: readonly string[]
  readonly sourceFactIds?: readonly string[]
}): readonly RuntimeSourceFact[] {
  const targetSet = new Set(input.targetFiles.map(compactPath).filter(Boolean))
  const factIdSet = new Set((input.sourceFactIds ?? []).map(compact).filter(Boolean))
  return normalizeRuntimeSourceFacts(input.facts).filter((fact) =>
    factIdSet.has(fact.factId) || targetSet.has(fact.path)
  )
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 220)
}

function compactPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\s+/g, ' ').trim().slice(0, 220)
}
