# 启动产物与构建校验

`npm start` 不再直接运行源码，而是运行经过校验的构建产物；源码开发走 `npm run start:dev`（等价于工作区的 `tsx src/entrypoints/cli.tsx`）。

## 产物清单

`npm run build:ts` 在 tsc 成功、CLI bin 写入之后才写 `packages/ts-shell/dist/build-manifest.json`：

```json
{
  "schemaVersion": 1,
  "name": "@cheers/ts-shell",
  "version": "0.1.0",
  "builtAt": "...",
  "node": "20.x",
  "sourceDigest": "sha256 of sorted source files",
  "buildId": "sha256(version, digest, node)",
  "entry": ["entrypoints/cli.js"]
}
```

`sourceDigest` 覆盖 `packages/ts-shell/src` 下 `.ts/.tsx/.js/.mjs/.json`，按相对路径排序并写入路径与内容；不包含 mtime，因此同样的源码得到同样的 digest。`buildId` 由 version、digest 与 Node 版本决定，用于在日志与失败信息中指向同一次构建。

## 启动判定

`scripts/start.mjs` 调用 `scripts/start-lib.mjs` 的 `checkBuild`，五种结果互不混淆：

| 状态 | 条件 | 行为 |
|---|---|---|
| `missing` | 没有 manifest | 提示运行 `npm run build:ts`，退出 1 |
| `truncated` | JSON 不可读或字段缺失 | 提示重建，退出 1 |
| `version-mismatch` | manifest version 与包版本不同 | 提示重建，退出 1 |
| `missing-entry` | manifest 指向的入口不存在或不是文件 | 提示重建，退出 1 |
| `stale` | 当前 sourceDigest 与 manifest 不同 | 提示源码已变化并给出 buildId 前缀，退出 1 |
| `fresh` | 以上全部通过 | 用 manifest 的入口启动，转发信号与退出码 |

`--version`/`--help` 由启动脚本直接放行到 CLI 入口，不触发源码扫描之外的运行图；校验本身只读 manifest、入口 stat 与源码摘要。

## 验证

- `scripts/start.test.mjs` 覆盖 fresh、missing、truncated、version-mismatch、stale。
- 实机：`node scripts/start.mjs --version` 输出 `0.1.0`；向 `src/index.ts` 追加一行后同一命令输出 stale 并退出 1；恢复文件后再次通过。
- `npm run build:ts` 成功后 manifest 的 buildId 为 `b0fbac2d63c4`（本次构建）。
