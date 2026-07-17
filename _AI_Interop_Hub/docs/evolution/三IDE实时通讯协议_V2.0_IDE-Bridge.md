# 三 IDE 实时通讯协议 V2.0（IDE Bridge）

> 从"文件轮询"升级为"实时消息推送"——同一台电脑上的三个 IDE 实例像微信一样即时通讯
>
> 设计日期：2026-07-15 · 替代 V1.0 文件轮询协议 · 对应演进报告 冲突 #3 解决方案

---

## 一、为什么 V1.0 的文件轮询不够好

### 1.1 V1.0 的四个痛点

| 痛点 | V1.0 表现 | 影响 |
|------|----------|------|
| **延迟** | 轮询间隔 5-10 秒，最坏情况 10 秒才检测到 | 8 个 Phase × 2 次轮询（.pending + .result）= 最坏 160 秒空转 |
| **竞态** | .processing 文件是"乐观锁"，两个 Agent 可能同时读到 .pending | 需要额外处理冲突 |
| **不可观测** | 不知道对方 Agent 是否在线，只能靠心跳文件 | 故障检测不及时 |
| **非标准** | 文件轮询不是任何 Agent 协议标准 | 与 MCP/A2A 等标准协议不兼容 |

### 1.2 用户的核心洞察

> "就像现在的微信、QQ 一样的通信工具一样，有没有办法在三 IDE 之间做一个互相通讯的桥梁"

这个类比非常精准。微信/QQ 的本质是什么？**一个中心化的消息服务器 + 每个客户端的长连接**。映射到我们的场景：

| 微信/QQ | IDE Bridge |
|---------|------------|
| 微信服务器 | `ide-bridge.js`（本地 WebSocket 服务器） |
| 用户 A/B/C | Codex / OpenClaw / Cursor 三个 IDE Agent |
| 发消息 | Agent 发送 JSON 消息到 Bridge |
| 收消息 | Bridge 推送到目标 Agent |
| 群聊 | 广播消息（如任务完成通知） |

---

## 二、架构设计

### 2.1 整体架构

```
同一台电脑（Windows）上：

┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │              IDE Bridge（本地消息中枢）                      │    │
│   │              ws://localhost:9527                           │    │
│   │                                                           │    │
│   │   ┌─────────┐  ┌──────────┐  ┌───────────────────────┐    │    │
│   │   │ 消息路由  │  │ 在线管理  │  │ 消息持久化（可选）      │    │    │
│   │   │ role→ws  │  │ 心跳检测  │  │ 离线消息队列           │    │    │
│   │   └─────────┘  └──────────┘  └───────────────────────┘    │    │
│   └──────────┬───────────────┬───────────────┬────────────────┘    │
│              │               │               │                     │
│       WebSocket        WebSocket        WebSocket                  │
│              │               │               │                     │
│   ┌──────────▼───┐  ┌────────▼──────┐  ┌───▼──────────┐          │
│   │  Codex IDE   │  │ OpenClaw IDE  │  │  Cursor IDE  │          │
│   │  研究员       │  │  监督者+审核   │  │  开发者       │          │
│   │              │  │              │  │              │          │
│   │  发送：       │  │  发送：       │  │  发送：       │          │
│   │  - 审核请求   │  │  - 审核结果   │  │  - 审核请求   │          │
│   │  - 阶段完成   │  │  - 边界审核   │  │  - 阶段完成   │          │
│   │              │  │  - 心跳       │  │  - 任务完成   │          │
│   │  接收：       │  │  接收：       │  │  接收：       │          │
│   │  - 审核结果   │  │  - 审核请求   │  │  - 审核结果   │          │
│   │  - 任务分配   │  │  - 任务通知   │  │  - 设计文档   │          │
│   └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
│   共享工作区（G:\_AI_Interop_Hub\）                               │
│   └── 文件仍用于：产物存储、版本管理、断点恢复                       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 核心原则

1. **消息通知 + 文件存储**：消息只传递"通知"和"指令"，实际产物（spec.json、代码等）仍通过文件系统存储。Bridge 不传输大文件。
2. **本地闭环**：所有通信在本地回环（localhost）完成，不经过网络，延迟 < 1ms。
3. **角色寻址**：消息发送到角色（`codex`/`openclaw`/`cursor`），不需要知道对方的具体连接。
4. **离线缓冲**：如果目标 Agent 不在线，消息暂存，上线后推送。
5. **与 V1.0 兼容**：Bridge 同时监听文件变更（`fs.watch`），V1.0 的文件轮询 Agent 仍可工作。

---

## 三、消息协议定义

### 3.1 消息信封

每条消息包裹在标准信封中：

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

| 字段 | 说明 |
|------|------|
| `msg_id` | 全局唯一消息 ID |
| `from` | 发送者角色：`codex` / `openclaw` / `cursor` / `orchestrator` |
| `to` | 接收者角色，或 `broadcast`（广播） |
| `type` | 消息类型（见 3.2） |
| `timestamp` | ISO8601 时间戳 |
| `reply_to` | 可选，关联的请求消息 ID |
| `payload` | 消息体，随 type 不同而变化 |

### 3.2 消息类型定义

#### 3.2.1 审核请求（checkpoint.request）

Codex 或 Cursor 完成一个 Phase 后，请求 OpenClaw 审核。

```json
{
  "type": "checkpoint.request",
  "payload": {
    "checkpoint_id": "cp_0",
    "phase": 1,
    "phase_name": "意图锚定",
    "task_id": "task_novel_mystery_20260715",
    "artifact": "spec.json",
    "artifact_path": "G:/_AI_Interop_Hub/collaboration/deliverables/task_novel_mystery_20260715_research/spec.json",
    "root_goal_sha256": "a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9",
    "checks_required": [
      "file_exists",
      "44_fields_present",
      "inferred_ratio_under_30",
      "goal_trace_present",
      "acceptance_criteria_measurable"
    ]
  }
}
```

#### 3.2.2 审核结果（checkpoint.result）

OpenClaw 审核完成后，回复结果。

```json
{
  "type": "checkpoint.result",
  "payload": {
    "checkpoint_id": "cp_0",
    "phase": 1,
    "task_id": "task_novel_mystery_20260715",
    "result": "pass",
    "automated_checks": {
      "file_exists": true,
      "44_fields_present": true,
      "inferred_ratio": 0.27,
      "inferred_under_30_percent": true,
      "goal_trace_present": true
    },
    "semantic_review": {
      "root_goal_consistent": true,
      "contradictions_found": [],
      "missing_dimensions": [],
      "notes": "Phase 1 产出自洽，放行。"
    },
    "failure_details": null
  }
}
```

#### 3.2.3 阶段交接（phase.handoff）

一个 Phase 完成，通知下游进入下一 Phase。

```json
{
  "type": "phase.handoff",
  "payload": {
    "task_id": "task_novel_mystery_20260715",
    "from_phase": 1,
    "to_phase": 2,
    "from_role": "codex",
    "to_role": "codex",
    "handoff_data": {
      "input_artifact": "spec.json",
      "output_artifact": "path.json",
      "gate_check_passed": true
    }
  }
}
```

#### 3.2.4 任务分配（task.assign）

Orchestrator 分配任务给 Codex。

```json
{
  "type": "task.assign",
  "payload": {
    "task_id": "task_novel_mystery_20260715",
    "task_type": "创作类",
    "one_liner": "生成一本悬疑推理小说前十章正文",
    "assignee": "codex",
    "priority": "normal",
    "created_at": "2026-07-15T10:00:00Z"
  }
}
```

#### 3.2.5 任务完成（task.complete）

Cursor 完成后通知所有角色。

```json
{
  "type": "task.complete",
  "to": "broadcast",
  "payload": {
    "task_id": "task_novel_mystery_20260715",
    "completed_by": "cursor",
    "output_path": "G:/_AI_Interop_Hub/collaboration/deliverables/task_novel_mystery_20260715_research/",
    "summary": "8 Phase 全部完成，10 章 23,168 字"
  }
}
```

#### 3.2.6 心跳（heartbeat）

每个 Agent 定期发送，Bridge 用于在线状态管理。

```json
{
  "type": "heartbeat",
  "payload": {
    "role": "codex",
    "current_phase": 2,
    "current_task": "task_novel_mystery_20260715",
    "status": "working"
  }
}
```

#### 3.2.7 错误/阻断（error.blocked）

任何 Agent 遇到阻断时通知。

```json
{
  "type": "error.blocked",
  "payload": {
    "task_id": "task_novel_mystery_20260715",
    "phase": 3,
    "role": "codex",
    "reason": "three_strikes",
    "detail": "Phase 3 连续 3 次自检失败，需人工介入",
    "blockage_file": "blockage.json"
  }
}
```

### 3.3 消息路由规则

| 发送者 | 消息类型 | 目标 |
|--------|----------|------|
| orchestrator | `task.assign` | → codex |
| codex | `checkpoint.request` | → openclaw |
| openclaw | `checkpoint.result` | → codex（Phase 1-5）或 cursor（Phase 6-8） |
| codex | `phase.handoff` | → openclaw（通知）+ 自己（继续） |
| cursor | `checkpoint.request` | → openclaw |
| cursor | `task.complete` | → broadcast（所有角色） |
| 任何角色 | `heartbeat` | → bridge（不转发） |
| 任何角色 | `error.blocked` | → broadcast |

---

## 四、IDE Bridge 服务器实现

### 4.1 技术选型

| 组件 | 选择 | 原因 |
|------|------|------|
| 通信协议 | WebSocket | 全双工、低延迟、浏览器/Node.js 原生支持 |
| 服务器 | Node.js + `ws` 库 | 零依赖（`ws` 是 Node.js 生态最轻量的 WebSocket 库） |
| 端口 | `9527` | 固定端口，避免冲突 |
| 消息格式 | JSON | 与现有总纲 JSON 体系一致 |
| 持久化 | 可选（文件 JSON） | 离线消息存本地文件，重启不丢失 |

### 4.2 服务器代码（ide-bridge.js）

```javascript
#!/usr/bin/env node

/**
 * IDE Bridge — 三 IDE 实时通讯消息中枢
 *
 * 用法：
 *   node ide-bridge.js                    # 默认端口 9527
 *   node ide-bridge.js --port 9999        # 自定义端口
 *
 * 功能：
 *   1. WebSocket 服务器，三 IDE Agent 连接
 *   2. 基于角色（codex/openclaw/cursor）的消息路由
 *   3. 心跳检测 + 在线状态管理
 *   4. 离线消息缓冲
 *   5. 消息日志（可选）
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================
// 配置
// ============================================================
const PORT = parseInt(process.argv[process.argv.indexOf('--port') + 1]) || 9527;
const HEARTBEAT_INTERVAL = 5000;   // 心跳间隔 5 秒
const HEARTBEAT_TIMEOUT = 15000;   // 超过 15 秒无心跳视为离线
const OFFLINE_QUEUE_DIR = path.join(__dirname, '.ide-bridge-offline');

// ============================================================
// 在线状态管理
// ============================================================
const connections = new Map();     // role → { ws, lastHeartbeat, currentTask, currentPhase }
const offlineQueues = new Map();  // role → [messages]

// 确保离线队列目录存在
if (!fs.existsSync(OFFLINE_QUEUE_DIR)) {
  fs.mkdirSync(OFFLINE_QUEUE_DIR, { recursive: true });
}

// 初始化离线队列（从文件恢复）
['codex', 'openclaw', 'cursor'].forEach(role => {
  const file = path.join(OFFLINE_QUEUE_DIR, `${role}.json`);
  if (fs.existsSync(file)) {
    try {
      offlineQueues.set(role, JSON.parse(fs.readFileSync(file, 'utf-8')));
    } catch (e) {
      offlineQueues.set(role, []);
    }
  } else {
    offlineQueues.set(role, []);
  }
});

// ============================================================
// 消息工具函数
// ============================================================
function createEnvelope(from, to, type, payload, replyTo) {
  return {
    envelope: {
      msg_id: `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      from,
      to,
      type,
      timestamp: new Date().toISOString(),
      reply_to: replyTo || null
    },
    payload
  };
}

function sendMessage(role, message) {
  const conn = connections.get(role);
  if (conn && conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

function queueOfflineMessage(role, message) {
  const queue = offlineQueues.get(role) || [];
  queue.push(message);
  offlineQueues.set(role, queue);
  // 持久化到文件
  fs.writeFileSync(
    path.join(OFFLINE_QUEUE_DIR, `${role}.json`),
    JSON.stringify(queue, null, 2)
  );
}

function flushOfflineQueue(role) {
  const queue = offlineQueues.get(role) || [];
  if (queue.length === 0) return;
  console.log(`[Bridge] 推送 ${queue.length} 条离线消息给 ${role}`);
  const conn = connections.get(role);
  queue.forEach(msg => {
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(msg));
    }
  });
  offlineQueues.set(role, []);
  fs.writeFileSync(
    path.join(OFFLINE_QUEUE_DIR, `${role}.json`),
    '[]'
  );
}

function broadcast(message, excludeRole) {
  connections.forEach((conn, role) => {
    if (role !== excludeRole && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message));
    }
  });
}

// ============================================================
// 消息路由
// ============================================================
function routeMessage(envelope) {
  const { to, type } = envelope.envelope;
  const msg = JSON.stringify(envelope);

  console.log(`[Bridge] ${envelope.envelope.from} → ${to} [${type}]`);

  if (to === 'broadcast') {
    broadcast(envelope);
    return;
  }

  // 定向发送
  const delivered = sendMessage(to, envelope);
  if (!delivered) {
    console.log(`[Bridge] ${to} 不在线，消息入队`);
    queueOfflineMessage(to, envelope);
  }
}

// ============================================================
// WebSocket 服务器
// ============================================================
const wss = new WebSocket.Server({ port: PORT });

console.log(`[Bridge] IDE Bridge 已启动，端口 ${PORT}`);
console.log(`[Bridge] 等待三个 IDE Agent 连接...`);
console.log(`[Bridge] ws://localhost:${PORT}`);
console.log('');

wss.on('connection', (ws, req) => {
  let role = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      // 第一条消息必须是注册消息
      if (!role) {
        if (message.type === 'register') {
          role = message.payload.role;
          if (!['codex', 'openclaw', 'cursor', 'orchestrator'].includes(role)) {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: `无效角色: ${role}` }
            }));
            ws.close();
            return;
          }

          // 注册连接
          const oldConn = connections.get(role);
          if (oldConn) {
            console.log(`[Bridge] ${role} 重新连接（旧连接关闭）`);
            oldConn.ws.close();
          }

          connections.set(role, {
            ws,
            lastHeartbeat: Date.now(),
            currentTask: message.payload.current_task || null,
            currentPhase: message.payload.current_phase || null
          });

          console.log(`[Bridge] ${role} 已上线`);
          broadcast(createEnvelope('bridge', 'broadcast', 'presence.online', {
            role,
            message: `${role} 已上线`
          }));

          // 推送离线消息
          flushOfflineQueue(role);

          // 发送当前在线状态
          const onlineRoles = [];
          connections.forEach((_, r) => onlineRoles.push(r));
          ws.send(JSON.stringify(createEnvelope('bridge', role, 'presence.list', {
            online: onlineRoles
          })));
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            payload: { message: '请先发送 register 消息' }
          }));
        }
        return;
      }

      // 心跳消息
      if (message.type === 'heartbeat') {
        const conn = connections.get(role);
        if (conn) {
          conn.lastHeartbeat = Date.now();
          conn.currentTask = message.payload.current_task || conn.currentTask;
          conn.currentPhase = message.payload.current_phase || conn.currentPhase;
        }
        return;
      }

      // 封装为标准信封并路由
      const envelope = createEnvelope(
        role,
        message.to || 'broadcast',
        message.type,
        message.payload,
        message.reply_to || null
      );
      routeMessage(envelope);

    } catch (err) {
      console.error(`[Bridge] 消息解析错误: ${err.message}`);
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: `消息格式错误: ${err.message}` }
      }));
    }
  });

  ws.on('close', () => {
    if (role) {
      console.log(`[Bridge] ${role} 已离线`);
      connections.delete(role);
      broadcast(createEnvelope('bridge', 'broadcast', 'presence.offline', {
        role,
        message: `${role} 已离线`
      }));
    }
  });

  ws.on('error', (err) => {
    console.error(`[Bridge] ${role || '未知'} 连接错误: ${err.message}`);
  });
});

// ============================================================
// 心跳检测
// ============================================================
setInterval(() => {
  const now = Date.now();
  connections.forEach((conn, role) => {
    if (now - conn.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log(`[Bridge] ${role} 心跳超时，关闭连接`);
      conn.ws.close();
      connections.delete(role);
      broadcast(createEnvelope('bridge', 'broadcast', 'presence.offline', {
        role,
        message: `${role} 心跳超时，已离线`,
        reason: 'heartbeat_timeout'
      }));
    }
  });
}, HEARTBEAT_INTERVAL);

// ============================================================
// 状态查询 HTTP 端点（可选，方便调试）
// ============================================================
const http = require('http');
http.createServer((req, res) => {
  if (req.url === '/status') {
    const status = {};
    connections.forEach((conn, role) => {
      status[role] = {
        online: true,
        currentTask: conn.currentTask,
        currentPhase: conn.currentPhase,
        lastHeartbeat: new Date(conn.lastHeartbeat).toISOString()
      };
    });
    ['codex', 'openclaw', 'cursor'].forEach(role => {
      if (!status[role]) {
        status[role] = {
          online: false,
          offlineQueueLength: (offlineQueues.get(role) || []).length
        };
      }
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('IDE Bridge is running. WebSocket: ws://localhost:' + PORT);
  }
}).listen(PORT + 1, () => {
  console.log(`[Bridge] 状态查询: http://localhost:${PORT + 1}/status`);
});

console.log('[Bridge] 按 Ctrl+C 停止');
```

### 4.3 Agent 客户端 SDK（ide-bridge-client.js）

每个 IDE Agent 使用此客户端连接 Bridge：

```javascript
/**
 * IDE Bridge 客户端
 * 每个 IDE Agent 在启动时引入此模块，建立与 Bridge 的 WebSocket 连接
 *
 * 用法：
 *   const BridgeClient = require('./ide-bridge-client');
 *   const bridge = new BridgeClient('codex');
 *
 *   bridge.on('checkpoint.request', (msg) => { ... });
 *   bridge.send('openclaw', 'checkpoint.request', { checkpoint_id: 'cp_0', ... });
 */

const WebSocket = require('ws');

class BridgeClient {
  constructor(role, options = {}) {
    this.role = role;
    this.url = options.url || 'ws://localhost:9527';
    this.reconnectDelay = options.reconnectDelay || 2000;
    this.handlers = new Map();  // type → [callbacks]
    this.ws = null;
    this.connected = false;
    this.pendingMessages = [];  // 连接前的消息缓冲
    this.heartbeatTimer = null;
    this.currentTask = null;
    this.currentPhase = null;
  }

  // ---- 连接管理 ----

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      // 注册角色
      this.ws.send(JSON.stringify({
        type: 'register',
        payload: {
          role: this.role,
          current_task: this.currentTask,
          current_phase: this.currentPhase
        }
      }));

      // 发送缓冲消息
      this.pendingMessages.forEach(msg => this.ws.send(JSON.stringify(msg)));
      this.pendingMessages = [];

      // 启动心跳
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat();
      }, 5000);
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this._dispatch(msg);
      } catch (e) {
        console.error(`[BridgeClient:${this.role}] 消息解析失败:`, e.message);
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      clearInterval(this.heartbeatTimer);
      console.log(`[BridgeClient:${this.role}] 连接断开，${this.reconnectDelay}ms 后重连...`);
      setTimeout(() => this.connect(), this.reconnectDelay);
    });

    this.ws.on('error', (err) => {
      console.error(`[BridgeClient:${this.role}] 连接错误:`, err.message);
    });
  }

  // ---- 消息发送 ----

  send(to, type, payload, replyTo) {
    const msg = { to, type, payload, reply_to: replyTo };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pendingMessages.push(msg);
    }
  }

  sendHeartbeat() {
    this.send('bridge', 'heartbeat', {
      role: this.role,
      current_task: this.currentTask,
      current_phase: this.currentPhase,
      status: 'working'
    });
  }

  requestCheckpoint(checkpointId, phase, taskId, artifact, artifactPath) {
    this.send('openclaw', 'checkpoint.request', {
      checkpoint_id: checkpointId,
      phase,
      task_id: taskId,
      artifact,
      artifact_path: artifactPath
    });
  }

  replyCheckpoint(checkpointId, phase, taskId, result, automatedChecks, semanticReview) {
    this.send(this.lastRequestFrom || 'codex', 'checkpoint.result', {
      checkpoint_id: checkpointId,
      phase,
      task_id: taskId,
      result,
      automated_checks: automatedChecks,
      semantic_review: semanticReview
    });
  }

  // ---- 事件处理 ----

  on(type, callback) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type).push(callback);
  }

  off(type, callback) {
    const cbs = this.handlers.get(type);
    if (cbs) {
      this.handlers.set(type, cbs.filter(cb => cb !== callback));
    }
  }

  _dispatch(msg) {
    // 系统消息
    if (msg.type === 'presence.online') {
      console.log(`[BridgeClient:${this.role}] ${msg.payload.role} 已上线`);
    }
    if (msg.type === 'presence.offline') {
      console.log(`[BridgeClient:${this.role}] ${msg.payload.role} 已离线`);
    }

    // 记录最后请求者（用于回复路由）
    if (msg.envelope) {
      this.lastRequestFrom = msg.envelope.from;
    }

    // 分发到注册的处理器
    const type = msg.envelope ? msg.envelope.type : msg.type;
    const cbs = this.handlers.get(type) || [];
    cbs.forEach(cb => cb(msg));

    // 通配符处理器
    const wildcardCbs = this.handlers.get('*') || [];
    wildcardCbs.forEach(cb => cb(msg));
  }

  // ---- 状态更新 ----

  setTask(taskId) {
    this.currentTask = taskId;
  }

  setPhase(phase) {
    this.currentPhase = phase;
  }

  disconnect() {
    clearInterval(this.heartbeatTimer);
    if (this.ws) this.ws.close();
  }
}

module.exports = BridgeClient;
```

---

## 五、三 Agent 使用示例

### 5.1 Codex Agent 启动流程

```javascript
const BridgeClient = require('./ide-bridge-client');

const bridge = new BridgeClient('codex');
bridge.connect();

// 监听：收到审核结果
bridge.on('checkpoint.result', (msg) => {
  const { checkpoint_id, result, failure_details } = msg.payload;
  if (result === 'pass') {
    console.log(`✅ ${checkpoint_id} 通过，进入下一 Phase`);
    bridge.setPhase(bridge.currentPhase + 1);
    // 继续执行下一 Phase...
  } else {
    console.log(`❌ ${checkpoint_id} 不通过:`, failure_details);
    // 重做当前 Phase...
  }
});

// 监听：收到任务分配
bridge.on('task.assign', (msg) => {
  const { task_id, one_liner } = msg.payload;
  bridge.setTask(task_id);
  bridge.setPhase(1);
  console.log(`📋 收到任务: ${one_liner}`);
  // 开始执行 Phase 1...
  
  // Phase 1 完成后，请求审核
  bridge.requestCheckpoint('cp_0', 1, task_id, 'spec.json',
    `G:/_AI_Interop_Hub/collaboration/deliverables/${task_id}_research/spec.json`);
});

// 监听：在线状态
bridge.on('presence.online', (msg) => {
  console.log(`👋 ${msg.payload.role} 上线了`);
});
```

### 5.2 OpenClaw Agent 启动流程

```javascript
const BridgeClient = require('./ide-bridge-client');

const bridge = new BridgeClient('openclaw');
bridge.connect();

// 监听：收到审核请求
bridge.on('checkpoint.request', async (msg) => {
  const { checkpoint_id, phase, task_id, artifact_path } = msg.payload;
  console.log(`🔍 收到审核请求: ${checkpoint_id} (Phase ${phase})`);

  // 执行自动化检查
  const fs = require('fs');
  const artifact = JSON.parse(fs.readFileSync(artifact_path, 'utf-8'));
  const checks = performAutomatedChecks(checkpoint_id, artifact);

  // 回复审核结果
  const from = msg.envelope.from; // codex 或 cursor
  bridge.send(from, 'checkpoint.result', {
    checkpoint_id,
    phase,
    task_id,
    result: checks.allPassed ? 'pass' : 'fail',
    automated_checks: checks,
    semantic_review: {
      root_goal_consistent: true,
      contradictions_found: [],
      missing_dimensions: []
    },
    failure_details: checks.allPassed ? null : checks.failures
  });
});

function performAutomatedChecks(cpId, artifact) {
  // 根据 checkpoint_id 执行不同检查
  // （复用 V1.0 的检查逻辑）
  const checks = {};
  if (cpId === 'cp_0') {
    checks.file_exists = true;
    checks['44_fields_present'] = Object.keys(artifact.self_audit_log || {}).length >= 44;
    checks.inferred_ratio = artifact.self_audit_log?.inferred_ratio || 0;
    checks.inferred_under_30_percent = checks.inferred_ratio < 0.30;
    checks.goal_trace_present = !!artifact.goal_trace?.root_goal;
  }
  // ... 其他 cp 的检查

  checks.allPassed = Object.values(checks).every(v => v === true || (typeof v === 'number' && v < 0.30));
  if (!checks.allPassed) {
    checks.failures = Object.entries(checks)
      .filter(([, v]) => v === false)
      .map(([k]) => k);
  }
  return checks;
}
```

### 5.3 Cursor Agent 启动流程

```javascript
const BridgeClient = require('./ide-bridge-client');

const bridge = new BridgeClient('cursor');
bridge.connect();

// 监听：设计文档就绪（OpenClaw 审核通过后，codex 会发 phase.handoff）
bridge.on('phase.handoff', (msg) => {
  if (msg.payload.to_role === 'cursor') {
    console.log(`📦 收到设计文档，开始实现 Phase 6`);
    bridge.setTask(msg.payload.task_id);
    bridge.setPhase(6);
    // 读取设计文档，开始实现...
  }
});

// 监听：审核结果
bridge.on('checkpoint.result', (msg) => {
  const { checkpoint_id, result } = msg.payload;
  if (result === 'pass') {
    bridge.setPhase(bridge.currentPhase + 1);
  }
});

// 实现完成后
function onImplementationComplete(taskId) {
  bridge.send('broadcast', 'task.complete', {
    task_id: taskId,
    completed_by: 'cursor',
    output_path: `G:/_AI_Interop_Hub/collaboration/deliverables/${taskId}_research/`,
    summary: '8 Phase 全部完成'
  });
}
```

---

## 六、与 V1.0 的兼容迁移

### 6.1 双模运行

在过渡期，Bridge 同时支持两种模式：

```
Agent 启动时：
  1. 尝试连接 ws://localhost:9527
  2. 如果连接成功 → 使用 Bridge 实时模式
  3. 如果连接失败 → 回退到 V1.0 文件轮询模式
```

```javascript
// 兼容模式启动
const bridge = new BridgeClient(role);
bridge.connect();

// 无论 Bridge 是否连接，文件系统操作保持不变
// Bridge 仅用于通知，实际产物仍走文件系统
```

### 6.2 Bridge 内建文件监听

Bridge 可以监听文件变更，作为 V1.0 Agent 的"翻译层"：

```javascript
// ide-bridge.js 中的文件监听模块
const chokidar = require('chokidar'); // 或使用 fs.watch

chokidar.watch('G:/_AI_Interop_Hub/collaboration/deliverables/*/supervisor_checkpoints/', {
  ignored: /\.result$/,
  persistent: true
}).on('add', (filePath) => {
  if (filePath.endsWith('.pending')) {
    // V1.0 Agent 写入了 .pending 文件
    // Bridge 将其转换为实时消息推送给 OpenClaw
    const pendingData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    routeMessage(createEnvelope(
      pendingData.created_by,
      'openclaw',
      'checkpoint.request',
      pendingData
    ));
  }
});
```

---

## 七、与行业标准协议的对比

| 能力 | V1.0 文件轮询 | V2.0 IDE Bridge | MCP | A2A |
|------|-------------|----------------|-----|-----|
| 通信方式 | 文件系统轮询 | WebSocket 实时推送 | JSON-RPC | HTTP/gRPC |
| 延迟 | 5-10 秒 | < 1ms | < 10ms | < 50ms |
| 在线感知 | 心跳文件 | 原生心跳 | 连接状态 | 连接状态 |
| 离线缓冲 | 无 | 有（持久化队列） | 无 | 无 |
| 标准化 | 自定义 | 自定义（JSON 信封） | 行业标准 | 行业标准 |
| 适用场景 | 本地同一文件系统 | 本地同一机器 | Agent↔Tool | Agent↔Agent |
| 部署复杂度 | 零 | 启动一个 Node.js 进程 | 配置 MCP Server | 配置 A2A Server |

> **定位：** IDE Bridge 是本地场景下的轻量级实时通讯方案，解决"同一台电脑上三个 IDE 如何即时通讯"的问题。当需要跨机器或者与外部工具交互时，再升级到 MCP/A2A。

---

## 八、部署方案

### 8.1 启动 Bridge

```powershell
# Windows PowerShell
# 在 G:\_AI_Interop_Hub 目录下启动

# 首次安装依赖
cd G:\_AI_Interop_Hub
npm install ws

# 启动 Bridge（后台运行）
Start-Process -NoNewWindow node -ArgumentList "ide-bridge.js"

# 或者注册为 Windows 服务（开机自启）
```

### 8.2 启动三个 IDE

```powershell
# 每个 IDE 使用相同的项目目录
# Codex IDE:  打开 G:\_AI_Interop_Hub
# OpenClaw IDE: 打开 G:\_AI_Interop_Hub
# Cursor IDE: 打开 G:\_AI_Interop_Hub
```

### 8.3 验证连通性

```powershell
# 查看 Bridge 状态
curl http://localhost:9528/status

# 预期输出：
# {
#   "codex": { "online": true, "currentTask": "...", "currentPhase": 1 },
#   "openclaw": { "online": true, "currentTask": null, "currentPhase": null },
#   "cursor": { "online": false, "offlineQueueLength": 0 }
# }
```

---

## 九、与总纲体系的集成

### 9.1 文件位置

```
G:\_AI_Interop_Hub\
├── 00-governance\
│   ├── 开发总纲_可执行版.json
│   ├── 开发总纲_人类可读版.md
│   ├── ontology.json
│   ├── AGENT_INSTRUCTION.md
│   ├── orchestrator.js
│   ├── ide-bridge.js              ← 新增：消息中枢
│   ├── ide-bridge-client.js       ← 新增：客户端 SDK
│   └── 三IDE角色自动化联通协议_V2.0.md  ← 新增：本文档
├── collaboration\
│   ├── task_queue\
│   ├── deliverables\
│   └── reviews\
└── .ide-bridge-offline\           ← 新增：离线消息存储
```

### 9.2 与 AGENT_INSTRUCTION.md 的关系

`AGENT_INSTRUCTION.md` 中每个 Agent 的启动流程新增一步：

```markdown
### 启动任何任务前的完整流程（V3.7 更新）

1. 连接 IDE Bridge（ws://localhost:9527），注册角色
2. 读取 phase_gate_engine，执行门禁检查
3. 读取 ontology.json，获取本体定义
4. 读取 task_memory.json，检索相关记忆
5. 等待接收任务或继续当前任务
```

### 9.3 与 orchestrator.js 的关系

`orchestrator.js` 在创建任务后，通过 Bridge 推送任务（而非仅写入文件）：

```javascript
// orchestrator.js 新增
const BridgeClient = require('./ide-bridge-client');
const bridge = new BridgeClient('orchestrator');
bridge.connect();

// 创建任务后，实时推送给 Codex
bridge.send('codex', 'task.assign', {
  task_id: taskId,
  task_type: '创作类',
  one_liner: userInput
});

console.log(`任务已推送给 Codex: ${taskId}`);
```

---

## 十、总结

| 维度 | V1.0 文件轮询 | V2.0 IDE Bridge |
|------|-------------|----------------|
| 通信模型 | 轮询（Pull） | 推送（Push） |
| 延迟 | 5-10 秒 | < 1ms |
| 在线感知 | 心跳文件 | 原生 WebSocket 心跳 |
| 离线消息 | 无 | 持久化队列 |
| 部署 | 零依赖 | 需启动一个 Node.js 进程 |
| 调试 | 查看文件 | HTTP API + 日志 |
| 与 MCP 关系 | 无关 | 为未来 MCP 封装打基础 |

**核心理念：** 消息通知走 Bridge（实时），产物存储走文件系统（可靠）。Bridge 是"微信消息"，文件系统是"云盘"——两者各司其职，互补而非替代。