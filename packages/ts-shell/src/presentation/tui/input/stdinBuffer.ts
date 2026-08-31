import { parseKeyEvent, type ParsedKeyEvent } from "./keys.js";

/**
 * Raw Stdin Stream Chunk Buffer & Escape Sequence Assembler
 *
 * Assembles chunked escape sequences arriving over stdin:
 * 1. Buffers fragmented escape codes (e.g. `\x1b`, `[`, `A`) across chunks
 * 2. Detects bracketed paste blocks (`\x1b[200~` ... `\x1b[201~`)
 * 3. Dispatches discrete `ParsedKeyEvent` records to active focused components
 */

export type KeyEventListener = (event: ParsedKeyEvent) => void;
export type PasteEventListener = (pastedText: string) => void;

export class StdinBuffer {
  private pending = "";
  private inBracketedPaste = false;
  private pasteBuffer = "";
  private readonly keyListeners: KeyEventListener[] = [];
  private readonly pasteListeners: PasteEventListener[] = [];

  onKey(listener: KeyEventListener): () => void {
    this.keyListeners.push(listener);
    return () => {
      const idx = this.keyListeners.indexOf(listener);
      if (idx >= 0) this.keyListeners.splice(idx, 1);
    };
  }

  onPaste(listener: PasteEventListener): () => void {
    this.pasteListeners.push(listener);
    return () => {
      const idx = this.pasteListeners.indexOf(listener);
      if (idx >= 0) this.pasteListeners.splice(idx, 1);
    };
  }

  feed(chunk: string): void {
    if (!chunk) return;
    this.pending += chunk;
    this.process();
  }

  private process(): void {
    while (this.pending.length > 0) {
      // 1. Handle Bracketed Paste Start
      if (!this.inBracketedPaste && this.pending.startsWith("\x1b[200~")) {
        this.inBracketedPaste = true;
        this.pasteBuffer = "";
        this.pending = this.pending.slice("\x1b[200~".length);
        continue;
      }

      // 2. Handle Bracketed Paste Content and End
      if (this.inBracketedPaste) {
        const endIdx = this.pending.indexOf("\x1b[201~");
        if (endIdx >= 0) {
          this.pasteBuffer += this.pending.slice(0, endIdx);
          this.pending = this.pending.slice(endIdx + "\x1b[201~".length);
          this.inBracketedPaste = false;
          this.emitPaste(this.pasteBuffer);
          this.pasteBuffer = "";
          continue;
        } else {
          this.pasteBuffer += this.pending;
          this.pending = "";
          break;
        }
      }

      // 3. Handle Escape Sequence Buffering
      if (this.pending[0] === "\x1b") {
        if (this.pending === "\x1b") {
          // Incomplete single escape byte, hold in buffer for potential sequence
          break;
        }

        // Multi-byte sequence matching
        const seqMatch = this.pending.match(/^(\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[a-zA-Z0-9]|\x1bO[A-Z])/);
        if (seqMatch) {
          const matchedSeq = seqMatch[0];
          const parsed = parseKeyEvent(matchedSeq);
          this.pending = this.pending.slice(matchedSeq.length);
          this.emitKey(parsed);
          continue;
        }

        // If incomplete CSI sequence, hold in buffer
        if (/^\x1b\[[0-9;]*$/.test(this.pending)) {
          break;
        }
      }

      // 4. Handle Single Discrete Key
      const char = this.pending[0];
      const parsed = parseKeyEvent(char);
      this.pending = this.pending.slice(1);
      this.emitKey(parsed);
    }
  }

  private emitKey(event: ParsedKeyEvent): void {
    for (const listener of this.keyListeners) {
      listener(event);
    }
  }

  private emitPaste(text: string): void {
    for (const listener of this.pasteListeners) {
      listener(text);
    }
  }
}
