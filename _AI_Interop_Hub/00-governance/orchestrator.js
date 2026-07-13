#!/usr/bin/env node

/**
 * 全自动流水线调度器（V3.5 — 三真实 IDE 实例通信版）
 *
 * 用法：
 *   node orchestrator.js --task "模糊描述"           # 默认：初始化任务后退出，Agent 轮询接管
 *   node orchestrator.js --task "模糊描述" --watch   # 同步模式：等待全链路完成（调试用）
 *
 * 角色分配（三个物理 IDE 实例）：
 *   Codex IDE    — 研究员（Phase 1 全自动自问自答 + Phase 2-5 去程设计）
 *   OpenClaw IDE — 监督者 + 审核员（全程校验目标对齐 + 审核设计文档）
 *   Cursor IDE   — 开发者（Phase 6 回程实现）
 *
 * 通信原理：
 *   三个 IDE 实例共享同一个 /workspace/ 目录。
 *   每个 IDE 的 Agent 独立轮询协作目录中的任务。
 *   Agent 之间通过文件系统异步交接，不直接互相调用。
 *
 *   协作目录：/workspace/collaboration/
 *     ├── task_queue/              ← 任务队列（Codex 轮询此目录）
 *     ├── deliverables/            ← 交付物（各 Agent 的产出）
 *     ├── reviews/                 ← 审核结果（Cursor 轮询此目录）
 *     └── supervisor_checkpoints/  ← 检查点状态机（OpenClaw 轮询此目录）
 *
 * 全程不需要用户参与。用户只需要输入一句话。
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 配置区域
// ============================================================

const CONFIG = {
  // 共享工作区根目录（三个 IDE 实例都打开此目录）
  workspaceDir: '/workspace',

  // 协作子目录
  collaborationDir: '/workspace/collaboration',

  // 三个 IDE 实例的工作目录（都指向同一个共享目录）
  // 在实际部署中，这三个路径可能是同一个目录，也可能是不同机器上的挂载点
  agents: {
    codex: {
      name: 'Codex',
      role: 'researcher',          // Phase 1 自审 + Phase 2-5 去程设计
      workDir: '/workspace',       // Codex IDE 的工作区根目录
      pollTarget: 'task_queue',    // 轮询目标：task_queue 目录
      instructionFile: 'AGENT_INSTRUCTION.md',  // 行为规范文件
    },
    openclaw: {
      name: 'OpenClaw',
      role: 'supervisor_reviewer', // 监督者（全程）+ 审核员
      workDir: '/workspace',       // OpenClaw IDE 的工作区根目录
      pollTarget: 'supervisor_checkpoints',  // 轮询目标：检查点目录
      instructionFile: 'AGENT_INSTRUCTION.md',
    },
    cursor: {
      name: 'Cursor',
      role: 'developer',            // Phase 6 回程实现
      workDir: '/workspace',       // Cursor IDE 的工作区根目录
      pollTarget: 'reviews',       // 轮询目标：reviews 目录
      instructionFile: 'AGENT_INSTRUCTION.md',
    },
  },

  // 关键文件路径
  selfAuditChecklist: '/workspace/开发总纲_问答题框架.md',
  devConstitution: '/workspace/开发总纲_可执行版.json',

  // 监督者检查点配置
  supervisorCheckpoints: ['cp_0', 'cp_1', 'cp_2', 'cp_3', 'cp_4', 'cp_5', 'cp_6', 'cp_7'],

  // 轮询间隔（毫秒），供 Agent 参考
  pollIntervalMs: 5000,
};

// ============================================================
// 工具函数
// ============================================================

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[调度器] 创建目录: ${dirPath}`);
  }
}

function setupCollaborationDirs() {
  const dirs = [
    `${CONFIG.collaborationDir}/task_queue`,
    `${CONFIG.collaborationDir}/deliverables`,
    `${CONFIG.collaborationDir}/reviews`,
    `${CONFIG.collaborationDir}/supervisor_checkpoints`,
    `${CONFIG.collaborationDir}/logs`,
  ];
  dirs.forEach(ensureDir);
  console.log('[调度器] 协作目录初始化完成');
}

function createTaskFile(taskId, taskDescription) {
  const task = {
    task_id: taskId,
    description: taskDescription,
    status: 'created',
    created_at: new Date().toISOString(),
    current_stage: 'audit',           // 第一阶段：Codex 自审
    assigned_to: 'codex',             // 当前由 Codex 负责
    pipeline: ['audit', 'review', 'develop'],
    execution_mode: 'three_ide_polling',
    supervisor_checkpoints: {},
    collaboration_paths: {
      deliverables: `${CONFIG.collaborationDir}/deliverables/${taskId}_research/`,
      reviews: `${CONFIG.collaborationDir}/reviews/${taskId}/`,
      code: `${CONFIG.collaborationDir}/deliverables/${taskId}_code/`,
      checkpoints: `${CONFIG.collaborationDir}/deliverables/${taskId}_research/supervisor_checkpoints/`,
    },
  };

  // 初始化所有检查点状态为 pending
  CONFIG.supervisorCheckpoints.forEach(cp => {
    task.supervisor_checkpoints[cp] = 'pending';
  });

  const taskPath = path.join(CONFIG.collaborationDir, 'task_queue', `${taskId}.json`);
  fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));
  console.log(`[调度器] 任务已创建: ${taskPath}`);
  return task;
}

function updateTaskStatus(taskId, status, stage, assignedTo) {
  const taskPath = path.join(CONFIG.collaborationDir, 'task_queue', `${taskId}.json`);
  if (!fs.existsSync(taskPath)) return;
  const task = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
  task.status = status;
  if (stage) task.current_stage = stage;
  if (assignedTo) task.assigned_to = assignedTo;
  task.updated_at = new Date().toISOString();
  fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));
}

function waitForSignal(signalPath, timeoutMs = 600000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (fs.existsSync(signalPath)) {
        console.log(`[调度器] 检测到完成信号: ${signalPath}`);
        resolve(true);
      } else if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`等待超时: ${signalPath} 在 ${timeoutMs}ms 内未出现`));
      } else {
        setTimeout(check, 2000);
      }
    };
    check();
  });
}

// ============================================================
// 指令生成函数（写入 task_queue，供 Agent 轮询读取）
// ============================================================

function generateTaskInstruction(taskId, taskDescription) {
  return {
    task_id: taskId,
    description: taskDescription,
    created_at: new Date().toISOString(),
    phases: {
      phase_1: {
        agent: 'codex',
        instruction: `执行 Phase 1 全自动自问自答。
1. 读取 ${CONFIG.devConstitution}
2. 调用 ${CONFIG.selfAuditChecklist}，按 8 维度 44 问逐层自审
3. 基于 44 问的回答，合成一句话精炼需求 + spec.json（含 goal_trace）
4. 自评置信度，写入 spec.json
5. 产出路径：${CONFIG.collaborationDir}/deliverables/${taskId}_research/spec.json
6. 完成后写入 ${CONFIG.collaborationDir}/deliverables/${taskId}_research/supervisor_checkpoints/cp_0.pending
7. 自动进入 Phase 2，不询问用户，不等待用户`,
        output: `${CONFIG.collaborationDir}/deliverables/${taskId}_research/spec.json`,
        checkpoint_signal: `${CONFIG.collaborationDir}/deliverables/${taskId}_research/supervisor_checkpoints/cp_0.pending`,
      },
      phase_2_5: {
        agent: 'codex',
        instruction: `执行 Phase 2-5 去程设计。
产出 path.json、nodes.json、interfaces.json，递归拆解到叶节点。
每阶段产出后写入对应的 cp_N.pending。
产出路径：${CONFIG.collaborationDir}/deliverables/${taskId}_research/`,
        outputs: [
          `${CONFIG.collaborationDir}/deliverables/${taskId}_research/path.json`,
          `${CONFIG.collaborationDir}/deliverables/${taskId}_research/nodes.json`,
          `${CONFIG.collaborationDir}/deliverables/${taskId}_research/interfaces.json`,
        ],
      },
      phase_6_8: {
        agent: 'cursor',
        instruction: `执行 Phase 6-8 回程实现。
1. 读取 ${CONFIG.collaborationDir}/deliverables/${taskId}_research/ 中的设计文档
2. 按去程蓝图生成代码
3. 产出路径：${CONFIG.collaborationDir}/deliverables/${taskId}_code/
4. 完成后创建 code_complete.txt`,
        output: `${CONFIG.collaborationDir}/deliverables/${taskId}_code/code_complete.txt`,
      },
    },
    supervisor_checkpoints: {
      cp_0: { phase: 1, description: 'Phase 1 自审质量校验：44 问完整？inferred < 30%？goal_trace 完整？' },
      cp_1: { phase: 2, description: 'path.json 存在且与 spec.json 一致？' },
      cp_2: { phase: 3, description: 'nodes.json 每个节点 maps_to_root_goal 非空？' },
      cp_3: { phase: 4, description: 'interfaces.json 与 spec.json 数值约束一致？' },
      cp_4: { phase: 5, description: '递归拆解至少产出 1 个子节点 spec.json？' },
      cp_5: { phase: 6, description: '代码行为是否匹配去程蓝图？' },
      cp_6: { phase: 7, description: '测试用例验收标准是否对齐根目标？' },
      cp_7: { phase: 8, description: '最终交付物能否完整回答根目标？goal_trace 全链路完整？' },
    },
  };
}

// ============================================================
// 模式 1：初始化后退出（默认）—— Agent 轮询接管
// ============================================================

function runInitMode(taskDescription) {
  const taskId = `task_${Date.now()}`;
  setupCollaborationDirs();
  const task = createTaskFile(taskId, taskDescription);

  // 创建 deliverables 子目录
  const deliverablesDir = path.join(CONFIG.collaborationDir, 'deliverables', `${taskId}_research`);
  const checkpointsDir = path.join(deliverablesDir, 'supervisor_checkpoints');
  const codeDir = path.join(CONFIG.collaborationDir, 'deliverables', `${taskId}_code`);
  const reviewDir = path.join(CONFIG.collaborationDir, 'reviews', taskId);
  ensureDir(deliverablesDir);
  ensureDir(checkpointsDir);
  ensureDir(codeDir);
  ensureDir(reviewDir);

  // 写入详细任务指令到 task_queue
  const instruction = generateTaskInstruction(taskId, taskDescription);
  const instructionPath = path.join(CONFIG.collaborationDir, 'task_queue', `${taskId}_instruction.json`);
  fs.writeFileSync(instructionPath, JSON.stringify(instruction, null, 2));

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  三 IDE 流水线任务已初始化');
  console.log('═══════════════════════════════════════');
  console.log(`任务ID: ${taskId}`);
  console.log(`你的描述: "${taskDescription}"`);
  console.log('');
  console.log('接下来的自动化流程（无需你参与）：');
  console.log('');
  console.log('  1. Codex IDE 的 Agent 轮询到 task_queue 中的新任务');
  console.log('     → 自动执行 Phase 1 自问自答');
  console.log('     → 产出 spec.json');
  console.log('     → 写入 cp_0.pending');
  console.log('');
  console.log('  2. OpenClaw IDE 的 Agent 轮询到 cp_0.pending');
  console.log('     → 自动执行检查点校验');
  console.log('     → 写入 cp_0.result');
  console.log('');
  console.log('  3. Codex 看到 cp_0.result = pass');
  console.log('     → 自动继续 Phase 2-5');
  console.log('     → 每个 Phase 完成后写入 .pending');
  console.log('');
  console.log('  4. OpenClaw 审核全部通过后');
  console.log('     → Cursor 轮询到 reviews/ 中的 approved');
  console.log('     → 自动执行 Phase 6-8 开发');
  console.log('');
  console.log('  5. 全链路完成');
  console.log('     → 代码产出: ' + codeDir);
  console.log('');
  console.log('任务文件: ' + path.join(CONFIG.collaborationDir, 'task_queue', `${taskId}.json`));
  console.log('');
  console.log('提示：请确保三个 IDE 都已打开此工作区并加载了 AGENT_INSTRUCTION.md。');
  console.log('');

  return taskId;
}

// ============================================================
// 模式 2：同步等待（--watch）—— 调试用
// ============================================================

async function runWatchMode(taskDescription) {
  const taskId = runInitMode(taskDescription);

  console.log('[调度器] 进入同步等待模式（--watch），将等待全链路完成...');
  console.log('');

  try {
    const deliverablesDir = path.join(CONFIG.collaborationDir, 'deliverables', `${taskId}_research`);
    const codeDir = path.join(CONFIG.collaborationDir, 'deliverables', `${taskId}_code`);
    const reviewDir = path.join(CONFIG.collaborationDir, 'reviews', taskId);

    // 等待 spec.json
    const specPath = path.join(deliverablesDir, 'spec.json');
    console.log('[调度器] 等待 Codex 产出 spec.json...');
    await waitForSignal(specPath, 600000);
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
    const rootGoal = spec.goal_trace?.root_goal || spec.clarified_requirement?.one_liner || '(未提取)';
    console.log(`[调度器] spec.json 已产出。根目标: ${rootGoal}`);
    console.log('');

    // 等待 cp_0.result
    const cp0Path = path.join(deliverablesDir, 'supervisor_checkpoints', 'cp_0.result');
    console.log('[调度器] 等待 OpenClaw 完成 cp_0 检查点...');
    await waitForSignal(cp0Path, 300000);
    const cp0Result = JSON.parse(fs.readFileSync(cp0Path, 'utf-8'));
    if (cp0Result.result !== 'pass') {
      console.error(`[调度器] cp_0 未通过: ${cp0Result.summary}`);
      process.exit(1);
    }
    console.log('[调度器] cp_0 通过 ✓');
    console.log('');

    // 等待审核结果
    const reviewPath = path.join(reviewDir, 'review.json');
    console.log('[调度器] 等待 OpenClaw 完成审核...');
    await waitForSignal(reviewPath, 600000);
    const review = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
    if (review.status !== 'approved') {
      console.error(`[调度器] 审核未通过: ${JSON.stringify(review.issues)}`);
      process.exit(1);
    }
    console.log('[调度器] 审核通过 ✓');
    console.log('');

    // 等待代码完成
    const codeCompletePath = path.join(codeDir, 'code_complete.txt');
    console.log('[调度器] 等待 Cursor 完成开发...');
    await waitForSignal(codeCompletePath, 600000);
    console.log('[调度器] 代码完成 ✓');
    console.log('');

    console.log('═══════════════════════════════════════');
    console.log('  全链路通路！开发完成！');
    console.log('═══════════════════════════════════════');
    console.log(`根目标: ${rootGoal}`);
    console.log(`规格书: ${specPath}`);
    console.log(`代码产出: ${codeDir}`);

  } catch (err) {
    console.error(`\n[调度器] 执行失败: ${err.message}`);
    process.exit(1);
  }
}

// ============================================================
// 入口
// ============================================================

const args = process.argv.slice(2);
const taskIndex = args.indexOf('--task');
const watchMode = args.includes('--watch');

const taskDescription = taskIndex !== -1 ? args[taskIndex + 1] : null;

if (!taskDescription) {
  console.log('用法:');
  console.log('  node orchestrator.js --task "模糊描述"           # 初始化任务后退出（Agent 轮询接管）');
  console.log('  node orchestrator.js --task "模糊描述" --watch   # 同步等待全链路完成（调试用）');
  console.log('');
  console.log('三个 IDE 实例的 Agent 会通过共享文件系统自动通信。');
  console.log('全程不需要你参与。');
  process.exit(1);
}

if (watchMode) {
  runWatchMode(taskDescription);
} else {
  runInitMode(taskDescription);
}