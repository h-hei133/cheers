import type { HookDispatcher } from "../hookDispatcher.js";
import { createPostMutationLspGuard } from "./postMutationLspGuard.js";
import { createAffectedUnitTestRunner } from "./affectedUnitTestRunner.js";
import { createEvidenceReceiptCollector } from "./evidenceReceiptCollector.js";

export { createPostMutationLspGuard } from "./postMutationLspGuard.js";
export { createAffectedUnitTestRunner } from "./affectedUnitTestRunner.js";
export {
  createEvidenceReceiptCollector,
  getSessionReceipts,
  clearSessionReceipts,
  type ToolExecutionReceipt,
} from "./evidenceReceiptCollector.js";

/**
 * Register all default verification and compiler guard hooks into the dispatcher
 */
let builtinHooksRegistered = false;

export function setupBuiltinVerificationHooks(dispatcher: HookDispatcher): void {
  if (builtinHooksRegistered) return;
  dispatcher.registerInProcessHook(createPostMutationLspGuard());
  dispatcher.registerInProcessHook(createAffectedUnitTestRunner());
  dispatcher.registerInProcessHook(createEvidenceReceiptCollector());
  builtinHooksRegistered = true;
}
