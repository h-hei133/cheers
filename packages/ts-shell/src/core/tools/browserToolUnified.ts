import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";
import { defaultBrowserSessionManager } from "../../browser/browserSessionManager.js";

/**
 * Unified Browser Tool
 * Controls a stateful, persistent browser session across multi-turn interactions.
 */
export function createUnifiedBrowserToolDefinition(): ToolDefinition {
  return {
    name: "browser",
    description:
      "Control a stateful browser session across multi-turn interactions: open URLs (including localhost), observe page structure with [ref=eN] markers, click, type, select options, hover, press keys, and close session.",
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
            "close",
          ],
          description: "Browser action to execute.",
        },
        url: {
          type: "string",
          description: "URL to navigate to for 'open' action (e.g. http://localhost:3000, https://example.com).",
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
    permissions: { check: () => [] },
    async execute(args, _context) {
      const action = typeof args.action === "string" ? args.action.toLowerCase().trim() : "";
      if (!action) {
        return deniedResult("Error: action parameter is required for browser tool.");
      }

      switch (action) {
        case "open": {
          const url = typeof args.url === "string" ? args.url.trim() : "";
          if (!url) {
            return deniedResult("Error: url parameter is required for 'open' action.");
          }
          const { title } = await defaultBrowserSessionManager.openUrl(url);
          const state = await defaultBrowserSessionManager.observe();
          return approvedResult(
            `# Navigated to \`${url}\` (Title: "${title}")\n\n${state.outline}`,
          );
        }

        case "observe": {
          const state = await defaultBrowserSessionManager.observe();
          return approvedResult(
            `# Browser Page State (\`${state.url}\`)\n\n${state.outline}`,
          );
        }
        case "click": {
          const selector = typeof args.selector === "string" ? args.selector.trim() : "";
          if (!selector) {
            return deniedResult("Error: selector parameter (e.g. 'e1' or CSS selector) is required for 'click' action.");
          }
          const result = await defaultBrowserSessionManager.click(selector);
          if (result.startsWith("Click attempt failed")) {
            return deniedResult(result);
          }
          return approvedResult(result);
        }

        case "type": {
          const selector = typeof args.selector === "string" ? args.selector.trim() : "";
          const text = typeof args.text === "string" ? args.text : "";
          if (!selector) {
            return deniedResult("Error: selector parameter is required for 'type' action.");
          }
          const result = await defaultBrowserSessionManager.type(selector, text);
          if (result.startsWith("Type attempt failed")) {
            return deniedResult(result);
          }
          return approvedResult(result);
        }

        case "select": {
          const selector = typeof args.selector === "string" ? args.selector.trim() : "";
          const value = typeof args.value === "string" ? args.value : "";
          if (!selector || !value) {
            return deniedResult("Error: selector and value parameters are required for 'select' action.");
          }
          const result = await defaultBrowserSessionManager.selectOption(selector, value);
          if (result.startsWith("Select option failed")) {
            return deniedResult(result);
          }
          return approvedResult(result);
        }

        case "hover": {
          const selector = typeof args.selector === "string" ? args.selector.trim() : "";
          if (!selector) {
            return deniedResult("Error: selector parameter is required for 'hover' action.");
          }
          const result = await defaultBrowserSessionManager.hover(selector);
          if (result.startsWith("Hover failed")) {
            return deniedResult(result);
          }
          return approvedResult(result);
        }

        case "press": {
          const key = typeof args.key === "string" ? args.key.trim() : "";
          if (!key) {
            return deniedResult("Error: key parameter is required for 'press' action.");
          }
          const result = await defaultBrowserSessionManager.pressKey(key);
          if (result.startsWith("Key press failed")) {
            return deniedResult(result);
          }
          return approvedResult(result);
        }

        case "close": {
          const result = await defaultBrowserSessionManager.closeSession();
          return approvedResult(result);
        }

        default:
          return deniedResult(
            `Error: Unsupported browser action '${action}'. Supported actions: open, observe, click, type, select, hover, press, close.`,
          );
      }
    },
  };
}
