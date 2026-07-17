---
title: 三IDE角色自动化联通协议
version: V2.1
updated: 2026-07-15
status: active
authority: 唯一权威·三层通信架构
supersedes: V2.0, V1.0
---

# 三 IDE 角色自动化联通协议 V2.1

> **通信层唯一权威定义。** 任何关于三 IDE 如何通信的问题，以此文档为准。
> 三层通信架构：IDE Bridge（Agent↔Agent） → Hooks 触发层（系统自动触发） → IM 机器人桥接（Agent↔人）
> 配套文件：`ide-bridge.js`（服务器）、`ide-bridge-client.js`（客户端 SDK）
> 引用文档：`开发总纲_可执行版.json`、`AGENT_INSTRUCTION.md`、`orchestrator.js`

---

## 一、三层通信架构总览

### 1.1 为什么是三层

```
┌──────────────────────────────────────────────────────┐
│  Layer 3: IM 机器人桥接（Agent ↔ 人）                 │
│  微信 / QQ / 飞书 / Lark                              │
│  一句话触发任务 / 进度推送 / 阻断告警 / 完成通知       │
│  解决：用户不用盯着 IDE，在 IM 里就能操控              │
├──────────────────────────────────────────────────────┤
│  Layer 2: Hooks 触发层（系统自动触发）                 │
│  onSessionStart / postPhase / onError / sessionEnd   │
│  从"Agent记得发消息"升级为"系统钩子自动触发"          │
│  解决：Agent 可能忘，系统不会忘                        │
├──────────────────────────────────────────────────────┤
│  Layer 1: IDE Bridge（Agent ↔ Agent）                │
│  WebSocket 实时消息 / 角色寻址 / 离线队列 / 心跳      │
│  解决：三 IDE 之间实时通信，替代文件轮询               │
└──────────────────────────────────────────────────────┘
```

### 1.2 各层定位

| 层级 | 名称 | 解决的问题 | 状态 |
|------|------|-----------|------|
| Layer 1 | IDE Bridge | 三 IDE 之间怎么发消息 | ✅ 已实现 |
| Layer 2 | Hooks 触发层 | 消息由谁触发（Agent 自觉 vs 系统强制） | 📐 架构已定，待实现 |
| Layer 3 | IM 机器人桥接 | 用户怎么和系统交互（IDE vs 微信/QQ） | 📐 架构已定，待实现 |

### 1.3 V2.1 核心变化

- 从单层（IDE Bridge）扩展为三层完整通信架构
- 新增 **Layer 2: Hooks 触发层** — 系统级自动触发，Agent 不会忘
- 新增 **Layer 3: IM 机器人桥接** — 用户通过微信/QQ/飞书就能发指令、收通知
- 各层独立演进，下层为上层提供基础能力

---

## 二、Layer 1: IDE Bridge（Agent ↔ Agent）

> **已实现，V2.0 版本内容完整保留。** 以下为摘要，详见 V2.0 完整实现。

### 2.1 架构

```
                    ┌──────────────────────┐
                    │   IDE Bridge :9527    │
                    │   消息路由 在线管理     │
                    │   离线缓冲 心跳检测     │
                    └──┬────────┬────────┬──┘
                 WebSocket WebSocket WebSocket
                    │        │        │
               Codex IDE  OpenClaw  Cursor IDE
               研究员     监督者     开发者
```

### 2.2 核心文件

| 文件 | 角色 |
|------|------|
| `ide-bridge.js` | 服务器，监听端口 9527 |
| `ide-bridge-client.js` | 客户端 SDK |
| `.ide-bridge-offline/*.json` | 离线消息队列 |

### 2.3 消息信封（唯一标准格式）

```json
{
  "envelope": {
    "msg_id": "msg_xxx",
    "from": "codex",
    "to": "openclaw",
    "type": "checkpoint.request",
    "timestamp": "2026-07-15T10:00:00.000Z",
    "reply_to": "msg_xxx"
  },
  "payload": { ... }
}
```

### 2.4 消息类型

> 以 OpenClaw 为中心的星型拓扑：所有控制流消息经 OpenClaw 分发，Codex 和 Cursor 不直接对话。

| 类型 | 发送者 | 接收者 | 说明 |
|------|--------|--------|------|
| **任务分配流** | | | |
| `task.assign` | openclaw | codex | 分配设计任务（用户需求→OpenClaw 接收→分发给 Codex） |
| `task.delegate` | openclaw | cursor | 下发实现任务（设计完成→OpenClaw 分发给 Cursor） |
| `task.complete` | openclaw | broadcast | 任务完成广播（由 OpenClaw 统一通知） |
| **审核流** | | | |
| `checkpoint.request` | codex / cursor | openclaw | 请求审核检查点 |
| `checkpoint.result` | openclaw | codex / cursor | 回复审核结果 |
| **异常流** | | | |
| `error.blocked` | openclaw | broadcast | 阻断通知（由 OpenClaw 统一发出） |
| `error.user_escalation` | openclaw | user_proxy | 需要用户介入（阻断 3 次以上或重大决策） |
| **状态流** | | | |
| `presence.online` | bridge | broadcast | 角色上线通知 |
| `presence.offline` | bridge | broadcast | 角色离线通知 |
| **扩展预留** | | | |
| `custom.*` | 任何角色 | 任何角色 | 自定义消息类型，用于未来扩展新角色 |

---

## 三、Layer 2: Hooks 触发层（系统自动触发）

### 3.1 为什么需要 Hooks 层

**问题**：IDE Bridge 解决了"怎么发消息"，但没解决"谁来触发发消息"。

如果靠 Agent 自觉（Prompt 里写"完成后记得发消息"），就会出现：
- Agent 可能忘记发
- Agent 可能发错格式
- Agent 可能跳过审核直接进入下一 Phase

**解决方案**：在 IDE 的 Agent 生命周期钩子上挂脚本，**系统层面自动触发**。Agent 不用"记得"，到点自动执行。

这和 V3.6 把"纸面门禁"升级为"代码门禁"是同一个思路——**从靠自觉升级为系统强制。**

### 3.2 Hooks 定义

Hooks（钩子）= 在 Agent 执行流程的特定时间点，系统自动触发执行自定义脚本。

参考行业标准（ChatGPT Hooks、Reasonix Hooks），定义以下钩子时机：

| 钩子时机 | 触发时刻 | 对应 Bridge 动作 |
|----------|---------|-----------------|
| `onSessionStart` | Agent 会话启动时 | 自动连接 Bridge + 注册角色 + 拉取离线消息 |
| `prePhaseStart` | Phase 开始执行前 | 自动检查 gate_file + 拉取上游产物 |
| `postPhaseComplete` | Phase 执行完成后 | 自动发送 `checkpoint.request` + 写入 produce_file |
| `onCheckpointResult` | 收到审核结果时 | pass → 进入下一 Phase；fail → 触发重做 |
| `onError` | 执行出错时 | 自动发送 `error.blocked` 广播 |
| `onTaskComplete` | 任务全部完成时 | 自动发送 `task.complete` 广播 |
| `preSessionEnd` | 会话结束前 | 自动断开 Bridge + 清理状态 + 发送下线通知 |
| `sessionEnd` | 会话结束后 | （预留，用于日志/统计） |

### 3.3 Hooks 与 Bridge 的关系

```
Agent 执行 Phase N
     │
     ▼
  Phase 完成
     │
     ▼
┌─────────────┐
│ postPhase   │  ← Hook 触发（系统自动，不需要 Agent 记得）
│ Complete    │
└──────┬──────┘
       │
       ▼
  写入 produce_file  ←  门禁引擎（文件层强制）
       │
       ▼
  发送 checkpoint.request → IDE Bridge → OpenClaw
```

**两层强制**：
1. **门禁引擎**（文件层）：不写 produce_file 就进不了下一 Phase
2. **Hooks 触发**（系统层）：Phase 完成自动发消息，Agent 想忘都忘不掉

### 3.4 Hooks 脚本规范

每个钩子对应一个脚本文件，放在 `hooks/` 目录下：

```
hooks/
  onSessionStart.js       # 会话启动
  prePhaseStart.js        # Phase 开始前
  postPhaseComplete.js    # Phase 完成后
  onCheckpointResult.js   # 收到审核结果
  onError.js              # 出错时
  onTaskComplete.js       # 任务完成
  preSessionEnd.js        # 会话结束前
```

**脚本输入输出**：
- 输入：环境变量（`BRIDGE_ROLE`、`CURRENT_PHASE`、`TASK_ID` 等）
- 输出：标准输出会被 Agent 捕获并纳入上下文
- 失败：非零退出码会阻断当前操作

### 3.5 无 Hooks 环境的降级

如果 IDE 不支持 Hooks（如通用 IDE），自动降级为 **Agent 主动触发模式**：
- Agent 在 Prompt 约束下完成每个 Phase 后主动调用 Bridge Client
- 可靠性略低（依赖 Agent 执行），但功能完整
- 这也是当前的实现状态

---

## 四、Layer 3: IM 机器人桥接（Agent ↔ 人）

### 4.1 为什么需要 IM 桥接层

**问题**：用户要使用系统，必须打开三个 IDE 窗口，盯着进度。

**目标**：用户像用微信一样和系统交互——发一句话就开始干活，进度自动推送，出错了告警，完成了收通知。

```
用户在微信说："帮我写一本悬疑小说前十章"
  │
  ▼
IM 机器人桥接层
  │
  ▼
IDE Bridge → Orchestrator → Codex → ...
  │
  ▼
进度推送 / 阻断告警 / 完成通知 → 用户的微信
```

### 4.2 支持的 IM 平台

参考 DeepSeek Reasonix 的机器人配置，支持以下平台：

| 平台 | 接入方式 | 用途 |
|------|---------|------|
| 微信 | 企业微信机器人 / 微信公众号 | 任务通知、进度推送 |
| QQ | QQ 频道机器人 / 群机器人 | 任务通知、进度推送 |
| 飞书 / Lark | 飞书自定义机器人 / 应用机器人 | 卡片通知、交互式审批 |

### 4.3 IM 桥接层架构

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  用户 IM     │────▶│  IM 桥接适配器     │────▶│  IDE Bridge  │
│  (微信/QQ)   │◀────│  (im-bridge.js)   │◀────│  (:9527)    │
└─────────────┘     └──────────────────┘     └─────────────┘
```

**IM 桥接适配器**（`im-bridge.js`）是 Layer 3 的核心组件，负责：
1. **接收用户消息** → 解析为任务指令 → 通过 Bridge 发送 `task.assign`
2. **转发系统通知** → 监听 Bridge 的 broadcast → 推送到用户 IM
3. **交互式审批** → 阻断时发卡片 → 用户点"继续/终止" → 回传指令

### 4.4 用户侧交互流程

**触发任务**：
```
用户："写一本悬疑推理小说，前十章，每章2000字"
  ↓
IM 机器人收到 → 解析意图 → 调用 orchestrator 创建任务
  ↓
回复："收到，任务已启动，预计10分钟完成，完成后通知你"
  ↓
IDE Bridge → Codex → 8 Phase 流水线
```

**进度推送**（可选，默认仅关键节点）：
```
[设计完成] Phase 1-5 已完成，开始实现阶段...
[完成提醒] 任务完成！《第七声钟响》前十章，23,168字
           点击查看产物：file:///G:/_AI_Interop_Hub/...
```

**阻断告警**：
```
⚠️ [阻断告警] Phase 3 连续 3 次审核失败
   原因：节点与根目标一致性不足
   操作：[查看详情] [继续重试] [终止任务]
```

### 4.5 与 IDE Bridge 的关系

IM 桥接层是 IDE Bridge 的**一个特殊客户端**，角色为 `user_proxy`：

- 接收用户消息 → 转换为 `task.assign` 发送给 codex
- 监听 `task.complete` → 推送给用户
- 监听 `error.blocked` → 推送告警卡片
- 监听 `checkpoint.result` → （可选）推送进度

```
IDE Bridge 中的角色：
  codex       ← 研究员
  openclaw    ← 监督者
  cursor      ← 开发者
  user_proxy  ← IM 桥接层（代表人的角色）
```

### 4.6 无 IM 环境的降级

如果不配置 IM 机器人，自动降级为 **IDE 内通知模式**：
- 用户通过 IDE 输入指令（当前方式）
- 任务完成后在 IDE 内通知
- 不影响三 IDE 协作的核心功能

---

## 五、全流程时序（三层完整）

### 5.1 一句话触发全流程

```
用户微信："写一本悬疑小说前十章"
  │
  ├─ Layer 3: IM 桥接接收 → 转发给 OpenClaw
  │
  ├─ Layer 2: OpenClaw 的 onUserRequest hook 触发
  │         → 第一道门禁（判断可行性 → 确认目标）
  │         → 自动发 task.assign → Codex
  │
  ├─ Layer 1: IDE Bridge 路由给 codex
  │
Codex（研究员）:
  ├─ Layer 2: onSessionStart hook → 自动连接 Bridge + 注册
  ├─ Layer 2: postPhaseComplete hook (×5) → 自动发 checkpoint.request
  ├─ Layer 1: checkpoint.request → openclaw
  ├─ Layer 1: checkpoint.result ← openclaw
  └─ Phase 5 完成 → checkpoint.request（最后一个）
     │
OpenClaw（协调者+监督者）:
  ├─ 收到 Phase 5 pass → onPhase5Complete hook 触发
  ├─ 自动发 task.delegate → Cursor（下发实现任务）
  │
Cursor（开发者）:
  ├─ Layer 2: onTaskDelegate hook → 自动开始 Phase 6
  ├─ Layer 2: postPhaseComplete hook (×3) → 自动发 checkpoint.request
  ├─ Layer 1: checkpoint.request → openclaw
  ├─ Layer 1: checkpoint.result ← openclaw
  └─ Phase 8 完成 → checkpoint.request（最后一个）
     │
OpenClaw:
  ├─ 收到 Phase 8 pass → onTaskComplete hook 触发
  ├─ 自动发 task.complete → broadcast
  │
  ├─ Layer 1: task.complete 广播到所有角色
  │
  ├─ Layer 3: IM 桥接收到 task.complete → 推送微信通知
  │
用户微信："任务完成！《第七声钟响》前十章，23,168字"
```

---

## 六、部署与运行

### 6.1 三层部署顺序

| 步骤 | 层级 | 操作 | 状态 |
|------|------|------|------|
| 1 | Layer 1 | `node ide-bridge.js` 启动 Bridge | ✅ 已可用 |
| 2 | Layer 2 | 在 IDE 中配置 Hooks 脚本路径 | 📐 待实现 |
| 3 | Layer 3 | 配置 IM 机器人 + 启动 `im-bridge.js` | 📐 待实现 |

### 6.2 当前可用状态

- **Layer 1（IDE Bridge）**：完全可用，端到端测试通过
- **Layer 2（Hooks）**：架构已定，脚本规范已定义，待接入具体 IDE 的 Hooks 系统
- **Layer 3（IM 桥接）**：架构已定，待实现 `im-bridge.js`

### 6.3 降级链

```
三层完整 → 退化为两层 → 退化为一层 → 退化为零层（纯文件轮询）
  IM + Hooks + Bridge    Hooks + Bridge    Bridge 仅文件轮询
```

每一层都可以独立启用/禁用，不影响下层功能。

---

## 七、角色行为规范（三层视角）

### 7.0 通信拓扑与角色体系

三 IDE 在通信层呈现**以 OpenClaw 为中心的星型拓扑**——OpenClaw 是系统的唯一对接口（对上对接用户，对下管理执行），Codex 和 Cursor 只与 OpenClaw 直接通信。

```
                       ┌──────────────┐
                       │    用户（人）  │
                       └──────┬───────┘
                              │
                       Layer 3: IM 桥接
                              │
                       ┌──────▼───────┐
                       │   OpenClaw    │  ← 中心枢纽：协调者+监督者
                       │  （项目经理）   │
                       └──┬─────────┬──┘
                          │         │
                task.assign  task.delegate
                设计任务     实现任务
                          │         │
                 ┌────────▼──┐  ┌──▼─────────┐
                 │   Codex    │  │   Cursor    │
                 │  研究员     │  │  开发者     │
                 │ (去程设计)  │  │ (回程实现)  │
                 └────────────┘  └─────────────┘
```

**消息流向**（全部经 OpenClaw 中转）：
- 用户 → OpenClaw：需求输入（经 IM 桥接）
- OpenClaw → Codex：`task.assign`（分配设计任务）
- Codex → OpenClaw：`checkpoint.request`（Phase 1-5 审核请求）
- OpenClaw → Codex：`checkpoint.result`（审核结果）
- OpenClaw → Cursor：`task.delegate`（下发实现任务）
- Cursor → OpenClaw：`checkpoint.request`（Phase 6-8 审核请求）
- OpenClaw → Cursor：`checkpoint.result`（审核结果）
- OpenClaw → 全体：`error.blocked` / `task.complete`（广播）
- OpenClaw → 用户：`error.user_escalation`（需要人工介入时）

> **为什么 OpenClaw 在最上面？** 因为它是唯一对接用户的角色——第一道门禁由它把守（判断需求、分配任务），质量由它把控（8 个检查点），异常由它上报（阻断告警），结果由它交付（完成通知）。这就是项目经理的角色。

---

### 7.1 OpenClaw（协调者 + 监督者）—— 中心枢纽

**角色定位**：系统的唯一对接口和中心调度者。对上对接用户，对下管理 Codex 和 Cursor，全程把控质量和进度。相当于**项目经理 + 质量总监**。

**核心职责**（从第一道门禁到最终交付）：
1. **第一道门禁**：接收用户需求 → 判断可行性 → 必要时澄清 → 确认目标
2. **任务分配**：把设计任务分给 Codex，把实现任务分给 Cursor
3. **质量监督**：8 个检查点审核裁决（pass / fail）
4. **异常处理**：连续失败时阻断 → 必要时上报用户请求决策
5. **结果交付**：任务完成后统一通知用户

**Layer 1 通信**：
- 入站：接收 Codex 和 Cursor 的 `checkpoint.request`
- 出站：向请求方回复 `checkpoint.result`（pass / fail / fail_semantic）
- 出站：`task.assign` → Codex（分配设计任务）
- 出站：`task.delegate` → Cursor（下发实现任务）
- 广播：`task.complete`（任务完成，统一由 OpenClaw 发出）
- 广播：`error.blocked`（阻断通知，统一由 OpenClaw 发出）
- 上报：`error.user_escalation` → user_proxy（需人工介入）

**Layer 2 触发**：
- `onUserRequest` 钩子：收到用户需求后自动启动第一道门禁
- `onCheckpointRequest` 钩子：收到审核请求后自动执行审核流程
- `onPhase5Complete` 钩子：设计全部通过后自动向 Cursor 下发 `task.delegate`
- `onTaskComplete` 钩子：全链路通过后自动广播完成 + 通知用户

**Layer 3 交互**：
- 是系统中**唯一**直接与用户交互的角色
- 第一道门禁：接收需求、判断可行性、必要时澄清
- 阻断告警：连续失败时发 IM 消息，请求人工决策
- 完成通知：任务完成后发 IM 消息，附产物摘要
- 其他角色不得直接与用户通信

**独立性原则**：审核时只读取产物文件，不得参考对话历史、不得读取发送方的"设计思路"。

---

### 7.2 Codex（研究员）—— 上游生产者

**角色定位**：去程设计的执行者。把用户的模糊想法拆解为可实现的蓝图（spec → path → nodes → interfaces → 叶节点）。只做设计，不做实现。

**核心职责**：
1. 接收 OpenClaw 分配的设计任务（`task.assign`）
2. 执行 Phase 1-5 去程设计
3. 每个 Phase 完成后提交 OpenClaw 审核
4. 审核不通过则根据反馈重做

**Layer 1 通信**：
- 入站：接收 `task.assign`（任务分配）、`checkpoint.result`（审核结果）
- 出站：发送 `checkpoint.request`（每个 Phase 完成后）
- **不直接与 Cursor 通信**，所有消息经 OpenClaw 中转

**Layer 2 触发**：
- `onSessionStart` 钩子：自动连接 Bridge + 注册角色
- `postPhaseComplete` 钩子：Phase 完成后自动发 `checkpoint.request`
- `onCheckpointResult` 钩子：收到 pass → 自动进入下一 Phase；收到 fail → 自动触发重做

**Layer 3 交互**：
- 不直接和用户交互
- 通过 OpenClaw 的广播间接感知系统状态

---

### 7.3 Cursor（开发者）—— 下游生产者

**角色定位**：回程实现的执行者。按 Codex 的设计蓝图把东西做出来（代码 / 文档 / 小说正文等）。只做实现，不做设计。

**核心职责**：
1. 接收 OpenClaw 下发的实现任务（`task.delegate`）
2. 读取设计文档，执行 Phase 6-8 回程实现
3. 每个 Phase 完成后提交 OpenClaw 审核
4. 审核不通过则根据反馈重做

**Layer 1 通信**：
- 入站：接收 `task.delegate`（实现任务下发）、`checkpoint.result`（审核结果）
- 出站：发送 `checkpoint.request`（每个 Phase 完成后）
- **不直接与 Codex 通信**，所有消息经 OpenClaw 中转

**Layer 2 触发**：
- `onTaskDelegate` 钩子：收到实现任务后自动开始 Phase 6
- `postPhaseComplete` 钩子：Phase 完成后自动发 `checkpoint.request`
- `onCheckpointResult` 钩子：收到 pass → 自动进入下一 Phase；收到 fail → 自动触发重做

**Layer 3 交互**：
- 不直接和用户交互
- 完成通知由 OpenClaw 统一发出，Cursor 不直接通知用户

---

### 7.4 角色扩展机制（预留口子）

当前是 3 个角色，但系统设计为**可插拔的角色架构**，未来可以随时新增角色而不需要修改核心协议。

**新增角色的方式**：

1. **注册角色名**：在 Bridge 中注册新的 `role` 标识（如 `tester`、`designer`、`researcher`）
2. **定义消息类型**：使用 `custom.*` 命名空间定义该角色专属的消息类型
3. **挂到星型拓扑**：新角色同样只与 OpenClaw 直接通信，不与其他执行角色直接对话

**未来可能新增的角色示例**：

| 角色 | IDE | 职责 | 接入方式 |
|------|-----|------|---------|
| Tester（测试员） | 第 4 个 IDE | 自动化测试、质量验收 | OpenClaw → task.delegate → Tester |
| Designer（设计师） | 第 5 个 IDE | UI/UX 设计、原型输出 | OpenClaw → task.assign → Designer |
| Researcher（调研员） | 第 6 个 IDE | 资料搜集、市场调研 | OpenClaw → task.assign → Researcher |

**扩展原则**：
- 永远保持**星型拓扑**——所有角色只跟 OpenClaw 对话，不互相直接通信
- 新角色的消息类型用 `custom.` 前缀，避免与核心消息冲突
- OpenClaw 永远是中心枢纽和唯一对接口

---

## 八、唯一文档原则

本文件是三 IDE 通信的**唯一权威定义**，涵盖全部三层。以下规则确保信息不重复、不同步：

| 概念 | 唯一定义位置 | 其他文件 |
|------|-------------|----------|
| 三层通信架构总览 | 本文 1.1 节 | 只引用，不复制 |
| IDE Bridge 消息协议 | 本文 2.3/2.4 节 + ide-bridge.js 代码 | 只引用，不复制 |
| Hooks 时机列表 | 本文 3.2 节 | 只引用，不复制 |
| IM 桥接架构 | 本文 4.3/4.4 节 | 只引用，不复制 |
| 角色通信行为 | 本文 7.0/7.1/7.2/7.3/7.4 节 | 只引用角色定位，不复制通信细节 |
| 角色扩展机制 | 本文 7.4 节 | 只引用扩展原则，不复制细节 |
| 客户端 SDK API | 本文 2 节 + ide-bridge-client.js 代码 | 只引用，不复制 |
| V1.0 文件轮询 | archive/V1.0 归档版 | 本文只提"降级方案"，不重复细节 |