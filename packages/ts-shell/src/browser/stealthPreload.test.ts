import { describe, it, expect } from "vitest";
import {
  STEALTH_LAUNCH_ARGS,
  STEALTH_IGNORE_DEFAULT_ARGS,
  buildStealthPreloadScript,
  DEFAULT_USER_AGENT,
} from "./stealthPreload.js";

describe("Browser Anti-Detection & Stealth Engine", () => {
  it("defines essential anti-detection launch arguments", () => {
    expect(STEALTH_LAUNCH_ARGS).toContain("--disable-blink-features=AutomationControlled");
    expect(STEALTH_LAUNCH_ARGS).toContain("--no-sandbox");
    expect(STEALTH_IGNORE_DEFAULT_ARGS).toContain("--enable-automation");
  });

  it("provides modern desktop user agent", () => {
    expect(DEFAULT_USER_AGENT).toContain("Mozilla/5.0");
    expect(DEFAULT_USER_AGENT).toContain("Chrome/");
  });

  it("builds composite preload script covering all detection vectors", () => {
    const script = buildStealthPreloadScript();

    // 1. Mask webdriver on prototype
    expect(script).toContain("proto, 'webdriver'");
    expect(script).toContain("get: () => false");

    // 2. Chrome runtime emulation
    expect(script).toContain("window.chrome");
    expect(script).toContain("loadTimes");
    expect(script).toContain("csi");

    // 3. Plugins & languages
    expect(script).toContain("navigator, 'plugins'");
    expect(script).toContain("navigator, 'languages'");

    // 4. Hardware concurrency & WebGL
    expect(script).toContain("hardwareConcurrency");
    expect(script).toContain("Intel Iris OpenGL Engine");

    // 5. Permissions Query & PermissionStatus emulation
    expect(script).toContain("navigator.permissions.query");
    expect(script).toContain("notifications");

    // 6. Native toString protection
    expect(script).toContain("Function.prototype.toString");
    expect(script).toContain("[native code]");
  });
});
