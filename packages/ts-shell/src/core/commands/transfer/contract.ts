/** External data transfer uses the host's current source and prepared-write authority. */
export interface CommandDataTransfer {
  read(input: { readonly path: string; readonly maxBytes: number }): Promise<CommandDataReadResult>;
  write(input: { readonly path: string; readonly content: string }): Promise<CommandDataEffectResult>;
  copy?(input: { readonly content: string }): Promise<CommandDataEffectResult>;
  openLink?(input: { readonly url: string }): Promise<CommandDataEffectResult>;
}

export type CommandDataReadResult =
  | { readonly outcome: "read"; readonly content: string }
  | { readonly outcome: "blocked" | "denied" | "cancelled" | "failed"; readonly reason: string };

export interface CommandDataEffectResult {
  readonly outcome: "committed" | "unchanged" | "blocked" | "denied" | "cancelled" | "failed" | "unknown";
  readonly reason?: string;
}
