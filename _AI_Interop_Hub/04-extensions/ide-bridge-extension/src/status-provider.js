/**
 * Status Provider — 侧边栏面板数据提供
 *
 * 三个面板：
 *   1. 状态面板 — 连接状态 / 在线角色 / 我的角色
 *   2. 任务面板 — 当前任务 / 待审核 / 任务进度
 *   3. 消息日志面板 — 最近消息列表
 */

const vscode = require('vscode');

class StatusProvider {
  constructor(options = {}) {
    this.role = options.role || '';
    this.getStatus = options.getStatus || (() => 'disconnected');
    this.getOnlineRoles = options.getOnlineRoles || (() => []);
    this.getCurrentTask = options.getCurrentTask || (() => null);
    this.getMessageLog = options.getMessageLog || (() => []);

    this._statusEmitter = new vscode.EventEmitter();
    this._taskEmitter = new vscode.EventEmitter();
    this._messageEmitter = new vscode.EventEmitter();
  }

  /**
   * 刷新所有面板
   */
  refresh() {
    this._statusEmitter.fire();
    this._taskEmitter.fire();
    this._messageEmitter.fire();
  }

  // ============================================================
  // 1. 状态面板
  // ============================================================

  getStatusTreeProvider() {
    const self = this;
    return {
      onDidChangeTreeData: this._statusEmitter.event,

      getTreeItem(element) {
        return element;
      },

      getChildren(element) {
        if (!element) {
          return self._getStatusRootItems();
        }
        return element.children || [];
      }
    };
  }

  _getStatusRootItems() {
    const items = [];
    const status = this.getStatus();
    const role = this.role;
    const roleLabel = this._getRoleLabel(role);
    const onlineRoles = this.getOnlineRoles();

    // 我的角色
    const roleItem = new vscode.TreeItem(
      `我的角色: ${roleLabel || '未设置'}`,
      vscode.TreeItemCollapsibleState.None
    );
    roleItem.iconPath = new vscode.ThemeIcon(this._getRoleIcon(role));
    roleItem.description = role ? this._getRoleDesc(role) : '点击配置';
    roleItem.command = role ? undefined : {
      command: 'ide-bridge.switchRole',
      title: '切换角色'
    };
    items.push(roleItem);

    // 连接状态
    const statusItem = new vscode.TreeItem(
      `连接状态: ${this._getStatusLabel(status)}`,
      vscode.TreeItemCollapsibleState.None
    );
    statusItem.iconPath = new vscode.ThemeIcon(this._getStatusIcon(status));
    items.push(statusItem);

    // 在线角色（可展开）
    const onlineItem = new vscode.TreeItem(
      `在线角色 (${onlineRoles.length})`,
      onlineRoles.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    );
    onlineItem.iconPath = new vscode.ThemeIcon('account');
    onlineItem.children = onlineRoles.map(r => {
      const child = new vscode.TreeItem(
        this._getRoleLabel(r),
        vscode.TreeItemCollapsibleState.None
      );
      child.iconPath = new vscode.ThemeIcon(this._getRoleIcon(r));
      child.description = r === role ? '(我)' : '';
      child.contextValue = 'online-role';
      return child;
    });
    if (onlineRoles.length === 0) {
      const empty = new vscode.TreeItem(
        '暂无在线角色',
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon('circle-outline');
      empty.description = '等待其他 IDE 连接...';
      onlineItem.children = [empty];
    }
    items.push(onlineItem);

    // 操作区
    const actionsItem = new vscode.TreeItem(
      '快捷操作',
      vscode.TreeItemCollapsibleState.Expanded
    );
    actionsItem.iconPath = new vscode.ThemeIcon('tools');
    actionsItem.children = [
      this._makeActionItem('重启 Bridge 服务', 'debug-restart', 'ide-bridge.restartBridge'),
      this._makeActionItem('切换角色', 'account', 'ide-bridge.switchRole'),
      this._makeActionItem('查看消息日志', 'output', 'ide-bridge.showMessageLog'),
    ];
    items.push(actionsItem);

    return items;
  }

  _makeActionItem(label, icon, command) {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(icon);
    item.command = { command, title: label };
    item.contextValue = 'action-item';
    return item;
  }

  // ============================================================
  // 2. 任务面板
  // ============================================================

  getTaskTreeProvider() {
    const self = this;
    return {
      onDidChangeTreeData: this._taskEmitter.event,

      getTreeItem(element) {
        return element;
      },

      getChildren(element) {
        if (!element) {
          return self._getTaskRootItems();
        }
        return element.children || [];
      }
    };
  }

  _getTaskRootItems() {
    const items = [];
    const task = this.getCurrentTask();
    const role = this.role;

    if (!task) {
      const empty = new vscode.TreeItem(
        '暂无进行中的任务',
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon('tasklist');
      empty.description = role === 'openclaw' ? '点击启动任务' : '等待任务分配...';
      if (role === 'openclaw') {
        empty.command = {
          command: 'ide-bridge.startTask',
          title: '启动任务'
        };
      }
      items.push(empty);
      return items;
    }

    // 当前任务
    const taskItem = new vscode.TreeItem(
      `当前任务: ${task.task_id || '未命名'}`,
      vscode.TreeItemCollapsibleState.Expanded
    );
    taskItem.iconPath = new vscode.ThemeIcon('play-circle');
    taskItem.children = [];

    // 任务详情
    if (task.task_type) {
      const typeItem = new vscode.TreeItem(
        `类型: ${task.task_type}`,
        vscode.TreeItemCollapsibleState.None
      );
      typeItem.iconPath = new vscode.ThemeIcon('tag');
      taskItem.children.push(typeItem);
    }

    if (task.status) {
      const statusItem = new vscode.TreeItem(
        `状态: ${this._getTaskStatusLabel(task.status)}`,
        vscode.TreeItemCollapsibleState.None
      );
      statusItem.iconPath = new vscode.ThemeIcon(
        task.status === 'completed' ? 'pass' :
        task.status === 'blocked' ? 'error' : 'sync~spin'
      );
      taskItem.children.push(statusItem);
    }

    if (task.assigned_at) {
      const timeItem = new vscode.TreeItem(
        `分配时间: ${this._formatTime(task.assigned_at)}`,
        vscode.TreeItemCollapsibleState.None
      );
      timeItem.iconPath = new vscode.ThemeIcon('clock');
      taskItem.children.push(timeItem);
    }

    items.push(taskItem);

    // 任务操作
    if (role === 'openclaw') {
      const actions = new vscode.TreeItem(
        '任务操作',
        vscode.TreeItemCollapsibleState.Collapsed
      );
      actions.iconPath = new vscode.ThemeIcon('gear');
      actions.children = [
        this._makeActionItem('分配新任务', 'add', 'ide-bridge.startTask'),
      ];
      items.push(actions);
    }

    return items;
  }

  // ============================================================
  // 3. 消息日志面板
  // ============================================================

  getMessageTreeProvider() {
    const self = this;
    return {
      onDidChangeTreeData: this._messageEmitter.event,

      getTreeItem(element) {
        return element;
      },

      getChildren(element) {
        if (!element) {
          return self._getMessageItems();
        }
        return [];
      }
    };
  }

  _getMessageItems() {
    const log = this.getMessageLog() || [];

    if (log.length === 0) {
      const empty = new vscode.TreeItem(
        '暂无消息',
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon('comment');
      empty.description = '等待消息...';
      return [empty];
    }

    return log.map(entry => {
      const item = new vscode.TreeItem(
        `[${entry.time}] ${this._getRoleLabel(entry.from)} → ${entry.type}`,
        vscode.TreeItemCollapsibleState.None
      );
      item.iconPath = new vscode.ThemeIcon(this._getMessageIcon(entry.type));
      item.description = entry.summary || '';
      item.tooltip = `${entry.type}\n来自: ${entry.from}\n时间: ${entry.time}\n摘要: ${entry.summary || ''}`;
      return item;
    });
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  _getRoleLabel(role) {
    const map = {
      openclaw: 'OpenClaw (协调者)',
      codex: 'Codex (研究员)',
      cursor: 'Cursor (开发者)',
    };
    return map[role] || role || '未设置';
  }

  _getRoleIcon(role) {
    const map = {
      openclaw: 'organization',
      codex: 'search',
      cursor: 'code',
    };
    return map[role] || 'circle-outline';
  }

  _getRoleDesc(role) {
    const map = {
      openclaw: '项目经理',
      codex: '去程设计',
      cursor: '回程实现',
    };
    return map[role] || '';
  }

  _getStatusLabel(status) {
    const map = {
      connected: '已连接',
      connecting: '连接中...',
      disconnected: '已断开',
      error: '连接错误',
      unconfigured: '未配置',
    };
    return map[status] || status;
  }

  _getStatusIcon(status) {
    const map = {
      connected: 'check',
      connecting: 'sync~spin',
      disconnected: 'debug-disconnect',
      error: 'error',
      unconfigured: 'circle-slash',
    };
    return map[status] || 'circle-outline';
  }

  _getTaskStatusLabel(status) {
    const map = {
      in_progress: '进行中',
      completed: '已完成',
      blocked: '已阻断',
      pending: '待处理',
    };
    return map[status] || status;
  }

  _getMessageIcon(type) {
    if (type.startsWith('task.')) return 'tasklist';
    if (type.startsWith('checkpoint.')) return 'verified';
    if (type.startsWith('error.')) return 'error';
    if (type.startsWith('presence.')) return 'account';
    return 'comment';
  }

  _formatTime(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleString();
    } catch {
      return isoString;
    }
  }
}

module.exports = StatusProvider;
