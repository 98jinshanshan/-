---
title: AI Interop Hub 文档索引
version: V3.9.1
updated: 2026-07-17
status: active
authority: 唯一索引入口
---

# AI Interop Hub 文档索引 (INDEX.md)

> **唯一文档原则**：每个概念只有一个权威定义源。所有引用指向源文件，禁止复制。
> **SSOT 原则**：`00-governance/manifest.json` 是治理核心文件的权威清单。

---

## 一、目录结构总览

```
_AI_Interop_Hub/
├── INDEX.md                    ← 你在这里（唯一索引入口）
├── CONTEXT.md                  ← 项目上下文与背景
├── WORKSPACE_ROOT.md           ← 工作空间映射声明
├── 00-governance/              ← SSOT：总纲·协议·规则·脚本
│   ├── manifest.json           ← 权威文件清单（sha1校验）
│   ├── README_FIRST.md         ← 入门必读
│   ├── rules/                  ← 治理规则（G1-G14 等）
│   ├── scripts/                ← 治理脚本（gang_gate, gate_runner）
│   ├── convergence-engine/     ← 约束收敛引擎（Phase 0）
│   ├── _deprecated/            ← 归档文件（不活跃）
│   └── ...核心治理文件...
├── collaboration/              ← 任务实例产物（交接区）
│   ├── task_queue/             ← 任务队列
│   ├── deliverables/           ← 任务交付物
│   ├── reviews/                ← 审核记录
│   ├── logs/                   ← 运行日志
│   └── supervisor_checkpoints/ ← 监督者检查点
├── docs/                       ← 跨任务说明文档（非总纲正文）
│   ├── test-reports/           ← 测试报告
│   ├── architecture/           ← 架构方案
│   ├── evolution/              ← 演进历史
│   ├── extensions/             ← 扩展插件
│   ├── automations/            ← 自动化配置
│   ├── case-studies/           ← 案例研究
│   ├── archive/                ← 历史归档
│   └── articles/               ← 对外文章
└── intermediate/               ← 运行中临时文件（.gitignore）
```

---

## 二、权威文件清单（00-governance/）

> 完整清单及校验值见 [`00-governance/manifest.json`](00-governance/manifest.json)

### 宪法层

| 文件 | 职责 |
|------|------|
| [`开发总纲_人类可读版.md`](00-governance/开发总纲_人类可读版.md) | **宪法·人类版** — 双程递归模型、8阶段、监督者机制、约束收敛引擎 |
| [`开发总纲_可执行版.json`](00-governance/开发总纲_可执行版.json) | **宪法·机械版** — JSON 格式，Agent 递归解析执行 |

### 协议层

| 文件 | 职责 |
|------|------|
| [`三IDE角色自动化联通协议.md`](00-governance/三IDE角色自动化联通协议.md) | **通信协议（唯一权威）** — 三层架构、消息格式、API、部署 |

### 规范层

| 文件 | 职责 |
|------|------|
| [`AGENT_INSTRUCTION.md`](00-governance/AGENT_INSTRUCTION.md) | **Agent 行为规范** — 角色职责、工作流程、禁止行为 |
| [`Agent子节点沟通模板.md`](00-governance/Agent子节点沟通模板.md) | **子节点规范** — 14 个模板，子节点沟通标准格式 |
| [`开发总纲_问答题框架.md`](00-governance/开发总纲_问答题框架.md) | **Phase 1 工具** — 44 问自审清单 |

### 引擎层

| 文件 | 职责 |
|------|------|
| [`ide-bridge.js`](00-governance/ide-bridge.js) | **消息中枢服务器** — WebSocket 端口 9527 |
| [`ide-bridge-client.js`](00-governance/ide-bridge-client.js) | **客户端 SDK** — Agent 连接 Bridge 的标准 API |
| [`orchestrator.js`](00-governance/orchestrator.js) | **调度器引擎** — 任务初始化、门禁引擎、Sprint Contract |
| [`test-bridge-connection.js`](00-governance/test-bridge-connection.js) | **连通性测试** — 18 项自动化测试 |
| [`ontology.json`](00-governance/ontology.json) | **核心本体定义** — 15 个实体，核心概念语义 |

### 约束收敛引擎（Phase 0）

| 文件 | 职责 |
|------|------|
| [`convergence-engine/dictionaries/domain-dict.json`](00-governance/convergence-engine/dictionaries/domain-dict.json) | **L0 领域字典** — 4 大类关键词+排除词 |
| [`convergence-engine/dictionaries/subtype-dict.json`](00-governance/convergence-engine/dictionaries/subtype-dict.json) | **L1 子类型字典** — 领域内子类型关键词体系 |
| [`convergence-engine/fix_gaps.js`](00-governance/convergence-engine/fix_gaps.js) | **GAP 修复脚本** — 25 项维度缺失修复 |
| [`convergence-engine/收敛算法纠偏全记录_系统整合.md`](00-governance/convergence-engine/收敛算法纠偏全记录_系统整合.md) | **收敛引擎专题文档** — 5D 收敛框架设计思路 |

### 治理工具链

| 目录/文件 | 职责 |
|-----------|------|
| [`rules/`](00-governance/rules/) | **治理规则** — G1-G14 命名/索引/职责/生命周期规则 |
| [`scripts/gang_gate.py`](00-governance/scripts/gang_gate.py) | **闸门验证器** — 规则驱动的交付闸门 |
| [`scripts/gate_runner.py`](00-governance/scripts/gate_runner.py) | **闸门运行器** — 结构完整性验证（参考实现） |

---

## 三、历史版本（_deprecated/）

> 以下文件已归档，不再维护。仅作历史参考。

| 归档文件 | 版本 | 被替代 |
|---------|------|--------|
| `_deprecated/三IDE角色自动化联通协议_V1.0.md` | V1.0 | 三IDE角色自动化联通协议.md (V2.1) |
| `_deprecated/三IDE实时通讯协议_V2.0_IDE-Bridge.md` | V2.0 | 三IDE角色自动化联通协议.md (V2.1) |
| `_deprecated/开发总纲优化方案_V3.5.md` | V3.5 | 开发总纲_人类可读版.md (V3.6+) |

---

## 四、项目交付物（collaboration/）

| 任务ID | 描述 | 类型 | 状态 | 日期 |
|--------|------|------|------|------|
| task_novel_mystery_20260713 | 悬疑推理小说《第七声钟响》前十章 | 小说正文 | completed | 2026-07-13 |
| task_news_bavi_20260713 | 巴威过境江浙沪新闻报告 | 新闻报告 | completed | 2026-07-13 |

---

## 五、版本变更

### V3.9.1 (2026-07-17) — 目录治理收口
- **G1 命名**：协议文件名去掉版本号，版本写入 front-matter
- **G2/G3 SSOT**：重刷 manifest.json，从 6 个文件扩展到 30 个，全量 sha1/size 校验
- **G4 职责互斥**：清理根目录污染文件（zip/docx/ps1），新增 docs/ 和 intermediate/
- **G8 CONTEXT**：新增根级 CONTEXT.md
- **G10 生命周期**：新增 `_deprecated/` 目录，旧版文件统一归档
- **目录重构**：01~08 编号目录合并到 docs/ 下
- **闸门**：新增 gate_runner.py（参考实现），识别出 12 项总纲 JSON 结构缺口

### V3.7 (2026-07-15) — 三层通信架构
- 通信层从 V1.0 文件轮询升级为三层通信架构
- 新增 ide-bridge.js / ide-bridge-client.js
- 三IDE角色自动化联通协议 V2.1 成为通信层唯一权威

### V3.6 (2026-07-13) — Phase 门禁引擎
- 新增 Phase 门禁引擎
- 新增 orchestrator.js（调度器）
