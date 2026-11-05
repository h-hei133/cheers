# C0 合成探针记录

实际执行时间：2026-11-05T08:16:00.145Z，宿主 0057eb604ecc8d154ce691794b494c354e89755b，v24.15.0 / linux-x64。

执行命令（退出码 0）：

```bash
rtk proxy node .tmp/c0-hooks/run.mjs > .tmp/c0-hooks/probes.log 2> .tmp/c0-hooks/probes.stderr.log
```

以下输出是 results.json 的字段投影，未把观察结果替换为期望值。完整输入、实际 stdin、dispatch 返回、消费者输出及错误日志见 [results.json](results.json)。主探针顺序执行，真实 shell 子进程返回合成内容；没有调用真实模型。`<runtime>` 仅归一化本次随机临时目录，原目录由 launcher 清理。

## 1. pretooluse-nested-deny

输入：

```json
{
  "args": {
    "path": "fixture.txt",
    "content": "synthetic only\n"
  },
  "response": {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "synthetic nested refusal"
    }
  }
}
```

观察点：Real shell JSON stdin/stdout -> HookDispatcher -> runPreparedTool/createToolHooks -> synthetic prepared target effect counter。

实际结果（status=observed）：

```json
{
  "dispatch": {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "synthetic nested refusal"
    }
  },
  "received": [
    {
      "eventName": "PreToolUse",
      "sessionId": "c0",
      "workspaceRoot": "<runtime>/project",
      "timestamp": "2026-11-05T08:15:53.625Z",
      "toolName": "write",
      "toolCallId": "c0-call",
      "args": {
        "path": "fixture.txt",
        "content": "synthetic only\n"
      }
    }
  ],
  "targetEffects": 1,
  "toolResult": {
    "output": "synthetic effect",
    "isError": false
  }
}
```

证据来源：`packages/ts-shell/src/core/hooks/hookDispatcher.ts:313-331`；`packages/ts-shell/src/turn/tools.ts:311-350`；`packages/ts-shell/src/turn/invoke.ts:15-28`。

## 2. pretooluse-flat-block

输入：

```json
{
  "modes": [
    "block",
    "retry",
    "allow",
    "empty",
    "unknown",
    "invalid",
    "exit-2",
    "exit-1",
    "timeout"
  ],
  "timeoutMs": 300,
  "unmatchedMatcher": "Write|Edit|MultiEdit",
  "tool": "write"
}
```

观察点：Real command completion/failure plus actual pre-use consumer; empty/unknown host continuation is not proof of a clean verdict。

实际结果（status=observed）：

```json
{
  "cases": [
    {
      "mode": "block",
      "dispatcherDecision": "block",
      "targetEffects": 0,
      "toolIsError": true
    },
    {
      "mode": "retry",
      "dispatcherDecision": "retry",
      "targetEffects": 0,
      "toolIsError": true
    },
    {
      "mode": "allow",
      "dispatcherDecision": "allow",
      "targetEffects": 1,
      "toolIsError": false
    },
    {
      "mode": "empty",
      "dispatcherDecision": "allow",
      "targetEffects": 1,
      "toolIsError": false
    },
    {
      "mode": "unknown",
      "dispatcherDecision": "allow",
      "feedback": "could-not-decide (synthetic)",
      "targetEffects": 1,
      "toolIsError": false
    },
    {
      "mode": "invalid",
      "dispatcherDecision": "block",
      "targetEffects": 0,
      "toolIsError": true
    },
    {
      "mode": "exit-2",
      "dispatcherDecision": "block",
      "targetEffects": 0,
      "toolIsError": true
    },
    {
      "mode": "exit-1",
      "dispatcherDecision": "block",
      "targetEffects": 0,
      "toolIsError": true
    },
    {
      "mode": "timeout",
      "dispatcherDecision": "block",
      "targetEffects": 0,
      "toolIsError": true,
      "timeoutMs": 300,
      "elapsedMs": 309,
      "timedOut": true
    }
  ],
  "matcher": {
    "pattern": "Write|Edit|MultiEdit",
    "tool": "write",
    "commandExecutions": 0,
    "dispatcherDecision": "allow",
    "targetEffects": 1
  }
}
```

证据来源：`packages/ts-shell/src/core/hooks/hookDispatcher.ts:174-193`；`packages/ts-shell/src/core/hooks/hookDispatcher.ts:250-371`；`packages/ts-shell/src/turn/tools.ts:325-338`。

## 3. stop-dispatch-result-discard

输入：

```json
{
  "modes": [
    "block",
    "retry",
    "exit-2",
    "invalid",
    "timeout"
  ],
  "timeout": "default, no override",
  "syntheticSteps": 1
}
```

观察点：Actual runTurn event stream after real Stop command; block/retry/exit-2 results discarded; timeout and no re-entry observed separately。

实际结果（status=observed）：

```json
[
  {
    "mode": "block",
    "elapsedMs": 39,
    "dispatcherDecision": "block",
    "queryCompleted": 1,
    "terminalStatus": "completed",
    "steps": 1
  },
  {
    "mode": "retry",
    "elapsedMs": 32,
    "dispatcherDecision": "retry",
    "queryCompleted": 1,
    "terminalStatus": "completed",
    "steps": 1
  },
  {
    "mode": "exit-2",
    "elapsedMs": 34,
    "dispatcherDecision": "block",
    "queryCompleted": 1,
    "terminalStatus": "completed",
    "steps": 1
  },
  {
    "mode": "invalid",
    "elapsedMs": 33,
    "dispatcherDecision": "allow",
    "queryCompleted": 1,
    "terminalStatus": "completed",
    "steps": 1
  },
  {
    "mode": "timeout",
    "elapsedMs": 3008,
    "dispatcherDecision": "allow",
    "timeoutMs": 3000,
    "timedOut": true,
    "queryCompleted": 1,
    "terminalStatus": "completed",
    "steps": 1
  }
]
```

证据来源：`packages/ts-shell/src/core/hooks/hookDispatcher.ts:64-68`；`packages/ts-shell/src/core/hooks/hookDispatcher.ts:355-371`；`packages/ts-shell/src/turn/session.ts:363-390`。

## 4. unknown-event-registration

输入：

```json
{
  "TaskCompleted": [
    {
      "hooks": [
        {
          "command": "exec '/home/wang/.nvm/versions/node/v24.15.0/bin/node' '/home/wang/projects/cheers/.tmp/c0-hooks/reply.mjs' 'block' '<runtime>/unknown/unknown.jsonl'"
        }
      ]
    }
  ]
}
```

观察点：loadHookDeclarations and real registration boundary; unknown event was never dispatched。

实际结果（status=observed）：

```json
{
  "loaded": {
    "hooks": [],
    "problems": [
      "<runtime>/unknown/.agents/hooks.json declares unknown hook event 'TaskCompleted'"
    ]
  },
  "registration": {
    "registered": 0,
    "problems": [
      "<runtime>/unknown/.agents/hooks.json declares unknown hook event 'TaskCompleted'"
    ]
  },
  "installedCommandHooks": 0,
  "dispatchCalls": 0,
  "commandExecuted": false,
  "conclusion": "从未被 dispatch"
}
```

证据来源：`packages/ts-shell/src/core/hooks/config.ts:29-48`；`packages/ts-shell/src/core/hooks/config.ts:134-157`；`packages/ts-shell/src/core/hooks/registration.ts:81-110`。

## 5. config-timeout-retention

输入：

```json
{
  "Stop": [
    {
      "matcher": "*",
      "timeout": 91,
      "hooks": [
        {
          "type": "command",
          "command": "synthetic-command",
          "timeout": 92,
          "timeoutMs": 93,
          "name": "lost-name",
          "description": "lost-description",
          "extra": "lost"
        },
        {
          "type": "prompt",
          "command": "also-retained",
          "timeout": 94
        },
        {
          "type": "command",
          "timeout": 95
        }
      ]
    }
  ]
}
```

观察点：Actual JSON loader projection and installed command configs; no fixture command executed。

实际结果（status=observed）：

```json
{
  "loaded": {
    "hooks": [
      {
        "event": "Stop",
        "matcher": "*",
        "command": "synthetic-command",
        "sourcePath": "<runtime>/config/.agents/hooks.json"
      },
      {
        "event": "Stop",
        "matcher": "*",
        "command": "also-retained",
        "sourcePath": "<runtime>/config/.agents/hooks.json"
      }
    ],
    "problems": []
  },
  "installed": [
    {
      "name": "hooks.json:Stop",
      "event": "Stop",
      "matcher": "*",
      "command": "synthetic-command",
      "fingerprint": "b0607e90dae94a84d2c8212acb5ed92ddb001235590941f5dff04375fadbc132",
      "sourcePath": "<runtime>/config/.agents/hooks.json"
    },
    {
      "name": "hooks.json:Stop",
      "event": "Stop",
      "matcher": "*",
      "command": "also-retained",
      "fingerprint": "58b100006233c031266421a0c36be6b4a1c27d17e6037cbca91d5c1d559f893b",
      "sourcePath": "<runtime>/config/.agents/hooks.json"
    }
  ],
  "retainedHandlerKeys": [
    "command"
  ],
  "retainedGroupKeys": [
    "matcher"
  ],
  "eventFromMapKey": true,
  "discardedHandlerKeys": [
    "type",
    "timeout",
    "timeoutMs",
    "name",
    "description",
    "extra"
  ],
  "groupTimeoutDiscarded": true
}
```

证据来源：`packages/ts-shell/src/core/hooks/config.ts:134-184`；`packages/ts-shell/src/core/hooks/registration.ts:91-101`；`packages/ts-shell/src/core/hooks/types.ts:187-199`。

## 6. registration-path-isolation

输入：

```json
{
  "projectSource": "<runtime>/registration/.agents/hooks.json",
  "command": "exec '/home/wang/.nvm/versions/node/v24.15.0/bin/node' '/home/wang/projects/cheers/.tmp/c0-hooks/reply.mjs' 'block' '<runtime>/registration/registered.jsonl'",
  "approvalSequence": [
    [
      "normal",
      "allow-once"
    ],
    [
      "git",
      "allow-once"
    ],
    [
      "prepared",
      "allow-once"
    ],
    [
      "security",
      "allow-once"
    ],
    [
      "normal",
      "allow-always"
    ],
    [
      "git",
      "deny"
    ],
    [
      "prepared",
      "deny"
    ],
    [
      "security",
      "deny"
    ],
    [
      "prepared",
      "deny"
    ]
  ],
  "ordinaryPermissionScope": "allow-all for synthetic targets",
  "providerMode": "real branch with injected readiness and deterministic StepFunction; no provider transport"
}
```

观察点：Actual normal registration and gitGateFor; runNativeGit/runPreparedTool/runSecurityTool consumers; temporary default trust store vs explicit separate file。

实际结果（status=observed）：

```json
{
  "cases": [
    {
      "route": "normal",
      "configuredAnswer": "allow-once",
      "approvalRequests": 1,
      "hookCommands": 1,
      "targetEffects": 0
    },
    {
      "route": "git",
      "configuredAnswer": "allow-once",
      "approvalRequests": 1,
      "hookCommands": 1,
      "targetEffects": 0
    },
    {
      "route": "prepared",
      "configuredAnswer": "allow-once",
      "approvalRequests": 1,
      "hookCommands": 1,
      "targetEffects": 0
    },
    {
      "route": "security",
      "configuredAnswer": "allow-once",
      "approvalRequests": 1,
      "hookCommands": 1,
      "targetEffects": 0
    },
    {
      "route": "normal",
      "configuredAnswer": "allow-always",
      "approvalRequests": 1,
      "hookCommands": 1,
      "targetEffects": 0
    },
    {
      "route": "git",
      "configuredAnswer": "deny",
      "approvalRequests": 0,
      "hookCommands": 1,
      "targetEffects": 0
    },
    {
      "route": "prepared",
      "configuredAnswer": "deny",
      "approvalRequests": 0,
      "hookCommands": 1,
      "targetEffects": 0
    },
    {
      "route": "security",
      "configuredAnswer": "deny",
      "approvalRequests": 0,
      "hookCommands": 1,
      "targetEffects": 0
    },
    {
      "route": "prepared",
      "configuredAnswer": "deny",
      "approvalRequests": 1,
      "hookCommands": 0,
      "targetEffects": 1
    }
  ],
  "sameDispatcherNormalVsGit": false,
  "freshNativeDispatcherPerOperation": true,
  "actualWorkspaceMatchesFixture": true,
  "oneShotPersisted": 0,
  "persistedAfterAlways": 1,
  "persistedTrustSharedAcrossRoutes": true,
  "trustPath": "<runtime>/home/.cheers/hook-trust.json",
  "separateStoreTrusted": false,
  "wrongWorkspace": {
    "commandExecutions": 0,
    "hostReturn": {
      "decision": "allow"
    },
    "verdict": "unknown; hook skipped, not an adapter allow"
  }
}
```

证据来源：`packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts:331-341`；`packages/ts-shell/src/cli/runtime/gitGate.ts:41-53`；`packages/ts-shell/src/core/hooks/registration.ts:88-110`；`packages/ts-shell/src/core/hooks/trust.ts:78-131`；`packages/ts-shell/src/core/hooks/hookDispatcher.ts:98-140`；`packages/ts-shell/src/workflow/git/operation/gate.ts:10-34`；`packages/ts-shell/src/turn/invoke.ts:14-30`；`packages/ts-shell/src/security/analysis/gate.ts:7-24`。

## 解读边界

- nested deny 的 targetEffects=1 来自合成 prepared 目标计数，不是产品文件写入；真实 createToolHooks 消费者确实没有阻断它。普通权限显式设为 allow-all，只用于合成目标，不代表 hook 授予了用户权限。
- flat block/retry、无效 JSON、exit 1/2 和超时均阻断 PreToolUse；空 stdout 与 allow/could-not-decide 的实际 continuation 不能解释为 clean/proven。matcher 使用 JS 正则，合法的大写模式不会匹配 lowercase write。
- Stop 超时是默认 3,000 ms 的真实 subprocess 超时；总耗时包含周边开销。另四个响应也都发 completed，且均无重入。延迟预算和完成阻断分别记录。
- 未知事件在配置读取时被丢弃，installedCommandHooks=0；没有对未知事件调用 dispatch。
- 配置 command 被保留（包括 type:prompt 但带 command 的 handler），timeout/timeoutMs 被丢弃。sourcePath/event 是加载器附加的，name/fingerprint 是注册器生成的。
- registration 中 configuredAnswer=deny、approvalRequests=0 表示回调根本没有被调用：相同 fingerprint 的持久批准已经满足信任门。最后一条 prepared 的 deny 是撤销后真实询问所得，hookCommands=0 而 targetEffects=1。
- normal 使用实际 runCliRuntimeInvocation 的注册路径，依赖注入提供 readiness/StepFunction；原 providerModeEnv=real 只是选择此注入分支。global fetch 被设置成计数后抛错，fetchCalls=0；新子进程环境不继承认证变量。native Git 在 hook 阻断前使用最小 git/plan fixture，prepared/security 使用合成 ToolDefinition，不代表真实 Git mutation/security scan 验证。
- 首轮撤销后的 Git 对照触及缺失 git.identity 的夹具方法；[初始结果](evidence/initial-results.json) 保留该事实。最终改用实际 runPreparedTool 验证跳过 hook 后的方向，并增加 workspace 精确断言、独立 matcher capture 和 timeout diagnostics；没有修改产品。

标准输出末行：

```json
{"summary":"6/6 named probes observed","names":["pretooluse-nested-deny","pretooluse-flat-block","stop-dispatch-result-discard","unknown-event-registration","config-timeout-retention","registration-path-isolation"],"fetchCalls":0,"host":{"commit":"0057eb604ecc8d154ce691794b494c354e89755b","node":"v24.15.0","platform":"linux","arch":"x64","measuredAt":"2026-11-05T08:16:00.145Z"}}
```
