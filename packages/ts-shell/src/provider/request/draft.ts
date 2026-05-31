import {
  streamTurnRoleDraft,
  type TurnRoleDraftRealProvider,
} from "../../turn/roleDraftStage.js";

export async function runProviderDraftStage(input: {
  readonly role: "planner" | "coder" | "reviewer";
  readonly draft: string;
  readonly providerMode: "synthetic" | "real";
  readonly realProvider?: TurnRoleDraftRealProvider;
}): Promise<string> {
  return streamTurnRoleDraft(input);
}
