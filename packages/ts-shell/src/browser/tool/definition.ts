import { approvedResult, deniedResult } from "../../core/tools/toolResultLifecycle.js";
import type { ToolDefinition, ToolExecutionResult, ToolExecutionContext } from "../../tools/types.js";
import { browserSession } from "../session/pool.js";
import { prepareBrowserCall, verifyBrowserCall } from "./preparation.js";
import { browserFeature } from "./features.js";
import type { BrowserActionResult, BrowserSessionFailure } from "../sessionManager.js";
import { getPwRuntimeStatus } from "../playwrightRuntime.js";
import { readBrowserOriginPolicy } from "../originPolicy.js";

/**
 * A stateful browser session the model drives across turns.
 *
 * Every outcome here is one of two things: what happened, or why it could not.
 * There is no third state where an action reports success without a page — an
 * earlier version answered `Simulated click on element 'e1'` when no browser was
 * running, which is the failure mode a reader cannot detect and therefore cannot
 * recover from.
 */
export function createUnifiedBrowserToolDefinition(): ToolDefinition {
  return {
    name: "browser",
    description:
      "Control a stateful browser session across multi-turn interactions: open URLs (including localhost), observe page structure with [ref=eN] markers, click, type, select options, hover, press keys, manage tabs, capture masked viewport screenshots, upload approved files, download explicit URLs into session artifacts, and close session.",
    argsSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "open",
            "observe",
            "click",
            "type",
            "select",
            "hover",
            "press",
            "close", "tabs", "tab_new", "tab_select", "tab_close", "screenshot", "upload", "download",
          ],
          description: "The browser action to perform.",
        },
        tabId: { type: "string", description: "Stable tab identity for tab_select/tab_close; obtain it from tabs." },
        files: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4, description: "Complete upload source list. Up to four approved workspace files and 8 MiB total." },
        masks: { type: "array", items: { type: "string" }, maxItems: 16, description: "Required CSS masks for a screenshot; every supplied selector must match. Form controls and iframe regions are always masked." },
        url: {
          type: "string",
          description: "Absolute http(s) URL for open or explicit URL download (including localhost).",
        },
        selector: {
          type: "string",
          description: "Element ref from observe (e.g. 'e1', 'e2') or standard CSS selector.",
        },
        text: {
          type: "string",
          description: "Text string to fill into an input field for 'type' action.",
        },
        value: {
          type: "string",
          description: "Dropdown option value to select for 'select' action.",
        },
        key: {
          type: "string",
          description: "Key name to press for 'press' action (e.g. Enter, Tab, Escape, ArrowDown).",
        },
      },
      required: ["action"],
    },
    prepare: (args, context) => prepareBrowserCall(args, context, executeBrowser),
    execute: executeBrowser,
  };
}

async function executeBrowser(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
  const action = typeof args.action === "string" ? args.action.toLowerCase().trim() : "";
  if (!action) {
    return deniedResult("Error: action parameter is required for browser tool.");
  }

  const manager = browserSession(context);
  const operation = await manager.run(
    { signal: context.abortSignal, taskId: context.taskId },
    async () => {
      try { verifyBrowserCall(args, context); } catch (error) { return deniedResult((error as Error).message); }
      const policy = readBrowserOriginPolicy();
      if (action !== 'close' && manager.tabs.failure) return deniedResult(manager.tabs.failure);
      const feature = await browserFeature(action, args, context, manager);
      if (feature) return feature;

      switch (action) {
        case "open": {
          const url = typeof args.url === "string" ? args.url.trim() : "";
          if (!url) {
            return deniedResult("Error: url parameter is required for 'open' action.");
          }
          const opened = await manager.openUrl(url, policy);
          if (!opened.ok) {
            return deniedResult(await renderFailure(opened.failure!));
          }
          const state = await manager.observe();
          if (state.failure) return deniedResult(await renderFailure(state.failure));
          return approvedResult(
            `# Navigated to \`${opened.url}\` (Title: "${opened.title ?? ""}")\n\n${state.outline}`,
          );
        }

        case "observe": {
          const state = await manager.observe();
          if (state.failure) return deniedResult(await renderFailure(state.failure));
          if (state.elements.length === 0 && state.url === "about:blank") {
            // Nothing has been opened, so the honest answer is that there is no
            // page rather than an empty element list from a blank one.
            return deniedResult(await renderFailure(
              {
                kind: "not-launched",
                reason: "No page has been opened yet, so there is nothing to observe.",
                nextAction: 'Run `browser` with `action: "open"` and a URL first.',
              },
            ));
          }
          return approvedResult(`# Browser Page State (\`${state.url}\`)\n\n${state.outline}`);
        }

        case "click": {
          const selector = typeof args.selector === "string" ? args.selector.trim() : "";
          if (!selector) {
            return deniedResult("Error: selector parameter (e.g. 'e1' or CSS selector) is required for 'click' action.");
          }
          return runBrowserAction(manager.click(selector));
        }

        case "type": {
          const selector = typeof args.selector === "string" ? args.selector.trim() : "";
          const text = typeof args.text === "string" ? args.text : "";
          if (!selector) {
            return deniedResult("Error: selector parameter is required for 'type' action.");
          }
          return runBrowserAction(manager.type(selector, text));
        }

        case "select": {
          const selector = typeof args.selector === "string" ? args.selector.trim() : "";
          const value = typeof args.value === "string" ? args.value : "";
          if (!selector || !value) {
            return deniedResult("Error: selector and value parameters are required for 'select' action.");
          }
          return runBrowserAction(manager.selectOption(selector, value));
        }

        case "hover": {
          const selector = typeof args.selector === "string" ? args.selector.trim() : "";
          if (!selector) {
            return deniedResult("Error: selector parameter is required for 'hover' action.");
          }
          return runBrowserAction(manager.hover(selector));
        }

        case "press": {
          const key = typeof args.key === "string" ? args.key.trim() : "";
          if (!key) {
            return deniedResult("Error: key parameter is required for 'press' action.");
          }
          return runBrowserAction(manager.pressKey(key));
        }

        case "close": {
          return runBrowserAction(manager.closeSession());
        }

        default:
          return deniedResult(
            `Error: Unsupported browser action '${action}'. Supported actions: open, observe, click, type, select, hover, press, close, tabs, tab_new, tab_select, tab_close, screenshot, upload, download.`,
          );
      }
    },
    action === "close",
  );
  const evidence = action === "close" && operation.status === "completed"
    ? { ...operation.evidence, cleanup: operation.value.success ? "complete" : operation.value.metadata?.browserCleanup ?? "failed" }
    : operation.evidence;
  const metadata = { browserAction: evidence, browserTabs: manager.tabs.list(), browserDialogs: manager.tabs.dialogs.map(record => ({ ...record })) };
  if (operation.status !== "completed") {
    const retained = operation.value?.metadata?.artifactPublication;
    return deniedResult(
      `Browser action ${operation.status}. Activity: ${operation.evidence.activity}; effects: ${operation.evidence.effect}; cleanup: ${operation.evidence.cleanup}. External effects are not rolled back.${retained ? ` Artifact publication: ${JSON.stringify(retained)}.` : ''}`,
      { ...metadata, ...(retained ? { artifactPublication: retained } : {}) },
    );
  }
  return { ...operation.value, metadata: { ...operation.value.metadata, ...metadata } };
}

/**
 * One page action's outcome, as the tool reports it.
 *
 * Stands apart from `execute` because the arms differ only in which method they
 * call: repeating the result-to-output mapping left each arm free to drift and,
 * at this function's length, defeated the compiler's narrowing of the result
 * union. One mapping, one place.
 */
async function runBrowserAction(action: Promise<BrowserActionResult>): Promise<ToolExecutionResult> {
  const result = await action;
  if (!result.ok) {
    return deniedResult(await renderFailure(result.failure), result.failure.cleanup ? { browserCleanup: result.failure.cleanup } : undefined);
  }
  return approvedResult(result.output);
}

/**
 * A refusal, with the detail that makes it actionable.
 *
 * The launch case is the one that needs the extra step: this report comes from a
 * failed launch, and the passive runtime status can say whether the package and
 * binary are present, which distinguishes "not installed" from "will not start".
 * Its own answer is included rather than restated, so the two readings agree.
 */
async function renderFailure(failure: BrowserSessionFailure): Promise<string> {
  const lines = [`Error: ${failure.reason}`, `Next: ${failure.nextAction}`];

  if (failure.kind === "not-launched") {
    const status = await getPwRuntimeStatus().catch(() => undefined);
    if (status) {
      lines.push(
        `Runtime: ${status.status} (dependency: ${status.dependency}, executable: ${status.executableSource}).`,
        `Runtime next action: ${status.nextAction}`,
      );
      if (status.warnings.length > 0) {
        lines.push(`Runtime warnings: ${status.warnings.join(", ")}.`);
      }
    }
  }

  if (failure.refusal) {
    lines.push(`Refused: ${failure.refusal.code} (${failure.refusal.hostname || "no host"}).`);
  }

  return lines.join("\n");
}
