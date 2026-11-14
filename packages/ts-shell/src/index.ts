export {
  selectVerification,
  type VerificationPurpose,
  type VerificationRunState,
  type VerificationSelection,
} from "./verification/selection/model.js";
export {
  executeVerification,
  type VerificationExecution,
  type VerificationExecutionState,
} from "./verification/execution/model.js";
export {
  createArtifactReceipt,
  type ArtifactCorrection,
  type ArtifactReceipt,
  type ArtifactValidationState,
} from "./artifacts/workflow/model.js";
export {
  decideRepair,
  executeRepair,
  type RepairAction,
  type RepairDecision,
  type RepairState,
} from "./repair/loop/model.js";
export {
  selectContext,
  type ContextSelection,
  type ContextSelectionState,
} from "./context/selection/model.js";
export {
  buildExecutionPlan,
  type ExecutionPlan,
  type ExecutionPlanState,
} from "./planning/execution/model.js";
export {
  buildTaskRequestPacket,
  type TaskRequestPacket,
  type RequestPacketState,
} from "./provider/request/packet.js";
export {
  chooseToolStrategy,
  type ToolStrategy,
  type ToolStrategyState,
} from "./tools/policy/strategy.js";
export {
  buildTaskProofInput,
  type TaskProofInput,
  type TaskProofStatus,
} from "./evidence/task/proof.js";
export {
  projectTaskVerdict,
  type TaskVerdict,
  type TaskVerdictStatus,
} from "./result/task/verdict.js";

// Embedded Session SDK (Track 3)
export {
  AgentSession,
  createAgentSession,
  type CreateAgentSessionOptions,
  type CreateAgentSessionResult,
} from "./sdk/agentSession.js";
export {
  DefaultResourceLoader,
  type DefaultResourceLoaderOptions,
  type LoadedSdkExtension,
  type LoadExtensionsResult,
  type ResourceDiagnostic,
  type ResourceLoader,
} from "./sdk/resourceLoader.js";
export {
  runExtensionFactory,
  loadInProcessExtension,
  type ExtensionAPI,
  type ExtensionFactory,
  type ExtensionHostBridge,
  type LoadedInProcessExtension,
} from "./extensions/runtime/inProcessLoader.js";
export { SessionManager } from "./session/SessionManager.js";
export { getRuntimeConfig, type RuntimeConfig, type RuntimeConfigOverrides, type RuntimeProvider } from "./config/runtimeConfig.js";
export type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from "./tools/types.js";
export type { QueryEvent } from "./core/query/runtime/events.js";
export type { QueryEventObserver } from "./core/shell/sessionRuntime.js";
