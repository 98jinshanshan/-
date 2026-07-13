---
id: DOC-HUB-0021
title: 共享挂载根映射与SSOT声明
project: _AI_Interop_Hub
partition: root
type: governance
status: active
owner: AI
created: 2026-07-12
updated: 2026-07-12
summary: /workspace虚拟路径到本地绝对路径的映射表与SSOT声明。
tags: [路径映射, SSOT, 共享根]
related: [DOC-HUB-0004, DOC-HUB-0011]
---

# 三IDE共享挂载根 — WORKSPACE_ROOT 约定

> 唯一真相源。所有Agent(Codex / OpenClaw / Cursor)在跨项目交接时，均以本文件约定的绝对路径读写协作产物。
> 本文件路径：`G:\_AI_Interop_Hub\WORKSPACE_ROOT.md`

## 1. 为什么需要共享根
三方作业目录彼此分离（见 三IDE协作边界与回执流转规范）：
- OpenClaw：`C:\Users\admin\Documents\OpenClaw_Audit_Reports`
- Codex：`G:\Users\admin\Documents\AI_Workspace_OS`
- Cursor：`G:\CURSOR`

各自私有目录对方不可写，导致总纲 `/workspace/collaboration` 交接产物无处落脚。
本共享根即三方都能本地直达的中立交接区，非云端、非容器路径。

## 2. 挂载映射（总纲虚拟路径 → 本地绝对路径）
| 总纲虚拟路径 | 本地绝对路径（Windows） |
|--------------|--------------------------|
| `/workspace` | `G:\_AI_Interop_Hub` |
| `/workspace/collaboration` | `G:\_AI_Interop_Hub\collaboration` |
| `/workspace/collaboration/task_queue` | `G:\_AI_Interop_Hub\collaboration\task_queue` |
| `/workspace/collaboration/deliverables` | `G:\_AI_Interop_Hub\collaboration\deliverables` |
| `/workspace/collaboration/reviews` | `G:\_AI_Interop_Hub\collaboration\reviews` |
| `/workspace/collaboration/logs` | `G:\_AI_Interop_Hub\collaboration\logs` |
| `/workspace/intermediate` | `G:\_AI_Interop_Hub\intermediate` |
| `/workspace/docs` | `G:\_AI_Interop_Hub\docs` |

> 规则：凡总纲或指令中出现 `/workspace/...`，一律替换为 `G:\_AI_Interop_Hub\...` 后按绝对路径访问。

## 3. 命名空间（多项目隔离）
同一 task_id 可能同时服务多个项目，用 `{task_id}__{project}` 命名空间隔离，避免覆盖：
- `task_docgov_20260712__AI_Workspace_OS`
- `task_docgov_20260712__AI-Agent-Interop`

产物目录：
- 规格书：`G:\_AI_Interop_Hub\collaboration\deliverables\{ns}_research\spec.json`
- 审核：`G:\_AI_Interop_Hub\collaboration\reviews\{ns}\review.json`
- 交付报告：`G:\_AI_Interop_Hub\collaboration\deliverables\{ns}_DELIVERY_REPORT.md`
- 任务：`G:\_AI_Interop_Hub\collaboration\task_queue\{ns}.json`

## 4. 三IDE读写权限（沿用协作边界规范）
| 角色 | 对共享Hub权限 | 典型动作 |
|------|---------------|----------|
| Codex（研究/治理） | 读写 | 产出 spec.json、成果文档、更新 task_queue |
| OpenClaw（审核） | 读写(仅reviews) + 只读其余 | 读 spec，写 reviews/{ns}/review.json |
| Cursor（开发） | 读写(仅deliverables/{ns}_code) + 只读其余 | 读 review 通过后写代码产物 |

> 各Agent仍不得越界修改对方私有项目目录；共享Hub是唯一合法交接区。

## 5. 路径书写铁律
- 禁止在交接产物中使用省略号路径（如三点加斜杠）、相对路径、`~`、云端URL。
- 一律写完整绝对路径（含盘符），如 `G:\_AI_Interop_Hub\collaboration\deliverables\...\spec.json`。
- spec.json 内必须含 `storage_location`（type=local_shared_hub）与 `downstream_handoff.*_abs_path`。

## 6. 开发总纲唯一权威源（SSOT）
开发总纲及其配套文档已迁入本共享根，作为后续所有开发的唯一准则。桌面旧目录停用（保留重定向）。

- 权威目录：`G:\_AI_Interop_Hub\00-governance\`
- 清单：`G:\_AI_Interop_Hub\00-governance\manifest.json`

### 总纲文档映射（总纲内部 /workspace 引用 → 本地绝对路径）
| 总纲虚拟路径 | 本地绝对路径 | 状态 |
|--------------|--------------|------|
| `/workspace/开发总纲_可执行版.json` | `G:\_AI_Interop_Hub\00-governance\开发总纲_可执行版.json` | 权威(机械执行版) |
| `/workspace/开发总纲_人类可读版.md` | `G:\_AI_Interop_Hub\00-governance\开发总纲_人类可读版.md` | 权威 |
| `/workspace/AGENT_INSTRUCTION.md` | `G:\_AI_Interop_Hub\00-governance\AGENT_INSTRUCTION.md` | 权威(行为入口) |
| `/workspace/Agent子节点沟通模板.md` | `G:\_AI_Interop_Hub\00-governance\Agent子节点沟通模板.md` | 权威(模板1-14) |
| `/workspace/orchestrator.js` | `G:\_AI_Interop_Hub\00-governance\orchestrator.js` | 权威(调度器) |
| `/workspace/开发总纲_问答题框架.md` | `G:\_AI_Interop_Hub\00-governance\开发总纲_问答题框架.md` | 权威·运行时组件(被JSON trigger引用,V3.0) |

### 关联产物更新规则（改总纲后必做）
1. 更新 `00-governance/manifest.json`（sha1/size/updated 变化）。
2. 更新本文件映射表（如新增/重命名总纲文档）。
3. 更新 Hub 根 `INDEX.md`。
4. 各任务 spec.json 的 `governance_ref` 指向本目录总纲绝对路径（版本随之刷新）。
5. 若总纲版本号(version)升级：在 `00-governance/CHANGELOG.md` 记一条，旧版移入 `_deprecated/`。
6. 桌面原目录不再作为源，仅保留 `_MIGRATED_勿用.md` 重定向。

### Agent 读取铁律
- 任何 Agent 启动时，总纲一律从 `G:\_AI_Interop_Hub\00-governance\` 读取，禁止再读桌面旧目录。
- 引用总纲时写完整绝对路径，禁用 `/workspace/` 裸路径与省略号路径。