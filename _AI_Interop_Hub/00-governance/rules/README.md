---
id: DOC-HUB-0014
title: 规则集说明
project: _AI_Interop_Hub
partition: 00-governance/rules
type: governance
status: active
owner: AI
created: 2026-07-12
updated: 2026-07-12
summary: 分层规则集的结构与用法说明。
tags: [规则, 说明, 索引]
related: [DOC-HUB-0004, DOC-HUB-0011]
---

# 分层规则集 — 总纲挂接说明

> 本目录（00-governance/rules）是从 AI_Workspace_OS 与 AI-Agent-Interop 全部规则文档索引、按《开发总纲》三层配置结构转换而成的协助规则集。

## 与总纲的挂接
总纲 `global_config.config_priority = [task_level, project_level, global_level]`（查找从最具体开始，找不到向上回退）。本目录三份文档正是这三层的规则实体：

| 总纲层级 | 本目录文档 | 优先级 |
|----------|-----------|--------|
| task_level | task-layer-rules.md | 最高（最具体） |
| project_level | project-layer-rules.md | 中 |
| global_level | global-layer-rules.md | 兜底（最通用） |

## 双版本(人类可读 + 机器可执行)
- 机器可执行: rules.json (14条，每条含 id/rule/severity/detect/action/validator，与总纲trigger_question_conditions同构)
- 人类可读: {global,project,task}-layer-rules.md (引用rules.json的id)
- 校验器: scripts/gang_gate.py (驱动于rules.json，交付前必跑)

## 索引
- `rules-index.json`：两个项目全部规则文档的机读索引（含 layer 归类、绝对路径）。

## 使用
- Agent 执行任务时按 config_priority 从 task→project→global 查找适用规则。
- 规则均引用源文档（SSOT），本集是导航层与准则提炼，非全文复制。
- 修改规则改源文档，然后重跑 rules-index 与本集提炼。