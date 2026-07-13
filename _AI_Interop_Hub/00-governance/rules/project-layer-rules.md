---
id: DOC-HUB-0012
title: 项目层规则
project: _AI_Interop_Hub
partition: 00-governance/rules
type: governance
status: active
owner: AI
created: 2026-07-12
updated: 2026-07-12
summary: 项目层规则(P-A/P-B/P-C)，可覆盖全局层。
tags: [规则, 项目层, 治理]
related: [DOC-HUB-0004, DOC-HUB-0011]
---

# 项目层规则（Project Layer Rules）

> 定位：对应总纲 `config_priority` 的 `project_level`，覆盖全局层，被任务层覆盖。
> 原则：全局规则定义“必须怎么做”，项目文档记录“本项目实际怎么做”，二者是层级关系不是复制关系。
> 来源：rules-index.json（project 层共 40 条）。

## P-A. AI_Workspace_OS（系统级工作区）
- 目录架构：新项目必须放 `02_Projects_项目区` 下；根目录结构、项目内标准结构固定。
- 项目启动/接手 SOP、项目结束写回 SOP：任务结束写回决策/经验/下一步，同步索引与谱系。
- 会话结束文档治理 SOP：涉及移动/重命名/删除必须先列映射表并等待用户确认。
- 归档区 `.ai_rules` 映射处理 SOP；文档唯一承继链规范。
- 源：`Shared_Project_Rules/*.md`、`docs/00_总索引与规则/*`、`docs/10_SOP与工作流基础/*`。

## P-B. AI-Agent-Interop（联合集成样板）
- 编号分区强制：00~05 编号即语义、位置即分类；ADR 单独子分区；分区红线。
- 三层存储模型（治理文档/运行期产物/冷备交付）职责互斥。
- front-matter 状态机 + 稳定 ID；脚本化索引/冗余检测/版本迁移闭环。
- 源：`00-methodology/doc-governance/*.md`。

## P-C. 子项目规则（Project_10/11/12）
- 各子项目通过 `.ai_rules/_shared` 映射到系统级共享规则（不复制，引用）。
- 子项目专属：如 Project_11 `工具选择规则.md`、Project_12 `候选项目人工复核SOP.md`。
- 特定领域规则：核心/适配层边界、第三方适配器默认关闭、商业核心禁入、防卡死强制规则。
- 源：`02_Projects_项目区/*/docs/*`、`.ai_rules/_shared/*`（映射，SSOT 源在系统级）。