# IDE Bridge — VS Code 插件

> 三 IDE 实时通信插件 — 协调者+监督者 / 研究员 / 开发者 三角色协作

让 Codex、OpenClaw、Cursor 三个 VS Code 系 IDE 之间实现**零命令全自动通信**。
插件安装后，配置好角色，自动连接 Bridge，自动收发消息，Agent 只需读写状态文件即可协作。

---

## 功能特性

- 🔌 **自动连接** — 启动 IDE 自动连接 Bridge，Bridge 不在线自动启动本地 Bridge 进程
- 👤 **角色配置** — 一键切换角色（协调者/研究员/开发者），插件自动适配功能
- 📊 **侧边栏面板** — 实时显示连接状态、在线角色、任务进度、消息日志
- 📨 **消息路由** — Bridge 消息自动写入工作区状态文件，Agent 可直接读取
- 🎯 **任务管理** — 分配任务、提交审核、审核通过/驳回，全流程可视化
- 🔔 **通知提醒** — 重要消息（任务分配、阻断、完成）自动弹通知
- 🔄 **自动重连** — 断线自动重连，最多 10 次指数退避

---

## 怎么装？（三种方式，从简单到复杂）

---

### 🥇 方式一：双击安装（最简单，推荐）

**就像安装游戏一样，双击文件就行。**

你已经有了 `ide-bridge-0.1.0.vsix` 这个文件。把它想象成一个"安装包"——就像 Windows 上的 `.exe` 安装器，或者手机上的 `.apk` 文件。

**操作步骤：**

1. 在文件管理器里找到 `ide-bridge-0.1.0.vsix`
2. **双击它**
3. VS Code 会自动弹出来说"要不要装这个插件？"→ 点"安装"
4. 装完重启 VS Code 就行了

> 如果双击没反应（某些系统关联不上），就用下面的方式二，也一样简单。

---

### 🥈 方式二：在 VS Code 里点三下鼠标

**不用命令行，全鼠标操作。**

1. 打开你的 VS Code
2. 按 `Ctrl+Shift+P`（Mac 按 `Cmd+Shift+P`），会弹出一个输入框
3. 输入 `vsix` 三个字母，会看到一个选项叫 **"Extensions: Install from VSIX..."**
4. 点它，然后在弹出的文件选择框里找到 `ide-bridge-0.1.0.vsix`，选中，点确定
5. 装完重启 VS Code

> 就这么简单。没有命令行，没有代码，纯鼠标点击。

---

### 🥉 方式三：一键脚本（适合三个 IDE 一起装）

**如果你想把插件同时装到 Codex、OpenClaw、Cursor 三个 IDE 里，用这个。**

我们提供了 `一键安装.bat` 脚本，原理是：把插件文件复制到 VS Code 的"插件仓库"文件夹里，这样所有 VS Code 系的 IDE 都能自动识别它。

**操作步骤：**

1. 找到 `一键安装.bat` 文件
2. **右键** → **以管理员身份运行**
3. 等待黑色窗口显示"安装完成"
4. 重启所有 IDE

> 这个脚本做了什么？其实就三件事：
> 1. 把插件文件复制到 `C:\Users\你的用户名\.vscode\extensions\` 里
> 2. 自动安装依赖包
> 3. 完成

---

### 🤔 为什么方式三能同时装到三个 IDE？

因为 Codex、OpenClaw、Cursor 都是 VS Code 的"亲戚"——它们共享同一个"插件仓库"文件夹（`%USERPROFILE%\.vscode\extensions\`）。你往这个文件夹里放一个插件，三个 IDE 都能用。

**打个比方：** 就像你家里有三个房间（三个 IDE），但共用一个储藏室（extensions 文件夹）。你往储藏室里放一个工具箱，三个房间的人都能拿去用。

---

## 装好后怎么用？

把插件装到三个 IDE 上之后，每个 IDE 需要**告诉插件"我是谁"**。

---

### 第 1 步：告诉插件你是谁（每个 IDE 做一次）

装好插件后，左下角状态栏会显示 **「Bridge 未配置」**：

1. **点击「Bridge 未配置」** 这几个字
2. 弹出一个选单，选你的角色：
   - 这是 **OpenClaw** → 选「OpenClaw — 协调者」
   - 这是 **Codex** → 选「Codex — 研究员」
   - 这是 **Cursor** → 选「Cursor — 开发者」
3. 选完后会提示重启，点「重启 IDE 生效」

**三个 IDE 都做完这一步，就完事了。** 后面全是自动的。

---

### 第 2 步：看灯（确认通车）

重启后，看左下角状态栏：

| 你看到的 | 意思 |
|----------|------|
| `✅ Bridge 协调者` | 已连接，一切正常 |
| `🔄 Bridge 连接中...` | 正在连，等一下 |
| `❌ Bridge 离线` | 没连上，检查 Bridge 是否在运行 |

三个 IDE 都显示 ✅ 就说明通车了。

---

### 第 3 步：看一眼面板（可选）

IDE 左侧活动栏多了一个桥形图标 🏗️，点开它，能看到：

| 面板 | 有什么用 |
|------|----------|
| **状态** | 看谁在线、谁离线 |
| **任务** | 看当前有没有任务在执行 |
| **消息日志** | 看最近谁给谁发了什么消息 |

---

### 三句话总结

> 1. 双击 vsix 安装
> 2. 点左下角选角色
> 3. 看到 ✅ 就通了

---

## 命令面板

按 `Ctrl+Shift+P`，输入 `IDE Bridge` 可看到所有命令：

| 命令 | 说明 | 权限 |
|------|------|------|
| `IDE Bridge: 启动任务` | 分配设计任务或下发实现任务 | 仅协调者 |
| `IDE Bridge: 查看连接状态` | 弹窗显示连接详情 | 所有角色 |
| `IDE Bridge: 发送测试消息` | 给指定角色发送测试消息 | 所有角色 |
| `IDE Bridge: 切换角色` | 切换当前 IDE 的角色 | 所有角色 |
| `IDE Bridge: 重启 Bridge 服务` | 断开并重连 Bridge | 所有角色 |
| `IDE Bridge: 查看消息日志` | 在编辑器中打开完整消息日志 | 所有角色 |

---

## 工作区状态文件

插件会在工作区根目录创建 `.bridge/` 文件夹，所有消息都会写入状态文件，Agent 可以直接读取：

```
.bridge/
├── current_task.json        # 当前任务（task.assign / task.delegate 写入）
├── pending_reviews.json     # 待审核列表（仅协调者，checkpoint.request 写入）
├── last_checkpoint_result.json  # 最近一次审核结果（checkpoint.result 写入）
├── task_complete.json       # 任务完成通知
├── blocked.json             # 阻断通知
├── user_escalation.json     # 需要人工介入的通知
└── message_log.json         # 完整消息日志（最近 100 条）
```

### Agent 如何使用

**Agent 收到任务：**
```
1. 读取 .bridge/current_task.json 获取任务详情
2. 执行任务
3. 完成后，通过 Bridge 发 task.complete 消息
```

**Agent 提交审核（Codex/Cursor）：**
```
1. 完成某个 Phase 后
2. 通过 Bridge 发 checkpoint.request 消息给 openclaw
3. 读取 .bridge/last_checkpoint_result.json 获取审核结果
4. pass 则继续下一 Phase，fail 则修改后重新提交
```

**Agent 审核（OpenClaw）：**
```
1. 读取 .bridge/pending_reviews.json 获取待审核列表
2. 逐项审核
3. 通过 Bridge 发 checkpoint.result 消息（pass/fail）
```

---

## 配置项

在 VS Code 设置中搜索 `ide-bridge` 可配置：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `ide-bridge.role` | `""` | 当前 IDE 的角色（openclaw / codex / cursor） |
| `ide-bridge.bridgeHost` | `"localhost"` | Bridge 服务器地址 |
| `ide-bridge.bridgePort` | `9527` | Bridge 服务器端口 |
| `ide-bridge.autoStartBridge` | `true` | Bridge 不在线时是否自动启动本地 Bridge |
| `ide-bridge.bridgeScriptPath` | `""` | ide-bridge.js 绝对路径（留空自动查找） |

---

## Bridge 自动查找顺序

当 `autoStartBridge` 为 `true` 且 Bridge 不在线时，插件会按以下顺序查找 `ide-bridge.js`：

1. 配置项 `ide-bridge.bridgeScriptPath` 指定的路径
2. 工作区根目录
3. 工作区 `00-governance/` 目录
4. 插件安装目录

---

## 三角色协作流程

```
用户发起需求
    ↓
OpenClaw（协调者）
    ├→ 分配设计任务给 Codex (task.assign)
    │
Codex（研究员）
    ├→ Phase 1 意图锚定
    ├→ 提交审核 (checkpoint.request)
    ├→ 收到 pass 继续
    ├→ Phase 2-5 ...
    └→ 设计完成，通知 OpenClaw
    │
OpenClaw（协调者）
    ├→ 审核最终设计
    ├→ 下发实现任务给 Cursor (task.delegate)
    │
Cursor（开发者）
    ├→ Phase 5 模块实现
    ├→ 提交审核 (checkpoint.request)
    ├→ 收到 pass 继续
    ├→ Phase 4-1 ...
    └→ 实现完成 (task.complete)
    │
OpenClaw（协调者）
    └→ 验收，通知用户
```

---

## 消息类型一览

| 消息类型 | 发送方 | 接收方 | 说明 |
|----------|--------|--------|------|
| `task.assign` | openclaw | codex | 分配设计任务 |
| `task.delegate` | openclaw | cursor | 下发实现任务 |
| `checkpoint.request` | codex/cursor | openclaw | 提交阶段审核 |
| `checkpoint.result` | openclaw | codex/cursor | 审核结果 |
| `task.complete` | codex/cursor | * (广播) | 任务完成 |
| `error.blocked` | codex/cursor | openclaw | 报告阻断 |
| `error.user_escalation` | codex/cursor | openclaw | 请求人工介入 |
| `presence.online` | bridge | * | 角色上线通知 |
| `presence.offline` | bridge | * | 角色离线通知 |
| `presence.list` | bridge | * | 在线角色列表 |

---

## 常见问题

### Q：插件显示「Bridge 未配置」怎么办？

点击状态栏的提示，选择角色后重启 IDE。

### Q：Bridge 连接不上怎么办？

1. 检查 `ide-bridge.bridgeHost` 和 `ide-bridge.bridgePort` 配置
2. 确认 Bridge 服务是否在运行
3. 尝试执行「IDE Bridge: 重启 Bridge 服务」命令
4. 查看 VS Code 控制台（帮助 → 切换开发人员工具）的错误信息

### Q：三个 IDE 必须在同一台机器上吗？

目前默认配置是 `localhost`，三台 IDE 在同一台机器上即可。
如果要跨机器，把 `ide-bridge.bridgeHost` 改成运行 Bridge 的机器 IP，
确保那台机器的防火墙开放了 9527 端口。

### Q：如何确认其他 IDE 已上线？

打开左侧「IDE Bridge」面板 → 状态 → 在线角色，能看到所有已连接的角色。

### Q：Agent 怎么发消息？

Agent 可以通过两种方式：
1. 直接调用 Node.js 的 WebSocket 连接 Bridge（推荐，实时）
2. 写入状态文件 + 插件轮询（待实现 Hooks 层）

当前版本推荐方式 1，可参考 `ide-bridge-client.js` 的用法。

---

## 开发

### 目录结构

```
ide-bridge-extension/
├── package.json              # 插件清单
├── extension.js              # 主入口
├── assets/
│   └── icon.svg              # 活动栏图标
└── src/
    ├── bridge-manager.js     # Bridge 连接管理
    ├── message-bus.js        # 消息路由（状态文件）
    ├── status-provider.js    # 侧边栏面板数据
    ├── task-controller.js    # 任务管理
    └── commands.js           # 命令实现
```

### 打包 VSIX

```bash
npm install -g @vscode/vsce
cd ide-bridge-extension
vsce package
# 生成 ide-bridge-0.1.0.vsix
```

---

## 更新日志

### v0.1.0

- 初始版本
- 三角色通信（WebSocket Bridge）
- 侧边栏状态/任务/消息日志面板
- 命令面板命令
- 自动连接 + 自动启动 Bridge
- 工作区状态文件消息路由
- 任务分配/审核/完成流程

---

## License

MIT
