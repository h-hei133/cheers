use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use tokio::process::Command;
use tokio::time::sleep;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CommandExecutionStatus {
    Completed,
    Failed,
    Timeout,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FailureKind {
    SandboxPreflight,
    ExecutionFailure,
    Timeout,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandExecutionRequest {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub workspace_root: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandExecutionResult {
    pub status: CommandExecutionStatus,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub failure_kind: Option<FailureKind>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SandboxStatus {
    Allowed,
    EscalationRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxEvaluation {
    pub status: SandboxStatus,
    pub reason: String,
}

#[derive(Clone, Default)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

pub fn schema_version_is_valid(version: &str) -> bool {
    Regex::new(
        r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$",
    )
    .expect("valid schema regex")
    .is_match(version)
}

pub fn contract_schema_exists() -> bool {
    let mut current = Path::new(env!("CARGO_MANIFEST_DIR")).to_path_buf();

    for _ in 0..4 {
        let candidate = current
            .join("contracts")
            .join("runtime-protocol.schema.json");
        if candidate.exists() {
            return true;
        }

        if !current.pop() {
            break;
        }
    }

    false
}

pub async fn execute_command(
    request: CommandExecutionRequest,
    cancellation: CancellationToken,
) -> CommandExecutionResult {
    let sandbox = evaluate_sandbox(&request);
    if sandbox.status == SandboxStatus::EscalationRequired {
        return CommandExecutionResult {
            status: CommandExecutionStatus::Failed,
            exit_code: None,
            stdout: String::new(),
            stderr: sandbox.reason,
            failure_kind: Some(FailureKind::SandboxPreflight),
        };
    }

    let mut command = Command::new(&request.command);
    command.args(&request.args);

    if let Some(cwd) = &request.cwd {
        command.current_dir(cwd);
    }

    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return CommandExecutionResult {
                status: CommandExecutionStatus::Failed,
                exit_code: None,
                stdout: String::new(),
                stderr: error.to_string(),
                failure_kind: Some(FailureKind::ExecutionFailure),
            }
        }
    };

    let mut wait_handle = tokio::spawn(async move { child.wait_with_output().await });

    if let Some(limit) = request.timeout_ms.map(Duration::from_millis) {
        tokio::select! {
            result = &mut wait_handle => map_join_result(result),
            _ = sleep(limit) => {
                wait_handle.abort();
                CommandExecutionResult {
                    status: CommandExecutionStatus::Timeout,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: format!("Command timed out after {} ms", limit.as_millis()),
                    failure_kind: Some(FailureKind::Timeout),
                }
            }
            _ = wait_for_cancellation(cancellation) => {
                wait_handle.abort();
                CommandExecutionResult {
                    status: CommandExecutionStatus::Cancelled,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: "Command cancelled".to_string(),
                    failure_kind: Some(FailureKind::Cancelled),
                }
            }
        }
    } else {
        tokio::select! {
            result = &mut wait_handle => map_join_result(result),
            _ = wait_for_cancellation(cancellation) => {
                wait_handle.abort();
                CommandExecutionResult {
                    status: CommandExecutionStatus::Cancelled,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: "Command cancelled".to_string(),
                    failure_kind: Some(FailureKind::Cancelled),
                }
            }
        }
    }
}

pub fn evaluate_sandbox(request: &CommandExecutionRequest) -> SandboxEvaluation {
    let joined = format!("{} {}", request.command, request.args.join(" ")).to_lowercase();

    if joined.contains("http://")
        || joined.contains("https://")
        || joined.contains("curl ")
        || joined.contains("invoke-webrequest")
    {
        return SandboxEvaluation {
            status: SandboxStatus::EscalationRequired,
            reason: "Network access requires escalation".to_string(),
        };
    }

    if let Some(workspace_root) = &request.workspace_root {
        if let Some(cwd) = &request.cwd {
            let normalized_cwd = cwd.to_lowercase().replace('\\', "/");
            let normalized_root = workspace_root.to_lowercase().replace('\\', "/");
            if !normalized_cwd.starts_with(&normalized_root) {
                return SandboxEvaluation {
                    status: SandboxStatus::EscalationRequired,
                    reason: format!("Execution outside workspace requires escalation: {}", cwd),
                };
            }
        }
    }

    SandboxEvaluation {
        status: SandboxStatus::Allowed,
        reason: "Command allowed within workspace policy".to_string(),
    }
}

async fn wait_for_cancellation(cancellation: CancellationToken) {
    while !cancellation.is_cancelled() {
        sleep(Duration::from_millis(10)).await;
    }
}

fn map_join_result(
    result: Result<Result<std::process::Output, std::io::Error>, tokio::task::JoinError>,
) -> CommandExecutionResult {
    match result {
        Ok(Ok(output)) => CommandExecutionResult {
            status: if output.status.success() {
                CommandExecutionStatus::Completed
            } else {
                CommandExecutionStatus::Failed
            },
            exit_code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            failure_kind: if output.status.success() {
                None
            } else {
                Some(FailureKind::ExecutionFailure)
            },
        },
        Ok(Err(error)) => CommandExecutionResult {
            status: CommandExecutionStatus::Failed,
            exit_code: None,
            stdout: String::new(),
            stderr: error.to_string(),
            failure_kind: Some(FailureKind::ExecutionFailure),
        },
        Err(error) if error.is_cancelled() => CommandExecutionResult {
            status: CommandExecutionStatus::Cancelled,
            exit_code: None,
            stdout: String::new(),
            stderr: "Command cancelled".to_string(),
            failure_kind: Some(FailureKind::Cancelled),
        },
        Err(error) => CommandExecutionResult {
            status: CommandExecutionStatus::Failed,
            exit_code: None,
            stdout: String::new(),
            stderr: error.to_string(),
            failure_kind: Some(FailureKind::ExecutionFailure),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_schema_versions() {
        assert!(schema_version_is_valid("0.1.0"));
        assert!(schema_version_is_valid("1.0.0"));
        assert!(schema_version_is_valid("1.2.3"));
        assert!(schema_version_is_valid("1.0.0-alpha"));
        assert!(schema_version_is_valid("1.0.0+build.1"));
    }

    #[test]
    fn test_invalid_schema_versions() {
        assert!(!schema_version_is_valid("1"));
        assert!(!schema_version_is_valid("1.0"));
        assert!(!schema_version_is_valid("v1.0.0"));
        assert!(!schema_version_is_valid("1.0.0.0"));
    }

    #[test]
    fn test_rust_smoke_initialization() {
        assert!(contract_schema_exists());
    }

    #[tokio::test]
    async fn test_execute_command_success() {
        let request = if cfg!(windows) {
            CommandExecutionRequest {
                command: "cmd".to_string(),
                args: vec!["/C".to_string(), "echo hello".to_string()],
                cwd: None,
                workspace_root: None,
                timeout_ms: Some(1_000),
            }
        } else {
            CommandExecutionRequest {
                command: "sh".to_string(),
                args: vec!["-c".to_string(), "printf hello".to_string()],
                cwd: None,
                workspace_root: None,
                timeout_ms: Some(1_000),
            }
        };

        let result = execute_command(request, CancellationToken::new()).await;
        assert_eq!(result.status, CommandExecutionStatus::Completed);
        assert_eq!(result.exit_code, Some(0));
        assert!(result.stdout.to_lowercase().contains("hello"));
    }

    #[tokio::test]
    async fn test_execute_command_timeout() {
        let request = if cfg!(windows) {
            CommandExecutionRequest {
                command: "cmd".to_string(),
                args: vec![
                    "/C".to_string(),
                    "ping -n 3 127.0.0.1 >NUL".to_string(),
                ],
                cwd: None,
                workspace_root: None,
                timeout_ms: Some(50),
            }
        } else {
            CommandExecutionRequest {
                command: "sh".to_string(),
                args: vec!["-c".to_string(), "sleep 2".to_string()],
                cwd: None,
                workspace_root: None,
                timeout_ms: Some(50),
            }
        };

        let result = execute_command(request, CancellationToken::new()).await;
        assert_eq!(result.status, CommandExecutionStatus::Timeout);
        assert!(result.stderr.contains("timed out"));
    }

    #[tokio::test]
    async fn test_execute_command_cancel() {
        let request = if cfg!(windows) {
            CommandExecutionRequest {
                command: "cmd".to_string(),
                args: vec![
                    "/C".to_string(),
                    "ping -n 3 127.0.0.1 >NUL".to_string(),
                ],
                cwd: None,
                workspace_root: None,
                timeout_ms: Some(2_000),
            }
        } else {
            CommandExecutionRequest {
                command: "sh".to_string(),
                args: vec!["-c".to_string(), "sleep 2".to_string()],
                cwd: None,
                workspace_root: None,
                timeout_ms: Some(2_000),
            }
        };

        let cancellation = CancellationToken::new();
        let trigger = cancellation.clone();
        let handle = tokio::spawn(async move { execute_command(request, cancellation).await });

        sleep(Duration::from_millis(20)).await;
        trigger.cancel();

        let result = handle.await.expect("command task join");
        assert_eq!(result.status, CommandExecutionStatus::Cancelled);
    }

    #[test]
    fn test_sandbox_allows_workspace_command() {
        let evaluation = evaluate_sandbox(&CommandExecutionRequest {
            command: "cmd".to_string(),
            args: vec!["/C".to_string(), "echo ok".to_string()],
            cwd: Some("D:/repo/workspace".to_string()),
            workspace_root: Some("D:/repo".to_string()),
            timeout_ms: Some(100),
        });

        assert_eq!(evaluation.status, SandboxStatus::Allowed);
    }

    #[test]
    fn test_sandbox_requires_escalation_for_network() {
        let evaluation = evaluate_sandbox(&CommandExecutionRequest {
            command: "cmd".to_string(),
            args: vec!["/C".to_string(), "curl https://example.com".to_string()],
            cwd: Some("D:/repo/workspace".to_string()),
            workspace_root: Some("D:/repo".to_string()),
            timeout_ms: Some(100),
        });

        assert_eq!(evaluation.status, SandboxStatus::EscalationRequired);
        assert!(evaluation.reason.contains("Network access"));
    }
}
