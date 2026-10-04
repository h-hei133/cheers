/** Bounded web collection results; excerpts are not verified claims. */
export interface CollectedPage {
  readonly url: string;
  readonly status: "collected" | "empty" | "failed";
  readonly excerpts: readonly string[];
}

export interface CollectionReport {
  readonly topic: string;
  readonly queries: readonly { readonly query: string; readonly status: "completed" | "failed" }[];
  readonly pages: readonly CollectedPage[];
}
