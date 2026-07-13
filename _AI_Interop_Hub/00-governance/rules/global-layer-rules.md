---
id: DOC-HUB-0011
title: 全局层规则
project: _AI_Interop_Hub
partition: 00-governance/rules
type: governance
status: active
owner: AI
created: 2026-07-12
updated: 2026-07-12
summary: 协助总纲的全局层规则集(G1-G14)，对应rules.json。
tags: [规则, 全局层, 治理]
related: [DOC-HUB-0004, DOC-HUB-0011]
---

# 全局层规则（Global Layer Rules）

> 定位：协助《开发总纲》的最高层规则集，对应总纲 `config_priority` 的 `global_level`。
> 适用：所有项目、所有 Agent（Codex/OpenClaw/Cursor）、所有任务默认继承，除非被项目层/任务层显式覆盖。
> 来源：从 AI_Workspace_OS 与 AI-Agent-Interop 的规则文档索引提炼（见 rules-index.json），引用而非复制（SSOT）。

> **机器可执行版**：本文件是人类可读版；每条规则的可判定条件/动作/校验器见同目录 `rules.json`，由 `scripts/gang_gate.py` 自动执行。
> **变更声明**（2026-07-12 21:40 by Codex｜会话：规则集补全与交付闸门驱动化收尾）：
> 本次新增 G3b/G9–G14 六条人类可读条目并刷新校验器对照；同步修正 G1（尾部后缀+知识文档类型）与 G14（同目录归一重名）判定说明。
> 上游：`rules.json`、`DOC_VECTOR_MANDATE_强制规范.md`、`doc-governance.md`、`00_2工作区的命名与架构规范.md`；关联落地：`scripts/gang_gate.py`。已实测 gang_gate ALL PASS。

> 对照：G1→gate_naming、G2→gate_ssot_no_dup、G3→gate_index_meta、G3b→gate_metadata_fields、G4→gate_path、G5→manual_review、G6→gate_mirror_ro、G7→gate_anchor_chain、G8→gate_context_exists、G9→gate_vector_gene、G10→gate_lifecycle、G11→gate_lineage、G12→gate_section_ref、G13→manual_review、G14→gate_redundancy。
## G1. 命名铁律
- 禁止版本号后缀、日期后缀；一个主题一个文档。
- 运行期任务实例（task_id 派生目录/文件）不受此限，属总纲 delivery phase 授权例外。
- 源：总纲 doc_standards.naming_rule；`00_2工作区的命名与架构规范.md`。

## G2. 单一来源（SSOT）
- 内容只存一份，引用而非复制；跨项目共享规则集中在共享根，项目内以映射/引用方式使用。
- 禁止创建与已有文档内容重叠的新文档。
- 源：AI-Agent-Interop `doc-governance.md` / `ssot-versioning.md`；总纲禁止行为清单。

## G3. 索引与元数据
- 每个工作区必须有 INDEX（Phase1 电源），落盘前查 INDEX 防重复。
- 文档须带可机读元数据：AI-Agent-Interop 用 YAML front-matter + 稳定 ID；AI_Workspace_OS 用 DOC_VECTOR 块 + 语义指纹。
- 稳定 ID 原则、段落级引用原则、脚本化索引。
- 源：`文档索引治理规范_稳定ID与脚本化索引.md`；`DOC_VECTOR_MANDATE_强制规范.md`。

## G4. 存储与落盘路径
- 分层存储、职责互斥、不得混放；禁止硬编码绝对路径，走路径解析器/环境变量。
- 一项目一目录，禁止跨项目混放产物。
- 交接产物一律写完整绝对路径，禁用省略号路径/相对路径/云端URL裸引用。
- 源：AI-Agent-Interop `storage-path-policy.md`；本 Hub `WORKSPACE_ROOT.md`。

## G5. 三 IDE 协作边界
- 角色：Codex=研究/文档治理/规则；OpenClaw=只读审核/协调；Cursor=代码实现。
- 各守作业目录，不越界改对方私有项目；共享根是唯一合法交接区。
- 回执禁止「路径+正文+多执行方式」同发造成歧义。
- 源：`三IDE协作边界与回执流转规范.md`。

## G6. 只读镜像铁律
- 上游镜像只读，任何人（含 AI）不得增删改；不回推（防 AGPL 传染/源码外泄）；体检豁免；SBOM 留痕。
- 源：AI-Agent-Interop `upstream-mirror-policy.md`。

## G7. 交付自检（Phase 7/8 强制）
- 完成前必须本地命令核验关键字段；未验证不得声称完成。
- 交付前必须跑交付闸门 `00-governance/scripts/gang_gate.py` 至全绿。
- 不得让用户充当验证者。
- 源：`V7_P0强制自检规则.md`；本 Hub AGENT_INSTRUCTION Phase8 闸门。

## G8. Token 与上下文治理
- 上下文分层（入口/决策/细节）；每项目维护 CONTEXT.md 压缩背景。
- 源：`04_Token效率与上下文治理方案.md`。

## G3b. 元数据字段完整性
- 有元数据块的文档必须字段齐全，仅有分隔符不算合规。
- AI-Agent-Interop front-matter 必填：id/title/project/partition/type/status/owner。
- AI_Workspace_OS DOC_VECTOR 必填 8 项：vector_id/semantic_fingerprint/stratum_layer/primary_upstream/downstream_impact/contribution/health_score/governance_status。
- 校验器：gate_metadata_fields（仅校验已带元数据块的文档，不强推未治理存量）。
- 源：`doc-governance.md §2.2`；`DOC_VECTOR_MANDATE_强制规范.md §2.1`。

## G9. 向量化基因
- 每个带治理元数据的文档须自带可机器读取的语义指纹（AWS: semantic_fingerprint；AIA: summary+tags），支持语义检索。
- 「生成文档」与「向量化治理」是同一动作，缺失视为未完成。
- 校验器：gate_vector_gene。
- 源：`DOC_VECTOR_MANDATE_强制规范.md 第零条`；`doc-governance.md 支柱四`。

## G10. 生命周期状态机
- status 合法值域：draft / active / deprecated / archived / superseded。
- 被替代的旧文档须归档并登记替代关系，不滞留活跃区与向量索引。
- 校验器：gate_lifecycle（校验 status 值合法性）。
- 源：`每次会话结束文档治理SOP.md`；`doc-governance.md §5 生命周期`。

## G11. 谱系与承继
- 维护文档谱系与引用声明（上游/下游/引用图），说明研究→决策→执行→回执的演进链。
- 校验器：gate_lineage（每项目须存在谱系源：谱系文档 / DOC_VECTOR upstream / front-matter related）。
- 源：`每次会话结束文档治理SOP.md Step3`；`文档索引治理规范`。

## G12. 段落级引用
- 跨文档引用用 stable_id + section/anchor 指向具体段落，禁止只引整个文件；改版后可脚本检测引用有效性。
- 校验器：gate_section_ref（校验总纲 JSON 触发条件 entry_anchor → 问答框架 trigger_anchor 的锚点链）。
- 源：`文档索引治理规范_稳定ID与脚本化索引.md 规则2`。

## G13. 变更映射（移动/重命名/删除前置）
- 移动/重命名/删除文档前，必须先生成映射表（旧路径→新路径）并取得用户确认，禁止无映射表的批量改动。
- 校验器：manual_review（属破坏性操作，交人工确认，不自动放行）。
- 源：`每次会话结束文档治理SOP.md`；`00_2工作区的命名与架构规范.md §6`。

## G14. 冗余检测
- 同主题多文档须标 redundancy_group_id 并归为冗余组，保留唯一真相源，其余合并或归档；反冗余是落盘前置检查。
- 「同主题」判定为同目录去版本/日期归一后重名；架构规范§3 每目录各一份的样板文件（README/AGENTS/CONTEXT 等）与 P-C 管辖的 `_shared` 规则镜像不计入。
- 校验器：gate_redundancy。
- 源：`DOC_VECTOR_MANDATE_强制规范.md V1.2 反冗余`；`doc-governance.md`。