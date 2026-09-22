# Composer Attachment Chips: 编排器附件条架构研究

> 对标对象:`oh-my-pi` 的 composer attachment 体系(attachment-chips band + editor atom table + 大粘贴菜单)。
> 对照本项目 `presentation/tui/pastes.ts`(PasteStore 占位文本)+ `chrome/composer.ts`(输入框)。
> 所有引用仅作语义对照,不引入任何外部名称到产品代码。

## 1. 现状差距(本项目 vs 参照)

| 维度 | 参照实现 | 本项目现状 | 差距等级 |
|------|---------|-----------|---------|
| 粘贴附件可见性 | 输入框上方独立 chip 条:圆角卡片、图标+编号、首行片段、`+N lines`/`N chars` 说明 | 仅编辑器内文本占位 `[#1 pasted 34 chars]` | 高 |
| 占位符原子性 | atom table:backspace 一次删除整个 token,且跨符号预设正则识别 | 占位符是普通文本,backspace 逐字符删除 | 高 |
| 身份色 | 每个 chip 有独立身份色(调色板轮转),token 与卡片同色 | 无颜色区分,纯文本 | 中 |
| 大粘贴菜单 | 行数超阈值弹三选菜单:wrapped block / local file / inline;Esc 回退 inline | 无菜单,固定占位符策略 | 中 |
| 第二次粘贴展开 | 无此手势;展开由菜单 explicit 选择 | 连续两次粘贴展开全文(本手势保留) | — |
| 删除即丢弃 | token 从 buffer 消失 ⇒ chip 从 band 消失 ⇒ 提交时不含该附件 | 删除占位符后 held text 残留,提交时 expand 静默还原 | 高 |
| 图片/视频附件 | Kitty unicode placeholder 缩略图 + 像素尺寸 caption | 无(问题 2 OSC 66 未实现,合理) | 低(依赖图像协议) |

## 2. 参照实现的关键机制(语义提炼)

1. **chip label = 紧凑原子 token**:`<icon> #N` 形式,N 来自 per-draft 单调计数器(删除的 chip 不复用编号,label 是 atom table 的 key)。
2. **atom table**(label → expansion):编辑器 buffer 只存 label;提交时按 label 从表取展开文本。`composerChips()` 以 "buffer 仍包含 label" 为存活判据——删除即丢弃,无需额外状态机。
3. **band 卡片几何**:12×4 内容区 + 1 格圆角边框,卡片间距 2 格;宽度放不下则整卡省略,绝不换行。
4. **identity color**:从调色板按 `n` 轮转取 RGB,`attachmentSgr(kind, n)` 生成前/背景 SGR;token 与卡片共用同一色,视觉上把"编辑器里的 token"与"上方的卡片"绑成一个对象。
5. **大粘贴门控**:`paste.largeMenuThreshold`(行数)超限 → 菜单;否则直接落 chip。提交键已 burst 的粘贴跳过菜单(没人来得及回答)。
6. **submitAfterPaste**:submit 键与粘贴同 burst 到达时,同步 stage 后立即提交,不弹菜单。

## 3. 本项目的转接方案(不缝合,借机制)

### 3.1 PasteStore 增强(保持现有类,不加新文件)
- `hold()` 返回值从 `[#N pasted X chars]` 改为 `⎘ #N`(紧凑 token),N 仍单调递增。
- 新增 `chipsIn(draft): readonly {id, label, preview, lines, chars}[]` —— 以 "draft 含 label" 为存活判据,天然实现"删除即丢弃"。
- `expand(draft)` 语义不变(label → held text),但 expand 后必须清掉该 id(现在 `expandOnRepeat` 已有此语义,扩展到 submit 路径:提交后 held map 对已消费 id 的清除由 `clear()` 覆盖,保持现状即可)。

### 3.2 编辑器原子删除
- `Editor` 增加 atomic token 概念:backspace/delete 在光标处命中完整 token 模式(`/⎘ #\d+/`)时整段删除。放置在 editor 内部一个谓词注入点,不让 editor 认识 PasteStore。

### 3.3 chip band 渲染(`chrome/`新文件,名字从简)
- 输入框上方一行卡片带;每卡:`⎘ #1 ─ snippet… ─ +12 lines`,用 theme 现有 `userMessageBg`/accent 色系;宽度不足整卡省略。
- 候选数据来自 3.1 的 `chipsIn(draft)`,渲染归 frameSurface 的 composer 区域(与 hints/band 同层)。

### 3.4 大粘贴菜单(延后)
- 三选项菜单依赖全屏 picker(已有 `overlay.ts`),但 wrapped-block/local-file 两条路径需要 provider 侧约定(local:// store),超出本轮范围。**本轮只做:chip 化 + 原子删除 + band 展示**。

## 4. 不做的事
- 不引入图像缩略图(依赖 Kitty 协议,问题 2 整体延后)。
- 不改双击粘贴展开手势(本项目特有,与 chip 化正交)。
- 不新增主题 token;复用现有 ThemeBgToken。

## 5. 验收
- 长粘贴(>320 chars 或 >6 行)后:编辑器出现 `⎘ #1` token,上方出现对应卡片,卡片 caption 正确。
- backspace 一次删除整个 token:卡片同步消失,提交时不再包含该段文本。
- 短粘贴行为不变(直接进 buffer)。
- 双击粘贴展开手势回归通过。
