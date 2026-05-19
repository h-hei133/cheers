export const failureCategories = [
  'none',
  'provider-readiness',
  'task-execution-failure',
  'model-output',
  'provider/preflight',
  'unsupported patch',
  'verification-blocked',
  'no mutation',
  'post-write verification failed',
  'unsupported-patch-shape',
  'verification-failed',
  'verification-blocked',
  'protected-file-changed',
  'over-scoped-expectation',
  'product-gap',
  'assertion-mismatch',
  'environment-filesystem-issue',
]

export function providerReadinessStatusForCode(code) {
  if (code === 0) return 'pass'
  if (code === 2) return 'provider-network-inconclusive'
  if (code === 3) return 'config-failure'
  return 'provider-readiness-failed'
}

export function summarizeFailureStatus(results, { classifyProviderReadinessFailure }) {
  const failed = results.filter((entry) => entry.status !== 'PASS')
  if (failed.length === 0) {
    return { statusDetail: 'passed', exitCode: 0 }
  }

  const providerFailures = failed
    .filter((entry) => entry.failureCategory === 'provider-readiness')
    .map((entry) =>
      classifyProviderReadinessFailure(
        entry.failureReason,
        entry.outputTail,
        entry.provider,
      ) ?? {
        statusDetail: 'provider-readiness-failed',
        exitCode: 1,
      },
    )

  if (providerFailures.length === failed.length) {
    if (providerFailures.some((entry) => entry.statusDetail === 'provider-network-inconclusive')) {
      return { statusDetail: 'provider-network-inconclusive', exitCode: 2 }
    }
    if (providerFailures.some((entry) => entry.statusDetail === 'config-failure')) {
      return { statusDetail: 'config-failure', exitCode: 3 }
    }
    if (providerFailures.some((entry) => entry.statusDetail === 'provider-model-failed')) {
      return { statusDetail: 'provider-model-failed', exitCode: 1 }
    }
    return { statusDetail: 'provider-readiness-failed', exitCode: 1 }
  }

  return { statusDetail: 'failed', exitCode: 1 }
}
