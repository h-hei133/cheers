export type RepairHypothesisConfidence = 'high' | 'medium' | 'low'

export interface RepairHypothesisState {
  readonly hypothesisId: string
  readonly summary: string
  readonly confidence: RepairHypothesisConfidence
  readonly targetFiles: readonly string[]
  readonly contextNeed?: string
  readonly sourceFactIds: readonly string[]
  readonly rejectedCause?: string
}

export interface RepairHypothesisInput {
  readonly failureClass: string
  readonly failureSummary: string
  readonly targetFiles: readonly string[]
  readonly sourceFactIds?: readonly string[]
  readonly rejected?: readonly RepairHypothesisState[]
}

export function classifyRepairHypothesis(input: RepairHypothesisInput): RepairHypothesisState {
  const summary = compact(`${input.failureClass} ${input.failureSummary}`)
  const lower = summary.toLowerCase()
  const targetFiles = unique(input.targetFiles)
  const sourceFactIds = unique(input.sourceFactIds ?? [])
  const rejected = input.rejected ?? []
  const primaryTarget = targetFiles[0]

  const base = lower.includes('cannot find module') || lower.includes('module_not_found')
    ? {
        summary: 'inspect missing dependency path',
        confidence: 'high' as const,
        contextNeed: primaryTarget,
      }
    : lower.includes('expected') && (lower.includes('received') || lower.includes('got'))
      ? {
          summary: sourceFactIds.length > 0
            ? 'correct source value using recorded facts'
            : 'inspect source value used by failing assertion',
          confidence: sourceFactIds.length > 0 ? 'medium' as const : 'high' as const,
          contextNeed: sourceFactIds.length > 0 ? undefined : primaryTarget,
        }
      : lower.includes('typeerror') || lower.includes('is not a function')
        ? {
            summary: sourceFactIds.length > 0
              ? 'correct callable contract using recorded facts'
              : 'inspect callable source contract',
            confidence: sourceFactIds.length > 0 ? 'medium' as const : 'high' as const,
            contextNeed: sourceFactIds.length > 0 ? undefined : primaryTarget,
          }
        : {
            summary: sourceFactIds.length > 0
              ? 'repair target using recorded source facts'
              : 'inspect target before repair',
            confidence: sourceFactIds.length > 0 ? 'medium' as const : 'low' as const,
            contextNeed: sourceFactIds.length > 0 ? undefined : primaryTarget,
          }

  const priorSummaries = new Set(rejected.map((item) => item.summary))
  const distinctSummary = priorSummaries.has(base.summary)
    ? nextSummary(base.summary, rejected.length)
    : base.summary

  return Object.freeze({
    hypothesisId: `hypothesis:${hash([distinctSummary, ...targetFiles, ...sourceFactIds].join('|'))}`,
    summary: distinctSummary,
    confidence: base.confidence,
    targetFiles,
    ...(base.contextNeed ? { contextNeed: base.contextNeed } : {}),
    sourceFactIds,
    ...(rejected.length > 0 ? { rejectedCause: compact(rejected[rejected.length - 1]?.rejectedCause ?? input.failureSummary) } : {}),
  })
}

export function rejectRepairHypothesis(input: {
  readonly hypothesis: RepairHypothesisState
  readonly cause: string
}): RepairHypothesisState {
  return Object.freeze({
    ...input.hypothesis,
    rejectedCause: compact(input.cause),
  })
}

function nextSummary(summary: string, rejectedCount: number): string {
  if (summary.includes('source value')) return 'correct alternate source branch using recorded facts'
  if (summary.includes('callable contract')) return 'correct alternate callable path using recorded facts'
  if (summary.includes('missing dependency')) return 'inspect alternate dependency edge'
  return `try distinct repair hypothesis ${rejectedCount + 1}`
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 220)
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function hash(value: string): string {
  let result = 0
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) - result + value.charCodeAt(index)) | 0
  }
  return Math.abs(result).toString(36)
}
