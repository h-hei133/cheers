---
title: "Slash 命令入口与实现证据审计（102 个声明主入口）"
category: article
sources: [repo-audit-2026-10-17, packages/ts-shell/src/core/commands/registry.ts, packages/ts-shell/src/core/commands/types.ts, packages/ts-shell/src/entrypoints/slashCommandRegistry.ts, packages/ts-shell/src/cli/runtime/extensions.ts, packages/ts-shell/src/extensions/]
created: 2026-10-16
updated: 2026-10-17
tags: [features, slash-commands, audit, implementation-status, evidence]
summary: "71 个直接定义 + 30 个工厂定义 + 1 个 picker-only = 102 个声明主入口，逐名闭合。撤销不可追溯的69/25/4/0/4与92%完成率；23个Command回调接线只证明绑定。marketplace/plugin已有真实签名注册表、安装、授权与隔离执行链；非交互能力逐命令/动作判断，不再统称回退。没有新动态验收或全量功能完成结论。"
confidence: high
---

# Slash 命令入口与实现证据审计

2026-10-17 源码复核，产品基线 `0d30d589ec9023ed24e0794c1215f70398bc418d`。本轮只修研究文档，没有运行产品命令、TUI/PTY、网络、构建或测试，没有读取真实 provider 配置。本文确认可定位的声明/路由/实现链；生产质量、真实运行、跨平台与远端CI证据仍按各领域验收保留开放，不能由接线替代。

## 1. 旧结论撤销与证据分层

旧版 `REAL 69 / HOST-GATED 25 / PARTIAL 4 / STUB 0 / 无法确定 4` 不能复用：表中缺失2个PARTIAL名称、4个未知名称；正文同时声称3个未知已澄清但汇总仍保留4；HOST-GATED清单与追加项也未与25闭合。`local://cmd-audit-a.md` 等不是仓库内可审阅证据，不能据此说“没有空壳”或“92%已实现”。这些数字全部撤销，不通过移动几个桶伪造新完成率。

| 层 | 本文能证明什么 | 本文不能据此证明什么 |
|---|---|---|
| 声明 | 102个主入口已逐名定位，包括picker-only /back | 当前每个scope都显示102个、每条都能非交互运行 |
| 路由/绑定 | 101个dispatch定义有execute，23个*Command回调可追到CLI组合；/back由picker截获 | 必要runtime已安装、当前授权/资源可用、每个动作均完成 |
| 实现链 | 特定owner存在真实读写/执行路径；本轮详核extensions与host差异 | 实现满足全部契约、无缺陷、所有失败分支验证完毕 |
| 动态/交付 | 本轮没有新增运行证据 | 不能声称102条行为验收通过、Phase19关闭、跨平台/真实服务/精确commit CI通过 |

“找不到handler”的未知项现在为 **0 个可定位缺口**（见§2完整清单）；这不等于“0个未知行为”。行为覆盖未做本轮逐动作动态验证，必须在Phase20按风险补齐，而不是填入REAL桶。空输出也不自动等于stub：合法空集、用户取消、prompt转换、批准前预览各有不同语义。

## 2. 102 个声明主入口逐名闭合

统计使用源AST，只读取定义，不调用 `getRuntimeConfig` 或产品初始化。`registry.ts` 的commands数组有71个直接对象；独立registration与map工厂展开30个；`slashCommandRegistry.ts:72-84` 的PICKER_ONLY只有/back。总数 **71 + 30 + 1 = 102**，名字去重后仍102。alias与named invocation不计主入口；例如effort是thinking的alias，reload-plugins是plugin的named invocation，不是“Cheers不存在该拼写”。动态contribution、隐藏/disabled命令和作用域会改变实际可见集合；102是当前静态声明基线。

### 2.1 registry直接定义（71）

nonInteractive列只记录声明，不把true当运行成功。handler中context回调也可能按动作、身份、平台、授权返回不可用或拒绝。

| 主入口 | 声明位置 | execute目标/分支 | supportsNonInteractive |
|---|---|---|---|
| `/diagnose` | [registry:153](../../packages/ts-shell/src/core/commands/registry.ts#L153) | `runDiagnoseCommand(context, args)` | true |
| `/compact` | [registry:164](../../packages/ts-shell/src/core/commands/registry.ts#L164) | `runCompactLocalCommand(args, context)` | true |
| `/warmup` | [registry:177](../../packages/ts-shell/src/core/commands/registry.ts#L177) | `runWarmupLocalCommand(args, context)` | true |
| `/browser` | [registry:189](../../packages/ts-shell/src/core/commands/registry.ts#L189) | `runBrowserLocalCommand(args, context)` | true |
| `/sidebar` | [registry:201](../../packages/ts-shell/src/core/commands/registry.ts#L201) | `runSidebarLocalCommand(args, context)` | true |
| `/connect` | [registry:213](../../packages/ts-shell/src/core/commands/registry.ts#L213) | `runConnectCommand(args, context)` | true |
| `/login` | [registry:226](../../packages/ts-shell/src/core/commands/registry.ts#L226) | `runLoginShortcut(args, context)` | true |
| `/logout` | [registry:231](../../packages/ts-shell/src/core/commands/registry.ts#L231) | `runLogoutShortcut(args, context)` | true |
| `/model` | [registry:236](../../packages/ts-shell/src/core/commands/registry.ts#L236) | `runModelCommand(args, context)` | true |
| `/modelpreset` | [registry:249](../../packages/ts-shell/src/core/commands/registry.ts#L249) | `runModelPresetCommand(args, context)` | true |
| `/restore` | [registry:262](../../packages/ts-shell/src/core/commands/registry.ts#L262) | `runRestoreLocalCommand(args, context)` | true |
| `/tree` | [registry:274](../../packages/ts-shell/src/core/commands/registry.ts#L274) | `runTreeCommand(args)` | true |
| `/entries` | [registry:287](../../packages/ts-shell/src/core/commands/registry.ts#L287) | `runEntriesCommand(args, context)` | true |
| `/resume` | [registry:299](../../packages/ts-shell/src/core/commands/registry.ts#L299) | `runResumeCommand(args, context)` | true |
| `/fork` | [registry:319](../../packages/ts-shell/src/core/commands/registry.ts#L319) | `runResumeCommand(["fork", ...args], context)` | true |
| `/continue` | [registry:331](../../packages/ts-shell/src/core/commands/registry.ts#L331) | `runContinuePromptCommand(args, context)` | true |
| `/cancel` | [registry:344](../../packages/ts-shell/src/core/commands/registry.ts#L344) | `runCancelShellAction(args, context)` | false |
| `/workspace` | [registry:355](../../packages/ts-shell/src/core/commands/registry.ts#L355) | `runWorkspaceShellAction(args, context)` | true |
| `/cd` | [registry:368](../../packages/ts-shell/src/core/commands/registry.ts#L368) | `runCdShellAction(args, context)` | true |
| `/pwd` | [registry:380](../../packages/ts-shell/src/core/commands/registry.ts#L380) | `runPwdShellAction(args, context)` | true |
| `/mcp` | [registry:390](../../packages/ts-shell/src/core/commands/registry.ts#L390) | `runMcpShellAction(args, context)` | true |
| `/help` | [registry:402](../../packages/ts-shell/src/core/commands/registry.ts#L402) | `runHelpShellAction(args, context)` | true |
| `/exit` | [registry:413](../../packages/ts-shell/src/core/commands/registry.ts#L413) | `runExitCommand(context, args)` | true |
| `/permissions` | [registry:424](../../packages/ts-shell/src/core/commands/registry.ts#L424) | `runPermissionsShellAction(args, context)` | true |
| `/clear` | [registry:437](../../packages/ts-shell/src/core/commands/registry.ts#L437) | `runClearCommand(args, context)` | true |
| `/review` | [registry:448](../../packages/ts-shell/src/core/commands/registry.ts#L448) | `runReviewCommand(args, context)` | true |
| `/reload` | [registry:461](../../packages/ts-shell/src/core/commands/registry.ts#L461) | `runReloadCommand(args, context)` | true |
| `/statusline` | [registry:474](../../packages/ts-shell/src/core/commands/registry.ts#L474) | `runStatuslineCommand(args, context)` | true |
| `/settings` | [registry:489](../../packages/ts-shell/src/core/commands/registry.ts#L489) | `runSettingsCommand(args, context)` | true |
| `/view` | [registry:501](../../packages/ts-shell/src/core/commands/registry.ts#L501) | `runViewShellAction(args, context)` | true |
| `/theme` | [registry:513](../../packages/ts-shell/src/core/commands/registry.ts#L513) | `runThemeCommand(args, context)` | true |
| `/trust` | [registry:524](../../packages/ts-shell/src/core/commands/registry.ts#L524) | `runTrustCommand(args, context)` | true |
| `/init` | [registry:536](../../packages/ts-shell/src/core/commands/registry.ts#L536) | `runInitCommand(args, context)` | true |
| `/cost` | [registry:549](../../packages/ts-shell/src/core/commands/registry.ts#L549) | `runCostCommand(args, context)` | true |
| `/usage` | [registry:560](../../packages/ts-shell/src/core/commands/registry.ts#L560) | `runUsageCommand(args, context)` | true |
| `/undo` | [registry:565](../../packages/ts-shell/src/core/commands/registry.ts#L565) | `runUndoCommand(args, context)` | true |
| `/export` | [registry:580](../../packages/ts-shell/src/core/commands/registry.ts#L580) | `runExportCommand(args, context)` | true |
| `/skill` | [registry:593](../../packages/ts-shell/src/core/commands/registry.ts#L593) | `runSkillCommand(args, context)` | true |
| `/skillful` | [registry:605](../../packages/ts-shell/src/core/commands/registry.ts#L605) | `runSkillfulCommand(args, context)` | true |
| `/retry` | [registry:612](../../packages/ts-shell/src/core/commands/registry.ts#L612) | `runRetryCommand(args, context)` | false |
| `/hotkey` | [registry:623](../../packages/ts-shell/src/core/commands/registry.ts#L623) | `runHotkeyCommand(args, context)` | true |
| `/copy` | [registry:634](../../packages/ts-shell/src/core/commands/registry.ts#L634) | `runCopyCommand(args, context)` | true |
| `/goal` | [registry:647](../../packages/ts-shell/src/core/commands/registry.ts#L647) | `runGoalCommand(args, context)` | true |
| `/queue` | [registry:668](../../packages/ts-shell/src/core/commands/registry.ts#L668) | `context.queueCommand；未绑定返回 unavailable` | true |
| `/loop` | [registry:675](../../packages/ts-shell/src/core/commands/registry.ts#L675) | `runLoopCommand(args, context)` | true |
| `/todo` | [registry:690](../../packages/ts-shell/src/core/commands/registry.ts#L690) | `runTodoCommand(args, context, context.sessionId)` | true |
| `/fast` | [registry:707](../../packages/ts-shell/src/core/commands/registry.ts#L707) | `runFastCommand(args, context)` | true |
| `/slow` | [registry:720](../../packages/ts-shell/src/core/commands/registry.ts#L720) | `runSlowCommand(args, context)` | true |
| `/extended-context` | [registry:727](../../packages/ts-shell/src/core/commands/registry.ts#L727) | `runExtendedContextCommand(args, context)` | true |
| `/fresh` | [registry:734](../../packages/ts-shell/src/core/commands/registry.ts#L734) | `freshLocalState；缺少 freshState 返回 unavailable` | true |
| `/context` | [registry:745](../../packages/ts-shell/src/core/commands/registry.ts#L745) | `runContextCommand(args, context)` | true |
| `/btw` | [registry:758](../../packages/ts-shell/src/core/commands/registry.ts#L758) | `runBtwCommand(args, context)` | true |
| `/marketplace` | [registry:771](../../packages/ts-shell/src/core/commands/registry.ts#L771) | `extensionCommand 优先；未绑定才进入 legacy 回退` | true |
| `/plugin` | [registry:784](../../packages/ts-shell/src/core/commands/registry.ts#L784) | `runPluginCommand(context.rawCommandName === 'reload-plugins' ? ['reload', ...args] : args, context)` | true |
| `/memory` | [registry:798](../../packages/ts-shell/src/core/commands/registry.ts#L798) | `runMemoryCommand(args, context)` | true |
| `/workflow` | [registry:815](../../packages/ts-shell/src/core/commands/registry.ts#L815) | `runWorkflowCommand(args, context)` | true |
| `/web-research` | [registry:828](../../packages/ts-shell/src/core/commands/registry.ts#L828) | `runDeepResearchCommand(args, context)` | true |
| `/commit` | [registry:851](../../packages/ts-shell/src/core/commands/registry.ts#L851) | `runCommitCommand(args, context)` | true |
| `/tools` | [registry:864](../../packages/ts-shell/src/core/commands/registry.ts#L864) | `runToolsCommand(args, context)` | true |
| `/thinking` | [registry:875](../../packages/ts-shell/src/core/commands/registry.ts#L875) | `runThinkingCommand(args, context)` | true |
| `/brainstorm` | [registry:888](../../packages/ts-shell/src/core/commands/registry.ts#L888) | `runBrainstormCommand(args, context)` | true |
| `/shell` | [registry:903](../../packages/ts-shell/src/core/commands/registry.ts#L903) | `runShellCommand(args, context)` | true |
| `/log` | [registry:916](../../packages/ts-shell/src/core/commands/registry.ts#L916) | `runLogCommand(args, context)` | true |
| `/crash` | [registry:929](../../packages/ts-shell/src/core/commands/registry.ts#L929) | `runCrashCommand(args, context)` | true |
| `/timings` | [registry:942](../../packages/ts-shell/src/core/commands/registry.ts#L942) | `runTimingsCommand(args, context)` | true |
| `/metrics` | [registry:952](../../packages/ts-shell/src/core/commands/registry.ts#L952) | `runMetricsCommand(args, context)` | true |
| `/report` | [registry:964](../../packages/ts-shell/src/core/commands/registry.ts#L964) | `runReportCommand(args, context)` | true |
| `/debug` | [registry:976](../../packages/ts-shell/src/core/commands/registry.ts#L976) | `runDebugCommand(args, context)` | true |
| `/trace` | [registry:988](../../packages/ts-shell/src/core/commands/registry.ts#L988) | `runTraceCommand(args, context)` | true |
| `/changelog` | [registry:1000](../../packages/ts-shell/src/core/commands/registry.ts#L1000) | `runChangelogCommand(args, context)` | true |
| `/restart` | [registry:1012](../../packages/ts-shell/src/core/commands/registry.ts#L1012) | `runRestartCommand(args, context)` | true |

### 2.2 独立工厂与map定义（30）

下列路径均相对 `packages/ts-shell/src/core/commands/`。每个列出的名字是一个独立主入口，不能只搜registry字面name漏掉这些定义。

| 主入口 | 数量 | 声明owner | 路由目标 |
|---|---|---|---|
| `/pin` `/history` `/import` `/open` `/shake` | 5 | `navigation/operations.ts` | runSessionCommand → context.sessionCommand |
| `/force` | 1 | `force/registration.ts` | runForceCommand → context.forceTool |
| `/rules` | 1 | `rules/registration.ts` | runRulesCommand → context.ruleControlsCommand |
| `/cleanse` | 1 | `cleanse/registration.ts` | runCleanseCommand → repair/runtime owner |
| `/advisor` | 1 | `advisor/registration.ts` | context.advisorCommand |
| `/rename` `/delete` | 2 | `registry.ts / navigation/management.ts` | runSessionManagementCommand |
| `/plan` `/plan-review` `/guided-goal` | 3 | `registry.ts / planning/syntax.ts` | context.planningCommand |
| `/deep-research` | 1 | `research/registration.ts` | context.researchCommand |
| `/git` `/wt` | 2 | `git/registration.ts` | context.gitCommand / context.worktreeCommand |
| `/security` | 1 | `security/registration.ts` | context.securityCommand |
| `/agents` | 1 | `agents/registration.ts` | context.agentsCommand |
| `/collab` `/share` `/dump` | 3 | `collaboration/registration.ts` | context.collaborationCommand |
| `/ssh` | 1 | `ssh/registration.ts` | context.sshCommand |
| `/jobs` `/hub` | 2 | `jobs/registration.ts` | context.jobsCommand |
| `/handover` | 1 | `handoff/registration.ts` | context.handoffCommand |
| `/director` | 1 | `director/registration.ts` | context.directorCommand |
| `/improve` | 1 | `improve/registration.ts` | context.improveCommand |
| `/live` `/record` | 2 | `media/registration.ts` | context.mediaCommand |

### 2.3 picker-only（1）

| 主入口 | 路由与边界 |
|---|---|
| /back | `entrypoints/slashCommandRegistry.ts:72-84`声明，`cli/interactive/picker/registry.ts:98`映射rewindPicker；交互式支持选择器参数。它有意不在dispatch registry内，supportsNonInteractive=false，不能把“无dispatch handler”报成漏实现 |

## 3. 23/23 宿主回调意味着什么

`CommandContext`当前确有23个以Command结尾的可选回调（`core/commands/types.ts:41-69`）：

```text
sessionCommand ruleControlsCommand handoffCommand directorCommand mediaCommand
improveCommand jobsCommand workflowCommand collaborationCommand sshCommand
extensionCommand goalCommand planningCommand queueCommand advisorCommand
researchCommand gitCommand securityCommand agentsCommand mcpCommand usageCommand
worktreeCommand commitCommand
```

`interactiveCommandRouter.ts:147-176`、`cliRuntimeModule.ts:150-177`与`cliCommandExecutionBridge.ts:171-200`可追到这些能力的传递；usage/ssh在共享bridge也有字段，但**传递可选字段不是构造实际runtime的证明**。`ruleControlsCommand`还由传入值或runtimeContext值提供，不能仅凭同名字段就保证所有宿主都安装。

| 例子 | 实际代码约束 | 对审计结论的限制 |
|---|---|---|
| git/wt/commit | `cli/runtime/git.ts:48-55`读WeakMap；无workbench返回需要bound runtime。factory在`cliSessionRuntimeFactory.ts:496`安装native gate | 回调函数存在仍可无runtime，必须核安装与操作契约 |
| usage | `cli/runtime/usage.ts:33-35`要求gate、当前session/projectRoot及interactive===true；reset另需一次明确确认 | 该账户usage动作实际交互受限，不能从supportsNonInteractive=true推断可写 |
| ssh | `cli/runtime/ssh.ts:17-29`校验host/session/cwd与pending/closing；状态/取消与连接不同分支 | 有同一回调不代表所有动作同一可用性或权限 |
| marketplace/plugin | CLI与交互都传extensionCommand，factory在`cliSessionRuntimeFactory.ts:510`安装，运行时仍校验session/cwd、关闭与清理unknown | 不是只读旧注册记录；也不能从有安装链推断每个平台都可执行 |
| jobs/hub | `cli/jobs/command.ts:16-31`的hub投影真实账本，jobs继续进入parse/control；运行、取消、恢复另走审批 | /hub不是固定文本stub；其真实性不构成其他jobs动作验收 |

因此只写“23个回调可追到组合路径”，**撤销“25个HOST-GATED全部完成”与“底层能力都已实现只差UI”**。回调数、命令数、动作数不是同一分母。

## 4. marketplace/plugin 的真实扩展链（旧PARTIAL判定被推翻）

旧文引用`marketplaceCommandRuntime.ts:11`与`pluginCommandRuntime.ts:14-18`的legacy注释，漏掉优先委托分支：marketplace在registry execute与runtime第17行优先extensionCommand；plugin第86行同样优先委托。`core/commands/marketplace/store.ts:1-5`也已把源存储归属重导到extensions registry。

| 路径 | 当前源码事实 |
|---|---|
| 组合与身份 | `cli/runtime/extensions.ts:14-47`安装ExtensionService、绑定session/cwd、关闭/重入检查与源访问策略；旧清理unknown会阻止重入 |
| registry查询 | `extensions/command/marketplace.ts:14-16`有list/search/details；`registry/client.ts:12-59`有离线/目标边界/响应上限、签名验证、分页、精确版本解析 |
| 生命周期 | `extensions/command/plugin.ts:21-27`路由install/update/rollback/uninstall/enable/disable/grant/revoke/migrate；`lifecycle/install.ts:24-65`预览固定source:name@version与digest、审批后下载验证并发布，初始activation/grants为空 |
| 运行 | `extensions/service.ts:98-143`经prepare、身份/授权重验和普通审批；`runtime/execute.ts:26-71`通过唯一execution service发起OS沙箱执行，回传receipt、exit、cleanup与实际结果 |
| 撤销/关闭 | `service.ts:78-96`使registration失效、取消calls、关watchers；排空/进程清理unknown不可隐藏成成功 |

**正确结论**：已存在真实扩展运行时，不是“只记地址、无loader、不下载/执行”。同时当前脚本隔离执行明确要求Linux bubblewrap（execute.ts:29），网络grant不支持会拒绝（:43），文件deny策略不能被当前沙箱执行时拒绝（:32）。缺少真实公共registry/跨平台/运行质量证据仍保留，不能升级成生产全验收；UI规划必须显示这些能力与拒绝态。

当前pluginPicker已读真实extension state并委托enable/disable（`picker/plugins.ts:21-40`），sourcesPicker复用同一source store。**用户已定（2026-10-17）**：增强现有/plugin面板，/extensions作同一命令与面板别名，复用同一runtime和状态；不再规划第二个扩展系统。

## 5. 非交互、面板与生产完成度

旧文“25条非交互都只回退，交互都正常”不成立。`cliRuntimeModule.ts:150-177`本身也构造git、jobs、extension、planning等回调；部分动作在scripted bound session可用，部分显式interactive或terminal gate会拒绝。应按 **入口 × 动作 × 宿主 × 能力/授权 × 结果** 核验；supportsNonInteractive只是声明，需与实际路由和拒绝文案逐项对照。

面板映射19个也不等于19个实现或其余83个只输出文本。裸命令可能被opensPicker截获，带参数则进原handler；页面增强须保留这两条路径、非交互输出、领域审批和结果事实。企业级实施需要结构化快照/订阅/操作端口，不能把现有handler文本当API。完整约束见 [35面板契约](35-panel-inventory-full.md#生产面板的端口生命周期与副作用契约)。

## 6. Phase20审计任务与剩余证据

| 审计任务 | 完成标准 |
|---|---|
| 主入口/alias/named路由 | 保留本102项清单与scope语义；alias走同一owner；/back有意picker-only；新/extensions别名不重复状态 |
| 每动作能力矩阵 | 逐领域覆盖正常、unavailable、invalid、denied、cancelled、partial、unknown；核supportsNonInteractive与实际gate，不能只执行默认空参数 |
| 真实副作用链 | prepare/preview/approval/dispatch/effect/verification分开；只读不授权写入；写后未知保留receipt并防重放 |
| 新面板端口 | 查询/订阅返回领域事实和稳定身份，提交前重验；操作仍用原owner与执行服务；关闭页面不升级结果 |
| 产品质量与交付 | 依各域当前验收缺口保留真实provider、账户、registry、设备、远端结算、跨平台与精确SHA CI证据；文档读码不能代替 |

本次得到的是可审阅的声明全集、纠正后的实现链和实施风险边界。102个主入口的产品行为完成度仍须依据领域契约逐项验收，不再发布无法复现的单一“完成率”。
