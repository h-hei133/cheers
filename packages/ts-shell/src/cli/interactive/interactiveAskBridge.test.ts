import { describe, expect, it, vi } from "vitest";
import type { Interface as ReadlineInterface } from "node:readline";
import { promptInteractiveQuestions } from "./interactiveAskBridge.js";

describe("interactiveAskBridge", () => {
  it("returns empty record when readline is null", async () => {
    const result = await promptInteractiveQuestions(null, [
      { id: "q1", question: "question?" },
    ]);
    expect(result).toEqual({});
  });

  it("returns empty record when questions array is empty", async () => {
    const rl = { question: vi.fn() } as unknown as ReadlineInterface;
    const result = await promptInteractiveQuestions(rl, []);
    expect(result).toEqual({});
    expect(rl.question).not.toHaveBeenCalled();
  });

  it("prompts multiple-choice question and maps numeric choice to label", async () => {
    const rl = {
      question: vi.fn((_prompt: string, cb: (ans: string) => void) => {
        cb("2");
      }),
    } as unknown as ReadlineInterface;

    const result = await promptInteractiveQuestions(rl, [
      {
        id: "choice_1",
        question: "Which option?",
        options: [{ label: "Apple" }, { label: "Banana" }],
      },
    ]);

    expect(rl.question).toHaveBeenCalledOnce();
    expect(result).toEqual({ choice_1: "Banana" });
  });

  it("maps case-insensitive option label match", async () => {
    const rl = {
      question: vi.fn((_prompt: string, cb: (ans: string) => void) => {
        cb("apple");
      }),
    } as unknown as ReadlineInterface;

    const result = await promptInteractiveQuestions(rl, [
      {
        id: "choice_1",
        question: "Which option?",
        options: [{ label: "Apple" }, { label: "Banana" }],
      },
    ]);

    expect(result).toEqual({ choice_1: "Apple" });
  });

  it("falls back to recommended option on empty input", async () => {
    const rl = {
      question: vi.fn((_prompt: string, cb: (ans: string) => void) => {
        cb("");
      }),
    } as unknown as ReadlineInterface;

    const result = await promptInteractiveQuestions(rl, [
      {
        id: "choice_rec",
        question: "Which option?",
        options: [{ label: "Default" }, { label: "Other" }],
        recommended: 0,
      },
    ]);

    expect(result).toEqual({ choice_rec: "Default" });
  });

  it("handles free-form text questions without options", async () => {
    const rl = {
      question: vi.fn((_prompt: string, cb: (ans: string) => void) => {
        cb("custom response");
      }),
    } as unknown as ReadlineInterface;

    const result = await promptInteractiveQuestions(rl, [
      {
        id: "freeform",
        question: "Enter name:",
      },
    ]);

    expect(result).toEqual({ freeform: "custom response" });
  });
});
