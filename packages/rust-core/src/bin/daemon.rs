use cheers_core::{
    execute_command, CancellationToken, CommandExecutionRequest, CommandExecutionResult,
    CommandExecutionStatus,
};
use cheers_core::executor::FailureKind;
use serde::{Deserialize, Serialize};
use serde_json::to_string_pretty;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum DaemonRequest {
    Health,
    ExecStart {
        request: CommandExecutionRequest,
        execution_id: Option<String>,
    },
    ExecutionStatus {
        execution_id: String,
    },
    Cancel {
        execution_id: String,
    },
    // Keep legacy one-shot over stdio for transitional callers.
    Exec { request: CommandExecutionRequest },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ExecutionState {
    Running,
    Finished,
    NotFound,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CancelOutcome {
    Cancelled,
    AlreadyFinished,
    NotFound,
    NotCancellable,
    InternalError,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum TerminalOutcome {
    Completed,
    Failed,
    TimedOut,
    Cancelled,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DaemonEnvelope {
    instance_id: String,
    pid: u32,
    request_seq: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DaemonHealthPayload {
    #[serde(flatten)]
    envelope: DaemonEnvelope,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DaemonExecStartedPayload {
    #[serde(flatten)]
    envelope: DaemonEnvelope,
    execution_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DaemonExecutionStatusPayload {
    #[serde(flatten)]
    envelope: DaemonEnvelope,
    execution_id: String,
    state: ExecutionState,
    #[serde(skip_serializing_if = "Option::is_none")]
    terminal_outcome: Option<TerminalOutcome>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<CommandExecutionResult>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DaemonCancelPayload {
    #[serde(flatten)]
    envelope: DaemonEnvelope,
    execution_id: String,
    outcome: CancelOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    terminal_outcome: Option<TerminalOutcome>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DaemonLegacyExecPayload {
    #[serde(flatten)]
    envelope: DaemonEnvelope,
    result: CommandExecutionResult,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DaemonErrorPayload {
    #[serde(flatten)]
    envelope: DaemonEnvelope,
    error: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum DaemonResponse {
    Health(DaemonHealthPayload),
    ExecStarted(DaemonExecStartedPayload),
    ExecutionStatus(DaemonExecutionStatusPayload),
    Cancel(DaemonCancelPayload),
    Exec(DaemonLegacyExecPayload),
    Error(DaemonErrorPayload),
}

struct InFlightExecution {
    cancellation: CancellationToken,
    handle: tokio::task::JoinHandle<CommandExecutionResult>,
}

#[derive(Default)]
struct DaemonState {
    in_flight: HashMap<String, InFlightExecution>,
    completed: HashMap<String, CommandExecutionResult>,
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: daemon <exec|serve-stdio> ...");
        std::process::exit(1);
    }

    match args[1].as_str() {
        "exec" => run_one_shot_exec(&args).await,
        "serve-stdio" => run_stdio_daemon().await,
        other => {
            eprintln!("Unsupported daemon subcommand: {}", other);
            std::process::exit(1);
        }
    }
}

async fn run_stdio_daemon() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = BufReader::new(stdin).lines();
    let mut writer = BufWriter::new(stdout);
    let request_seq = AtomicU64::new(0);
    let mut state = DaemonState::default();
    let instance_id = format!(
        "daemon-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0)
    );

    loop {
        let maybe_line = match reader.next_line().await {
            Ok(line) => line,
            Err(error) => {
                let payload = DaemonResponse::Error(DaemonErrorPayload {
                    envelope: daemon_envelope(&instance_id, request_seq.load(Ordering::SeqCst)),
                    error: format!("Failed to read daemon request: {}", error),
                });
                if write_daemon_response(&mut writer, &payload).await.is_err() {
                    break;
                }
                break;
            }
        };

        let line = match maybe_line {
            Some(line) => line,
            None => break,
        };

        if line.trim().is_empty() {
            continue;
        }

        let seq = request_seq.fetch_add(1, Ordering::SeqCst) + 1;
        reap_completed(&mut state).await;

        let response = match serde_json::from_str::<DaemonRequest>(&line) {
            Ok(request) => handle_request(&instance_id, seq, request, &mut state).await,
            Err(error) => DaemonResponse::Error(DaemonErrorPayload {
                envelope: daemon_envelope(&instance_id, seq),
                error: format!("Invalid daemon request payload: {}", error),
            }),
        };

        if write_daemon_response(&mut writer, &response).await.is_err() {
            break;
        }
    }
}

async fn handle_request(
    instance_id: &str,
    seq: u64,
    request: DaemonRequest,
    state: &mut DaemonState,
) -> DaemonResponse {
    match request {
        DaemonRequest::Health => DaemonResponse::Health(DaemonHealthPayload {
            envelope: daemon_envelope(instance_id, seq),
        }),
        DaemonRequest::ExecStart {
            request,
            execution_id,
        } => {
            let execution_id = execution_id.unwrap_or_else(|| {
                format!("exec-{}-{}", std::process::id(), seq)
            });

            if state.in_flight.contains_key(&execution_id) || state.completed.contains_key(&execution_id) {
                return DaemonResponse::Error(DaemonErrorPayload {
                    envelope: daemon_envelope(instance_id, seq),
                    error: format!("Execution id already exists: {}", execution_id),
                });
            }

            let cancellation = CancellationToken::new();
            let execution_cancel = cancellation.clone();
            let handle = tokio::spawn(async move { execute_command(request, execution_cancel).await });

            state.in_flight.insert(
                execution_id.clone(),
                InFlightExecution {
                    cancellation,
                    handle,
                },
            );

            DaemonResponse::ExecStarted(DaemonExecStartedPayload {
                envelope: daemon_envelope(instance_id, seq),
                execution_id,
            })
        }
        DaemonRequest::ExecutionStatus { execution_id } => {
            if let Some(result) = state.completed.get(&execution_id) {
                return DaemonResponse::ExecutionStatus(DaemonExecutionStatusPayload {
                    envelope: daemon_envelope(instance_id, seq),
                    execution_id,
                    state: ExecutionState::Finished,
                    terminal_outcome: Some(terminal_outcome_from_result(result)),
                    result: Some(result.clone()),
                });
            }

            if state.in_flight.contains_key(&execution_id) {
                return DaemonResponse::ExecutionStatus(DaemonExecutionStatusPayload {
                    envelope: daemon_envelope(instance_id, seq),
                    execution_id,
                    state: ExecutionState::Running,
                    terminal_outcome: None,
                    result: None,
                });
            }

            DaemonResponse::ExecutionStatus(DaemonExecutionStatusPayload {
                envelope: daemon_envelope(instance_id, seq),
                execution_id,
                state: ExecutionState::NotFound,
                terminal_outcome: None,
                result: None,
            })
        }
        DaemonRequest::Cancel { execution_id } => {
            if let Some(result) = state.completed.get(&execution_id) {
                return DaemonResponse::Cancel(DaemonCancelPayload {
                    envelope: daemon_envelope(instance_id, seq),
                    execution_id,
                    outcome: CancelOutcome::AlreadyFinished,
                    terminal_outcome: Some(terminal_outcome_from_result(result)),
                });
            }

            if let Some(in_flight) = state.in_flight.get(&execution_id) {
                in_flight.cancellation.cancel();
                return DaemonResponse::Cancel(DaemonCancelPayload {
                    envelope: daemon_envelope(instance_id, seq),
                    execution_id,
                    outcome: CancelOutcome::Cancelled,
                    terminal_outcome: None,
                });
            }

            DaemonResponse::Cancel(DaemonCancelPayload {
                envelope: daemon_envelope(instance_id, seq),
                execution_id,
                outcome: CancelOutcome::NotFound,
                terminal_outcome: None,
            })
        }
        DaemonRequest::Exec { request } => {
            let result = execute_command(request, CancellationToken::new()).await;
            DaemonResponse::Exec(DaemonLegacyExecPayload {
                envelope: daemon_envelope(instance_id, seq),
                result,
            })
        }
    }
}

async fn reap_completed(state: &mut DaemonState) {
    let finished_ids: Vec<String> = state
        .in_flight
        .iter()
        .filter_map(|(execution_id, in_flight)| {
            if in_flight.handle.is_finished() {
                Some(execution_id.clone())
            } else {
                None
            }
        })
        .collect();

    for execution_id in finished_ids {
        if let Some(in_flight) = state.in_flight.remove(&execution_id) {
            let result = match in_flight.handle.await {
                Ok(result) => result,
                Err(error) => CommandExecutionResult {
                    status: CommandExecutionStatus::Failed,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: format!("Execution task join failed: {}", error),
                    failure_kind: Some(FailureKind::ExecutionFailure),
                },
            };
            state.completed.insert(execution_id, result);
        }
    }
}

fn daemon_envelope(instance_id: &str, request_seq: u64) -> DaemonEnvelope {
    DaemonEnvelope {
        instance_id: instance_id.to_string(),
        pid: std::process::id(),
        request_seq,
    }
}

fn terminal_outcome_from_result(result: &CommandExecutionResult) -> TerminalOutcome {
    match result.status {
        CommandExecutionStatus::Completed => TerminalOutcome::Completed,
        CommandExecutionStatus::Failed => TerminalOutcome::Failed,
        CommandExecutionStatus::Timeout => TerminalOutcome::TimedOut,
        CommandExecutionStatus::Cancelled => TerminalOutcome::Cancelled,
    }
}

async fn write_daemon_response(
    writer: &mut BufWriter<tokio::io::Stdout>,
    response: &DaemonResponse,
) -> io::Result<()> {
    let encoded = serde_json::to_string(response)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))?;
    writer.write_all(encoded.as_bytes()).await?;
    writer.write_all(b"\n").await?;
    writer.flush().await
}

async fn run_one_shot_exec(args: &[String]) {
    let mut timeout_ms: Option<u64> = None;
    let mut cwd: Option<String> = None;
    let mut workspace_root: Option<String> = None;
    let mut command_parts: Vec<String> = Vec::new();

    let mut index = 2;
    while index < args.len() {
        match args[index].as_str() {
            "--timeout-ms" => {
                if index + 1 >= args.len() {
                    eprintln!("Missing value for --timeout-ms");
                    std::process::exit(1);
                }
                timeout_ms = args[index + 1].parse::<u64>().ok();
                index += 2;
            }
            "--cwd" => {
                if index + 1 >= args.len() {
                    eprintln!("Missing value for --cwd");
                    std::process::exit(1);
                }
                cwd = Some(args[index + 1].clone());
                index += 2;
            }
            "--workspace-root" => {
                if index + 1 >= args.len() {
                    eprintln!("Missing value for --workspace-root");
                    std::process::exit(1);
                }
                workspace_root = Some(args[index + 1].clone());
                index += 2;
            }
            other => {
                command_parts.push(other.to_string());
                index += 1;
            }
        }
    }

    if command_parts.is_empty() {
        eprintln!("No command provided");
        std::process::exit(1);
    }

    let request = CommandExecutionRequest {
        command: command_parts[0].clone(),
        args: command_parts[1..].to_vec(),
        cwd,
        workspace_root,
        timeout_ms,
    };

    let result = execute_command(request, CancellationToken::new()).await;
    match to_string_pretty(&result) {
        Ok(json) => println!("{}", json),
        Err(error) => {
            eprintln!("Failed to serialize daemon result: {}", error);
            std::process::exit(1);
        }
    }

    if result.exit_code.unwrap_or(1) != 0
        && !matches!(result.status, CommandExecutionStatus::Completed)
    {
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{sleep, Duration};

    fn long_running_request() -> CommandExecutionRequest {
        if cfg!(windows) {
            CommandExecutionRequest {
                command: "cmd".to_string(),
                args: vec!["/C".to_string(), "ping -n 4 127.0.0.1 >NUL".to_string()],
                cwd: None,
                workspace_root: None,
                timeout_ms: Some(5_000),
            }
        } else {
            CommandExecutionRequest {
                command: "sh".to_string(),
                args: vec!["-c".to_string(), "sleep 3".to_string()],
                cwd: None,
                workspace_root: None,
                timeout_ms: Some(5_000),
            }
        }
    }

    fn quick_request() -> CommandExecutionRequest {
        if cfg!(windows) {
            CommandExecutionRequest {
                command: "cmd".to_string(),
                args: vec!["/C".to_string(), "echo done".to_string()],
                cwd: None,
                workspace_root: None,
                timeout_ms: Some(1_000),
            }
        } else {
            CommandExecutionRequest {
                command: "sh".to_string(),
                args: vec!["-c".to_string(), "printf done".to_string()],
                cwd: None,
                workspace_root: None,
                timeout_ms: Some(1_000),
            }
        }
    }

    #[tokio::test]
    async fn cancel_marks_in_flight_execution_as_cancelled() {
        let mut state = DaemonState::default();

        let started = handle_request(
            "daemon-test",
            1,
            DaemonRequest::ExecStart {
                request: long_running_request(),
                execution_id: Some("exec-cancel".to_string()),
            },
            &mut state,
        )
        .await;

        match started {
            DaemonResponse::ExecStarted(payload) => {
                assert_eq!(payload.execution_id, "exec-cancel");
            }
            other => panic!("unexpected start response: {:?}", other),
        }

        let cancelled = handle_request(
            "daemon-test",
            2,
            DaemonRequest::Cancel {
                execution_id: "exec-cancel".to_string(),
            },
            &mut state,
        )
        .await;

        match cancelled {
            DaemonResponse::Cancel(payload) => {
                assert!(matches!(payload.outcome, CancelOutcome::Cancelled));
            }
            other => panic!("unexpected cancel response: {:?}", other),
        }

        for _ in 0..50 {
            reap_completed(&mut state).await;
            let status = handle_request(
                "daemon-test",
                3,
                DaemonRequest::ExecutionStatus {
                    execution_id: "exec-cancel".to_string(),
                },
                &mut state,
            )
            .await;

            if let DaemonResponse::ExecutionStatus(payload) = status {
                if matches!(payload.state, ExecutionState::Finished) {
                    let result = payload.result.expect("finished result");
                    assert!(matches!(result.status, CommandExecutionStatus::Cancelled));
                    return;
                }
            }

            sleep(Duration::from_millis(20)).await;
        }

        panic!("execution never reached finished cancelled state");
    }

    #[tokio::test]
    async fn cancel_reports_already_finished_for_completed_execution() {
        let mut state = DaemonState::default();

        let started = handle_request(
            "daemon-test",
            1,
            DaemonRequest::ExecStart {
                request: quick_request(),
                execution_id: Some("exec-finished".to_string()),
            },
            &mut state,
        )
        .await;
        assert!(matches!(started, DaemonResponse::ExecStarted(_)));

        for _ in 0..50 {
            reap_completed(&mut state).await;
            if state.completed.contains_key("exec-finished") {
                break;
            }
            sleep(Duration::from_millis(10)).await;
        }

        let cancel = handle_request(
            "daemon-test",
            2,
            DaemonRequest::Cancel {
                execution_id: "exec-finished".to_string(),
            },
            &mut state,
        )
        .await;

        match cancel {
            DaemonResponse::Cancel(payload) => {
                assert!(matches!(payload.outcome, CancelOutcome::AlreadyFinished));
            }
            other => panic!("unexpected cancel response: {:?}", other),
        }
    }
}
