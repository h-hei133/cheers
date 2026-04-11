use private_agents_core::{execute_command, CancellationToken, CommandExecutionRequest};
use serde_json::to_string_pretty;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 || args[1] != "exec" {
        eprintln!("Usage: daemon exec <command> [args...] [--timeout-ms <value>] [--cwd <path>]");
        std::process::exit(1);
    }

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
        && !matches!(result.status, private_agents_core::CommandExecutionStatus::Completed)
    {
        std::process::exit(1);
    }
}
