/**
 * Browser Stealth and Anti-Detection Engine
 * Provides launch argument scrubbing and preload script generation
 * to bypass modern WAFs (Cloudflare Turnstile, DataDome, Akamai) and bot-detection heuristics.
 */

export const STEALTH_LAUNCH_ARGS: readonly string[] = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--disable-site-isolation-trials",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-infobars",
  "--window-position=0,0",
  "--ignore-certificate-errors",
  "--ignore-certificate-errors-spki-list",
  "--disable-accelerated-2d-canvas",
  "--disable-gpu",
  "--hide-scrollbars",
  "--mute-audio",
];

export const STEALTH_IGNORE_DEFAULT_ARGS: readonly string[] = [
  "--enable-automation",
  "--enable-blink-features=IdleDetection",
];

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const DEFAULT_VIEWPORT = {
  width: 1366,
  height: 768,
};

/**
 * Builds the composite stealth preload script injected via page.addInitScript()
 */
export function buildStealthPreloadScript(): string {
  return `(() => {
    try {
      // 1. Mask navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });

      // 2. Emulate window.chrome runtime
      if (!window.chrome) {
        window.chrome = {
          app: {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
          },
          runtime: {
            OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
            OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
            PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
            PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
            PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
            RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
          },
          loadTimes: () => ({
            commitLoadTime: 1.4,
            connectionInfo: 'http/1.1',
            finishDocumentLoadTime: 1.6,
            finishLoadTime: 1.8,
            firstPaintAfterLoadTime: 0,
            firstPaintTime: 1.5,
            navigationType: 'Other',
            npnNegotiatedProtocol: 'unknown',
            requestTime: 1.2,
            startLoadTime: 1.3,
            wasAlternateProtocolAvailable: false,
            wasFetchedViaSpdy: false,
            wasNpnNegotiated: false,
          }),
          csi: () => ({
            onloadT: 1600000000000,
            pageT: 1200,
            startE: 1600000000000,
            tran: 15,
          }),
        };
      }

      // 3. Emulate navigator.plugins and mimeTypes
      if (!navigator.plugins || navigator.plugins.length === 0) {
        Object.defineProperty(navigator, 'plugins', {
          get: () => [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
          ],
          configurable: true,
        });
      }

      // 4. Emulate navigator.languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'zh-CN', 'zh'],
        configurable: true,
      });

      // 5. Hardware Concurrency and Device Memory
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
        configurable: true,
      });
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
        configurable: true,
      });

      // 6. WebGL Vendor / Renderer Spoofing
      const getParameterProto = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        // UNMASKED_VENDOR_WEBGL
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        // UNMASKED_RENDERER_WEBGL
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameterProto.apply(this, [parameter]);
      };

      if (typeof WebGL2RenderingContext !== 'undefined') {
        const getParameter2Proto = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) {
            return 'Intel Inc.';
          }
          if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';
          }
          return getParameter2Proto.apply(this, [parameter]);
        };
      }

      // 7. Permissions Query spoofing for notifications
      if (navigator.permissions && navigator.permissions.query) {
        const originalQuery = navigator.permissions.query;
        navigator.permissions.query = function(parameters) {
          if (parameters && parameters.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission });
          }
          return originalQuery.apply(this, [parameters]);
        };
      }

      // 8. Native toString protection
      const nativeToString = Function.prototype.toString;
      const patchedFunctions = new Set([
        WebGLRenderingContext.prototype.getParameter,
        typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext.prototype.getParameter : null,
        navigator.permissions ? navigator.permissions.query : null,
      ].filter(Boolean));

      Function.prototype.toString = function() {
        if (patchedFunctions.has(this)) {
          return 'function getParameter() { [native code] }';
        }
        return nativeToString.apply(this, arguments);
      };
    } catch (err) {
      // Ignore errors inside preload
    }
  })();`;
}
