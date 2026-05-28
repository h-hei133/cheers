use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const RUNTIME_PROTOCOL_SCHEMA_VERSION: &str = "1.0.0";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeOrigin {
    Typescript,
    Rust,
    Python,
    User,
    System,
    External,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RuntimeErrorCode {
    E_SCHEMA_VERSION_REQUIRED,
    E_SCHEMA_VERSION_FORMAT,
    E_COMPATIBILITY_UNSUPPORTED,
    E_KIND_INVALID,
    E_FIELD_REQUIRED,
    E_FIELD_INVALID_TYPE,
    E_FIELD_INVALID_VALUE,
    E_COMMAND_INVALID,
    E_TASK_STATUS_INVALID,
    E_PERMISSION_RESPONSE_INVALID,
    E_CANCELLATION_INVALID,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRequest {
    pub schema_version: String,
    pub kind: String,
    pub command_id: String,
    pub task_id: String,
    pub command_name: String,
    pub args: HashMap<String, serde_json::Value>,
    pub requested_by: RuntimeOrigin,
    pub issued_at: u64,
    pub correlation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ExecutionAuthorityMode {
    NoneRequired,
    ReadOnly,
    Preview,
    PermissionPending,
    Denied,
    ApprovedForWrite,
    CommandAllowlisted,
    SandboxApproved,
    SandboxRejected,
    UnknownTransitional,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ExecutionAuthoritySource {
    ToolRuntimeApproval,
    WorkspaceAuthority,
    DaemonSandbox,
    None,
    UnknownTransitional,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ExecutionPath {
    TsLocal,
    RustDaemon,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Completed,
    Failed,
    Timeout,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionFailureKind {
    SandboxPreflight,
    ExecutionFailure,
    Timeout,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionAuthority {
    pub mode: ExecutionAuthorityMode,
    pub source: ExecutionAuthoritySource,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionCommandRequest {
    pub operation_kind: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub workspace_root: String,
    pub authority: ExecutionAuthority,
    pub caller: String,
    pub reason: String,
    pub report_safe_command: String,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionEvent {
    pub kind: String,
    pub operation_kind: String,
    pub execution_path: ExecutionPath,
    pub authority_mode: ExecutionAuthorityMode,
    pub caller: Option<String>,
    pub report_safe_command: Option<String>,
    pub timeout_ms: Option<u64>,
    pub status: Option<ExecutionStatus>,
    pub exit_code: Option<i32>,
    pub failure_kind: Option<ExecutionFailureKind>,
    pub recovery_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionCommandResult {
    pub status: ExecutionStatus,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub failure_kind: Option<ExecutionFailureKind>,
    pub execution_path: ExecutionPath,
    pub events: Vec<ExecutionEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionCommandContractResults {
    pub completed: ExecutionCommandResult,
    pub failed: ExecutionCommandResult,
    pub timed_out: ExecutionCommandResult,
    pub cancelled: ExecutionCommandResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionCommandContract {
    pub schema_version: String,
    pub kind: String,
    pub request: ExecutionCommandRequest,
    pub results: ExecutionCommandContractResults,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Killed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskLifecycleEvent {
    pub schema_version: String,
    pub kind: String,
    pub event_id: String,
    pub task_id: String,
    pub status: TaskStatus,
    pub previous_status: Option<TaskStatus>,
    pub message: Option<String>,
    pub progress: Option<f64>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StreamChannel {
    Stdout,
    Stderr,
    System,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunk {
    pub schema_version: String,
    pub kind: String,
    pub stream_id: String,
    pub task_id: String,
    pub channel: StreamChannel,
    pub chunk_index: u64,
    pub content: String,
    pub is_final: bool,
    pub emitted_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeError {
    pub schema_version: String,
    pub kind: String,
    pub error_id: String,
    pub task_id: Option<String>,
    pub code: RuntimeErrorCode,
    pub message: String,
    pub recoverable: bool,
    pub details: Option<HashMap<String, serde_json::Value>>,
    pub emitted_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PermissionScopeMode {
    Read,
    Write,
    Execute,
    Network,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PermissionDecision {
    Allow,
    Deny,
    Ask,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionScope {
    pub mode: PermissionScopeMode,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionPrompt {
    pub schema_version: String,
    pub kind: String,
    pub prompt_id: String,
    pub task_id: String,
    pub tool_name: String,
    pub action: String,
    pub rationale: Option<String>,
    pub scope: PermissionScope,
    pub default_decision: PermissionDecision,
    pub requested_at: u64,
    pub expires_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancellationRequest {
    pub schema_version: String,
    pub kind: String,
    pub request_id: String,
    pub task_id: String,
    pub reason: Option<String>,
    pub requested_by: RuntimeOrigin,
    pub requested_at: u64,
    pub immediate: bool,
    pub correlation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RuntimeProtocolMessage {
    CommandRequest(CommandRequest),
    ExecutionCommandContract(ExecutionCommandContract),
    TaskLifecycleEvent(TaskLifecycleEvent),
    StreamChunk(StreamChunk),
    RuntimeError(RuntimeError),
    PermissionPrompt(PermissionPrompt),
    CancellationRequest(CancellationRequest),
}
