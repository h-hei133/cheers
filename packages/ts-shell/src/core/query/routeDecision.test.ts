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

  it("routes explicit planning to a no-write plan path", () => {
    const decision = decideQueryRoute({
      prompt: "先不要写代码，制定一个实现计划",
    });

    expect(decision.mode).toBe("plan");
    expect(decision.route).toBe("lightweight");
    expect(decision.noWrite).toBe(true);
  });

  it("keeps implementation requests on the existing orchestration path", () => {
    const decision = decideQueryRoute({ prompt: "实现这个功能并测试" });

    expect(decision.mode).toBe("implementation");
    expect(decision.route).toBe("orchestrated");
  });

  it("keeps tool and write requests behind orchestration boundaries", () => {
    for (const prompt of [
      "修改 src/app.ts",
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
