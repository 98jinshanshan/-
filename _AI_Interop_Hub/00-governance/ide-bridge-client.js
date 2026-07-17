#!/usr/bin/env node

/**
 * IDE Bridge 客户端 SDK
 *
 * 每个 IDE Agent 在启动时引入此模块，建立与 Bridge 的 WebSocket 连接。
 *
 * 用法：
 *   const BridgeClient = require('./ide-bridge-client');
 *   const bridge = new BridgeClient('codex');
 *
 *   bridge.on('checkpoint.result', (msg) => { ... });
 *   bridge.send('openclaw', 'checkpoint.request', { ... });
 *
 * 支持的方法：
 *   connect()              — 连接 Bridge
 *   send(to, type, payload) — 发送消息
 *   on(type, callback)     — 监听消息
 *   requestCheckpoint(...) — 快捷：请求审核
 *   replyCheckpoint(...)   — 快捷：回复审核结果
 *   setTask(id) / setPhase(n) — 更新当前状态
 *   disconnect()           — 断开连接
 */

const WebSocket = require('ws');

class BridgeClient {
  constructor(role, options = {}) {
    this.role = role;
    this.url = options.url || 'ws://localhost:9527';
    this.reconnectDelay = options.reconnectDelay || 2000;
    this.handlers = new Map();
    this.ws = null;
    this.connected = false;
    this.pendingMessages = [];
    this.heartbeatTimer = null;
    this.currentTask = null;
    this.currentPhase = null;
    this.lastRequestFrom = null;
  }

  // ============================================================
  // 连接管理
  // ============================================================

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.connected = true;
      this.ws.send(JSON.stringify({
        type: 'register',
        payload: {
          role: this.role,
          current_task: this.currentTask,
          current_phase: this.currentPhase
        }
      }));

      // 发送连接前缓冲的消息
      this.pendingMessages.forEach(msg => this.ws.send(JSON.stringify(msg)));
      this.pendingMessages = [];

      // 启动心跳
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat();
      }, 5000);

      if (process.env.BRIDGE_DEBUG) {
        console.log(`[BridgeClient:${this.role}] ✅ 已连接`);
      }
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
      if (process.env.BRIDGE_DEBUG) {
        console.log(`[BridgeClient:${this.role}] 连接断开，${this.reconnectDelay}ms 后重连...`);
      }
      setTimeout(() => this.connect(), this.reconnectDelay);
    });

    this.ws.on('error', (err) => {
      console.error(`[BridgeClient:${this.role}] 连接错误:`, err.message);
    });
  }

  // ============================================================
  // 消息发送
  // ============================================================

  send(to, type, payload, replyTo) {
    const msg = { to, type, payload, reply_to: replyTo || null };
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

  // ============================================================
  // 快捷方法
  // ============================================================

  requestCheckpoint(checkpointId, phase, taskId, artifact, artifactPath, checksRequired) {
    this.send('openclaw', 'checkpoint.request', {
      checkpoint_id: checkpointId,
      phase,
      task_id: taskId,
      artifact,
      artifact_path: artifactPath,
      checks_required: checksRequired || []
    });
  }

  replyCheckpoint(checkpointId, phase, taskId, result, automatedChecks, semanticReview, failureDetails) {
    const target = this.lastRequestFrom || 'codex';
    this.send(target, 'checkpoint.result', {
      checkpoint_id: checkpointId,
      phase,
      task_id: taskId,
      result,
      automated_checks: automatedChecks || {},
      semantic_review: semanticReview || {},
      failure_details: failureDetails || null
    });
  }

  announcePhaseComplete(taskId, fromPhase, toPhase, toRole) {
    this.send('openclaw', 'phase.handoff', {
      task_id: taskId,
      from_phase: fromPhase,
      to_phase: toPhase,
      from_role: this.role,
      to_role: toRole || this.role,
      handoff_data: { gate_check_passed: true }
    });
  }

  announceTaskComplete(taskId, outputPath, summary) {
    this.send('broadcast', 'task.complete', {
      task_id: taskId,
      completed_by: this.role,
      output_path: outputPath,
      summary
    });
  }

  reportBlocked(taskId, phase, reason, detail) {
    this.send('broadcast', 'error.blocked', {
      task_id: taskId,
      phase,
      role: this.role,
      reason,
      detail
    });
  }

  // ============================================================
  // 事件处理
  // ============================================================

  on(type, callback) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type).push(callback);
  }

  once(type, callback) {
    const wrapper = (msg) => {
      callback(msg);
      this.off(type, wrapper);
    };
    this.on(type, wrapper);
  }

  off(type, callback) {
    const cbs = this.handlers.get(type);
    if (cbs) {
      this.handlers.set(type, cbs.filter(cb => cb !== callback));
    }
  }

  _dispatch(msg) {
    // 记录最后请求者（用于回复路由）
    if (msg.envelope && msg.envelope.from) {
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

  // ============================================================
  // 状态更新
  // ============================================================

  setTask(taskId) {
    this.currentTask = taskId;
  }

  setPhase(phase) {
    this.currentPhase = phase;
  }

  disconnect() {
    clearInterval(this.heartbeatTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

module.exports = BridgeClient;

// ============================================================
// 如果直接运行，则启动连接测试
// ============================================================
if (require.main === module) {
  const role = process.argv[2] || 'test';
  console.log(`BridgeClient 测试模式 — 角色: ${role}`);

  const bridge = new BridgeClient(role);
  bridge.connect();

  bridge.on('*', (msg) => {
    console.log(`[${role}] 收到消息:`, JSON.stringify(msg.envelope || msg, null, 2));
  });

  bridge.on('presence.online', (msg) => {
    console.log(`[${role}] 👋 ${msg.payload.role} 上线了`);
  });

  bridge.on('presence.offline', (msg) => {
    console.log(`[${role}] 👋 ${msg.payload.role} 离线了`);
  });

  // 保持进程运行
  process.on('SIGINT', () => {
    bridge.disconnect();
    process.exit(0);
  });
}