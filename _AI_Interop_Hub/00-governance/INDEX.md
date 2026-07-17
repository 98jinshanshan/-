# 协作目录索引 (INDEX.md)

> 版本 V3.7 | 更新于 2026-07-15 | 新增 IDE Bridge 实时通信（S6）

---

## 文档职责边界（一文档一职责）

| 文档 | 职责 | 一句话定义 |
|------|------|-----------|
| `开发总纲_人类可读版.md` | **宪法** | 定义双程递归模型、8阶段、监督者机制。所有文档以此为准。 |
| `开发总纲_可执行版.json` | **宪法机械版** | 人类可读版的 JSON 表示，Agent 递归解析执行。 |
| `开发总纲_问答题框架.md` | **Phase 1 工具** | 44 问自审清单，Agent 在 Phase 1 调用，不独立使用。 |
| `AGENT_INSTRUCTION.md` | **Agent 行为规范** | 每个 Agent 的职责、工作流程、禁止行为。 |
| `三IDE角色自动化联通协议_V2.1.md` | **通信协议（唯一权威）** | 三 IDE 通信的唯一定义：三层架构（IDE Bridge + Hooks + IM 桥接）、消息格式、API、部署。 |
| `ide-bridge.js` | **消息中枢服务器** | IDE Bridge 服务端，WebSocket 端口 9527。 |
| `ide-bridge-client.js` | **客户端 SDK** | Agent 连接 Bridge 的标准 API。 |
| `Agent子节点沟通模板.md` | **子节点规范** | 14 个模板，Agent 完善工作流子节点时使用。 |
| `orchestrator.js` | **调度器** | 初始化任务、创建协作目录、推送任务到 Bridge。 |

> **唯一文档原则**：每个概念只有一个权威定义源。通信协议以 V2.0 协议文档为准，其他文档只引用不复制。

---

## 文档间引用关系

```
开发总纲_人类可读版.md（宪法）
  ├── 开发总纲_可执行版.json（机械版，被 Agent 解析）
  │     ├── phase_gate_engine（门禁引擎，引用通信层）
  │           └── communication_layer → 三IDE角色自动化联通协议_V2.1.md（三层架构）
  │
  ├── 开发总纲_问答题框架.md（Phase 1 工具，被总纲引用）
  │
  ├── AGENT_INSTRUCTION.md（Agent 行为规范，引用总纲）
  │     └── 通信方式 → 三IDE角色自动化联通协议_V2.1.md（唯一权威·三层架构）
  │           ├── ide-bridge.js（Layer1 服务端实现）
  │           ├── ide-bridge-client.js（Layer1 客户端 SDK）
  │           ├── Layer2 Hooks 触发层（架构已定）
  │           └── Layer3 IM 机器人桥接（架构已定）
  │
  ├── Agent子节点沟通模板.md（子节点规范，引用总纲）
  │
  └── orchestrator.js（调度器，引用总纲 + Bridge Client）
```

---

## V3.7 变更

- 通信层从 V1.0 文件轮询升级为 **三层通信架构**
- **Layer 1**：IDE Bridge 实时消息推送（已实现）
- **Layer 2**：Hooks 系统触发层（架构已定，系统级自动触发）
- **Layer 3**：IM 机器人桥接（架构已定，微信/QQ/飞书用户入口）
- 新增 `ide-bridge.js` 和 `ide-bridge-client.js`
- `三IDE角色自动化联通协议_V2.1.md` 成为通信层唯一权威定义
- V2.0 / V1.0 协议归档，仅作为兼容降级方案保留
- 版本号 3.6.0 → 3.7.0

---

## 项目交付物

| 任务ID | 描述 | 类型 | 状态 | 日期 |
|--------|------|------|------|------|
| task_novel_mystery_20260713 | 悬疑推理小说《第七声钟响》前十章正文（.docx格式） | 小说正文 | completed | 2026-07-13 |
| task_news_bavi_20260713 | 巴威过境江浙沪新闻报告 | 新闻报告 | completed | 2026-07-13 |

## task_novel_mystery_20260713 详情

- **根目标**: 产出《第七声钟响》前十章正文（.docx格式，起点标准排版），每章2000-2500字，多视角叙事
- **版本**: V3.6 门禁引擎运行（10章/23,168字）
- **输出文件**: `/workspace/第七声钟响_前十章.docx`
- **管道产物**: spec.json, path.json, nodes.json, interfaces.json, leaf_nodes.json, blueprint_comparison.json, verification.json, manifest.json, health_check.json
- **自检文件**: cp_0~cp_7.self_check.json（8/8 pass）
- **故事标题**: 《第七声钟响》
- **规格**: 10章 | 23,168字 | 7人物 | 多视角叙事 | 每章断章钩子
- **格式**: 宋体小四(12pt) / 首行缩进2字符 / 1.5倍行距 / A4纸
- **历史版本**: V1(24章大纲) → V2(400章大纲) → V3(10章正文·当前)