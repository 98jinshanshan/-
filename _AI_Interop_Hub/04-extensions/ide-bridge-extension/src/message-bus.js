/**
 * Message Bus — 消息路由
 *
 * 功能：
 *   - Bridge 消息 → 写入工作区状态文件（供 Agent 读取）
 *   - Agent → 通过命令发送消息到 Bridge
 *   - 消息去重、过滤
 *   - 当前任务状态维护
 */

const fs = require('fs');
const path = require('path');

class MessageBus {
  constructor(options = {}) {
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.role = options.role || '';
    this.stateDir = path.join(this.workspaceRoot, '.bridge');
    this.currentTask = null;
    this.pendingReviews = [];

    // 确保状态目录存在
    this._ensureStateDir();
  }

  /**
   * 确保状态目录存在
   */
  _ensureStateDir() {
    try {
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true });
      }
    } catch (err) {
      console.error('[MessageBus] 创建状态目录失败:', err.message);
    }
  }

  /**
   * 投递消息（Bridge → Agent）
   * 写入状态文件，Agent 可以读取
   */
  deliverMessage(msg) {
    const type = msg.envelope?.type || msg.type;
    const from = msg.envelope?.from || msg.from;
    const payload = msg.payload || {};

    // 不同类型的消息，写入不同的状态文件
    switch (type) {
      case 'task.assign':
      case 'task.delegate':
        this._writeCurrentTask(payload);
        break;

      case 'checkpoint.request':
        this._addPendingReview(from, payload);
        break;

      case 'checkpoint.result':
        this._writeCheckpointResult(from, payload);
        break;

      case 'task.complete':
        this._writeTaskComplete(payload);
        break;

      case 'error.blocked':
        this._writeBlocked(payload);
        break;

      case 'error.user_escalation':
        this._writeUserEscalation(payload);
        break;

      default:
        break;
    }

    // 所有消息都写入消息日志文件
    this._appendMessageLog({
      timestamp: new Date().toISOString(),
      type,
      from,
      payload,
    });
  }

  /**
   * 写入当前任务
   */
  _writeCurrentTask(payload) {
    this.currentTask = {
      task_id: payload.task_id,
      task_type: payload.task_type,
      spec_path: payload.spec_path,
      design_dir: payload.design_dir,
      assigned_at: new Date().toISOString(),
      status: 'in_progress',
    };

    const filePath = path.join(this.stateDir, 'current_task.json');
    try {
      fs.writeFileSync(filePath, JSON.stringify(this.currentTask, null, 2));
    } catch (err) {
      console.error('[MessageBus] 写入 current_task.json 失败:', err.message);
    }
  }

  /**
   * 添加待审核项（OpenClaw 用）
   */
  _addPendingReview(from, payload) {
    const review = {
      id: `review_${Date.now()}`,
      from_role: from,
      checkpoint_id: payload.checkpoint_id,
      phase: payload.phase,
      phase_name: payload.phase_name,
      task_id: payload.task_id,
      artifact: payload.artifact,
      artifact_path: payload.artifact_path,
      requested_at: new Date().toISOString(),
      status: 'pending',
    };

    this.pendingReviews.unshift(review);
    if (this.pendingReviews.length > 20) this.pendingReviews.pop();

    const filePath = path.join(this.stateDir, 'pending_reviews.json');
    try {
      fs.writeFileSync(filePath, JSON.stringify(this.pendingReviews, null, 2));
    } catch (err) {
      console.error('[MessageBus] 写入 pending_reviews.json 失败:', err.message);
    }
  }

  /**
   * 写入检查点结果（Codex/Cursor 用）
   */
  _writeCheckpointResult(from, payload) {
    const filePath = path.join(this.stateDir, 'last_checkpoint_result.json');
    try {
      fs.writeFileSync(filePath, JSON.stringify({
        from_role: from,
        checkpoint_id: payload.checkpoint_id,
        phase: payload.phase,
        result: payload.result,
        automated_checks: payload.automated_checks,
        semantic_review: payload.semantic_review,
        failure_details: payload.failure_details,
        received_at: new Date().toISOString(),
      }, null, 2));
    } catch (err) {
      console.error('[MessageBus] 写入 checkpoint_result 失败:', err.message);
    }
  }

  /**
   * 写入任务完成
   */
  _writeTaskComplete(payload) {
    if (this.currentTask) {
      this.currentTask.status = 'completed';
      this.currentTask.completed_at = new Date().toISOString();
      this.currentTask.summary = payload.summary || '';
    }

    const filePath = path.join(this.stateDir, 'task_complete.json');
    try {
      fs.writeFileSync(filePath, JSON.stringify({
        task_id: payload.task_id,
        summary: payload.summary,
        completed_at: new Date().toISOString(),
      }, null, 2));
    } catch (err) {
      console.error('[MessageBus] 写入 task_complete 失败:', err.message);
    }
  }

  /**
   * 写入阻断通知
   */
  _writeBlocked(payload) {
    const filePath = path.join(this.stateDir, 'blocked.json');
    try {
      fs.writeFileSync(filePath, JSON.stringify({
        task_id: payload.task_id,
        phase: payload.phase,
        reason: payload.reason,
        blocked_at: new Date().toISOString(),
      }, null, 2));
    } catch (err) {
      console.error('[MessageBus] 写入 blocked 失败:', err.message);
    }
  }

  /**
   * 写入需要用户介入的通知
   */
  _writeUserEscalation(payload) {
    const filePath = path.join(this.stateDir, 'user_escalation.json');
    try {
      fs.writeFileSync(filePath, JSON.stringify({
        task_id: payload.task_id,
        reason: payload.reason,
        options: payload.options || [],
        escalated_at: new Date().toISOString(),
      }, null, 2));
    } catch (err) {
      console.error('[MessageBus] 写入 user_escalation 失败:', err.message);
    }
  }

  /**
   * 追加消息日志
   */
  _appendMessageLog(entry) {
    const filePath = path.join(this.stateDir, 'message_log.json');
    try {
      let log = [];
      if (fs.existsSync(filePath)) {
        log = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      log.unshift(entry);
      if (log.length > 100) log = log.slice(0, 100);
      fs.writeFileSync(filePath, JSON.stringify(log, null, 2));
    } catch (err) {
      console.error('[MessageBus] 写入消息日志失败:', err.message);
    }
  }

  /**
   * 获取当前任务
   */
  getCurrentTask() {
    return this.currentTask;
  }

  /**
   * 获取待审核列表
   */
  getPendingReviews() {
    return [...this.pendingReviews];
  }

  /**
   * 读取状态文件（Agent 也可以用同样方式读取）
   */
  readStateFile(filename) {
    const filePath = path.join(this.stateDir, filename);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (err) {
      console.error(`[MessageBus] 读取 ${filename} 失败:`, err.message);
    }
    return null;
  }
}

module.exports = MessageBus;
