import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { JsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/types.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { McpClassifiedError, classifyMcpFailure } from "./errorTaxonomy.js";
import { randomUUID } from 'node:crypto';
import { sameValue } from '../../config/values.js';

/** Metadata for the entire catalog, including tools from earlier pages. */
export class McpToolCatalog {
  private readonly tools = new Map<string, Tool>();
  private readonly validators = new Map<string, JsonSchemaValidator<unknown>>();
  private readonly contracts = new Map<string, string>();

  constructor(tools: Tool[], previous?: McpToolCatalog) {
    const validator = new AjvJsonSchemaValidator();
    for (const tool of tools) {
      if (this.tools.has(tool.name)) throw new Error("MCP catalog contains duplicate tool: " + tool.name);
      this.tools.set(tool.name, structuredClone(tool));
      this.contracts.set(tool.name, previous && sameValue(previous.tools.get(tool.name), tool)
        ? previous.contractId(tool.name)! : randomUUID());
      if (tool.outputSchema) this.validators.set(tool.name, validator.getValidator(tool.outputSchema));
    }
  }

  contractId(name: string): string | undefined { return this.contracts.get(name); }

  assertCallable(name: string, contractId?: string): void {
    const tool = this.tools.get(name);
    if (!tool) throw new Error("MCP tool is absent from the current catalog: " + name);
    if (contractId !== undefined && this.contractId(name) !== contractId) {
      throw new McpClassifiedError(classifyMcpFailure({ failureClass: 'tool-unavailable',
        detail: 'MCP tool definition or connection changed; refresh tools and obtain a new approval before retrying.' }));
    }
    if (tool.execution?.taskSupport === "required") {
      throw new McpClassifiedError(classifyMcpFailure({
        failureClass: "tool-unavailable",
        detail: "MCP tool " + name + " requires task execution, which this build does not implement",
      }));
    }
  }

  validate(name: string, result: CallToolResult): void {
    const validator = this.validators.get(name);
    if (!validator || result.isError) return;
    if (result.structuredContent === undefined || !validator(result.structuredContent).valid) {
      throw new McpClassifiedError(classifyMcpFailure({
        failureClass: "malformed-result",
        detail: "MCP tool " + name + " returned no valid structured content for its output schema",
      }));
    }
  }
}
