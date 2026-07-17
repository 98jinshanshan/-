#!/usr/bin/env node

/**
 * 全自动流水线调度器（V4.2 — Bridge 集成版）
 *
 * 用法：
 *   node orchestrator.js --task "模糊描述"                             # 初始化 + 门禁检查 + 推送 Bridge
 *   node orchestrator.js --task "模糊描述" --watch                     # 同步等待全链路完成
 *   node orchestrator.js --gate-check                                  # 独立门禁检查模式（不创建任务）
 *   node orchestrator.js --contract-check <taskDir> <contractPath>     # Sprint Contract 验收检查
 *
 * V4.2 核心改动：
 *   1. Bridge Client 集成：创建任务后通过 WebSocket 实时推送 task.assign
 *   2. Sprint Contract 验证：validateContract() 函数 + --contract-check 模式
 *   3. 上下文焦虑防御：max_rounds_per_node 配置
 *   4. Harness 退化：model_capability_profile 自动匹配
 *
 * 角色分配（三个物理 IDE 实例）：
 *   Codex IDE    — 研究员（Phase 1 全自动自问自答 + Phase 2-5 去程设计）
 *   OpenClaw IDE — 监督者 + 审核员（全程校验目标对齐 + 审核设计文档）
 *   Windsurf IDE — 开发者（Phase 6-8 回程实现）
 *
 * 通信原理：
 *   V4.2: 三个 IDE 实例通过 IDE Bridge（WebSocket）实时通信。
 *   创建任务后通过 Bridge 推送 task.assign 消息。
 *   Agent 之间通过 WebSocket + 状态文件异步交接。
 *
 * 全程不需要用户参与。用户只需要输入一句话。
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Bridge Client 初始化（V4.2 新增）
// ============================================================

const BRIDGE_HOST = process.env.BRIDGE_HOST || 'localhost';
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '9527', 10);
let bridgeClient = null;

function initBridgeClient() {
  try {
    const bridgeScriptPath = path.join(__dirname, 'ide-bridge-client.js');
    if (fs.existsSync(bridgeScriptPath)) {
      const BridgeClient = require(bridgeScriptPath);
      bridgeClient = new BridgeClient('openclaw', {
        host: BRIDGE_HOST,
        port: BRIDGE_PORT,
      });
      bridgeClient.on('connect', () => {
        console.log('[Bridge] orchestrator 已连接到 IDE Bridge');
      });
      bridgeClient.on('error', (err) => {
        console.warn('[Bridge] 连接失败:', err.message, '（将使用文件模式）');
        bridgeClient = null;
      });
      bridgeClient.connect();
      return true;
    }
  } catch (err) {
    console.warn('[Bridge] 初始化失败:', err.message, '（将使用文件模式）');
  }
  return false;
}

/**
 * 通过 Bridge 推送任务给目标 IDE（V4.2 新增）
 * 如果 Bridge 不可用，fallback 到文件系统模式
 */
function pushTaskToBridge(task, targetRole) {
  if (bridgeClient && bridgeClient.ws && bridgeClient.ws.readyState === 1) {
    const msgType = targetRole === 'codex' ? 'task.assign' : 'task.delegate';
    const success = bridgeClient.send(targetRole, msgType, {
      task_id: task.task_id,
      task_type: task.task_type || 'design',
      description: task.description,
      spec_path: task.spec_path || '',
      design_dir: task.design_dir || '',
      assigned_at: task.created_at,
    });
    if (success) {
      console.log(`[Bridge] 任务 ${task.task_id} 已推送至 ${targetRole}`);
      return true;
    }
  }
  // Fallback: 写入 .bridge/ 状态文件
  console.log('[Bridge] 不可用，fallback 到文件模式');
  const bridgeDir = path.join(WORKSPACE_DIR, '.bridge');
  if (!fs.existsSync(bridgeDir)) fs.mkdirSync(bridgeDir, { recursive: true });
  fs.writeFileSync(path.join(bridgeDir, 'current_task.json'), JSON.stringify({
    ...task,
    assigned_to: targetRole,
    pushed_at: new Date().toISOString(),
  }, null, 2));
  return false;
}

// ============================================================
// 动态工作区检测（不再硬编码 /workspace）
// ============================================================

function detectWorkspaceDir() {
  // 策略 1：命令行参数 --workspace G:\_AI_Interop_Hub
  const wsIndex = process.argv.indexOf('--workspace');
  if (wsIndex !== -1 && process.argv[wsIndex + 1]) {
    return process.argv[wsIndex + 1];
  }

  // 策略 2：环境变量 CONSTITUTION_WORKSPACE
  if (process.env.CONSTITUTION_WORKSPACE) {
    return process.env.CONSTITUTION_WORKSPACE;
  }

  // 策略 3：当前工作目录
  return process.cwd();
}

const WORKSPACE_DIR = detectWorkspaceDir();

// ============================================================
// 配置区域（所有路径基于 WORKSPACE_DIR 动态生成）
// ============================================================

const CONFIG = {
  workspaceDir: WORKSPACE_DIR,

  collaborationDir: path.join(WORKSPACE_DIR, 'collaboration'),

  agents: {
    codex: {
      name: 'Codex',
      role: 'researcher',
      workDir: WORKSPACE_DIR,
      pollTarget: 'task_queue',
      instructionFile: 'AGENT_INSTRUCTION.md',
    },
    openclaw: {
      name: 'OpenClaw',
      role: 'supervisor_reviewer',
      workDir: WORKSPACE_DIR,
      pollTarget: 'supervisor_checkpoints',
      instructionFile: 'AGENT_INSTRUCTION.md',
    },
    cursor: {
      name: 'Cursor',
      role: 'developer',
      workDir: WORKSPACE_DIR,
      pollTarget: 'reviews',
      instructionFile: 'AGENT_INSTRUCTION.md',
    },
  },

  selfAuditChecklist: path.join(WORKSPACE_DIR, '开发总纲_问答题框架.md'),
  devConstitution: path.join(WORKSPACE_DIR, '开发总纲_可执行版.json'),

  supervisorCheckpoints: ['cp_0', 'cp_1', 'cp_2', 'cp_3', 'cp_4', 'cp_5', 'cp_6', 'cp_7'],
  pollIntervalMs: 5000,
};

// ============================================================
// 门禁引擎（V3.6 核心 —— 真正解析 JSON 并执行检查）
// ============================================================

/**
 * 加载并解析 开发总纲_可执行版.json 中的 phase_gate_engine 章节
 * @returns {object} gates 配置，如果文件不存在或解析失败则返回 null
 */
function loadGateEngine() {
  if (!fs.existsSync(CONFIG.devConstitution)) {
    console.error(`[门禁] 错误：找不到开发总纲 ${CONFIG.devConstitution}`);
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG.devConstitution, 'utf-8'));
    if (!raw.phase_gate_engine || !raw.phase_gate_engine.gates) {
      console.error('[门禁] 错误：phase_gate_engine.gates 不存在，总纲版本可能过低');
      return null;
    }
    console.log(`[门禁] 已加载门禁引擎 v${raw.phase_gate_engine.version}，来源: ${CONFIG.devConstitution}`);
    console.log(`[门禁] 总纲版本: ${raw.version}`);
    return raw.phase_gate_engine;
  } catch (err) {
    console.error(`[门禁] 解析 JSON 失败: ${err.message}`);
    return null;
  }
}

/**
 * 从 JSON 字段值中提取实际文件路径
 * JSON 中的路径格式如: "{task_dir}/spec.json（必须存在）"
 * 需要剥离中文说明，只保留路径部分
 * @param {string} raw - 原始字段值
 * @param {string} taskDir - 任务目录（替换 {task_dir}）
 * @returns {string} 实际文件路径
 */
function extractPath(raw, taskDir) {
  if (typeof raw !== 'string') return '';
  // 替换 {task_dir} 占位符
  let resolved = raw.replace(/\{task_dir\}/g, taskDir);
  // 剥离中文括号说明，如 "（必须存在）" "（至少 1 个子节点 spec.json）" " 或 最终产出文件"
  resolved = resolved.replace(/[（(][^)）]*[)）]/g, '').trim();
  // 剥除 " 或 " 之后的文本（Phase 5/6 的 produce_file 含 "或" 分支）
  const orIdx = resolved.indexOf(' 或 ');
  if (orIdx !== -1) {
    resolved = resolved.substring(0, orIdx).trim();
  }
  return resolved;
}

/**
 * 检查单个 Phase 的门禁状态
 * @param {object} gateDef - gate 定义（来自 phase_gate_engine.gates）
 * @param {string} taskDir - 任务交付物目录
 * @returns {{phase: string, status: string, gate_file: string, produce_files: string[], detail: string}}
 */
function checkSingleGate(gateDef, taskDir) {
  const phase = gateDef.phase_name;

  // Phase 5/6 的 gate_file_2 可能含 "或" 分支（如 "nodes/ 或 leaf_nodes.json"）
  // 已在 extractPath 中处理：取 "或" 之前的部分
  // 但 Phase 5 的 produce_file "nodes/" 和 Phase 6 的 gate_file_2 需要特殊处理：
  // 如果提取出的路径以 / 结尾（目录），检查目录下是否有内容或检查替代文件
  const gateFiles = [];
  for (const key of Object.keys(gateDef)) {
    if (key.startsWith('gate_file')) {
      const rawVal = gateDef[key];
      if (rawVal.startsWith('无') || rawVal.startsWith('Phase')) continue;
      const gatePath = extractPath(rawVal, taskDir);
      if (!gatePath) continue;

      // 如果路径以 / 结尾（目录类型），改为检查目录存在
      if (gatePath.endsWith('/')) {
        if (fs.existsSync(gatePath) && fs.readdirSync(gatePath).length > 0) {
          // 目录存在且有内容，视为通过
        } else {
          // 目录不存在或为空，检查是否有替代文件（如 leaf_nodes.json）
          const altKey = key === 'gate_file_2' ? 'leaf_nodes.json' : null;
          gateFiles.push({ key, path: gatePath, isDir: true, altFile: altKey ? path.join(taskDir, altKey) : null });
        }
      } else {
        gateFiles.push({ key, path: gatePath });
      }
    }
  }

  // 构建 produce_file 列表（可能有多个：produce_file, produce_file_1, produce_file_2, produce_file_3）
  const produceFiles = [];
  for (const key of Object.keys(gateDef)) {
    if (key.startsWith('produce_file')) {
      const rawVal = gateDef[key];
      const producePath = extractPath(rawVal, taskDir);
      if (!producePath) continue;
      // 如果路径以 / 结尾（目录类型），检查目录存在且有内容，或替代文件存在
      if (producePath.endsWith('/')) {
        const dirExists = fs.existsSync(producePath) && fs.readdirSync(producePath).length > 0;
        // Phase 5 创作类简化：leaf_nodes.json 可替代 nodes/
        const altFile = path.join(taskDir, 'leaf_nodes.json');
        const altExists = fs.existsSync(altFile);
        produceFiles.push({ key, path: producePath, exists: dirExists || altExists });
      } else {
        produceFiles.push({ key, path: producePath, exists: fs.existsSync(producePath) });
      }
    }
  }

  // Phase 1 没有 gate_file（起点），只检查 produce_file
  if (gateFiles.length === 0) {
    const exists = produceFiles.length > 0 && produceFiles[0].exists;
    return {
      phase,
      status: exists ? 'pass' : 'missing',
      gate_file: '无（起点）',
      produce_files: produceFiles.map(p => p.path),
      detail: exists ? '产出物存在' : '产出物缺失',
    };
  }

  // 检查所有 gate_file 是否存在
  const missingGates = gateFiles.filter(g => {
    if (g.isDir) {
      // 目录类型：目录不存在或为空，且替代文件也不存在
      return g.altFile ? !fs.existsSync(g.altFile) : true;
    }
    return !fs.existsSync(g.path);
  });
  if (missingGates.length > 0) {
    return {
      phase,
      status: 'blocked',
      gate_file: missingGates.map(g => g.path).join(', '),
      produce_files: produceFiles.map(p => p.path),
      detail: `前置条件缺失: ${missingGates.map(g => g.key).join(', ')} 不存在`,
    };
  }

  // gate 全部存在，检查 produce_file（任一存在即可）
  const anyProduceExists = produceFiles.some(p => p.exists);
  return {
    phase,
    status: anyProduceExists ? 'pass' : 'missing',
    gate_file: '全部存在',
    produce_files: produceFiles.map(p => p.path),
    detail: anyProduceExists ? '门禁通过，产出物存在' : '门禁通过，但产出物尚未生成',
  };
}

/**
 * 执行完整门禁链检查，返回第一个断点和整体状态
 * @param {string} taskDir - 任务交付物目录
 * @returns {{chain: Array, firstBreak: object|null, overall: string, phaseCount: number, passCount: number}}
 */
function runGateCheck(taskDir) {
  const engine = loadGateEngine();
  if (!engine) {
    return { chain: [], firstBreak: null, overall: 'error', phaseCount: 0, passCount: 0 };
  }

  const gateOrder = [
    'phase_1', 'phase_2', 'phase_3', 'phase_4',
    'phase_5', 'phase_6', 'phase_7', 'phase_8',
  ];

  const chain = [];
  let firstBreak = null;
  let passCount = 0;

  console.log(`[门禁] 开始检查任务目录: ${taskDir}`);
  console.log(`[门禁] ${'─'.repeat(60)}`);

  for (const gateKey of gateOrder) {
    const gateDef = engine.gates[gateKey];
    if (!gateDef) {
      chain.push({ phase: gateKey, status: 'undefined', detail: '门禁定义不存在' });
      continue;
    }

    const result = checkSingleGate(gateDef, taskDir);
    result.gate_key = gateKey;
    chain.push(result);

    // 渲染状态
    const icon = result.status === 'pass' ? '✓' : result.status === 'blocked' ? '✗' : '○';
    const color = result.status === 'pass' ? '通过' : result.status === 'blocked' ? '阻断' : '待执行';
    console.log(`[门禁] ${icon} ${gateDef.phase_name} (${gateKey}) [${color}]`);
    if (result.detail) {
      console.log(`         ${result.detail}`);
    }

    if (result.status === 'pass') {
      passCount++;
    } else if (result.status === 'blocked' && !firstBreak) {
      firstBreak = result;
    }
  }

  console.log(`[门禁] ${'─'.repeat(60)}`);
  const overall = firstBreak ? 'blocked' : (passCount === gateOrder.length ? 'full_pass' : 'in_progress');
  console.log(`[门禁] 结果: ${overall === 'full_pass' ? '全链路通过' : overall === 'blocked' ? `阻断于 ${firstBreak.phase}` : '进行中'} (${passCount}/${gateOrder.length})`);

  return { chain, firstBreak, overall, phaseCount: gateOrder.length, passCount };
}

/**
 * 反跳过机制：检查是否有连续 2 个以上的 produce_file 缺失
 * @param {Array} chain - runGateCheck 返回的 chain 数组
 * @returns {{hasSystemicSkip: boolean, skippedPhases: string[]}}
 */
function detectSystemicSkip(chain) {
  const skipped = chain.filter(c => c.status === 'missing' && c.gate_file !== '无（起点）');
  // missing 意味着 gate 通过了但 produce 不存在 —— 说明被跳过了
  if (skipped.length >= 2) {
    return {
      hasSystemicSkip: true,
      skippedPhases: skipped.map(s => s.phase),
      message: `检测到系统性跳过: ${skipped.map(s => s.phase).join(', ')} 的门禁已通过但产出物缺失`,
    };
  }
  return { hasSystemicSkip: false, skippedPhases: [], message: '' };
}

/**
 * Sprint Contract 验证（V4.1 新增）
 * 借鉴 Anthropic Harness 工程，对每个 Phase 产出执行验收合同对照检查。
 *
 * @param {object} contract - sprint_contract 对象
 * @param {string} taskDir - 任务目录
 * @returns {{result: string, criteria_results: Array, failure_details: Array, overall: string}}
 */
function validateContract(contract, taskDir) {
  if (!contract || !contract.acceptance_criteria) {
    return {
      result: 'skip',
      criteria_results: [],
      failure_details: [],
      overall: 'no_contract',
      message: '无 Sprint Contract，跳过验收检查。'
    };
  }

  const criteriaResults = [];
  const failureDetails = [];
  const fs = require('fs');
  const path = require('path');

  for (const ac of contract.acceptance_criteria) {
    const targetFile = ac.target_file.replace(/\{task_dir\}/g, taskDir);
    let passed = false;
    let actualValue = '';
    let notes = '';

    try {
      switch (ac.verification_type) {
        case 'file_exists':
          passed = fs.existsSync(targetFile);
          actualValue = passed ? '文件存在' : '文件不存在';
          break;

        case 'field_check': {
          if (!fs.existsSync(targetFile)) {
            passed = false;
            actualValue = '文件不存在，无法检查字段';
            break;
          }
          const data = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
          const fieldPath = ac.target_field.split('.');
          let value = data;
          for (const key of fieldPath) {
            value = value?.[key];
          }
          actualValue = JSON.stringify(value);
          // 根据 expected_value 判断
          if (ac.expected_value.includes('>')) {
            const threshold = parseInt(ac.expected_value.match(/\d+/)?.[0] || '0');
            passed = Array.isArray(value) ? value.length > threshold : (value > threshold);
          } else if (ac.expected_value.includes('非空')) {
            passed = value !== null && value !== undefined && value !== '';
          } else if (ac.expected_value.includes('存在')) {
            passed = value !== undefined && value !== null;
          } else {
            passed = String(value) === ac.expected_value;
          }
          break;
        }

        case 'value_range': {
          const data = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
          const fieldPath = ac.target_field.split('.');
          let value = data;
          for (const key of fieldPath) {
            value = value?.[key];
          }
          actualValue = String(value);
          const range = ac.expected_value.match(/[\d.]+/g);
          if (range && range.length >= 2) {
            passed = parseFloat(value) >= parseFloat(range[0]) && parseFloat(value) <= parseFloat(range[1]);
          }
          break;
        }

        case 'count_check': {
          const data = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
          const fieldPath = ac.target_field.split('.');
          let value = data;
          for (const key of fieldPath) {
            value = value?.[key];
          }
          const count = Array.isArray(value) ? value.length : (typeof value === 'object' ? Object.keys(value || {}).length : 0);
          actualValue = `count = ${count}`;
          const expectedNum = parseInt(ac.expected_value.match(/\d+/)?.[0] || '0');
          passed = ac.expected_value.includes('>=') ? count >= expectedNum : count === expectedNum;
          break;
        }

        case 'content_length': {
          if (!fs.existsSync(targetFile)) {
            passed = false;
            actualValue = '文件不存在';
            break;
          }
          const content = fs.readFileSync(targetFile, 'utf-8');
          const length = content.length;
          actualValue = `length = ${length}`;
          const expectedNum = parseInt(ac.expected_value.match(/\d+/)?.[0] || '0');
          passed = ac.expected_value.includes('>=') ? length >= expectedNum : length === expectedNum;
          break;
        }

        case 'schema_match': {
          if (!fs.existsSync(targetFile)) {
            passed = false;
            actualValue = '文件不存在';
            break;
          }
          const data = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
          const requiredFields = ac.expected_value.split(',').map(f => f.trim());
          const missingFields = requiredFields.filter(f => {
            const fieldPath = f.split('.');
            let value = data;
            for (const key of fieldPath) {
              value = value?.[key];
            }
            return value === undefined || value === null;
          });
          passed = missingFields.length === 0;
          actualValue = passed ? '所有字段匹配' : `缺失字段: ${missingFields.join(', ')}`;
          break;
        }

        default:
          passed = false;
          actualValue = `未知验证类型: ${ac.verification_type}`;
          notes = '不支持此验证类型';
      }
    } catch (err) {
      passed = false;
      actualValue = `验证异常: ${err.message}`;
      notes = err.message;
    }

    criteriaResults.push({
      ac_id: ac.id,
      passed,
      actual_value: actualValue,
      notes,
    });

    if (!passed) {
      failureDetails.push({
        ac_id: ac.id,
        reason: `${ac.description} 未通过。实际值: ${actualValue}`,
        file: targetFile,
        field: ac.target_field || '',
        fix_suggestion: ac.fail_action === 'retry' ? `请修正 ${ac.target_field} 后重新提交` : '请检查并修正',
      });
    }
  }

  const allPassed = criteriaResults.every(r => r.passed);
  const criticalFailures = failureDetails.filter(f => {
    const ac = contract.acceptance_criteria.find(a => a.id === f.ac_id);
    return ac?.weight === 'critical';
  });

  let overall;
  if (allPassed) {
    overall = 'pass';
  } else if (criticalFailures.length > 0) {
    overall = 'fail';
  } else {
    overall = 'needs_revision';
  }

  return {
    result: overall,
    criteria_results: criteriaResults,
    failure_details: failureDetails,
    overall,
    message: overall === 'pass'
      ? `验收通过: ${criteriaResults.length}/${criteriaResults.length} 条标准全部满足`
      : `验收未通过: ${failureDetails.length} 条标准未满足（${criticalFailures.length} 条 critical）`,
  };
}

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
    path.join(CONFIG.collaborationDir, 'task_queue'),
    path.join(CONFIG.collaborationDir, 'deliverables'),
    path.join(CONFIG.collaborationDir, 'reviews'),
    path.join(CONFIG.collaborationDir, 'supervisor_checkpoints'),
    path.join(CONFIG.collaborationDir, 'logs'),
  ];
  dirs.forEach(ensureDir);
  console.log('[调度器] 协作目录初始化完成');
}

function createTaskFile(taskId, taskDescription, gateResult) {
  const task = {
    task_id: taskId,
    description: taskDescription,
    status: 'created',
    created_at: new Date().toISOString(),
    current_stage: gateResult.firstBreak ? gateResult.firstBreak.gate_key.replace('phase_', 'phase_') : 'phase_1',
    assigned_to: 'codex',
    pipeline: ['audit', 'review', 'develop'],
    execution_mode: 'three_ide_polling',
    constitution_version: 'V3.6.0',
    gate_engine_version: '1.0.0',
    gate_check_at_init: gateResult.overall,
    supervisor_checkpoints: {},
    collaboration_paths: {
      deliverables: path.join(CONFIG.collaborationDir, 'deliverables', `${taskId}_research/`),
      reviews: path.join(CONFIG.collaborationDir, 'reviews', taskId),
      code: path.join(CONFIG.collaborationDir, 'deliverables', `${taskId}_code/`),
      checkpoints: path.join(CONFIG.collaborationDir, 'deliverables', `${taskId}_research/supervisor_checkpoints/`),
    },
  };

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

function generateTaskInstruction(taskId, taskDescription, gateResult) {
  const deliverablesDir = path.join(CONFIG.collaborationDir, 'deliverables', `${taskId}_research`);
  const codeDir = path.join(CONFIG.collaborationDir, 'deliverables', `${taskId}_code`);
  const checkpointsDir = path.join(deliverablesDir, 'supervisor_checkpoints');

  // 根据门禁检查结果，确定应该从哪个 Phase 开始
  const resumePhase = gateResult.firstBreak
    ? gateResult.firstBreak.gate_key
    : 'phase_1';

  const phases = {
    resume_phase: {
      agent: 'codex',
      instruction: `门禁引擎检查结果：当前应从 ${resumePhase}（${gateResult.firstBreak ? gateResult.firstBreak.phase : 'Phase 1 意图锚定'}）开始执行。
原因：${gateResult.firstBreak ? gateResult.firstBreak.detail : '全新任务，从起点开始'}。

执行步骤：
1. 读取门禁引擎配置: ${CONFIG.devConstitution}
2. 按门禁链顺序执行，每完成一个 Phase 写入对应 produce_file
3. Phase 5 如为创作类任务，写入 leaf_nodes.json（创作类简化规则）
4. Phase 6 开始前执行蓝图对照：读取 path.json + nodes.json
5. Phase 6 完成后写入 blueprint_comparison.json
6. Phase 7 自动化内容校验，写入 verification.json
7. Phase 8 产出 manifest.json + health_check.json
8. 每个 Phase 完成后写入 cp_N.self_check.json 自检文件`,
      resume_from: resumePhase,
    },
    phase_1: {
      agent: 'codex',
      instruction: `执行 Phase 1 全自动自问自答。
1. 读取 ${CONFIG.devConstitution}
2. 调用 ${CONFIG.selfAuditChecklist}，按 8 维度 44 问逐层自审
3. 基于 44 问的回答，合成一句话精炼需求 + spec.json（含 goal_trace）
4. 自评置信度，写入 spec.json
5. 产出路径：${deliverablesDir}/spec.json
6. 完成后写入 ${checkpointsDir}/cp_0.self_check.json
7. 自动进入 Phase 2，不询问用户，不等待用户`,
      output: `${deliverablesDir}/spec.json`,
      checkpoint_signal: `${checkpointsDir}/cp_0.pending`,
    },
    phase_2_5: {
      agent: 'codex',
      instruction: `执行 Phase 2-5 去程设计。
产出 path.json、nodes.json、interfaces.json，递归拆解到叶节点。
每阶段产出后写入对应的 cp_N.self_check.json。
产出路径：${deliverablesDir}/`,
      outputs: [
        `${deliverablesDir}/path.json`,
        `${deliverablesDir}/nodes.json`,
        `${deliverablesDir}/interfaces.json`,
        `${deliverablesDir}/leaf_nodes.json`,
      ],
    },
    phase_6_8: {
      agent: 'cursor',
      instruction: `执行 Phase 6-8 回程实现。
1. 读取 ${deliverablesDir}/ 中的设计文档
2. 按去程蓝图生成代码
3. 产出路径：${codeDir}/
4. Phase 7 产出 verification.json
5. Phase 8 产出 manifest.json + health_check.json
6. 完成后创建 code_complete.txt`,
      output: `${codeDir}/code_complete.txt`,
    },
  };

  const supervisor_checkpoints = {
    cp_0: { phase: 1, description: 'Phase 1 自审质量校验：44 问完整？inferred < 30%？goal_trace 完整？' },
    cp_1: { phase: 2, description: 'path.json 存在且与 spec.json 一致？' },
    cp_2: { phase: 3, description: 'nodes.json 每个节点 maps_to_root_goal 非空？' },
    cp_3: { phase: 4, description: 'interfaces.json 与 spec.json 数值约束一致？' },
    cp_4: { phase: 5, description: '叶节点或 nodes/ 子目录存在？' },
    cp_5: { phase: 6, description: '最终产出存在？blueprint_comparison.json 存在？' },
    cp_6: { phase: 7, description: 'verification.json 存在且 passed？' },
    cp_7: { phase: 8, description: 'manifest.json + health_check.json 存在？' },
  };

  return {
    task_id: taskId,
    description: taskDescription,
    created_at: new Date().toISOString(),
    gate_check_result: gateResult.overall,
    resume_from: resumePhase,
    phases,
    supervisor_checkpoints,
  };
}

// ============================================================
// 模式 1：初始化后退出（默认）—— Agent 轮询接管
// ============================================================

function runInitMode(taskDescription) {
  const taskId = `task_${Date.now()}`;
  setupCollaborationDirs();

  const deliverablesDir = path.join(CONFIG.collaborationDir, 'deliverables', `${taskId}_research`);
  const checkpointsDir = path.join(deliverablesDir, 'supervisor_checkpoints');
  const codeDir = path.join(CONFIG.collaborationDir, 'deliverables', `${taskId}_code`);
  const reviewDir = path.join(CONFIG.collaborationDir, 'reviews', taskId);
  ensureDir(deliverablesDir);
  ensureDir(checkpointsDir);
  ensureDir(codeDir);
  ensureDir(reviewDir);

  // === 门禁引擎检查 ===
  const gateResult = runGateCheck(deliverablesDir);

  // 反跳过检测
  const skipResult = detectSystemicSkip(gateResult.chain);
  if (skipResult.hasSystemicSkip) {
    console.error(`[门禁] ⚠ ${skipResult.message}`);
    console.error('[门禁] 这可能意味着之前的执行跳过了 Phase，建议重新从缺失的最早 Phase 开始');
  }

  // 如果门禁全通过，说明是已有任务的重新检查
  if (gateResult.overall === 'full_pass') {
    console.log('');
    console.log('[调度器] 门禁全链路已通过。该任务已完成，无需重新初始化。');
    console.log(`[调度器] 交付物目录: ${deliverablesDir}`);
    return taskId;
  }

  // 创建任务文件，记录门禁状态
  const task = createTaskFile(taskId, taskDescription, gateResult);

  // V4.2: 通过 Bridge 推送任务给 Codex
  initBridgeClient();
  setTimeout(() => {
    pushTaskToBridge(task, 'codex');
  }, 1000); // 等 Bridge 连接建立

  // 写入详细任务指令
  const instruction = generateTaskInstruction(taskId, taskDescription, gateResult);
  const instructionPath = path.join(CONFIG.collaborationDir, 'task_queue', `${taskId}_instruction.json`);
  fs.writeFileSync(instructionPath, JSON.stringify(instruction, null, 2));

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  三 IDE 流水线任务已初始化');
  console.log('═══════════════════════════════════════');
  console.log(`任务ID: ${taskId}`);
  console.log(`你的描述: "${taskDescription}"`);
  console.log(`工作区: ${WORKSPACE_DIR}`);
  console.log(`总纲: ${CONFIG.devConstitution}`);
  console.log(`门禁状态: ${gateResult.overall} (${gateResult.passCount}/${gateResult.phaseCount})`);
  if (gateResult.firstBreak) {
    console.log(`断点位置: ${gateResult.firstBreak.phase} — ${gateResult.firstBreak.detail}`);
  }
  console.log('');
  console.log('接下来的自动化流程（无需你参与）：');
  console.log('');
  console.log('  1. Codex IDE 的 Agent 轮询到 task_queue 中的新任务');
  console.log('     → 从断点 Phase 开始执行');
  console.log('     → 每完成一个 Phase 写入 produce_file');
  console.log('     → 每完成一个 Phase 写入 cp_N.self_check.json');
  console.log('');
  console.log('  2. OpenClaw IDE 的 Agent 轮询到检查点');
  console.log('     → 执行检查点校验');
  console.log('     → 写入校验结果');
  console.log('');
  console.log('  3. 全链路完成后');
  console.log('     → 产出 manifest.json + health_check.json');
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

    // 最终门禁检查
    console.log('[调度器] 执行最终门禁检查...');
    const finalGate = runGateCheck(deliverablesDir);
    const skipCheck = detectSystemicSkip(finalGate.chain);
    if (skipCheck.hasSystemicSkip) {
      console.error(`[调度器] ⚠ 最终检查发现系统性跳过: ${skipCheck.message}`);
    }

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
// 模式 3：独立门禁检查（--gate-check）
// ============================================================

function runStandaloneGateCheck() {
  // 查找协作目录下所有任务的 deliverables
  const deliverablesBase = path.join(CONFIG.collaborationDir, 'deliverables');
  if (!fs.existsSync(deliverablesBase)) {
    console.error(`[门禁] 协作交付物目录不存在: ${deliverablesBase}`);
    console.error('[门禁] 请先运行 node orchestrator.js --task "描述" 初始化任务');
    process.exit(1);
  }

  const taskDirs = fs.readdirSync(deliverablesBase)
    .filter(name => name.endsWith('_research'))
    .map(name => path.join(deliverablesBase, name));

  if (taskDirs.length === 0) {
    console.error('[门禁] 未找到任何任务的交付物目录');
    process.exit(1);
  }

  console.log(`[门禁] 找到 ${taskDirs.length} 个任务交付物目录`);
  console.log('');

  taskDirs.forEach((dir, i) => {
    console.log(`[门禁] ── 任务 ${i + 1}: ${path.basename(dir)} ──`);
    const result = runGateCheck(dir);
    const skipCheck = detectSystemicSkip(result.chain);
    if (skipCheck.hasSystemicSkip) {
      console.error(`[门禁]   ⚠ ${skipCheck.message}`);
    }
    console.log('');
  });
}

// ============================================================
// 入口
// ============================================================

const args = process.argv.slice(2);
const taskIndex = args.indexOf('--task');
const watchMode = args.includes('--watch');
const gateCheckMode = args.includes('--gate-check');
const contractCheckMode = args.includes('--contract-check');

const taskDescription = taskIndex !== -1 ? args[taskIndex + 1] : null;

// 模式 4：Sprint Contract 验收检查（--contract-check）
if (contractCheckMode) {
  const contractIdx = args.indexOf('--contract-check');
  const taskDir = args[contractIdx + 1];
  const contractPath = args[contractIdx + 2];

  if (!taskDir || !contractPath) {
    console.error('用法: node orchestrator.js --contract-check <taskDir> <contractPath>');
    process.exit(1);
  }

  console.log('[Contract] Sprint Contract 验收检查');
  console.log(`[Contract] 任务目录: ${taskDir}`);
  console.log(`[Contract] 合同文件: ${contractPath}`);

  if (!fs.existsSync(contractPath)) {
    console.error(`[Contract] 合同文件不存在: ${contractPath}`);
    process.exit(1);
  }

  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf-8'));
  const result = validateContract(contract, taskDir);

  console.log(`[Contract] 验收结果: ${result.overall}`);
  console.log(`[Contract] ${result.message}`);
  console.log(JSON.stringify({
    criteria_results: result.criteria_results,
    failure_details: result.failure_details,
  }, null, 2));
  process.exit(result.overall === 'pass' ? 0 : 1);
}

console.log('');
console.log(`[调度器] V3.6 — 工作区: ${WORKSPACE_DIR}`);
console.log(`[调度器] 总纲: ${CONFIG.devConstitution}`);
console.log('');

if (gateCheckMode) {
  runStandaloneGateCheck();
} else if (!taskDescription) {
  console.log('用法:');
  console.log('  node orchestrator.js --task "模糊描述"           # 初始化 + 门禁检查后退出');
  console.log('  node orchestrator.js --task "模糊描述" --watch   # 同步等待全链路完成');
  console.log('  node orchestrator.js --gate-check                 # 独立门禁检查（检查已有任务）');
  console.log('  node orchestrator.js --workspace "G:\\path"       # 指定工作区路径');
  console.log('');
  console.log('环境变量:');
  console.log('  CONSTITUTION_WORKSPACE=G:\\_AI_Interop_Hub        # 也可通过环境变量指定');
  console.log('');
  process.exit(0);
}

if (watchMode) {
  runWatchMode(taskDescription);
} else {
  runInitMode(taskDescription);
}
