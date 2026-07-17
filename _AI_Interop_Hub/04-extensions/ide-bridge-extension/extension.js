/**
 * IDE Bridge — VS Code 插件主入口
 *
 * 功能：
 *   - 自动检测/启动 IDE Bridge 服务
 *   - 自动连接 Bridge 并注册角色
 *   - 侧边栏状态面板（在线角色 / 任务 / 消息日志）
 *   - 命令面板命令（启动任务/发消息/切换角色...）
 *   - 消息路由：Bridge ↔ Agent（通过工作区状态文件）
 */

const vscode = require('vscode');
const BridgeManager = require('./src/bridge-manager');
const StatusProvider = require('./src/status-provider');
const MessageBus = require('./src/message-bus');
const TaskController = require('./src/task-controller');
const { registerCommands } = require('./src/commands');

/** @type {BridgeManager} */
let bridgeManager;

/** @type {MessageBus} */
let messageBus;

/** @type {StatusProvider} */
let statusProvider;

/** @type {TaskController} */
let taskController;

let statusBarItem;
let messageLog = [];

/**
 * 插件激活入口
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('[IDE Bridge] 插件激活中...');

  const config = vscode.workspace.getConfiguration('ide-bridge');
  const role = config.get('role', '');

  // 如果没设角色，只显示提示，不启动通信
  if (!role) {
    vscode.window.showInformationMessage(
      '[IDE Bridge] 请在设置中配置当前 IDE 的角色（openclaw / codex / cursor）',
      '去设置'
    ).then(selection => {
      if (selection === '去设置') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'ide-bridge.role');
      }
    });
    createMinimalStatusBar(context);
    return;
  }

  // 初始化各模块
  bridgeManager = new BridgeManager({
    host: config.get('bridgeHost', 'localhost'),
    port: config.get('bridgePort', 9527),
    autoStart: config.get('autoStartBridge', true),
    bridgeScriptPath: config.get('bridgeScriptPath', ''),
    role,
    workspaceRoot: vscode.workspace.rootPath || process.cwd(),
  });

  messageBus = new MessageBus({
    workspaceRoot: vscode.workspace.rootPath || process.cwd(),
    role,
  });

  statusProvider = new StatusProvider({
    role,
    getStatus: () => bridgeManager.getConnectionStatus(),
    getOnlineRoles: () => bridgeManager.getOnlineRoles(),
    getCurrentTask: () => taskController ? taskController.getCurrentTask() : null,
    getMessageLog: () => messageLog,
  });

  taskController = new TaskController({
    role,
    bridgeManager,
    workspaceRoot: vscode.workspace.rootPath || process.cwd(),
  });

  // 注册侧边栏视图
  vscode.window.registerTreeDataProvider('ide-bridge.status', statusProvider.getStatusTreeProvider());
  vscode.window.registerTreeDataProvider('ide-bridge.tasks', statusProvider.getTaskTreeProvider());
  vscode.window.registerTreeDataProvider('ide-bridge.messages', statusProvider.getMessageTreeProvider());

  // 状态栏
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = `$(sync~spin) Bridge 连接中...`;
  statusBarItem.tooltip = 'IDE Bridge 正在连接...';
  statusBarItem.show();

  // Bridge 事件监听
  bridgeManager.on('connected', () => {
    updateStatusBar('connected');
    statusProvider.refresh();
    vscode.window.showInformationMessage(`[IDE Bridge] 已连接，角色：${role}`);
  });

  bridgeManager.on('disconnected', () => {
    updateStatusBar('disconnected');
    statusProvider.refresh();
  });

  bridgeManager.on('online-roles-updated', () => {
    statusProvider.refresh();
  });

  bridgeManager.on('message', (msg) => {
    // 记录日志
    messageLog.unshift({
      time: new Date().toLocaleTimeString(),
      from: msg.envelope?.from || msg.from || 'unknown',
      type: msg.envelope?.type || msg.type || 'unknown',
      summary: summarizeMessage(msg),
    });
    if (messageLog.length > 50) messageLog.pop();

    // 路由给 Agent（写状态文件）
    messageBus.deliverMessage(msg);

    // 更新任务控制器状态
    const msgType = msg.envelope?.type || msg.type;
    const msgFrom = msg.envelope?.from || msg.from;
    const msgPayload = msg.payload || {};

    if (taskController) {
      if (msgType === 'task.assign' || msgType === 'task.delegate') {
        taskController.onTaskAssigned(msgPayload);
      }
      if (msgType === 'checkpoint.request' && taskController.role === 'openclaw') {
        taskController.onCheckpointRequest(msgFrom, msgPayload);
      }
    }

    // 更新面板
    statusProvider.refresh();

    // 重要消息弹通知
    if (isImportantMessage(msg)) {
      vscode.window.showInformationMessage(
        `[Bridge] ${formatNotification(msg)}`
      );
    }
  });

  bridgeManager.on('error', (err) => {
    updateStatusBar('error');
    vscode.window.showErrorMessage(`[IDE Bridge] 连接错误: ${err.message}`);
  });

  // 注册命令
  registerCommands(context, {
    bridgeManager,
    messageBus,
    taskController,
    statusProvider,
    getMessageLog: () => messageLog,
  });

  // 启动连接
  bridgeManager.connect();

  // 监听配置变更
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ide-bridge.role')) {
        vscode.window.showInformationMessage('[IDE Bridge] 角色已变更，请重启 IDE 生效');
      }
    })
  );

  console.log('[IDE Bridge] 插件激活完成');
}

/**
 * 更新状态栏
 */
function updateStatusBar(state) {
  if (!statusBarItem) return;
  const config = vscode.workspace.getConfiguration('ide-bridge');
  const role = config.get('role', '');
  const roleLabel = {
    openclaw: '协调者',
    codex: '研究员',
    cursor: '开发者',
  }[role] || role;

  switch (state) {
    case 'connected':
      statusBarItem.text = `$(check) Bridge ${roleLabel}`;
      statusBarItem.tooltip = 'IDE Bridge 已连接';
      statusBarItem.color = new vscode.ThemeColor('statusBar.foreground');
      break;
    case 'disconnected':
      statusBarItem.text = `$(debug-disconnect) Bridge 离线`;
      statusBarItem.tooltip = 'IDE Bridge 已断开连接';
      statusBarItem.color = new vscode.ThemeColor('errorForeground');
      break;
    case 'error':
      statusBarItem.text = `$(error) Bridge 错误`;
      statusBarItem.tooltip = 'IDE Bridge 连接错误';
      statusBarItem.color = new vscode.ThemeColor('errorForeground');
      break;
    default:
      statusBarItem.text = `$(sync~spin) Bridge 连接中...`;
      statusBarItem.tooltip = 'IDE Bridge 正在连接...';
  }
}

/**
 * 极简状态栏（未设置角色时）
 */
function createMinimalStatusBar(context) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.text = `$(circle-slash) Bridge 未配置`;
  item.tooltip = '点击配置角色';
  item.command = 'ide-bridge.switchRole';
  item.show();
  context.subscriptions.push(item);

  // 也要注册命令和视图，避免报错
  statusProvider = new StatusProvider({
    role: '',
    getStatus: () => 'unconfigured',
    getOnlineRoles: () => [],
    getCurrentTask: () => null,
    getMessageLog: () => [],
  });
  vscode.window.registerTreeDataProvider('ide-bridge.status', statusProvider.getStatusTreeProvider());
  vscode.window.registerTreeDataProvider('ide-bridge.tasks', statusProvider.getTaskTreeProvider());
  vscode.window.registerTreeDataProvider('ide-bridge.messages', statusProvider.getMessageTreeProvider());

  registerCommands(context, {
    bridgeManager: null,
    messageBus: null,
    taskController: null,
    statusProvider,
    getMessageLog: () => [],
  });
}

/**
 * 判断消息是否重要（需要弹通知）
 */
function isImportantMessage(msg) {
  const type = msg.envelope?.type || msg.type;
  return [
    'task.assign',
    'task.delegate',
    'task.complete',
    'error.blocked',
    'error.user_escalation',
  ].includes(type);
}

/**
 * 格式化通知文本
 */
function formatNotification(msg) {
  const type = msg.envelope?.type || msg.type;
  const from = msg.envelope?.from || msg.from || '';
  const payload = msg.payload || {};

  switch (type) {
    case 'task.assign':
      return `新任务分配: ${payload.task_id || ''}`;
    case 'task.delegate':
      return `实现任务下发: ${payload.task_id || ''}`;
    case 'task.complete':
      return `任务完成: ${payload.summary || payload.task_id || ''}`;
    case 'error.blocked':
      return `⚠️  阻断: ${payload.reason || '未知原因'}`;
    case 'error.user_escalation':
      return `🔔 需要人工介入: ${payload.reason || ''}`;
    default:
      return `收到 ${type}`;
  }
}

/**
 * 消息摘要（用于日志列表）
 */
function summarizeMessage(msg) {
  const type = msg.envelope?.type || msg.type;
  const payload = msg.payload || {};

  switch (type) {
    case 'checkpoint.request':
      return `Phase ${payload.phase || '?'} ${payload.phase_name || ''}`;
    case 'checkpoint.result':
      return `${payload.result || '?'} — Phase ${payload.phase || '?'}`;
    case 'task.assign':
    case 'task.delegate':
      return payload.task_id || '';
    case 'task.complete':
      return payload.summary || payload.task_id || '';
    case 'error.blocked':
      return payload.reason || '阻断';
    case 'presence.online':
      return `${payload.role || '?'} 上线`;
    case 'presence.offline':
      return `${payload.role || '?'} 离线`;
    default:
      return type;
  }
}

function deactivate() {
  if (bridgeManager) bridgeManager.disconnect();
  if (statusBarItem) statusBarItem.dispose();
  console.log('[IDE Bridge] 插件已停用');
}

module.exports = {
  activate,
  deactivate,
};
