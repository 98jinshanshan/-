# 三 IDE 角色自动化联通协议 V1.0

> 解决"三个真实 IDE 实例（Codex / OpenClaw / Cursor）之间如何自动通信"的核心问题
> 配套文档：AGENT_INSTRUCTION.md、orchestrator.js、开发总纲_可执行版.json

---

## 一、问题定义

### 1.1 实际物理架构

你拥有**三个独立的 IDE 实例**，不是同一个 IDE 下的三个标签页：

| IDE 实例 | 角色 | 职责 | 物理位置 |
|---------|------|------|---------|
| Codex IDE | 研究员 | Phase 1-5 去程设计 | 独立进程/窗口 |
| OpenClaw IDE | 监督者+审核员 | 8 个检查点校验 + 边界审核 | 独立进程/窗口 |
| Cursor IDE | 开发者 | Phase 6 回程实现 | 独立进程/窗口 |

每个 IDE 实例内部运行着各自的 Agent。它们之间**不能直接互相调用**——没有 API、没有 RPC、没有共享内存。

### 1.2 核心问题

Codex 写完 spec.json 后，怎么"自动"通知 OpenClaw 来校验？
OpenClaw 校验通过后，怎么"自动"通知 Cursor 来开发？
Cursor 开发完成后，怎么"自动"通知 OpenClaw 来验收？

**答案：共享文件系统 + 轮询 = 三个独立 Agent 之间的异步通信。**

---

## 二、核心机制：共享文件系统通信

### 2.1 基本原理

```
┌──────────────────────────────────────────────────────────────────────┐
│                    共享工作区 /workspace/                              │
│                                                                       │
│   ┌─────────────────┐                                                │
│   │  orchestrator.js │ ← 调度器：写入任务、协调三个阶段                │
│   └────────┬────────┘                                                │
│            │ 写入任务文件                                              │
│            ▼                                                          │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │  /workspace/collaboration/         ← 三个 IDE 共享的协作目录   │    │
│   │    ├── task_queue/                 ← 任务队列                  │    │
│   │    ├── deliverables/               ← 各 Agent 的产出物          │    │
│   │    ├── reviews/                    ← 审核结果                   │    │
│   │    └── supervisor_checkpoints/     ← 检查点状态机               │    │
│   └─────────────────────────────────────────────────────────────┘    │
│            │                    │                    │                │
│      ┌─────▼─────┐        ┌─────▼─────┐        ┌─────▼─────┐        │
│      │  Codex    │        │ OpenClaw  │        │  Cursor   │        │
│      │  IDE 实例  │        │  IDE 实例  │        │  IDE 实例  │        │
│      │           │        │           │        │           │        │
│      │ 轮询       │        │ 轮询       │        │ 轮询       │        │
│      │ task_queue│        │ checkpoints│       │ task_queue│        │
│      │           │        │           │        │           │        │
│      │ 写入       │        │ 写入       │        │ 写入       │        │
│      │ deliverable│       │ reviews/  │        │ deliverable│       │
│      └───────────┘        └───────────┘        └───────────┘        │
└──────────────────────────────────────────────────────────────────────┘
```

**关键点**：每个 IDE 实例的 Agent 只做三件事——
1. **轮询**自己关心的目录（Codex 轮询 task_queue，OpenClaw 轮询 checkpoints，Cursor 轮询 reviews）
2. **读取**上游 Agent 写入的产物文件
3. **写入**自己的产出到共享目录，供下游 Agent 读取

这**不是**同一个 Agent 在"扮演"三个角色——这是三个物理上独立的 Agent 进程，各自运行在自己的 IDE 中，通过文件系统异步交接。

### 2.2 为什么用文件系统而不是 API

| 方案 | 可行性 | 问题 |
|------|--------|------|
| API/RPC 调用 | 不可行 | 三个 IDE 没有暴露可编程 API |
| 消息队列 | 不可行 | 需要额外基础设施，IDE 不内置 |
| 剪贴板共享 | 不可靠 | 格式丢失、需用户手动操作 |
| **共享文件系统** | **可行** | 三个 IDE 访问同一个 `/workspace/`，Agent 读写文件即可 |

只要三个 IDE 实例挂载同一个工作区目录，文件系统就是它们之间的天然通信总线。

---

## 三、各 Agent 的轮询与执行机制

三个 Agent 的完整轮询循环、工作流程、禁止行为详见 `AGENT_INSTRUCTION.md`。此处仅总结通信相关的关键点：

| Agent | 轮询目标 | 写入产物 | 触发下游 |
|-------|---------|---------|---------|
| Codex | `task_queue/` | `deliverables/{task_id}_research/` | 写入 `cp_N.pending` |
| OpenClaw | `supervisor_checkpoints/` | `cp_N.result` + `reviews/{task_id}/review.json` | .result 被 Codex/Cursor 轮询 |
| Cursor | `reviews/` | `deliverables/{task_id}_code/` | 写入 `cp_N.pending` + `code_complete.txt` |

**核心原则**：每个 Agent 只读写文件，不"等待"对方。Codex 写入 .pending 后轮询 .result；OpenClaw 轮询 .pending 并写入 .result；Cursor 轮询 reviews/ 并写入 code_complete.txt。三个 Agent 完全异步，互不阻塞。

---

## 四、触发文件协议（.pending → .processing → .result）

文件协议本身**不因单/多 Agent 环境而改变**——它只是描述"任务状态如何通过文件传递"。

### 4.1 目录结构

```
/workspace/collaboration/deliverables/{task_id}_research/
  ├── spec.json                          ← Codex 产出
  ├── path.json                          ← Codex 产出
  ├── nodes.json                         ← Codex 产出
  ├── interfaces.json                    ← Codex 产出
  ├── manifest.json                      ← Codex 产出
  │
  └── supervisor_checkpoints/            ← OpenClaw 轮询此目录
      ├── cp_0.pending                   ← Codex 写入："请审核 Phase 1"
      ├── cp_0.processing                ← OpenClaw 写入："正在审核中"
      ├── cp_0.result                    ← OpenClaw 写入："通过/不通过"
      ├── cp_1.pending
      ├── cp_1.result
      ├── ...
      └── cp_7.result
```

### 4.2 触发文件格式

**`.pending` 文件（Codex/Cursor 写入，触发审核）：**
```json
{
  "checkpoint_id": "cp_0",
  "phase": 1,
  "artifact": "spec.json",
  "artifact_path": "/workspace/collaboration/deliverables/task_xxx_research/spec.json",
  "created_at": "2026-07-13T10:00:00Z",
  "created_by": "codex",
  "root_goal_sha256": "a3f2b8c1...",
  "status": "pending"
}
```

**`.processing` 文件（OpenClaw 写入，声明正在审核，防止重复处理）：**
```json
{
  "checkpoint_id": "cp_0",
  "started_at": "2026-07-13T10:00:05Z",
  "processing_by": "openclaw",
  "status": "processing"
}
```

**`.result` 文件（OpenClaw 写入，审核结论）：**
```json
{
  "checkpoint_id": "cp_0",
  "phase": 1,
  "result": "pass",
  "timestamp": "2026-07-13T10:00:30Z",
  "reviewed_by": "openclaw",
  "automated_checks": {
    "file_exists": true,
    "44_fields_present": true,
    "inferred_ratio": 0.2727,
    "inferred_under_30_percent": true,
    "goal_trace_present": true,
    "goal_trace_root_non_empty": true
  },
  "semantic_review": {
    "root_goal_consistent": true,
    "acceptance_criteria_measurable": true,
    "scope_matches_root_goal": true,
    "contradictions_found": [],
    "missing_dimensions": []
  },
  "summary": "Phase 1 产出自洽。44 问完整，inferred 27.27% < 30%，goal_trace 完整。放行。"
}
```

### 4.3 三种结果

| 结果 | 含义 | 后续动作 |
|------|------|---------|
| `pass` | 全部检查通过 | Codex/Cursor 看到 .result=pass 后进入下一 Phase |
| `fail` | 自动化检查不通过 | Codex/Cursor 看到 .result=fail 后根据 failure_details 重做 |
| `fail_semantic` | 语义审查不通过 | Codex/Cursor 根据 contradiction 和 missing 重做 |

---

## 五、全流程 8 个检查点的联通协议

### 5.1 去程（Phase 1-5）—— Codex ↔ OpenClaw

```
Phase 1 完成 → Codex 写入 cp_0.pending
                → OpenClaw 轮询到 cp_0.pending → 执行 cp_0 → 写入 cp_0.result
                → Codex 轮询到 cp_0.result = pass → 进入 Phase 2
                → Codex 轮询到 cp_0.result = fail → 重做 Phase 1

Phase 2 完成 → Codex 写入 cp_1.pending
                → OpenClaw 轮询到 cp_1.pending → 执行 cp_1 → 写入 cp_1.result
                → ...

Phase 5 完成 → Codex 写入 cp_4.pending
                → OpenClaw 轮询到 cp_4.pending → 执行 cp_4 → 写入 cp_4.result
                → pass → Codex 写入最终设计文档，通知 Cursor 可开始
```

### 5.2 回程（Phase 6-8）—— Cursor ↔ OpenClaw

```
Phase 6 完成 → Cursor 写入 cp_5.pending
                → OpenClaw 轮询到 cp_5.pending → 执行 cp_5 → 写入 cp_5.result
                → Cursor 轮询到 cp_5.result = pass → 进入 Phase 7
                → ...

Phase 8 完成 → Cursor 写入 cp_7.pending
                → OpenClaw 轮询到 cp_7.pending → 执行 cp_7 → 写入 cp_7.result
                → pass → 任务完成，通知用户
```

### 5.3 联通的核心规则

```json
{
  "agent_handoff_protocol": {
    "rule_1": "每个 Agent 只在自己的 IDE 中运行，不跨 IDE 执行",
    "rule_2": "任何 Phase 完成后，执行 Agent 必须写入对应的 .pending 文件",
    "rule_3": "OpenClaw 持续轮询 supervisor_checkpoints/，发现 .pending 即执行",
    "rule_4": "Codex/Cursor 持续轮询 supervisor_checkpoints/，发现 .result 即响应",
    "rule_5": ".result 为 pass 时，执行 Agent 进入下一 Phase",
    "rule_6": ".result 为 fail 时，执行 Agent 根据 failure_details 重做当前 Phase",
    "rule_7": "同一 Phase 连续 fail 3 次 → 通知用户介入",
    "rule_8": "执行 Agent 不得在产物中预填任何 supervisor_* 或 alignment_* 字段",
    "rule_9": "每个 Agent 的 AGENT_INSTRUCTION.md 只描述该 Agent 的职责，不描述其他 Agent"
  }
}
```

---

## 六、orchestrator.js 的角色

orchestrator.js 是**初始化器**，不是持续运行的守护进程。它的职责：

1. **创建任务**：接收用户的一句话描述，生成 taskId，写入 task_queue
2. **初始化协作目录**：创建 task_queue/、deliverables/、reviews/、supervisor_checkpoints/
3. **写入初始指令**：将任务指令写入各 IDE 的工作目录下的 `TASK_{taskId}_{stage}.md`
4. **退出**：初始化完成后 orchestrator.js 退出。后续由三个 Agent 的轮询机制接管

```
用户执行：
  node orchestrator.js --task "生成一本悬疑推理类小说大纲"

orchestrator.js 做的事：
  1. 创建 /workspace/collaboration/task_queue/task_xxx.json
  2. 创建 /workspace/collaboration/deliverables/task_xxx_research/
  3. 写入 TASK_xxx_audit.md 到 Codex IDE 的工作目录
  4. 打印："任务已创建。Codex 将自动检测并开始执行。"
  5. 退出

之后：
  Codex Agent 轮询到 task_xxx.json → 开始执行 Phase 1
  OpenClaw Agent 轮询到 .pending → 执行检查点
  Cursor Agent 轮询到 reviews/ → 开始开发
```

---

## 七、与 AGENT_INSTRUCTION.md 的关系

`AGENT_INSTRUCTION.md` 描述每个 Agent "该做什么"（职责、工作流程、禁止行为）。本文件描述 Agent 之间"如何通信"（文件协议、触发机制、部署方案）。两者互补，不重叠。

每份 AGENT_INSTRUCTION.md 只含该 Agent 角色的规范，不包含其他 Agent 的职责——这是"三个独立 Agent"和"一个 Agent 扮演三个角色"的本质区别。

---

## 八、如何让三个 IDE 共享同一个 /workspace/

这是实际部署的关键。三种方案，按推荐度排序：

### 方案 A：同一台机器，软链接到同一目录（推荐）

```
物理机上的目录结构：
  /home/user/shared_workspace/          ← 实际的共享目录
    ├── collaboration/
    ├── orchestrator.js
    ├── AGENT_INSTRUCTION.md
    └── ...

Codex IDE 的工作区：  /home/user/shared_workspace/
OpenClaw IDE 的工作区：/home/user/shared_workspace/
Cursor IDE 的工作区：  /home/user/shared_workspace/

三个 IDE 都打开同一个目录作为项目根目录。
```

### 方案 B：Git 仓库同步

```
1. 创建 Git 仓库：git init /home/user/shared_workspace/
2. 三个 IDE 各自 clone 同一仓库
3. 每个 Agent 完成后 commit + push
4. 每个 Agent 轮询前先 git pull
```

### 方案 C：网络共享目录（NAS / NFS）

```
三台机器挂载同一个 NAS 目录到 /workspace/
```

---

## 九、与 V3.5 优化方案的关系

| V3.5 优化方案 | 本文档补充 |
|------|------|
| 监督者独立性（S1） | 三 Agent 物理分离：OpenClaw 在独立 IDE 中运行，天然独立 |
| 监督者检查点改为自动化校验 | 校验的具体执行流程和触发机制 |
| 强制递归产出（S2） | 递归中每层子节点的检查点联通 |
| 接口一致性检查（P4-1） | cp_3 的自动化校验细节 |
| 内容自动化校验（P7-2） | cp_6 的自动化校验细节 |
| 蓝图对照（S3） | cp_5 的自动化校验细节 |

**V3.5 优化方案中"七、不做什么"部分提到的"监督者需要另一个物理 Agent"——本文档正是解决这个问题的。三个 IDE 就是三个物理 Agent。**

---

## 十、实现优先级

**Phase 1（当前即可做）：**

1. 确保三个 IDE 共享同一个 `/workspace/` 目录（方案 A/B/C 任选）
2. 在每个 IDE 中放置对应的 AGENT_INSTRUCTION.md（只含该 Agent 的职责）
3. 创建 `supervisor_checkpoints/` 目录结构
4. 每个 Agent 在自己的 IDE 中按轮询逻辑运行

**Phase 2（完善自动化）：**

1. 运行 orchestrator.js 初始化任务
2. 验证 Codex → OpenClaw → Cursor 的完整链路
3. 调优轮询间隔（建议 5-10 秒）

**Phase 3（进一步自动化）：**

1. 为每个 IDE 编写启动脚本，自动开始轮询
2. 增加心跳文件（每个 Agent 定期写入 `heartbeat.json`，用于监控 Agent 是否在线）
3. 增加日志聚合