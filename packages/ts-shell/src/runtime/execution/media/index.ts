import { createReader, type MediaReader } from './reader.js'

export { processCleanupFailed } from './reader.js'

export function createMediaReader(): MediaReader {
  return createReader()
}

export const readMedia = createMediaReader()
