# 启动产物与构建校验

`npm start` 只运行通过新鲜度与完整性校验的构建产物；源码开发继续走 `npm run start:dev`（工作区内的 `tsx src/entrypoints/cli.tsx`）。`npm run build:ts` 是发布构建入口。

## 构建与发布

`npm run build:ts` 在单一构建锁内完成以下步骤：

1. 计算编译前输入摘要，将 TypeScript 编译到 `packages/ts-shell/dist` 下的独立 staging。
2. 再次计算输入摘要；源码、配置、锁文件、编译器、标准库或构建脚本在编译期间变化时失败，不发布新 manifest。
3. 生成根目录 `dist/cli.js` launcher；只有编译和输入校验成功后才替换它，发布失败时恢复旧字节。
4. 对 staging 中全部 emit 文件逐文件记录路径、字节数与 SHA-256，并检查 CLI 入口、package 主入口和五个主题/资源文件。
5. 将完整 staging 原子发布到 `packages/ts-shell/dist/builds/<buildId>`，原子替换 package 主入口 pointer，清理旧稳定镜像文件，最后原子替换 `build-manifest.json`。

`npm run build:exe` 使用同一把构建锁，先确认 TypeScript 构建仍为 fresh，再把 Bun 输出写到 `dist/bin` 内的临时路径。自定义 `--outfile` 只能命名该目录下的直接文件，不能指向 launcher、package 主入口、Git 元数据或其他仓库文件。构建前后都读取实际 `PATH` 中的 Bun 可执行文件，记录版本与 SHA-256；宿主目标先在临时文件上运行 `--version`，再把同一字节复制到 `dist/executables/<sha256>/cheers`。manifest 只引用这个不可变路径；`dist/bin/cheers` 是方便人工调用的稳定副本，不是启动校验的权威指针。发布后仍执行完整 `checkBuild({ executablePolicy: "required" })` 复核；失败会恢复旧 manifest。进程在 manifest 写入与后置复核之间退出时，下一次启动仍会按 manifest、不可变字节和宿主验证状态重新检查，不会把跨目标二进制当作宿主已验证。

manifest schema v2 的关键字段：

```json
{
  "schemaVersion": 2,
  "version": "0.1.0",
  "mode": "production",
  "node": "24.x",
  "inputsDigest": "sha256",
  "artifactDigest": "sha256",
  "buildId": "sha256",
  "entry": "builds/<buildId>/entrypoints/cli.js",
  "launcher": { "path": "dist/cli.js", "size": 51, "sha256": "..." },
  "packageMain": { "path": "packages/ts-shell/dist/index.js", "size": 100, "sha256": "..." },
  "executable": { "path": "dist/executables/<sha256>/cheers", "size": 102750336, "sha256": "...", "target": "linux-x64",
    "compiler": { "name": "bun", "version": "1.3.14", "sha256": "..." }, "builtAt": "..." },
  "artifacts": [{ "path": "builds/<buildId>/...", "size": 123, "sha256": "..." }]
}
```

`inputsDigest` 覆盖 `packages/ts-shell/src` 下的源文件、根与工作区 manifest、`package-lock.json`、两个 tsconfig、实际 TypeScript 编译器入口/实现、TypeScript 标准库 `.d.ts`、`@types` 以及构建/启动脚本。`artifactDigest` 覆盖全部 emit 文件；必需运行资产为 `presentation/themes/{dark,dark-contrast,light,light-contrast,schema}.json`。`buildId` 由 version、输入摘要、Node 版本与显式 build mode 决定。

`executable` 在尚未运行 `build:exe` 时可为空；一旦记录，普通构建校验也会核对二进制字节，manifest 格式校验同时要求 Bun 版本与编译器 SHA-256。编译器 provenance 是历史构建事实，启动时不需要重新找到 Bun。`qa:pty` 默认要求 Node 与单文件入口都存在，显式设置 `QA_PTY_TARGET=node` 时只校验 TypeScript 构建。

失败构建不替换 manifest，也不留下新的半套稳定镜像。package `main` 现在是一个单文件、原子更新的 re-export pointer；旧镜像文件在成功发布后清理，不再逐个覆盖 1700 多个文件。

构建锁只允许一个构建持有；若进程崩溃留下 `.build.lock`，后续构建仍会安全拒绝。`start` 在检查 manifest 前先原子取得同一把锁：任何现存 lock（包括 PID 已退出的 stale lock）或无法解析的 lock 都 fail-closed，不触碰 package-main pointer、journal 或 backup。只有确认没有 active builder 并人工清理 stale lock 后，下一次 `start` 才能恢复 publish journal。恢复与发布使用同一 journal/backup，发布器必须显式提供自己持有的 lock owner，不能借“active lock 放行”绕过所有权。

## 启动判定

`scripts/start.mjs` 和根目录 `dist/cli.js` 使用同一个 `checkBuild`。只有全部检查通过才启动 `packages/ts-shell/dist/build-manifest.json` 指向的不可变入口：

| 状态 | 条件 |
|---|---|
| `missing` | `packages/ts-shell/dist/build-manifest.json` 不存在 |
| `truncated` | JSON、字段、buildId、artifact 元数据或入口引用不自洽 |
| `version-mismatch` | manifest version 与工作区包版本不同 |
| `missing-artifact` | 不可变构建目录缺失、不是目录或为 symlink |
| `invalid-path` | 仓库、dist、build、launcher 或 package main 路径包含 symlink/越界 |
| `invalid-inputs` | 必需输入缺失、不可读或包含 symlink |
| `stale` | 当前输入摘要与构建时不同 |
| `artifact-mismatch` | emit 文件缺失、多余、被改写或包含 symlink |
| `launcher-mismatch` | `dist/cli.js` 字节与 manifest 不同 |
| `package-main-mismatch` | package 主入口 pointer 不是当前 buildId |
| `missing-executable` | 要求单文件入口，但 manifest 尚未绑定二进制 |
| `executable-mismatch` | 单文件入口缺失、被改写或包含 symlink |
| `fresh` | 以上全部通过；启动选中的同一 buildId 入口 |

启动校验不会在失败时构建、安装依赖或回退到 `tsx`。错误信息指向 `npm run build:ts`。跨目标编译只记录 `cross-target` 验证状态，普通可选校验可以读取其字节，但 `required` 策略会拒绝把它当作宿主可执行文件。

## 验证与边界

- `scripts/start.test.mjs` 覆盖完整构建、缺失/截断/版本不符、lockfile/编译器标准库变化、emit 改写/缺失/多余、launcher/package-main 改写、单文件入口绑定/缺失/改写及修复策略、空文件拒绝、Bun provenance 格式、输出路径限制、安装后校验失败时 manifest 回滚、symlink、祖先 symlink、越界或未登记入口、buildId 不自洽、不可变目录冲突、输入发布竞态、launcher/package-main 回滚、journal 恢复、活动与 stale build lock fail-closed、恢复期间竞争者拒绝、编译期间 lock 被替换时发布失败、tsc 退出码与锁所有权。宿主 `--version` 与稳定副本替换仍有独立的集成边界；当前测试没有把一次崩溃注入当作跨文件原子性证明。
- 本地反转：持有 `.build.lock` 时构建退出 1，原 lock 与 manifest 保留；临时 TypeScript 语法错误保留旧 launcher 并以 tsc 的退出码失败；编译期间新增源文件触发“inputs changed”，不替换 manifest；移除探针后 `npm start -- --version` 恢复 `0.1.0`。
- 本地 Node 24.15 上连续 7 次进程内 `checkBuild` 的 p50 约 168 ms、最大约 619 ms（首样本）；这是校验预算观测，不是 START-03 的冷/热启动或 ready 基准。
- `dist/cli.js` 与 `scripts/start.mjs` 都从 `packages/ts-shell/dist/build-manifest.json` 选择同一不可变入口；package `main` pointer 只 re-export 同一 buildId 的不可变 `index.js`。
