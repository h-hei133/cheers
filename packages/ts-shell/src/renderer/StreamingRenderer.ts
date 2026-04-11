/**
 * StreamingRenderer - Handles incremental output rendering
 * 
 * Provides:
 * - renderLine() - render complete line with newline
 * - renderChunk() - render partial content without newline (for streaming)
 * - Non-blocking output that doesn't interfere with input loop
 */

export class StreamingRenderer {
  private chunkBuffer: string = ''

  /**
   * Render a complete line with newline
   */
  renderLine(line: string): void {
    this.chunkBuffer = ''
    process.stdout.write(line + '\n')
  }

  /**
   * Render a partial chunk without newline (for streaming)
   */
  renderChunk(chunk: string): void {
    process.stdout.write(chunk)
    this.chunkBuffer += chunk
  }

  /**
   * Flush any pending chunks
   */
  flush(): void {
    this.chunkBuffer = ''
  }

  /**
   * Clear the current line (useful for updating status)
   */
  clearLine(): void {
    process.stdout.write('\r\x1b[K')
  }
}
