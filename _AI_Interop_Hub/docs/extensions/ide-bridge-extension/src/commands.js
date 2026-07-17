/**
 * Commands — 命令面板命令实现
 *
 * 所有在 package.json 中声明的命令都在这里实现
 */

const vscode = require('vscode');

/**
 * 注册所有命令
 * @param {vscode.ExtensionContext} context
 * @param {Object} deps - 依赖注入
 */
function registerCommands(context, deps) {
  const { bridgeManager, messageBus, taskController, statusProvider, getMessageLog } = deps;

  // 1. 启动任务
  context.subscriptions.push(
    vscode.commands.registerCommand('ide-bridge.startTask', async () => {
      if (!taskController) {
        vscode.window.showWarningMessage('[IDE Bridge] 请先配置角色');
        return;
      }

      if (taskController.role !== 'openclaw') {
        vscode.window.showWarningMessage('[IDE Bridge] 只有协调者角色可以启动任务');
        return;
      }

      // 选择任务类型
      const taskType = await vscode.window.showQuickPick([
        { label: '设计任务（分配给 Codex）', value: 'design', target: 'codex' },
        { label: '实现任务（下发给 Cursor）', value: 'implementation', target: 'cursor' },
      ], {
        placeHolder: '选择任务类型',
        title: 'IDE Bridge - 启动任务',
      });

      if (!taskType) return;

      // 输入任务描述
      const description = await vscode.window.showInputBox({
        prompt: '输入任务描述',
        placeHolder: '例如：写一个关于时间旅行的短篇故事大纲',
        title: 'IDE Bridge - 任务描述',
      });

      if (!description) return;

      try {
        let success;
        if (taskType.value === 'design') {
          success = taskController.assignDesignTask({
            task_type: 'design',
            description,
          });
        } else {
          success = taskController.delegateImplementation({
            task_type: 'implementation',
            description,
          });
        }

        if (success) {
          vscode.window.showInformationMessage(`[IDE Bridge] 任务已分配给 ${taskType.target === 'codex' ? 'Codex' : 'Cursor'}`);
          statusProvider?.refresh();
        } else {
          vscode.window.showErrorMessage('[IDE Bridge] 任务分配失败，请检查 Bridge 连接');
        }
      } catch (err) {
        vscode.window.showErrorMessage(`[IDE Bridge] ${err.message}`);
      }
    })
  );

  // 2. 查看连接状态
  context.subscriptions.push(
    vscode.commands.registerCommand('ide-bridge.showStatus', () => {
      const status = bridgeManager?.getConnectionStatus() || 'unconfigured';
      const onlineRoles = bridgeManager?.getOnlineRoles() || [];
      const role = taskController?.role || '未设置';

      const statusLabel = {
        connected: '✅ 已连接',
        connecting: '🔄 连接中...',
        disconnected: '❌ 已断开',
        error: '⚠️ 连接错误',
        unconfigured: '⚪ 未配置',
      }[status] || status;

      const roleLabel = {
        openclaw: 'OpenClaw (协调者)',
        codex: 'Codex (研究员)',
        cursor: 'Cursor (开发者)',
      }[role] || role;

      const onlineList = onlineRoles.length > 0
        ? onlineRoles.map(r => `  - ${r}`).join('\n')
        : '  （暂无）';

      vscode.window.showInformationMessage(
        `IDE Bridge 状态\n\n连接状态: ${statusLabel}\n我的角色: ${roleLabel}\n在线角色:\n${onlineList}`,
        '刷新'
      ).then(selection => {
        if (selection === '刷新') {
          vscode.commands.executeCommand('ide-bridge.showStatus');
        }
      });
    })
  );

  // 3. 发送测试消息
  context.subscriptions.push(
    vscode.commands.registerCommand('ide-bridge.sendMessage', async () => {
      if (!bridgeManager) {
        vscode.window.showWarningMessage('[IDE Bridge] 请先配置角色');
        return;
      }

      const target = await vscode.window.showQuickPick([
        { label: 'OpenClaw (协调者)', value: 'openclaw' },
        { label: 'Codex (研究员)', value: 'codex' },
        { label: 'Cursor (开发者)', value: 'cursor' },
        { label: '广播（所有人）', value: '*' },
      ], {
        placeHolder: '选择接收方',
        title: 'IDE Bridge - 发送测试消息',
      });

      if (!target) return;

      const msgType = await vscode.window.showQuickPick([
        { label: 'ping（心跳测试）', value: 'ping' },
        { label: '测试消息', value: 'test' },
        { label: '自定义类型', value: 'custom' },
      ], {
        placeHolder: '选择消息类型',
      });

      if (!msgType) return;

      let type = msgType.value;
      if (type === 'custom') {
        const customType = await vscode.window.showInputBox({
          prompt: '输入自定义消息类型',
          placeHolder: '例如：my.custom.message',
        });
        if (!customType) return;
        type = customType;
      }

      const content = await vscode.window.showInputBox({
        prompt: '输入消息内容',
        placeHolder: 'Hello from IDE Bridge!',
      });

      if (content === undefined) return;

      const success = bridgeManager.sendMessage(target.value, type, {
        text: content,
        test: true,
      });

      if (success) {
        vscode.window.showInformationMessage(`[IDE Bridge] 消息已发送给 ${target.label}`);
      } else {
        vscode.window.showErrorMessage('[IDE Bridge] 发送失败，请检查 Bridge 连接');
      }
    })
  );

  // 4. 切换角色
  context.subscriptions.push(
    vscode.commands.registerCommand('ide-bridge.switchRole', async () => {
      const currentRole = vscode.workspace.getConfiguration('ide-bridge').get('role', '');

      const selected = await vscode.window.showQuickPick([
        { label: 'OpenClaw — 协调者+监督者', value: 'openclaw', description: '项目经理，唯一对接口' },
        { label: 'Codex — 研究员', value: 'codex', description: '去程设计，Phase 1-5' },
        { label: 'Cursor — 开发者', value: 'cursor', description: '回程实现，Phase 5-1' },
        { label: '清除角色设置', value: '', description: '禁用插件通信功能' },
      ], {
        placeHolder: `当前角色: ${currentRole || '未设置'}`,
        title: 'IDE Bridge - 切换角色',
      });

      if (!selected) return;

      const config = vscode.workspace.getConfiguration('ide-bridge');
      await config.update('role', selected.value, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(
        `[IDE Bridge] 角色已切换为: ${selected.label.split(' — ')[0]}`,
        '重启 IDE 生效'
      ).then(choice => {
        if (choice === '重启 IDE 生效') {
          vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      });
    })
  );

  // 5. 重启 Bridge
  context.subscriptions.push(
    vscode.commands.registerCommand('ide-bridge.restartBridge', async () => {
      if (!bridgeManager) {
        vscode.window.showWarningMessage('[IDE Bridge] 请先配置角色');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        '确定要重启 Bridge 服务吗？',
        '重启',
        '取消'
      );

      if (confirm !== '重启') return;

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'IDE Bridge',
        cancellable: false,
      }, async (progress) => {
        progress.report({ message: '正在重启 Bridge...' });
        try {
          await bridgeManager.restart();
          progress.report({ message: '重启完成' });
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          vscode.window.showErrorMessage(`[IDE Bridge] 重启失败: ${err.message}`);
        }
      });
    })
  );

  // 6. 查看消息日志
  context.subscriptions.push(
    vscode.commands.registerCommand('ide-bridge.showMessageLog', () => {
      const log = getMessageLog ? getMessageLog() : [];

      if (log.length === 0) {
        vscode.window.showInformationMessage('[IDE Bridge] 暂无消息记录');
        return;
      }

      const logText = log.map(entry =>
        `[${entry.time}] ${entry.from} → ${entry.type}\n  ${entry.summary || ''}`
      ).join('\n\n');

      const doc = vscode.workspace.openTextDocument({
        content: `IDE Bridge 消息日志\n${'='.repeat(50)}\n\n共 ${log.length} 条消息\n\n${logText}`,
        language: 'plaintext',
      });

      doc.then(d => {
        vscode.window.showTextDocument(d);
      });
    })
  );

  // 7. 刷新状态面板
  context.subscriptions.push(
    vscode.commands.registerCommand('ide-bridge.refreshStatus', () => {
      statusProvider?.refresh();
    })
  );
}

module.exports = {
  registerCommands,
};
