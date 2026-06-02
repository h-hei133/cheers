import {
  createHostRuntime,
  type HostRuntime,
} from "../../runtime/api/host/runtime.js";
import {
  parseHostJsonInput,
  projectHostJsonError,
  projectHostJsonResponse,
  type HostJsonResponse,
} from "../../runtime/api/host/io.js";

export interface CliHostCommandInput {
  readonly commandJson: string;
  readonly projectRoot: string;
  readonly writeOutput: (message: string) => void;
  readonly exit: (code: number) => never;
  readonly host?: HostRuntime;
}

export async function runCliHostCommand(
  input: CliHostCommandInput,
): Promise<void> {
  const output = await dispatchCliHostCommand(input);
  input.writeOutput(JSON.stringify(output));
  input.exit(output.exit.code);
}

export async function dispatchCliHostCommand(input: {
  readonly commandJson: string;
  readonly projectRoot: string;
  readonly host?: HostRuntime;
}): Promise<HostJsonResponse> {
  try {
    const command = parseHostJsonInput(input.commandJson);
    const host = input.host ?? createHostRuntime({ projectRoot: input.projectRoot });
    const response = await host.dispatch(command);
    return projectHostJsonResponse({ response });
  } catch (error) {
    return projectHostJsonError({
      error,
      commandId: "host-command-input",
    });
  }
}
