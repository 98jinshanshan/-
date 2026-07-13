---
id: DOC-HUB-0013
title: 任务层规则
project: _AI_Interop_Hub
partition: 00-governance/rules
type: governance
status: active
owner: AI
created: 2026-07-12
updated: 2026-07-12
summary: 任务层规则(T1-T3)，优先级最高。
tags: [规则, 任务层, 治理]
related: [DOC-HUB-0004, DOC-HUB-0011]
---

# 任务层规则（Task Layer Rules）

> 定位：对应总纲 `config_priority` 的 `task_level`，最高优先级，仅在具体任务有特殊需求时生效。
> 特征：一次性、与具体交接/回执/节点/批次绑定，任务关闭后转历史。
> 来源：rules-index.json（task 层共 9 条）。

## T1. 交接类（Codex→Cursor 交接提示词）
- 每份交接提示词是一次性任务契约，含目标/边界/验收；任务完成后按生命周期转 archived。
- 源：`docs/60_Cursor交接提示词/*`（非废止/非草案者）。

## T2. 回执类（执行回执）
- 回执标准字段：修改/新增/废止文件清单（路径+行数+说明）、越界确认、交接状态。
- 源：`docs/70_Cursor执行回执/*`。

## T3. 节点/批次类
- 特定节点定义与接入规范、特定批次执行方案（如 EXE-P 系列、VR 系列）。
- 源：AI-Agent-Interop `03-implementation/EXEC-STEPS/*`；AI_Workspace_OS 节点规范。

## 任务层铁律
- 任务层规则不得与全局层 G1-G8 冲突；如冲突需显式声明例外理由并经用户/OpenClaw 确认。
- 任务实例产物落共享根 `collaboration/deliverables/{task_id}__{project}/`。