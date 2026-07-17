# IDE Bridge 插件 — 设计方案 V1.0

> 同一个 VS Code 插件，装在三个 IDE 里，配置不同角色 = 全自动通信通车

---

## 一、核心理念

### 问题：现在不够"全自动"

当前 V3.7 的通车流程需要：
1. 手动启动 Bridge（`node ide-bridge.js`）
2. 手动告诉 Agent "你是什么角色"
3. 手动让 Agent 调用 Bridge Client 发消息
4. 手动看终端日志了解状态

→ 这需要人操作，不算全自动。

### 目标：插件化 = 零命令全自动

装完插件之后：

```
打开 IDE
  → 插件自动激活
  → 自动检查 Bridge 是否在运行
  → 没人起？自动起一个
  → 自动连接 Bridge
  → 自动注册角色（配置里已经设好了）
  → 侧边栏自动显示状态面板
  → 收到消息自动通知 Agent
  → Agent 发消息通过插件命令一键搞定
```

用户只需要做一件事：**在设置里选自己是什么角色。**

---

## 二、插件架构

### 2.1 一个插件，三个角色

同一个 VS Code 插件（`.vsix`），装在三个 IDE 里，通过配置区分角色：

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  IDE #1     │  │  IDE #2     │  │  IDE #3     │
│  插件配置:  │  │  插件配置:  │  │  插件配置:  │
│  role=openclaw│ │  role=codex │  │  role=cursor│
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                IDE Bridge (:9527)
                 （其中一个插件自动启动）
```

### 2.2 插件内部结构

```
ide-bridge-extension/
├── package.json                  ← 插件清单（命令、配置、视图容器）
├── extension.js                  ← 主入口（activate/deactivate）
├── README.md                     ← 使用说明
├── src/
│   ├── bridge-manager.js         ← Bridge 启动/连接/停止管理
│   ├── role-config.js            ← 角色配置读写
│   ├── message-bus.js            ← 消息路由：Bridge ↔ Agent
│   ├── status-provider.js        ← 侧边栏状态面板（TreeView）
│   ├── task-controller.js        ← 任务生命周期控制
│   └── commands.js               ← 命令面板命令注册
└── assets/
    └── icon.png                  ← 插件图标
```

### 2.3 激活流程

```
IDE 打开工作区
  │
  ├─ 1. 读取配置：ide-bridge.role = ?
  │     （openclaw / codex / cursor）
  │
  ├─ 2. bridge-manager 检查 Bridge 是否在线
  │     ├─ 在线 → 直接连接
  │     └─ 不在线 → 启动一个本地 Bridge 进程
  │
  ├─ 3. 自动注册角色到 Bridge
  │     （发送 register 消息）
  │
  ├─ 4. 注册侧边栏面板
  │     （状态面板 + 任务面板 + 消息日志）
  │
  ├─ 5. 注册命令面板命令
  │     （启动任务 / 发送消息 / 查看状态...）
  │
  └─ 6. 监听 Bridge 消息
        收到消息 → 通知 Agent + 更新面板
```

---

## 三、核心模块详解

### 3.1 Bridge Manager（桥接管理器）

**职责**：管理 Bridge 进程的生命周期和 WebSocket 连接。

| 功能 | 说明 |
|------|------|
| 自动检测 Bridge | 连接 `ws://localhost:9527`，判断是否已有 Bridge 在跑 |
| 自动启动 Bridge | 没人起？`child_process.spawn` 起一个 `node ide-bridge.js` |
| 连接管理 | WebSocket 连接、重连、心跳 |
| 消息收发 | `sendMessage()` / `onMessage()` 封装 |
| 状态回调 | 连接成功/断开/错误时通知其他模块 |

**关键设计**：
- 三个 IDE 中只有第一个会启动 Bridge，后两个直接连上去
- Bridge 进程挂了自动重启
- IDE 关闭时，如果是自己启动的 Bridge，自动关掉

### 3.2 Role Config（角色配置）

**职责**：管理当前 IDE 的角色身份。

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `ide-bridge.role` | string | `""` | 当前 IDE 的角色：openclaw / codex / cursor |
| `ide-bridge.bridgeHost` | string | `"localhost"` | Bridge 地址 |
| `ide-bridge.bridgePort` | number | `9527` | Bridge 端口 |
| `ide-bridge.autoStartBridge` | boolean | `true` | 是否自动启动 Bridge |

用户只需要设一个：`ide-bridge.role`。

### 3.3 Message Bus（消息总线）

**职责**：Bridge 消息 ↔ VS Code 环境的双向路由。

```
Bridge 消息 → Message Bus → 分发到：
                       ├─ 状态栏（更新在线角色/状态）
                       ├─ 侧边栏面板（更新任务进度）
                       ├─ 通知（弹出消息提示）
                       └─ Agent 上下文（注入到 Agent 能读到的地方）

Agent 操作 → Message Bus → Bridge 消息
```

**Agent 怎么收到消息？** 两种方式：

1. **状态文件**：插件把最新消息写入工作区的 `.bridge/messages.json`，Agent 读文件
2. **命令触发**：Agent 可以调用 `ide-bridge.waitForMessage` 命令等待消息

**Agent 怎么发消息？**

调用 VS Code 命令：`ide-bridge.sendMessage`，参数是目标角色和消息内容。

### 3.4 Status Provider（状态面板）

**职责**：侧边栏的可视化状态面板。

```
╔══════════════════╗
║  IDE Bridge      ║  ← 侧边栏视图容器
╠══════════════════╣
║  🟢 连接中       ║  ← 连接状态
║  角色: OpenClaw  ║  ← 当前角色
╠══════════════════╣
║  ▼ 在线角色      ║
║    🟢 OpenClaw   ║
║    🟢 Codex      ║
║    🟡 Cursor     ║  ← 🟡=在线但忙碌
╠══════════════════╣
║  ▼ 当前任务      ║
║    悬疑小说前十章  ║
║    Phase: 3/8    ║
║    ████░░░░ 50%  ║
╠══════════════════╣
║  ▼ 最近消息      ║
║    [10:23] Codex ║
║    checkpoint.req│
║    [10:22] 系统   ║
║    task.assign   ║
╚══════════════════╝
```

用 VS Code 的 `TreeView` 实现，轻量原生。

### 3.5 Task Controller（任务控制器）

**职责**：管理任务的创建、推进、完成。

**OpenClaw 角色的插件会有这个功能**（其他角色没有）：

| 功能 | 说明 |
|------|------|
| 新建任务 | 输入一句话 → 创建任务目录 → 分配给 Codex |
| 任务列表 | 显示所有进行中和已完成的任务 |
| 任务详情 | 点击任务查看当前 Phase、检查点状态 |
| 一键重试 | 某个 Phase 失败了，一键让执行者重做 |
| 任务归档 | 完成的任务自动归档 |

---

## 四、命令面板（Command Palette）

装了插件后，按 `Ctrl+Shift+P` 可以用这些命令：

| 命令 | 角色 | 说明 |
|------|------|------|
| `IDE Bridge: 启动任务` | OpenClaw | 输入一句话，创建新任务 |
| `IDE Bridge: 查看状态` | 所有 | 显示当前 Bridge 连接状态 |
| `IDE Bridge: 发送消息` | 所有 | 手动发一条测试消息 |
| `IDE Bridge: 切换角色` | 所有 | 快速切换当前 IDE 的角色 |
| `IDE Bridge: 重启 Bridge` | 所有 | 重启 Bridge 服务 |
| `IDE Bridge: 查看消息日志` | 所有 | 打开消息日志面板 |

---

## 五、全自动时序（端到端）

### 场景：用户说一句话，三 IDE 全自动跑起来

```
用户在 OpenClaw IDE 里：
  Ctrl+Shift+P → IDE Bridge: 启动任务
  输入: "写一本悬疑小说前十章"
    │
    ▼
┌─────────────────────────────────────────┐
│ OpenClaw 插件                           │
│  1. 创建任务目录                         │
│  2. 写 spec.json（或者等 Codex 写）      │
│  3. 发 task.assign → Bridge → Codex     │
│  4. 更新侧边栏：任务开始，Phase 1/8      │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ Codex 插件                              │
│  1. 收到 task.assign 消息               │
│  2. 弹出通知："收到新任务：悬疑小说"     │
│  3. 写入 .bridge/current_task.json      │
│  4. 更新侧边栏：新任务分配               │
│  5. Agent 读文件 → 开始 Phase 1          │
└─────────────────────────────────────────┘
    │
    ▼
  Codex 完成 Phase 1
    │
    ▼
┌─────────────────────────────────────────┐
│ Codex 插件                              │
│  Agent 调用命令: ide-bridge.requestCheckpoint
│  → 发 checkpoint.request → Bridge       │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ OpenClaw 插件                           │
│  收到 checkpoint.request                │
│  → 弹出通知："Codex 请求审核 Phase 1"   │
│  → 写入 .bridge/pending_reviews.json    │
│  → 更新侧边栏：待审核 +1                 │
│  → Agent 读文件 → 开始审核               │
└─────────────────────────────────────────┘
    │
    ▼
  ... 以此类推，直到 Phase 8 完成 ...
    │
    ▼
┌─────────────────────────────────────────┐
│ OpenClaw 插件                           │
│  收到 task.complete 确认                │
│  → 弹出通知："任务完成！10章 23,168字"  │
│  → 更新侧边栏：任务完成 ✓                │
│  → （可选）通过系统通知提醒用户           │
└─────────────────────────────────────────┘
```

---

## 六、MVP 范围（第一版先做什么）

不追求一步到位，MVP 先做核心的：

### MVP 必做

- [ ] 插件骨架 + package.json
- [ ] Bridge Manager：自动检测/启动/连接 Bridge
- [ ] 角色配置：settings.json 里设角色
- [ ] 自动注册：激活时自动连 Bridge + 注册角色
- [ ] 状态栏项：显示连接状态 + 当前角色
- [ ] 基础侧边栏：在线角色列表
- [ ] 消息收发：sendMessage / onMessage
- [ ] 命令面板：发送测试消息、切换角色、重启 Bridge
- [ ] 消息日志面板

### MVP 暂不做（后续版本）

- [ ] 任务控制器（新建任务/任务列表）
- [ ] 深度 Agent 集成（需要 IDE 支持 Hooks）
- [ ] IM 机器人桥接
- [ ] 进度条可视化
- [ ] 多任务支持

---

## 七、技术选型

| 技术 | 选型 | 原因 |
|------|------|------|
| 语言 | JavaScript | 简单直接，VS Code 插件原生支持，不需要编译 |
| UI 框架 | VS Code TreeView API | 原生、轻量、零依赖 |
| WebSocket | `ws` 包 | 和 Bridge 服务端同一个库，一致 |
| 进程管理 | `child_process.spawn` | Node.js 原生，启动 Bridge |
| 状态持久化 | 工作区 `.bridge/` 目录 | Agent 能通过文件读取状态 |

---

## 八、部署方式

### 开发期

```bash
# 本地开发调试
code --extensionDevelopmentPath=./ide-bridge-extension
```

### 打包发布

```bash
# 打包成 .vsix
npm install -g @vscode/vsce
vsce package
# 生成 ide-bridge-0.1.0.vsix
```

### 安装方式

1. **VS Code 插件市场**（长期）：发布到市场，一键安装
2. **本地 .vsix**（当前）：三个 IDE 分别 `Extensions → ... → Install from VSIX...`
3. **复制到扩展目录**（最省事）：直接把插件文件夹复制到 `~/.vscode/extensions/`

---

## 九、和现有体系的关系

| 组件 | V3.7（现在） | V4.0（插件版） |
|------|-------------|----------------|
| Bridge 服务 | 手动启动 | 插件自动启动 |
| 角色识别 | 手动告诉 Agent | 插件配置自动注册 |
| 消息发送 | Agent 调用 JS 脚本 | 插件命令 + Agent 调用 |
| 状态查看 | 看终端日志 | 侧边栏可视化面板 |
| 任务启动 | 手动创建目录 | 命令面板一键启动 |
| 协议文档 | V2.1 | V2.1（不变，插件只是包装） |

**核心协议不变**——插件只是把 V3.7 的手动操作自动化了，底层的 IDE Bridge 消息协议、三角色分工、8 Phase 门禁引擎全部沿用。

---

## 十、演进路线

```
V3.7  ← 现在：手动启动 Bridge + Agent 自觉发消息
  │
  ▼
V3.8  ← 插件 MVP：自动启动/连接 + 侧边栏状态 + 命令面板
  │
  ▼
V3.9  ← 插件增强：任务控制器 + 进度可视化 + 消息日志
  │
  ▼
V4.0  ← 深度集成：Hooks 自动触发 + IM 桥接 + 全无人值守
```
