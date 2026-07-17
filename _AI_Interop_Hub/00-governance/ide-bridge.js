#!/usr/bin/env node

/**
 * IDE Bridge V2.0 — 三 IDE 实时通讯消息中枢
 *
 * 用法：
 *   node ide-bridge.js                    # 默认端口 9527
 *   node ide-bridge.js --port 9999        # 自定义端口
 *
 * WebSocket 连接：ws://localhost:9527
 * 状态查询：     http://localhost:9528/status
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

// ============================================================
// 配置
// ============================================================
const PORT = parseInt(process.argv[process.argv.indexOf('--port') + 1]) || 9527;
const HEARTBEAT_TIMEOUT = 15000;
const OFFLINE_QUEUE_DIR = path.join(__dirname, '.ide-bridge-offline');

// ============================================================
// 在线状态与离线队列
// ============================================================
const connections = new Map();
const offlineQueues = new Map();

if (!fs.existsSync(OFFLINE_QUEUE_DIR)) {
  fs.mkdirSync(OFFLINE_QUEUE_DIR, { recursive: true });
}

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
// 消息工具
// ============================================================
function createEnvelope(from, to, type, payload, replyTo) {
  return {
    envelope: {
      msg_id: `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      from, to, type,
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
  fs.writeFileSync(
    path.join(OFFLINE_QUEUE_DIR, `${role}.json`),
    JSON.stringify(queue, null, 2)
  );
}

function flushOfflineQueue(role) {
  const queue = offlineQueues.get(role) || [];
  if (queue.length === 0) return;
  const conn = connections.get(role);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) return;
  console.log(`[Bridge] 推送 ${queue.length} 条离线消息给 ${role}`);
  queue.forEach(msg => conn.ws.send(JSON.stringify(msg)));
  offlineQueues.set(role, []);
  fs.writeFileSync(path.join(OFFLINE_QUEUE_DIR, `${role}.json`), '[]');
}

function broadcast(message, excludeRole) {
  connections.forEach((conn, role) => {
    if (role !== excludeRole && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message));
    }
  });
}

function routeMessage(envelope) {
  const { to, type } = envelope.envelope;
  console.log(`[Bridge] ${envelope.envelope.from} → ${to} [${type}]`);
  if (to === 'broadcast') {
    broadcast(envelope);
    return;
  }
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

console.log('═'.repeat(56));
console.log('  IDE Bridge V2.0 — 三 IDE 实时通讯消息中枢');
console.log('═'.repeat(56));
console.log(`  WebSocket:  ws://localhost:${PORT}`);
console.log(`  状态查询:  http://localhost:${PORT + 1}/status`);
console.log(`  离线队列:  ${OFFLINE_QUEUE_DIR}`);
console.log('═'.repeat(56));
console.log('  等待 IDE Agent 连接...');
console.log('');

wss.on('connection', (ws, req) => {
  let role = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      // 第一条消息必须是注册
      if (!role) {
        if (message.type === 'register') {
          role = message.payload.role;
          if (!['codex', 'openclaw', 'cursor', 'orchestrator'].includes(role)) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: `无效角色: ${role}` } }));
            ws.close();
            return;
          }

          const oldConn = connections.get(role);
          if (oldConn) {
            console.log(`[Bridge] ${role} 重新连接（关闭旧连接）`);
            oldConn.ws.close();
          }

          connections.set(role, {
            ws,
            lastHeartbeat: Date.now(),
            currentTask: message.payload.current_task || null,
            currentPhase: message.payload.current_phase || null
          });

          console.log(`[Bridge] ✅ ${role} 已上线`);
          broadcast(createEnvelope('bridge', 'broadcast', 'presence.online', {
            role,
            message: `${role} 已上线`
          }));

          flushOfflineQueue(role);

          const onlineRoles = [];
          connections.forEach((_, r) => onlineRoles.push(r));
          ws.send(JSON.stringify(createEnvelope('bridge', role, 'presence.list', {
            online: onlineRoles
          })));
        } else {
          ws.send(JSON.stringify({ type: 'error', payload: { message: '请先发送 register 消息' } }));
        }
        return;
      }

      // 心跳
      if (message.type === 'heartbeat') {
        const conn = connections.get(role);
        if (conn) {
          conn.lastHeartbeat = Date.now();
          conn.currentTask = message.payload.current_task || conn.currentTask;
          conn.currentPhase = message.payload.current_phase || conn.currentPhase;
        }
        return;
      }

      // 路由消息
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
      ws.send(JSON.stringify({ type: 'error', payload: { message: `消息格式错误: ${err.message}` } }));
    }
  });

  ws.on('close', () => {
    if (role) {
      console.log(`[Bridge] ❌ ${role} 已离线`);
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
      console.log(`[Bridge] ⏰ ${role} 心跳超时，关闭连接`);
      conn.ws.close();
      connections.delete(role);
      broadcast(createEnvelope('bridge', 'broadcast', 'presence.offline', {
        role,
        message: `${role} 心跳超时，已离线`,
        reason: 'heartbeat_timeout'
      }));
    }
  });
}, 5000);

// ============================================================
// HTTP 状态端点
// ============================================================
http.createServer((req, res) => {
  if (req.url === '/status') {
    const status = {};
    ['codex', 'openclaw', 'cursor'].forEach(role => {
      const conn = connections.get(role);
      status[role] = {
        online: !!conn,
        currentTask: conn ? conn.currentTask : null,
        currentPhase: conn ? conn.currentPhase : null,
        lastHeartbeat: conn ? new Date(conn.lastHeartbeat).toISOString() : null,
        offlineQueueLength: (offlineQueues.get(role) || []).length
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(status, null, 2));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('IDE Bridge V2.0 运行中\nWebSocket: ws://localhost:' + PORT + '\n状态查询: http://localhost:' + (PORT + 1) + '/status');
  }
}).listen(PORT + 1);

process.on('SIGINT', () => {
  console.log('\n[Bridge] 正在关闭...');
  wss.close();
  process.exit(0);
});