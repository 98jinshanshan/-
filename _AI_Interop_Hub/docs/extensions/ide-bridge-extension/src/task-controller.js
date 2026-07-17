/**
 * Task Controller — 任务管理
 *
 * 功能：
 *   - OpenClaw: 分配任务给 Codex / 下发实现给 Cursor
 *   - Codex: 接收设计任务 / 提交审核
 *   - Cursor: 接收实现任务 / 报告进度
 *   - 任务状态跟踪
 */

const fs = require('fs');
const path = require('path');

class TaskController {
  constructor(options = {}) {
    this.role = options.role || '';
    this.bridgeManager = options.bridgeManager || null;
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.stateDir = path.join(this.workspaceRoot, '.bridge');

    this.currentTask = null;
    this.pendingReviews = [];

    // 从状态文件加载
    this._loadFromState();
  }

  /**
   * 从状态文件加载已有数据
   */
  _loadFromState() {
    try {
      const taskFile = path.join(this.stateDir, 'current_task.json');
      if (fs.existsSync(taskFile)) {
        this.currentTask = JSON.parse(fs.readFileSync(taskFile, 'utf-8'));
      }

      const reviewsFile = path.join(this.stateDir, 'pending_reviews.json');
      if (fs.existsSync(reviewsFile)) {
        this.pendingReviews = JSON.parse(fs.readFileSync(reviewsFile, 'utf-8'));
      }
    } catch (err) {
      console.error('[TaskController] 加载状态失败:', err.message);
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
   * 分配任务（OpenClaw → Codex）
   * 只有 openclaw 角色可以调用
   */
  assignDesignTask(options = {}) {
    if (this.role !== 'openclaw') {
      throw new Error('只有协调者角色可以分配任务');
    }

    const {
      task_id = `task_${Date.now()}`,
      task_type = 'design',
      description = '',
      spec_path = '',
      design_dir = '',
    } = options;

    if (!this.bridgeManager) {
      throw new Error('Bridge 未连接');
    }

    const success = this.bridgeManager.sendMessage('codex', 'task.assign', {
      task_id,
      task_type,
      description,
      spec_path,
      design_dir,
      assigned_by: 'openclaw',
    });

    if (success) {
      // 本地也记录
      this.currentTask = {
        task_id,
        task_type,
        description,
        spec_path,
        design_dir,
        assigned_at: new Date().toISOString(),
        status: 'in_progress',
        assigned_to: 'codex',
      };
      this._saveCurrentTask();
    }

    return success;
  }

  /**
   * 下发实现任务（OpenClaw → Cursor）
   */
  delegateImplementation(options = {}) {
    if (this.role !== 'openclaw') {
      throw new Error('只有协调者角色可以下发实现任务');
    }

    const {
      task_id = `impl_${Date.now()}`,
      task_type = 'implementation',
      description = '',
      spec_path = '',
      design_dir = '',
      output_dir = '',
    } = options;

    if (!this.bridgeManager) {
      throw new Error('Bridge 未连接');
    }

    const success = this.bridgeManager.sendMessage('cursor', 'task.delegate', {
      task_id,
      task_type,
      description,
      spec_path,
      design_dir,
      output_dir,
      delegated_by: 'openclaw',
    });

    if (success) {
      this.currentTask = {
        task_id,
        task_type,
        description,
        spec_path,
        design_dir,
        output_dir,
        assigned_at: new Date().toISOString(),
        status: 'in_progress',
        assigned_to: 'cursor',
      };
      this._saveCurrentTask();
    }

    return success;
  }

  /**
   * 提交审核请求（Codex/Cursor → OpenClaw）
   */
  requestCheckpoint(options = {}) {
    if (this.role === 'openclaw') {
      throw new Error('协调者不需要提交审核');
    }

    const {
      phase = 0,
      phase_name = '',
      checkpoint_id = `cp_${Date.now()}`,
      task_id = this.currentTask?.task_id || '',
      artifact = '',
      artifact_path = '',
    } = options;

    if (!this.bridgeManager) {
      throw new Error('Bridge 未连接');
    }

    return this.bridgeManager.sendMessage('openclaw', 'checkpoint.request', {
      phase,
      phase_name,
      checkpoint_id,
      task_id,
      artifact,
      artifact_path,
      requested_by: this.role,
    });
  }

  /**
   * 审核结果（OpenClaw → Codex/Cursor）
   */
  respondCheckpoint(options = {}) {
    if (this.role !== 'openclaw') {
      throw new Error('只有协调者可以审核');
    }

    const {
      to = 'codex',
      result = 'pass', // pass / fail / needs_revision
      checkpoint_id = '',
      phase = 0,
      automated_checks = {},
      semantic_review = '',
      failure_details = '',
    } = options;

    if (!this.bridgeManager) {
      throw new Error('Bridge 未连接');
    }

    // 从待审核列表移除
    this.pendingReviews = this.pendingReviews.filter(
      r => r.checkpoint_id !== checkpoint_id
    );
    this._savePendingReviews();

    return this.bridgeManager.sendMessage(to, 'checkpoint.result', {
      result,
      checkpoint_id,
      phase,
      automated_checks,
      semantic_review,
      failure_details,
      reviewed_by: 'openclaw',
    });
  }

  /**
   * 报告任务完成
   */
  completeTask(options = {}) {
    const {
      task_id = this.currentTask?.task_id || '',
      summary = '',
      output_path = '',
    } = options;

    if (!this.bridgeManager) {
      throw new Error('Bridge 未连接');
    }

    // 更新本地状态
    if (this.currentTask && this.currentTask.task_id === task_id) {
      this.currentTask.status = 'completed';
      this.currentTask.completed_at = new Date().toISOString();
      this.currentTask.summary = summary;
      this._saveCurrentTask();
    }

    // 广播完成消息
    return this.bridgeManager.sendMessage('*', 'task.complete', {
      task_id,
      summary,
      output_path,
      completed_by: this.role,
    });
  }

  /**
   * 报告阻断
   */
  reportBlocked(options = {}) {
    const {
      task_id = this.currentTask?.task_id || '',
      phase = 0,
      reason = '',
    } = options;

    if (!this.bridgeManager) {
      throw new Error('Bridge 未连接');
    }

    if (this.currentTask) {
      this.currentTask.status = 'blocked';
      this._saveCurrentTask();
    }

    return this.bridgeManager.sendMessage('openclaw', 'error.blocked', {
      task_id,
      phase,
      reason,
      reported_by: this.role,
    });
  }

  /**
   * 请求人工介入
   */
  escalateToUser(options = {}) {
    const {
      task_id = this.currentTask?.task_id || '',
      reason = '',
      options: choices = [],
    } = options;

    if (!this.bridgeManager) {
      throw new Error('Bridge 未连接');
    }

    return this.bridgeManager.sendMessage('openclaw', 'error.user_escalation', {
      task_id,
      reason,
      options: choices,
      escalated_by: this.role,
    });
  }

  /**
   * 保存当前任务到文件
   */
  _saveCurrentTask() {
    try {
      const filePath = path.join(this.stateDir, 'current_task.json');
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(this.currentTask, null, 2));
    } catch (err) {
      console.error('[TaskController] 保存任务失败:', err.message);
    }
  }

  /**
   * 保存待审核列表到文件
   */
  _savePendingReviews() {
    try {
      const filePath = path.join(this.stateDir, 'pending_reviews.json');
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(this.pendingReviews, null, 2));
    } catch (err) {
      console.error('[TaskController] 保存审核列表失败:', err.message);
    }
  }

  /**
   * 收到新任务时调用（更新本地状态）
   */
  onTaskAssigned(payload) {
    this.currentTask = {
      task_id: payload.task_id,
      task_type: payload.task_type,
      description: payload.description || '',
      spec_path: payload.spec_path || '',
      design_dir: payload.design_dir || '',
      output_dir: payload.output_dir || '',
      assigned_at: payload.assigned_at || new Date().toISOString(),
      status: 'in_progress',
      assigned_by: payload.assigned_by || payload.delegated_by || 'openclaw',
    };
    this._saveCurrentTask();
  }

  /**
   * 收到审核请求时调用（添加到待审核列表）
   */
  onCheckpointRequest(from, payload) {
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
    this._savePendingReviews();
  }
}

module.exports = TaskController;
