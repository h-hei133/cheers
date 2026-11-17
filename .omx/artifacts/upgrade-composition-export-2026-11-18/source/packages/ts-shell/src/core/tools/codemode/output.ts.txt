import type { ImageContent } from '../../../model-adapters/multimodal.js'
import { boundToolMedia, createToolMediaBudget } from '../../agent/media.js'
import { truncateTextBytes } from '../truncation.js'
import { validateCodemodeImage } from './image.js'

export interface ScriptOutput {
  readonly text: string
  readonly images?: readonly ImageContent[]
  readonly metadata?: Record<string, unknown>
}

/** Apply early host limits and the existing final media budget before any result is retained. */
export class CodemodeOutput {
  private readonly textItems: string[] = []
  private readonly consoleLines: string[] = []
  private readonly images: ImageContent[] = []
  private readonly media = createToolMediaBudget()
  private chars = 0
  private items = 0
  private notice = ''

  constructor(private readonly maxBytes: number) {}

  text(kind: 'text' | 'console', value: string): void {
    if (++this.items > 10_000 || value.length > this.maxBytes * 4 - this.chars) {
      throw new Error('Exceeded codemode output buffer limit.')
    }
    this.chars += value.length
    if (kind === 'text') { if (value) this.textItems.push(value) }
    else this.consoleLines.push(value)
  }

  image(item: unknown): void {
    const image = validateCodemodeImage(item)
    if (image.data.length > 4 * 1024 * 1024) throw new Error('image() exceeds the 4MiB encoded media limit.')
    const bounded = boundToolMedia({ output: '', images: [image], metadata: undefined as Record<string, unknown> | undefined }, this.media)
    this.images.push(...bounded.images ?? [])
    if (bounded.metadata?.outputNotice) this.notice = '[Image content omitted: the four-image/4MiB encoded media budget was reached.]'
  }

  result(header: 'Script completed' | 'Script failed', error?: string): ScriptOutput {
    const parts: string[] = [header]
    if (this.textItems.length === 1) parts.push(this.textItems[0]!)
    else this.textItems.forEach((item, index) => parts.push(`==> text ${index + 1}/${this.textItems.length} <==\n${item}`))
    if (this.consoleLines.length) parts.push(`<console_output>\n${this.consoleLines.join('\n')}\n</console_output>`)
    if (error) parts.push(`Script error: ${error}`)
    let text = parts.join('\n\n')
    let notice = this.notice
    if (Buffer.byteLength(text + (notice ? '\n' + notice : ''), 'utf8') > this.maxBytes) {
      notice = [notice, '[Script output truncated to its byte budget.]'].filter(Boolean).join('\n')
      const reserved = Buffer.byteLength(notice, 'utf8') + 2
      const retained = Math.max(0, this.maxBytes - reserved)
      // The terminal outcome precedes the user payload and always survives shortening.
      text = truncateTextBytes(text, retained) + '\n\n' + notice
    } else if (notice) text += '\n' + notice
    return { text, ...(this.images.length ? { images: [...this.images] } : {}),
      ...(notice ? { metadata: { outputNotice: notice } } : {}) }
  }
}
