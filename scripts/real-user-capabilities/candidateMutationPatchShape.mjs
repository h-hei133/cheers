export function classifySingleFileUpdatePatchShape(patchText) {
  const normalized = String(patchText ?? '').replace(/\r\n/g, '\n')
  const updateFiles = [...normalized.matchAll(/^\*\*\* Update File:\s+(.+)$/gm)]
    .map((match) => match[1].trim())
  const unsupportedHeaders = [
    /^\*\*\* Add File:/m,
    /^\*\*\* Delete File:/m,
    /^\*\*\* Move to:/m,
  ].filter((pattern) => pattern.test(normalized))

  if (unsupportedHeaders.length > 0) {
    return {
      ok: false,
      reason: 'unsupported patch: add/delete/move headers are outside the single-file update smoke boundary',
    }
  }
  if (updateFiles.length !== 1 || updateFiles[0] !== 'src/app.ts') {
    return {
      ok: false,
      reason: `unsupported patch: expected exactly one Update File for src/app.ts, observed ${updateFiles.join(',') || 'none'}`,
    }
  }
  if (
    !normalized.includes('-export const status = "draft"') ||
    !normalized.includes('+export const status = "ready"')
  ) {
    return {
      ok: false,
      reason: 'unsupported patch: expected deterministic draft-to-ready hunk for src/app.ts',
    }
  }
  return { ok: true, reason: '' }
}

export function classifyTwoFileUpdatePatchShape(patchText, fixture) {
  const normalized = String(patchText ?? '').replace(/\r\n/g, '\n')
  const updateFiles = [...normalized.matchAll(/^\*\*\* Update File:\s+(.+)$/gm)]
    .map((match) => match[1].trim())
  const addFiles = [...normalized.matchAll(/^\*\*\* Add File:\s+(.+)$/gm)]
    .map((match) => match[1].trim())
  const deleteFiles = [...normalized.matchAll(/^\*\*\* Delete File:\s+(.+)$/gm)]
    .map((match) => match[1].trim())
  const hasMove = /^\*\*\* Move to:/m.test(normalized)

  if (addFiles.length > 0 || deleteFiles.length > 0 || hasMove) {
    return {
      ok: false,
      reason: `unsupported patch: generated Add/Delete/Move outside the two-file update smoke boundary add=${addFiles.join(',') || 'none'} delete=${deleteFiles.join(',') || 'none'} move=${hasMove}`,
    }
  }
  if (updateFiles.length !== 2) {
    return {
      ok: false,
      reason: `unsupported patch: expected exactly two Update File operations for ${fixture.targetPaths.join(',')}, observed ${updateFiles.join(',') || 'none'}`,
    }
  }
  const expected = fixture.targetPaths.join(',')
  if (updateFiles.join(',') !== expected) {
    return {
      ok: false,
      reason: `unsupported patch: wrong Update File targets ${updateFiles.join(',')}; expected ${expected}`,
    }
  }
  if (
    !normalized.includes('-export const alpha = "draft"') ||
    !normalized.includes('+export const alpha = "ready"') ||
    !normalized.includes('-export const beta = "draft"') ||
    !normalized.includes('+export const beta = "ready"')
  ) {
    return {
      ok: false,
      reason: 'unsupported patch: expected deterministic draft-to-ready hunks for src/a.ts and src/b.ts',
    }
  }
  return { ok: true, reason: '' }
}

export function classifySingleFileCreatePatchShape(patchText, fixture) {
  const normalized = String(patchText ?? '').replace(/\r\n/g, '\n')
  const addFiles = [...normalized.matchAll(/^\*\*\* Add File:\s+(.+)$/gm)]
    .map((match) => match[1].trim())
  const updateFiles = [...normalized.matchAll(/^\*\*\* Update File:\s+(.+)$/gm)]
    .map((match) => match[1].trim())
  const deleteFiles = [...normalized.matchAll(/^\*\*\* Delete File:\s+(.+)$/gm)]
    .map((match) => match[1].trim())
  const hasMove = /^\*\*\* Move to:/m.test(normalized)

  if (updateFiles.length > 0) {
    return {
      ok: false,
      reason: `unsupported patch: generated Update File instead of Add File (${updateFiles.join(',')})`,
    }
  }
  if (deleteFiles.length > 0 || hasMove) {
    return {
      ok: false,
      reason: 'unsupported patch: delete/move headers are outside the single-file create smoke boundary',
    }
  }
  if (addFiles.length !== 1) {
    return {
      ok: false,
      reason: `unsupported patch: expected exactly one Add File for ${fixture.targetPath}, observed ${addFiles.join(',') || 'none'}`,
    }
  }
  if (addFiles[0] !== fixture.targetPath) {
    return {
      ok: false,
      reason: `unsupported patch: wrong Add File target ${addFiles[0]}; expected ${fixture.targetPath}`,
    }
  }

  const content = extractAddFileContent(normalized, fixture.targetPath)
  if (content !== fixture.plannedContent) {
    return {
      ok: false,
      reason: 'unsupported patch: Add File content did not match the deterministic planned content',
    }
  }
  return { ok: true, reason: '' }
}

function extractAddFileContent(patchText, targetPath) {
  const lines = patchText.split('\n')
  const start = lines.findIndex((line) => line.trim() === `*** Add File: ${targetPath}`)
  if (start < 0) return ''
  const content = []
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('*** ')) break
    if (!line.startsWith('+')) return ''
    content.push(line.slice(1))
  }
  return content.join('\n')
}
