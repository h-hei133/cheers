import type { ImageContent } from '../../model-adapters/multimodal.js'

export interface ToolMediaBudget { images: number; encodedBytes: number }
export function createToolMediaBudget(): ToolMediaBudget { return { images: 4, encodedBytes: 4 * 1024 * 1024 } }

/** Shared across a batch, before results are retained or published. */
export function boundToolMedia<T extends { readonly output: string; readonly images?: readonly ImageContent[]; readonly metadata?: Record<string, unknown> }>(result: T, budget: ToolMediaBudget): T {
  if (!result.images?.length) return result
  const images: ImageContent[] = []
  let omitted = false
  for (const image of result.images) {
    if (budget.images < 1 || image.data.length > budget.encodedBytes) { omitted = true; continue }
    budget.images--
    budget.encodedBytes -= image.data.length
    images.push(image)
  }
  const notice = '[Image content omitted: the tool batch reached its four-image/4MiB encoded media budget. Re-read the omitted source in a separate batch if visual content is needed.]'
  return { ...result, images, output: result.output + (omitted ? '\n' + notice : ''),
    ...(omitted ? { metadata: { ...result.metadata, outputNotice: [typeof result.metadata?.outputNotice === 'string' ? result.metadata.outputNotice : '', notice].filter(Boolean).join('\n') } } : {}) }
}
