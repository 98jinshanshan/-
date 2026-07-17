---
title: Workspace Root 映射声明
version: V1.0
created: 2026-07-17
status: active
---

# WORKSPACE_ROOT.md — 工作空间映射声明

## 映射关系

本文件声明 `_AI_Interop_Hub/` 目录与各 IDE 本地工作空间的映射关系。

```
IDE 本地工作空间 (WORKSPACE_ROOT)
└── _AI_Interop_Hub/          ← 共享根（Git 仓库挂载点）
    ├── 00-governance/        ← SSOT（只读，由协调者更新）
    ├── collaboration/        ← 交接区（读写，所有 IDE 共享）
    ├── docs/                 ← 跨任务文档
    └── intermediate/         ← 临时文件（不进 Git）
```

## 目录职责

| 目录 | 权限 | 生命周期 | 版本控制 | 说明 |
|------|------|---------|---------|------|
| `00-governance/` | 研究员可写，其他只读 | 长期 | ✅ Git | 总纲 SSOT，变更需走升级流程 |
| `collaboration/task_queue/` | 协调者可写，研究员可读 | 任务级 | ✅ Git | 任务队列，新任务从这里进入 |
| `collaboration/deliverables/` | 研究员/开发者可写 | 任务级 | ✅ Git | 任务交付物，按任务ID分目录 |
| `collaboration/reviews/` | 协调者可写 | 任务级 | ✅ Git | 审核记录 |
| `collaboration/logs/` | 所有 IDE 可写 | 运行时 | ❌ .gitignore | 运行日志 |
| `collaboration/supervisor_checkpoints/` | 协调者可写 | 任务级 | ✅ Git | 监督者检查点 |
| `docs/` | 所有 IDE 可写 | 长期 | ✅ Git | 跨任务说明文档 |
| `intermediate/` | 所有 IDE 可写 | 运行时 | ❌ .gitignore | 运行中临时文件，重启可清 |

## 路径规范

1. **交接用绝对路径**：`collaboration/` 下的文件引用使用绝对路径（基于 WORKSPACE_ROOT）
2. **治理用相对路径**：`00-governance/` 内部引用使用相对路径
3. **路径解析器**：各 IDE 启动时读取本文件，建立路径映射表

## 各 IDE 私有空间

IDE 本地工作空间中，`_AI_Interop_Hub/` 之外的目录属于 IDE 私有空间，不共享：

- 任务执行中间产物
- 本地配置
- 缓存文件
- 临时下载

## Git 忽略规则

```gitignore
# 运行时
intermediate/
collaboration/logs/
*.log
*.tmp

# 依赖
node_modules/

# 系统文件
.DS_Store
Thumbs.db
```
