/**
 * Bridge Manager — Bridge 服务管理
 *
 * 功能：
 *   - 检测本地 Bridge 是否在运行
 *   - 自动启动 Bridge 进程（可选）
 *   - WebSocket 连接/重连
 *   - 角色注册
 *   - 在线角色列表维护
 *   - 消息收发
 *   - 事件回调
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class BridgeManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.host = options.host || 'localhost';
    this.port = options.port || 9527;
    this.autoStart = options.autoStart !== false;
    this.bridgeScriptPath = options.bridgeScriptPath || '';
    this.role = options.role || '';
    this.workspaceRoot = options.workspaceRoot || process.cwd();

    this.ws = null;
    this.bridgeProcess = null;
    this.onlineRoles = [];
    this.connectionStatus = 'disconnected'; // disconnected / connecting / connected / error
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  /**
   * 连接 Bridge
   */
  async connect() {
    this.connectionStatus = 'connecting';
    this.emit('status-change', 'connecting');

    // 先尝试直接连接
    try {
      await this._tryConnect();
      return;
    } catch (err) {
      console.log('[BridgeManager] 直接连接失败:', err.message);
    }

    // 自动启动 Bridge
    if (this.autoStart) {
      console.log('[BridgeManager] 尝试启动本地 Bridge...');
      try {
        await this._startBridge();
        // 等一下让它启动
        await new Promise(r => setTimeout(r, 1500));
        await this._tryConnect();
        return;
      } catch (err) {
        console.log('[BridgeManager] 启动 Bridge 失败:', err.message);
      }
    }

    // 连接失败，启动重连
    this._scheduleReconnect();
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }

    if (this.bridgeProcess) {
      try { this.bridgeProcess.kill(); } catch (e) {}
      this.bridgeProcess = null;
    }

    this.connectionStatus = 'disconnected';
    this.emit('status-change', 'disconnected');
  }

  /**
   * 尝试连接 WebSocket
   */
  _tryConnect() {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.host}:${this.port}`;
      console.log(`[BridgeManager] 正在连接 ${url}...`);

      const ws = new WebSocket(url);
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new Error('连接超时'));
        }
      }, 3000);

      ws.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        this.ws = ws;
        this.connectionStatus = 'connected';
        this.reconnectAttempts = 0;

        console.log('[BridgeManager] WebSocket 已连接');

        // 注册角色
        this._register();

        // 设置消息监听
        this._setupMessageHandler();

        this.emit('connected');
        resolve();
      });

      ws.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * 注册角色
   */
  _register() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      type: 'register',
      payload: {
        role: this.role,
        name: this.role.toUpperCase(),
      }
    }));

    console.log(`[BridgeManager] 已注册角色: ${this.role}`);
  }

  /**
   * 设置消息处理
   */
  _setupMessageHandler() {
    if (!this.ws) return;

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const type = msg.envelope?.type || msg.type;

        // 处理 presence.list（获取在线角色列表）
        if (type === 'presence.list' && msg.payload?.online) {
          this.onlineRoles = msg.payload.online;
          this.emit('online-roles-updated', this.onlineRoles);
        }

        // 处理 presence.online
        if (type === 'presence.online' && msg.payload?.role) {
          if (!this.onlineRoles.includes(msg.payload.role)) {
            this.onlineRoles.push(msg.payload.role);
          }
          this.emit('online-roles-updated', this.onlineRoles);
        }

        // 处理 presence.offline
        if (type === 'presence.offline' && msg.payload?.role) {
          this.onlineRoles = this.onlineRoles.filter(r => r !== msg.payload.role);
          this.emit('online-roles-updated', this.onlineRoles);
        }

        // 转发所有消息
        this.emit('message', msg);
      } catch (err) {
        console.error('[BridgeManager] 消息解析失败:', err.message);
      }
    });

    this.ws.on('close', () => {
      console.log('[BridgeManager] WebSocket 断开');
      this.connectionStatus = 'disconnected';
      this.emit('disconnected');
      this._scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[BridgeManager] WebSocket 错误:', err.message);
      this.emit('error', err);
    });
  }

  /**
   * 启动本地 Bridge 进程
   */
  _startBridge() {
    return new Promise((resolve, reject) => {
      const scriptPath = this._findBridgeScript();
      if (!scriptPath) {
        reject(new Error('找不到 ide-bridge.js'));
        return;
      }

      console.log(`[BridgeManager] 启动 Bridge: ${scriptPath}`);

      const proc = spawn('node', [scriptPath], {
        cwd: path.dirname(scriptPath),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        console.log('[Bridge]', text.trim());
        // 检测到启动成功标志
        if (text.includes('监听端口') || text.includes('IDE Bridge')) {
          this.bridgeProcess = proc;
          resolve();
        }
      });

      proc.stderr.on('data', (data) => {
        console.error('[Bridge ERR]', data.toString().trim());
      });

      proc.on('error', (err) => {
        reject(err);
      });

      proc.on('exit', (code) => {
        console.log(`[BridgeManager] Bridge 进程退出，code=${code}`);
        this.bridgeProcess = null;
      });

      // 超时
      setTimeout(() => {
        if (!this.bridgeProcess) {
          reject(new Error('Bridge 启动超时'));
        }
      }, 5000);
    });
  }

  /**
   * 查找 ide-bridge.js 路径
   */
  _findBridgeScript() {
    // 1. 配置中指定的路径
    if (this.bridgeScriptPath && fs.existsSync(this.bridgeScriptPath)) {
      return this.bridgeScriptPath;
    }

    // 2. 工作区根目录
    const p1 = path.join(this.workspaceRoot, 'ide-bridge.js');
    if (fs.existsSync(p1)) return p1;

    // 3. 工作区 00-governance 目录
    const p2 = path.join(this.workspaceRoot, '00-governance', 'ide-bridge.js');
    if (fs.existsSync(p2)) return p2;

    // 4. 插件目录
    const p3 = path.join(__dirname, '..', 'ide-bridge.js');
    if (fs.existsSync(p3)) return p3;

    return null;
  }

  /**
   * 重连调度
   */
  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[BridgeManager] 达到最大重连次数，停止重连');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

    console.log(`[BridgeManager] ${delay / 1000}s 后第 ${this.reconnectAttempts} 次重连...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectionStatus = 'connecting';
      this._tryConnect().catch(() => {
        // 失败会自动触发下一次重连（通过 close 事件）
      });
    }, delay);
  }

  /**
   * 发送消息
   */
  sendMessage(to, type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[BridgeManager] WebSocket 未连接，消息未发送');
      return false;
    }

    const msg = {
      type,
      from: this.role,
      to,
      payload,
    };

    this.ws.send(JSON.stringify(msg));
    return true;
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    return this.connectionStatus;
  }

  /**
   * 获取在线角色列表
   */
  getOnlineRoles() {
    return [...this.onlineRoles];
  }

  /**
   * 重启 Bridge
   */
  async restart() {
    this.disconnect();
    await new Promise(r => setTimeout(r, 500));
    this.reconnectAttempts = 0;
    await this.connect();
  }
}

module.exports = BridgeManager;
