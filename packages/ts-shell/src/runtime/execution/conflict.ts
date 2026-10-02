/** A conditional edit must be recomputed from the current file before retrying. */
export class FileContentConflictError extends Error {
  readonly code = 'FILE_CONTENT_CHANGED'

  constructor(target?: string) {
    super(`File changed since it was read${target ? `: ${target}` : ''}. Read the file again before editing.`)
    this.name = 'FileContentConflictError'
  }
}
