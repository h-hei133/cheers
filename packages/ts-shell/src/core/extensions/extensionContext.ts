import type { SessionMessage } from "../../session/schema/sessionMessage.js";

/**
 * Extension Context & UI Primitives
 * (Benchmarked against Pi Agent's `packages/coding-agent/src/core/extensions/types.ts`)
 *
 * Exposes rich UI interaction primitives, session access, and dynamic registration
 * to plugins and extensions.
 */

export interface ExtensionUIContext {
  select(title: string, options: readonly string[]): Promise<string | undefined>;
  confirm(message: string): Promise<boolean>;
  input(promptText: string, defaultValue?: string): Promise<string | undefined>;
  setStatus(message: string): void;
  setWorkingMessage(message: string): void;
}

export interface ExtensionCommand {
  readonly name: string;
  readonly description: string;
  execute(args: string, ctx: ExtensionContext): Promise<void>;
}

export interface ExtensionCustomTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, ctx: ExtensionContext): Promise<string>;
}

export interface ExtensionContext {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly ui: ExtensionUIContext;
  readonly modelName?: string;
  readonly thinkingLevel?: string;
  registerCommand(cmd: ExtensionCommand): void;
  registerTool(tool: ExtensionCustomTool): void;
  appendMessage(msg: SessionMessage): void;
}

export class DefaultExtensionRunner {
  private readonly registeredCommands = new Map<string, ExtensionCommand>();
  private readonly registeredTools = new Map<string, ExtensionCustomTool>();

  createContext(workspaceRoot: string, sessionId: string, ui?: Partial<ExtensionUIContext>): ExtensionContext {
    const defaultUI: ExtensionUIContext = {
      async select(_title, options) {
        return options[0];
      },
      async confirm(_message) {
        return true;
      },
      async input(_prompt, def) {
        return def ?? "";
      },
      setStatus(_message) {},
      setWorkingMessage(_message) {},
      ...ui,
    };

    return {
      workspaceRoot,
      sessionId,
      ui: defaultUI,
      registerCommand: (cmd) => {
        this.registeredCommands.set(cmd.name, cmd);
      },
      registerTool: (tool) => {
        this.registeredTools.set(tool.name, tool);
      },
      appendMessage: (_msg) => {},
    };
  }

  getCommand(name: string): ExtensionCommand | undefined {
    return this.registeredCommands.get(name);
  }

  getTool(name: string): ExtensionCustomTool | undefined {
    return this.registeredTools.get(name);
  }

  listCommands(): ExtensionCommand[] {
    return Array.from(this.registeredCommands.values());
  }

  listTools(): ExtensionCustomTool[] {
    return Array.from(this.registeredTools.values());
  }

  clear(): void {
    this.registeredCommands.clear();
    this.registeredTools.clear();
  }
}

export const extensionRunner = new DefaultExtensionRunner();
