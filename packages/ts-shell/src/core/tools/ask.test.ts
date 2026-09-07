import { describe, expect, it, vi } from "vitest";
import { createAskToolDefinition } from "./ask.js";

describe("ask tool", () => {
  it("uses interactiveAsk when provided in context", async () => {
    const askTool = createAskToolDefinition();
    const interactiveAsk = vi.fn().mockResolvedValue({
      approach: "Option B",
    });

    const result = await askTool.execute(
      {
        questions: [
          {
            id: "approach",
            question: "Which approach should we take?",
            options: [{ label: "Option A" }, { label: "Option B" }],
            recommended: 0,
          },
        ],
      },
      {
        taskId: "task_1",
        workspaceRoot: "/workspace",
        interactiveAsk,
      },
    );

    expect(interactiveAsk).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.output).toContain("### Question [approach]: Which approach should we take?");
    expect(result.output).toContain("- **User Decision**: Option B");
    expect(result.output).not.toContain("Autonomous execution mode");
  });

  it("falls back to recommended options when interactiveAsk is not provided", async () => {
    const askTool = createAskToolDefinition();

    const result = await askTool.execute(
      {
        questions: [
          {
            id: "approach",
            question: "Which approach should we take?",
            options: [{ label: "Option A" }, { label: "Option B" }],
            recommended: 0,
          },
        ],
      },
      {
        taskId: "task_2",
        workspaceRoot: "/workspace",
      },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Autonomous execution mode");
    expect(result.output).toContain("[1] Option A** (Recommended)");
  });

  it("rejects empty or invalid questions array", async () => {
    const askTool = createAskToolDefinition();
    const result = await askTool.execute({ questions: [] }, { taskId: "task_3", workspaceRoot: "/workspace" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("questions array is required");
  });

  it("falls back to recommended option or placeholder when user provides empty answer", async () => {
    const askTool = createAskToolDefinition();
    const interactiveAsk = vi.fn().mockResolvedValue({
      q_rec: "   ",
      q_none: "",
    });

    const result = await askTool.execute(
      {
        questions: [
          {
            id: "q_rec",
            question: "Choose format?",
            options: [{ label: "JSON" }, { label: "YAML" }],
            recommended: 1,
          },
          {
            id: "q_none",
            question: "Any thoughts?",
            options: [],
          },
        ],
      },
      {
        taskId: "task_4",
        workspaceRoot: "/workspace",
        interactiveAsk,
      },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("### Question [q_rec]: Choose format?\n- **User Decision**: YAML");
    expect(result.output).toContain("### Question [q_none]: Any thoughts?\n- **User Decision**: No answer provided");
  });
});
