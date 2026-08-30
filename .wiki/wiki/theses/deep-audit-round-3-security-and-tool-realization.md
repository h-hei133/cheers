# 全仓第三轮深层渗透审计报告与 SOTA 标杆解决方案知识库

> **所属知识库**：`.wiki/wiki/theses/`  
> **借鉴标杆**：`OpenCode` (细粒度权限作用域与精确指令拦截), `pi` (真实终端交互式 Ask 机制与子代理隔离), `Claude Code` (精准白名单与命令权限模型)  
> **更新时间**：2026-08-30  
> **核心目标**：彻底消灭隐藏在工具、权限作用域、网络检索与提供商准备度中的全部“假数据返回、假自动批准与权限后门”。

---

## 目录
1. [第三轮渗透审计发现的 8 大深层隐藏缺陷](#一-第三轮渗透审计发现的-8-大深层隐藏缺陷)
2. [SOTA 标杆项目解决方案解构](#二-sota-标杆项目解决方案解构)
3. [系统性重构与修复蓝图](#三-系统性重构与修复蓝图)

---

## 一、 第三轮渗透审计发现的 8 大深层隐藏缺陷

```mermaid
graph TD
  subgraph "第三轮深层隐藏缺陷全景 (工具 / 权限 / 准备度)"
    H1["1. bash 审批权限后门 (approval/store.ts:51-64)<br/>以二进制名作为权限作用域，允许了 npm test 后将自动放行 npm publish 等破坏性命令"]
    H2["2. 危险工具被误划为 READONLY (evaluator.ts:18-22)<br/>browser 与 task 工具被错误列入只读白名单，在 plan 模式下绕过权限执行写操作"]
    H3["3. /ask 工具假确认假返回 (core/tools/ask.ts:68-80)<br/>不等待终端用户实际输入，直接返回 approvedResult 假装用户已默认确认"]
    H4["4. /task 工具伪造子代理输出 (core/tools/taskTool.ts:38-59)<br/>生成随机 ID 并直接拼接返回已完成文本，根本未派发真实子代理"]
    H5["5. LSP hover 静态假签名 (core/tools/lsp.ts:189-194)<br/>hover 操作直接返回静态硬编码字符串，未真实从 AST 提取类型定义"]
    H6["6. webSearch 无 Key 伪装成功 (core/tools/webSearch.ts:133-141)<br/>未配置 API Key 时返回 approved 成功字符串，误导大模型认为搜索完成且无结果"]
    H7["7. anchoredProposalStage 静态 fake 强切 (anchoredProposalStage.ts:40-55)<br/>提案阶段当 providerMode 为 synthetic 时强行 fallback 至 fake 桩，不执行真正 dry-run"]
    H8["8. 提供商准备度假就绪 (providerReadiness.ts:122-155)<br/>未检验网络连通性与 Token 有效性，仅凭非空字符串即返回 ready: true"]
  end
```

---

## 二、 SOTA 标杆项目解决方案解构

### 1. `OpenCode`：细粒度全命令作用域（Exact Command Scoping）
- **核心哲学**：**永远不要按进程二进制名粗粒度放行，权限必须精确到全命令（Full Command Match）或安全子命令白名单。**
- **方案落地**：
  - 在 `approval/store.ts` 中，`buildScope` 对 bash 命令不能只取 `args[0]`（如 `npm` 或 `git`），而必须提取完整的规范化指令签名（如 `npm:test`、`git:status`）；
  - 对带有破坏性写参数的指令（如 `npm publish`、`git push`、`rm -rf`）永远独立申请权限，杜绝越权后门。

### 2. `Pi Agent`：交互式终端停顿与用户输入直通（Interactive Ask Protocol）
- **核心哲学**：**`ask` 工具的语义是向人类请教，绝不能在后台自作主张。**
- **方案落地**：
  - 在非交互式脚本环境下，明确返回 `status: "unconfirmed" / "blocked"`，要求模型选择显式默认值；
  - 在交互式 CLI 终端下，暂停当前 Turn，将选项以单选/多选卡片形式呈现给开发者，等待按键确认后回传真实选择。

### 3. `Claude Code`：只读工具严格边界（Read-Only Tool Boundaries）
- **核心哲学**：**只有绝对没有网络出站、没有进程派生、没有文件写入的工具才能叫只读。**
- **方案落地**：
  - 严格将 `browser`（可发起外部网络写请求、表单提交）和 `task`（可派发子任务执行写操作）从 `READONLY_TOOLS` 白名单中移除；
  - 仅保留 `read`、`glob`、`grep`、`lsp` 等真正无副作用的纯只读工具。

---

## 三、 系统性重构与修复蓝图

我们将按照以下规范，对第三轮审计出的全部 8 项缺陷进行系统性修复：

```mermaid
timeline
  title 第三轮深层缺陷真实化与安全加固路线
  权限与安全加固 : 修复 bash 权限作用域为全命令签名 : 移除非只读工具 (browser/task) 出白名单
  工具真实化 : 改造 ask 工具接入交互式输入或显式未确认状态 : 改造 task 工具接入真正子代理派发
  LSP 与搜索真实化 : 改造 lsp.ts hover 接入 AST 符号签名解析 : 改造 webSearch 缺失 Key 时显式返回失败
  编排与准备度真实化 : 统一 providerReadiness 网络探测与鉴权校验 : 彻底剥离 proposal 阶段的假 dry-run
```
