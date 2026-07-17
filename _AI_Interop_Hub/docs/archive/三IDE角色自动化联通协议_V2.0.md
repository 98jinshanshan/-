# 三 IDE 角色自动化联通协议 V2.0

> **通信层唯一权威定义。** 任何关于三 IDE 如何通信的问题，以此文档为准。
> 配套文件：`ide-bridge.js`（服务器）、`ide-bridge-client.js`（客户端 SDK）
> 引用文档：`开发总纲_可执行版.json`、`AGENT_INSTRUCTION.md`、`orchestrator.js`

---

## 一、概述

### 1.1 物理架构

| IDE 实例 | 角色 | 职责 |
|---------|------|------|------|
| Codex IDE | 研究员 | Phase 1-5 去程设计 |
| OpenClaw IDE | 监督者+审核员 | 8 个检查点校验 + 边界审核 |
| Cursor IDE | 开发者 | Phase 6-8 回程实现 |

三个 IDE 实例物理独立，各自运行 Agent，**通过 IDE Bridge 实时通信**。

### 1.2 V2.0 核心变化

| 维度 | V1.0（文件轮询） | V2.0（IDE Bridge） |
|------|-----------------|-------------------|
| 通信模型 | 轮询（Pull） | 推送（Push） |
| 延迟 | 5-10 秒 | < 1ms |
| 在线感知 | 心跳文件 | WebSocket 原生心跳 |
| 离线消息 | 无 | 持久化队列 |
| 兼容性 | — | 向下兼容 V1.0 文件轮询 |

> **兼容模式：** 如果 IDE Bridge 不可用，Agent 自动回退到 V1.0 文件轮询模式。V1.0 的 `.pending → .processing → .result` 文件协议仍然有效，作为降级方案。

---

## 二、IDE Bridge 架构

### 2.1 组件

```
┌──────────────────────────────────────────────────────┐
│              IDE Bridge（本地消息中枢）                 │
│              ws://localhost:9527                      │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │
│  │ 消息路由   │ │ 在线管理   │ │ 离线消息队列          │  │
│  │ role→ws  │ │ 心跳检测   │ │ 持久化到 .ide-bridge-offline/ │
│  └──────────┘ └──────────┘ └──────────────────────┘  │
└───────┬───────────────┬───────────────┬──────────────┘
        │               │               │
   WebSocket       WebSocket       WebSocket
        │               │               │
  Codex IDE      OpenClaw IDE     Cursor IDE
```

### 2.2 文件清单

| 文件 | 角色 | 说明 |
|------|------|------|
| `ide-bridge.js` | 服务器 | 消息中枢，启动后监听端口 9527 |
| `ide-bridge-client.js` | 客户端 SDK | 每个 Agent 引入，提供连接/发送/监听 API |
| `.ide-bridge-offline/*.json` | 离线队列 | 各角色的离线消息持久化存储 |

### 2.3 端口约定

| 端口 | 用途 |
|------|------|
| 9527 | WebSocket 消息通道 |
| 9528 | HTTP 状态查询（`http://localhost:9528/status`） |

---

## 三、消息协议

### 3.1 消息信封（唯一标准格式）

所有消息统一使用此信封格式：

```json
{
  "envelope": {
    "msg_id": "msg_20260715_001",
    "from": "codex",
    "to": "openclaw",
    "type": "checkpoint.request",
    "timestamp": "2026-07-15T10:00:00.000Z",
    "reply_to": "msg_20260715_000"
  },
  "payload": { ... }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `msg_id` | string | 是 | 全局唯一，Bridge 自动生成 |
| `from` | string | 是 | 发送者角色：`codex` / `openclaw` / `cursor` / `orchestrator` |
| `to` | string | 是 | 接收者角色，或 `broadcast` 广播 |
| `type` | string | 是 | 消息类型（见 3.2） |
| `timestamp` | string | 是 | ISO8601，Bridge 自动生成 |
| `reply_to` | string | 否 | 关联的请求消息 ID |

### 3.2 消息类型全集

| 类型 | 发送者 | 接收者 | 说明 |
|------|--------|--------|------|
| `checkpoint.request` | codex / cursor | openclaw | 请求审核检查点 |
| `checkpoint.result` | openclaw | codex / cursor | 回复审核结果 |
| `phase.handoff` | codex / cursor | openclaw | Phase 交接通知 |
| `task.assign` | orchestrator | codex | 分配新任务 |
| `task.complete` | cursor | broadcast | 任务完成广播 |
| `heartbeat` | 任何角色 | bridge | 心跳（不转发） |
| `error.blocked` | 任何角色 | broadcast | 阻断通知 |
| `presence.online` | bridge | broadcast | 角色上线通知 |
| `presence.offline` | bridge | broadcast | 角色离线通知 |
| `presence.list` | bridge | 新连接 | 当前在线列表 |

### 3.3 关键消息体详解

**checkpoint.request：**

```json
{
  "checkpoint_id": "cp_0",
  "phase": 1,
  "phase_name": "意图锚定",
  "task_id": "task_novel_xxx",
  "artifact": "spec.json",
  "artifact_path": "G:/_AI_Interop_Hub/collaboration/deliverables/task_xxx/spec.json",
  "root_goal_sha256": "a3f2b8c1...",
  "checks_required": ["file_exists", "44_fields_present", "inferred_ratio_under_30"]
}
```

**checkpoint.result：**

```json
{
  "checkpoint_id": "cp_0",
  "phase": 1,
  "task_id": "task_novel_xxx",
  "result": "pass",
  "automated_checks": { "file_exists": true, "inferred_ratio": 0.27 },
  "semantic_review": { "root_goal_consistent": true, "contradictions_found": [] },
  "failure_details": null
}
```

`result` 取值：`pass` / `fail` / `fail_semantic`

---

## 四、角色行为规范

### 4.1 Codex（研究员）

**启动流程：**
1. 连接 IDE Bridge（`ws://localhost:9527`），注册角色 `codex`
2. 监听 `task.assign`（接收新任务）
3. 监听 `checkpoint.result`（接收审核结果）
4. 监听 `presence.online` / `presence.offline`（感知其他角色状态）

**执行流程：**
- 收到 `task.assign` → 读取门禁引擎 → 从 Phase 1 开始
- 每个 Phase 完成 → 调用 `bridge.requestCheckpoint()` 发审核请求
- 收到 `checkpoint.result = pass` → 进入下一 Phase
- 收到 `checkpoint.result = fail` → 根据 `failure_details` 重做
- Phase 5 完成 → 发 `phase.handoff` 通知 Cursor 可以开始

### 4.2 OpenClaw（监督者）

**启动流程：**
1. 连接 IDE Bridge，注册角色 `openclaw`
2. 监听 `checkpoint.request`（接收审核请求）
3. 监听 `phase.handoff`（接收交接通知）

**执行流程：**
- 收到 `checkpoint.request` → 读取 `artifact_path` 的文件 → 执行自动化检查 → 调用 `bridge.replyCheckpoint()` 回复
- 审核原则：只读取产物文件，不参考对话历史（独立性原则）
- 连续 fail 3 次 → 发 `error.blocked` 广播

### 4.3 Cursor（开发者）

**启动流程：**
1. 连接 IDE Bridge，注册角色 `cursor`
2. 监听 `phase.handoff`（接收设计完成通知）
3. 监听 `checkpoint.result`（接收审核结果）

**执行流程：**
- 收到 Phase 5 完成的 `phase.handoff` → 读取设计文档 → 从 Phase 6 开始
- Phase 6-8 每个完成 → 发 `checkpoint.request`
- Phase 8 完成 → 发 `task.complete` 广播

---

## 五、客户端 SDK API

`ide-bridge-client.js` 提供以下方法（**唯一 API 定义，以此为准**）：

```javascript
const BridgeClient = require('./ide-bridge-client');
const bridge = new BridgeClient('codex');
bridge.connect();
```

| 方法 | 说明 |
|------|------|
| `connect()` | 连接 Bridge，自动重连 |
| `disconnect()` | 断开连接 |
| `send(to, type, payload)` | 发送原始消息 |
| `on(type, callback)` | 监听指定类型消息 |
| `once(type, callback)` | 监听一次 |
| `off(type, callback)` | 取消监听 |
| `requestCheckpoint(cpId, phase, taskId, artifact, path)` | 快捷：请求审核 |
| `replyCheckpoint(cpId, phase, taskId, result, checks, review, failures)` | 快捷：回复审核 |
| `announcePhaseComplete(taskId, fromPhase, toPhase, toRole)` | 快捷：广播 Phase 完成 |
| `announceTaskComplete(taskId, outputPath, summary)` | 快捷：广播任务完成 |
| `reportBlocked(taskId, phase, reason, detail)` | 快捷：广播阻断 |
| `setTask(id)` | 设置当前任务 ID |
| `setPhase(n)` | 设置当前 Phase |

---

## 六、全流程时序

### 6.1 完整 8 Phase 流程

```
用户 → orchestrator.js: "写一本悬疑小说"
  │
  ├─→ 发 task.assign → Codex
  │
Codex: Phase 1 → 发 checkpoint.request → OpenClaw
OpenClaw: 审核 → 发 checkpoint.result=pass → Codex
Codex: Phase 2 → 发 checkpoint.request → OpenClaw
OpenClaw: 审核 → 发 checkpoint.result=pass → Codex
...（Phase 3-5 同理）...
Codex: Phase 5 完成 → 发 phase.handoff → Cursor
  │
Cursor: Phase 6 → 发 checkpoint.request → OpenClaw
OpenClaw: 审核 → 发 checkpoint.result=pass → Cursor
...（Phase 7-8 同理）...
Cursor: Phase 8 完成 → 发 task.complete → broadcast
  │
  └─→ 所有角色收到完成通知 → 用户收到通知
```

### 6.2 失败重试

```
Codex: Phase 3 → checkpoint.request → OpenClaw
OpenClaw: checkpoint.result=fail → Codex
Codex: 重做 Phase 3 → checkpoint.request → OpenClaw
OpenClaw: checkpoint.result=fail → Codex
Codex: 再重做 Phase 3 → checkpoint.request → OpenClaw
OpenClaw: checkpoint.result=fail → OpenClaw 发 error.blocked → broadcast
```

---

## 七、部署与运行

### 7.1 启动 Bridge

```bash
# 安装依赖（首次）
npm install ws

# 启动
node ide-bridge.js

# 自定义端口
node ide-bridge.js --port 9999
```

### 7.2 验证状态

```bash
curl http://localhost:9528/status
```

返回各角色的在线状态、当前任务、离线队列长度。

### 7.3 停止

`Ctrl+C` 即可，无残留。

---

## 八、V1.0 兼容模式

如果 IDE Bridge 不可用，Agent 自动回退到 V1.0 文件轮询模式。

V1.0 文件协议（`.pending → .processing → .result`）的完整定义见 V1.0 归档版本。当前版本不再重复，以避免信息不同步。

**降级触发条件：** Bridge 连接失败 + 重连 3 次均失败 → 自动切换到文件轮询。

---

## 九、唯一文档原则

本文件是三 IDE 通信协议的**唯一权威定义**。以下规则确保信息不重复、不同步：

| 概念 | 唯一定义位置 | 其他文件 |
|------|-------------|----------|
| 消息信封格式 | 本文 3.1 节 | 只引用，不复制 |
| 消息类型列表 | 本文 3.2 节 | 只引用，不复制 |
| 客户端 API | 本文 5 节 + `ide-bridge-client.js` 代码 | 只引用，不复制 |
| 角色行为 | 本文 4 节 | `AGENT_INSTRUCTION.md` 只描述该角色的启动步骤 |
| 服务器配置 | 本文 2.3 节 + `ide-bridge.js` 代码 | 只引用端口号 |
| V1.0 文件轮询 | V1.0 归档版 | 本文只提"兼容模式"，不重复细节 |