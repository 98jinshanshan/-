---
title: AI Interop Hub 上下文说明
version: V1.0
created: 2026-07-17
status: active
---

# CONTEXT.md — 项目上下文

## 项目是什么

**AI Interop Hub** 是多 IDE 协作的中立共享根，也是开发总纲的唯一真相源（SSOT）。

核心目标：**一句话输入 → 经过 8 Phase 双程递归流水线 → 输出最终交付物**。

## 为什么存在

单 IDE 受限于上下文窗口和能力边界，无法独立完成复杂的端到端任务。通过三个 IDE 分工协作（研究员 / 协调者 / 开发者），结合明确的交接规范和门禁机制，实现可重复、可验证、可扩展的 AI 协作流水线。

## 核心设计原则

1. **SSOT（唯一真相源）**：每个概念只有一个权威定义，在 `00-governance/` 中
2. **双程递归**：去程（Phase 1-5）只设计，回程（Phase 6-8）只实现；每一层递归重复 8 Phase
3. **门禁即执行**：每个 Phase 有 gate_file（前置条件）和 produce_file（强制产出），不可跳过
4. **唯一文档原则**：禁止复制，只引用源文件
5. **穷举法**：任何决策前必须先穷举所有可能性，再收敛到唯一解

## 三 IDE 角色

| 角色 | 对应 IDE | 职责 | 启动入口 |
|------|---------|------|---------|
| **研究员** | Codex / Cursor | Phase 1-5 去程设计 | `00-governance/AGENT_INSTRUCTION.md` |
| **协调者** | OpenClaw / Windsurf | 全局调度、门禁验证、质量审核 | `00-governance/orchestrator.js` |
| **开发者** | Windsurf / VSCode | Phase 6-8 回程实现 | `00-governance/AGENT_INSTRUCTION.md` |

## 通信方式

三层通信架构（详见 `00-governance/三IDE角色自动化联通协议.md`）：

- **Layer 1**：IDE Bridge（WebSocket 实时消息，端口 9527）
- **Layer 2**：Hooks 触发（系统级事件触发）
- **Layer 3**：IM 机器人桥接（用户入口）

## 版本与演进

- 当前总纲版本：**V3.9.1**
- 演进历史见 `00-governance/CHANGELOG.md`
- 归档文件见 `00-governance/_deprecated/`

## 如何开始

1. 阅读 [`INDEX.md`](INDEX.md) — 了解全局结构
2. 阅读 [`00-governance/README_FIRST.md`](00-governance/README_FIRST.md) — 入门必读
3. 运行 `00-governance/ide-bridge.js` — 启动消息中枢
4. 运行 `00-governance/test-bridge-connection.js` — 验证连通性

## 不在 Hub 范围内的内容

- 各 IDE 的本地配置（属于 IDE 私有）
- 任务运行时的中间产物（放在 `intermediate/` 中，不进版本控制）
- 用户上传的临时文件（各 IDE 自行处理）
