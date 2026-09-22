export function statusDetailForRealSingleFileUpdateFailureCategory(failureCategory) {
  if (failureCategory === 'provider/preflight') return 'provider-preflight'
  if (failureCategory === 'model output') return 'model-output'
  if (failureCategory === 'unsupported patch') return 'unsupported-patch'
  if (failureCategory === 'verification-blocked') return 'verification-blocked'
  if (failureCategory === 'no mutation') return 'no-mutation'
  if (failureCategory === 'post-write verification failed') return 'post-write-verification-failed'
  if (failureCategory === 'redaction failure') return 'redaction-failure'
  return 'passed'
}

export function statusDetailForRealSingleFileCreateFailureCategory(failureCategory) {
  if (failureCategory === 'provider/preflight') return 'provider-preflight'
  if (failureCategory === 'model output') return 'model-output'
  if (failureCategory === 'unsupported patch') return 'unsupported-patch'
  if (failureCategory === 'verification-blocked') return 'verification-blocked'
  if (failureCategory === 'route rejected') return 'route-rejected'
  if (failureCategory === 'no mutation') return 'no-mutation'
  if (failureCategory === 'post-write verification failed') return 'post-write-verification-failed'
  if (failureCategory === 'redaction failure') return 'redaction-failure'
  return 'passed'
}

export function statusDetailForRealTwoFileUpdateFailureCategory(failureCategory) {
  if (failureCategory === 'provider/preflight') return 'provider-preflight'
  if (failureCategory === 'model output') return 'model-output'
  if (failureCategory === 'unsupported patch') return 'unsupported-patch'
  if (failureCategory === 'route rejected') return 'route-rejected'
  if (failureCategory === 'verification-blocked') return 'verification-blocked'
  if (failureCategory === 'no mutation') return 'no-mutation'
  if (failureCategory === 'partial mutation failed') return 'partial-mutation-failed'
  if (failureCategory === 'post-write verification failed') return 'post-write-verification-failed'
  if (failureCategory === 'redaction failure') return 'redaction-failure'
  return 'passed'
}

export function route02FailureClassForCandidate(fields) {
  const category = String(fields.failureCategory ?? '').toLowerCase()
  const detail = String(fields.statusDetail ?? '').toLowerCase()
  const reason = String(fields.failureReason ?? '').toLowerCase()
  const combined = `${category}\n${detail}\n${reason}`

  if (fields.status === 'PASS' || category === 'none') return 'none'
  if (
    combined.includes('missing-config') ||
    combined.includes('missing-key') ||
    combined.includes('config') ||
    combined.includes('not clean') ||
    combined.includes('status could not be checked') ||
    combined.includes('set cheers_real_home')
  ) {
    return 'config'
  }
  if (
    combined.includes('network') ||
    combined.includes('auth') ||
    combined.includes('401') ||
    combined.includes('403') ||
    combined.includes('unauthorized') ||
    combined.includes('forbidden') ||
    combined.includes('rate limit') ||
    combined.includes('429') ||
    combined.includes('quota') ||
    combined.includes('unavailable')
  ) {
    return 'network-auth'
  }
  if (
    category.includes('model output') ||
    detail.includes('provider-output') ||
    detail.includes('model-output') ||
    combined.includes('provider output did not contain') ||
    combined.includes('provider output missing') ||
    combined.includes('multiple patches') ||
    combined.includes('unparseable') ||
    combined.includes('malformed')
  ) {
    return 'model-output'
  }
  if (
    category.includes('unsupported patch') ||
    category.includes('unsupported-patch-shape') ||
    detail.includes('unsupported') ||
    combined.includes('unsupported capability') ||
    combined.includes('unsupported operation') ||
    combined.includes('delete file') ||
    combined.includes('move file') ||
    combined.includes('rollback') ||
    combined.includes('3+ files') ||
    combined.includes('arbitrary project')
  ) {
    return 'unsupported'
  }
  if (
    category.includes('post-write') ||
    category.includes('partial mutation failed') ||
    category.includes('no mutation') ||
    category.includes('verification-failed') ||
    combined.includes('post-write verification failed') ||
    combined.includes('readback did not match') ||
    combined.includes('stale-read') ||
    combined.includes('changed files') ||
    combined.includes('workspace boundary')
  ) {
    return 'post-write'
  }
  if (
    category.includes('route rejected') ||
    category.includes('verification-blocked') ||
    combined.includes('workspace write cli') ||
    combined.includes('route rejected')
  ) {
    return 'route'
  }
  if (
    category.includes('redaction') ||
    combined.includes('repository mutated') ||
    combined.includes('unexpected success')
  ) {
    return 'product-regression'
  }
  return 'unknown'
}

export function route01FailureClassForRealCandidate(fields) {
  return route02FailureClassForCandidate(fields)
}

export function withRoute02FailureClass(fields) {
  const route02FailureClass = route02FailureClassForCandidate(fields)
  if (route02FailureClass === 'none') {
    return fields
  }
  return {
    ...fields,
    route02FailureClass,
    route01FailureClass: fields.route01FailureClass ?? route02FailureClass,
  }
}

export function withRoute01FailureClass(fields) {
  return withRoute02FailureClass(fields)
}

export function candidateMutationFailureTaxonomyFixtures() {
  return [
    {
      name: 'success-none',
      expected: 'none',
      mustNotSuccess: false,
      fields: {
        status: 'PASS',
        statusDetail: 'passed',
        failureCategory: 'none',
        failureReason: '',
      },
    },
    {
      name: 'dirty-repo-preflight-config',
      expected: 'config',
      mustNotSuccess: true,
      fields: {
        status: 'FAIL',
        statusDetail: 'verification-blocked',
        failureCategory: 'verification-blocked',
        failureReason: 'verification-blocked: repository was not clean before opt-in real candidate mutation smoke',
      },
    },
    {
      name: 'network-auth-provider',
      expected: 'network-auth',
      mustNotSuccess: true,
      fields: {
        status: 'FAIL',
        statusDetail: 'provider-network-inconclusive',
        failureCategory: 'provider-readiness',
        failureReason: 'provider-readiness:network: provider endpoint was unavailable',
      },
    },
    {
      name: 'malformed-model-output',
      expected: 'model-output',
      mustNotSuccess: true,
      fields: {
        status: 'FAIL',
        statusDetail: 'model-output',
        failureCategory: 'model output',
        failureReason: 'provider output did not contain one parseable apply_patch block',
      },
    },
    {
      name: 'unsupported-mutation-shape',
      expected: 'unsupported',
      mustNotSuccess: true,
      fields: {
        status: 'FAIL',
        statusDetail: 'unsupported-patch',
        failureCategory: 'unsupported patch',
        failureReason: 'unsupported patch: generated Delete File and Move File outside the candidate mutation boundary',
      },
    },
    {
      name: 'route-rejected',
      expected: 'route',
      mustNotSuccess: true,
      fields: {
        status: 'FAIL',
        statusDetail: 'route-rejected',
        failureCategory: 'route rejected',
        failureReason: 'route rejected: valid candidate mutation shape had no eligible workspace write lane',
      },
    },
    {
      name: 'post-write-verification',
      expected: 'post-write',
      mustNotSuccess: true,
      fields: {
        status: 'FAIL',
        statusDetail: 'post-write-verification-failed',
        failureCategory: 'post-write verification failed',
        failureReason: 'post-write verification failed: readback did not match planned content',
      },
    },
    {
      name: 'product-regression-redaction',
      expected: 'product-regression',
      mustNotSuccess: true,
      fields: {
        status: 'FAIL',
        statusDetail: 'redaction-failure',
        failureCategory: 'redaction failure',
        failureReason: 'redaction failure: secret-like provider output escaped the report surface',
      },
    },
    {
      name: 'unknown-safe-evidence-missing',
      expected: 'unknown',
      mustNotSuccess: true,
      fields: {
        status: 'FAIL',
        statusDetail: 'failed',
        failureCategory: 'task-execution-failure',
        failureReason: 'opaque failure with no safe evidence available',
      },
    },
  ]
}
