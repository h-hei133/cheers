import { describe, expect, it } from "vitest";
import { decideQueryRoute } from "./routeDecision.js";

describe("query route decision", () => {
  it.each(["你好", "你是什么模型", "这是一次测试", "解释一下 turn 是什么"])(
    "routes ordinary chat to lightweight single-provider path: %s",
    (prompt) => {
      const decision = decideQueryRoute({ prompt });

      expect(decision.mode).toBe("chat");
      expect(decision.route).toBe("lightweight");
      expect(decision.noWrite).toBe(true);
    },
  );

  it("routes analysis to a no-write analysis path", () => {
    const decision = decideQueryRoute({ prompt: "分析这个错误原因" });

    expect(decision.mode).toBe("analysis");
    expect(decision.route).toBe("lightweight");
    expect(decision.noWrite).toBe(true);
  });

  it("does not downgrade error explanation to ordinary chat", () => {
    const decision = decideQueryRoute({ prompt: "解释这段日志为什么失败" });

    expect(decision.mode).toBe("analysis");
    expect(decision.route).toBe("lightweight");
    expect(decision.noWrite).toBe(true);
  });

  it.each([
    "review src/app.ts 是否有问题",
    "检查 package.json 里的 scripts 有没有问题",
  ])("routes read-only review prompts to analysis: %s", (prompt) => {
    const decision = decideQueryRoute({ prompt });

    expect(decision.mode).toBe("analysis");
    expect(decision.route).toBe("lightweight");
    expect(decision.noWrite).toBe(true);
  });

  it("routes explicit planning to a no-write plan path", () => {
    const decision = decideQueryRoute({
      prompt: "先不要写代码，制定一个实现计划",
    });

    expect(decision.mode).toBe("plan");
    expect(decision.route).toBe("lightweight");
    expect(decision.noWrite).toBe(true);
  });

  it.each([
    "不要修改文件，分析这个错误原因",
    "只回答：这个日志为什么失败",
    "请不要修改，看看 package.json scripts 有没有问题",
    "不要运行命令，分析这个错误原因",
    "不要执行，只解释 npm test 为什么失败",
    "只回答：npm run build 为什么失败",
    "不要运行 npm test，只分析为什么失败",
  ])("keeps explicit no-write analysis out of plan mode: %s", (prompt) => {
    const decision = decideQueryRoute({ prompt });

    expect(decision.mode).toBe("analysis");
    expect(decision.route).toBe("lightweight");
    expect(decision.noWrite).toBe(true);
  });

  it("keeps implementation requests on the existing orchestration path", () => {
    const decision = decideQueryRoute({ prompt: "实现这个功能并测试" });

    expect(decision.mode).toBe("implementation");
    expect(decision.route).toBe("orchestrated");
  });

  it("keeps mixed plan then implementation requests on orchestration", () => {
    const decision = decideQueryRoute({ prompt: "先制定计划，然后实现" });

    expect(decision.mode).toBe("implementation");
    expect(decision.route).toBe("orchestrated");
    expect(decision.noWrite).toBe(false);
  });

  it("keeps tool and write requests behind orchestration boundaries", () => {
    for (const prompt of [
      "修改 src/app.ts",
      "把 README 里的错误说明改一下",
      "apply_patch 更新文件",
      "运行命令并修复",
      "commit 并 push",
    ]) {
      const decision = decideQueryRoute({ prompt });
      expect(decision.mode).toBe("tool-write");
      expect(decision.route).toBe("orchestrated");
      expect(decision.noWrite).toBe(false);
    }
  });

  it.each([
    "commit 是什么意思",
    "delete 是什么意思",
    "run 是什么意思",
    "请不要修改文件，只解释 commit 是什么意思",
  ])("does not treat concept explanations as tool/write requests: %s", (prompt) => {
    const decision = decideQueryRoute({ prompt });

    expect(decision.mode).toBe("chat");
    expect(decision.route).toBe("lightweight");
    expect(decision.noWrite).toBe(true);
  });

  it("does not let active recovery seeds take the lightweight route", () => {
    const decision = decideQueryRoute({
      prompt: "你好",
      hasRuntimeSeed: true,
    });

    expect(decision.route).toBe("orchestrated");
    expect(decision.signals).toContain("runtime-seed");
  });

  it("uses active plan mode as a no-write route boundary", () => {
    const decision = decideQueryRoute({
      prompt: "看看下一步怎么做",
      agentMode: "plan",
    });

    expect(decision.mode).toBe("plan");
    expect(decision.route).toBe("lightweight");
    expect(decision.noWrite).toBe(true);
  });
});
