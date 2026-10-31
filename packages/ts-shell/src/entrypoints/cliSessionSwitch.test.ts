import { describe, expect, it } from "vitest";
import { permissionScopeAfterSwitch } from "./cliSessionModule.js";

describe("permission scope across a session switch", () => {
  it("keeps the scope when the session is still in the same project", () => {
    // Staying put changes nothing the grant was about, so dropping it would make
    // the user re-answer questions they had already answered.
    expect(permissionScopeAfterSwitch("allow-all", false)).toBe("allow-all");
    expect(permissionScopeAfterSwitch("accept-edits", false)).toBe("accept-edits");
  });

  it("puts the scope back to asking when the session moves to another project", () => {
    // The defect this guards: a standing `allow-all` was chosen for one project
    // and followed the user into another, pre-approving work never shown to them.
    expect(permissionScopeAfterSwitch("allow-all", true)).toBe("ask");
    expect(permissionScopeAfterSwitch("accept-edits", true)).toBe("ask");
  });

  it("leaves an already-neutral scope alone", () => {
    expect(permissionScopeAfterSwitch("ask", true)).toBe("ask");
    expect(permissionScopeAfterSwitch("ask", false)).toBe("ask");
  });
});
