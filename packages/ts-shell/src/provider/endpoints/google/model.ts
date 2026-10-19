import type { ChatMessage } from '../../../turn/prompt.js';

/** Parts carry signatures on the exact text or call the provider signed. */
export interface GooglePart {
  readonly text?: string;
  readonly inlineData?: { readonly mimeType: string; readonly data: string };
  readonly thought?: boolean;
  readonly thoughtSignature?: string;
  readonly functionCall?: { readonly name?: string; readonly args?: Record<string, unknown>; readonly id?: string };
  readonly functionResponse?: {
    readonly name: string;
    readonly parts?: readonly GooglePart[];
    readonly response: Record<string, unknown>;
    readonly id?: string;
  };
}

export interface GoogleContent {
  readonly role?: string;
  readonly parts: readonly GooglePart[];
}

export interface GoogleMessage extends ChatMessage {
  /** The protocol matches the tool name carried by its result. */
  readonly toolName?: string;
}
