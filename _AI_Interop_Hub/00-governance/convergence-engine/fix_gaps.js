const fs = require("fs");
const data = JSON.parse(fs.readFileSync("/workspace/开发总纲_可执行版.json", "utf8"));

// ============================================================
// GAP-1, GAP-2: Phase 1
// ============================================================
data.phase_1_autonomous.consistency_check = {
  "description": "44 问内部一致性校验。防止回答间矛盾（如 q12 说日更而 q28 说周更）。",
  "rules": [
    { "id": "CC-1", "name": "频率一致性", "check": "q12(更新频率) 与 q28(交付节奏) 的数值必须一致。不一致 → FAIL", "severity": "hard" },
    { "id": "CC-2", "name": "范围一致性", "check": "q3(范围边界) 与 q44(交付物清单) 的枚举必须互不矛盾。边界外的东西出现在交付物中 → FAIL", "severity": "hard" },
    { "id": "CC-3", "name": "格式一致性", "check": "q22(输出格式) 与 q41(交付格式) 必须一致。不一致 → 标记 inconsistency", "severity": "soft" },
    { "id": "CC-4", "name": "数量一致性", "check": "q13(规模预估) 的数值 ≥ q35(最小交付量) 的数值。不满足 → FAIL", "severity": "hard" },
    { "id": "CC-5", "name": "角色一致性", "check": "q8(目标用户) 与 q19(接口消费者) 必须兼容。角色冲突 → 标记 inconsistency", "severity": "soft" }
  ],
  "execution": "Phase 1 step_3 之后、step_5 之前执行。任意 hard 规则 FAIL → 标记 cp_0 不通过。"
};

data.phase_1_autonomous.hard_constraints = {
  "description": "Phase 1 硬约束。违反任意一条 → cp_0 FAIL，强制重做 Phase 1。",
  "constraints": [
    { "id": "HC-1", "name": "核心维度不可全推断", "rule": "dimension_1(意图锚定) 和 dimension_2(边界划定) 中，inferred 回答的比例不得同时 > 50%", "rationale": "如果连做什么和边界在哪都是推断的，后续全部不可靠" },
    { "id": "HC-2", "name": "44 问完整性", "rule": "self_audit_log 必须包含 44 个独立字段，缺 1 个 → FAIL", "rationale": "44 问是 spec 的骨架，缺一问 = 维度缺失" },
    { "id": "HC-3", "name": "一致性校验零 hard 失败", "rule": "consistency_check 中所有 severity=hard 的规则必须全部通过", "rationale": "回答间矛盾 = spec 不可信" },
    { "id": "HC-4", "name": "one_liner 不可为空", "rule": "clarified_requirement.one_liner 必须非空且 ≥ 10 个字符", "rationale": "一句话精炼需求是整条链路的根锚点" }
  ]
};

// ============================================================
// GAP-3, GAP-4, GAP-5: Phase 2
// ============================================================
data.forward_pass.phase_2.structural_parameters = {
  "description": "路径节点结构参数。定义路径的量化范围，消除画一条路径的模糊性。",
  "node_count": {
    "min": 3, "max": 15,
    "rationale": "最少 3 个节点（起点→中间→终点），最多 15 个（防止过度拆分）。由 Phase 0 L3 结构参数动态调整。",
    "override_by_L3": "若 Phase 0 L3 提取了具体数量（如 10 章），则 node_count.max = L3 提取值 × 1.5"
  },
  "granularity": {
    "definition": "一个节点 = 一个独立可交付的产出物，有明确的输入和输出。不是一个步骤或一个想法。",
    "test": "问：这个节点能独立交付吗？能 → 合格节点。不能 → 需要合并到相邻节点。"
  }
};

data.forward_pass.phase_2.hard_constraints = {
  "description": "路径完整性硬约束。违反任意一条 → cp_1 FAIL。",
  "constraints": [
    { "id": "P2-HC-1", "name": "连通性", "rule": "路径从起点到终点必须连通，无断点。path.json 中每个节点的 prev 和 next 字段必须形成完整链", "severity": "hard" },
    { "id": "P2-HC-2", "name": "无循环", "rule": "路径中不得出现循环引用（A→B→C→A）。检测到循环 → FAIL", "severity": "hard" },
    { "id": "P2-HC-3", "name": "终点对齐根目标", "rule": "路径终点描述必须与 spec.json.one_liner 一致", "severity": "hard" },
    { "id": "P2-HC-4", "name": "节点数范围", "rule": "节点数必须在 structural_parameters.node_count 范围内", "severity": "hard" }
  ]
};

// ============================================================
// GAP-6, GAP-7: Phase 3
// ============================================================
data.forward_pass.phase_3.structural_parameters = {
  "description": "每层级节点数量范围。防止节点数量无限膨胀或过度压缩。",
  "per_level": {
    "macro_node": { "min": 2, "max": 5, "description": "宏观节点（Phase 3 产出）" },
    "module": { "min": 2, "max": 8, "description": "模块级节点（递归第一层）" },
    "sub_node": { "min": 2, "max": 6, "description": "子节点（递归第二层及以下）" }
  },
  "override_by_L3": "若 Phase 0 L3 提取了具体数量，则 max = L3 提取值 × 1.5"
};

data.forward_pass.phase_3.overlap_detection = {
  "description": "节点功能重叠检测。防止两个节点做同一件事。",
  "rule": "若两个节点映射到同一个 acceptance_criteria 维度且无明确分工差异 → 标记 redundancy",
  "check": "对 nodes.json 中所有节点的 maps_to_root_goal 字段做去重检查。同一维度有 ≥ 2 个节点映射 → 检查节点描述是否明确分工。无明确分工 → redundancy",
  "on_redundancy": "合并冗余节点或标注分工差异，重做 Phase 3"
};

// ============================================================
// GAP-8, GAP-9: Phase 4
// ============================================================
data.forward_pass.phase_4.field_completeness = {
  "description": "接口字段完整性阈值。上游输出字段被下游消费的比例。",
  "threshold": 0.80,
  "rule": "interfaces.json 中每个连接的 consumer.consumes / producer.outputs ≥ 0.80。低于 80% → 标记 data_loss_risk",
  "on_data_loss": "Agent 必须对未被消费的字段给出解释（未来扩展/冗余/设计遗漏）。无解释 → cp_3 FAIL"
};

data.forward_pass.phase_4.semantic_match = {
  "description": "接口语义匹配规则。同义字段名识别和类型转换规则。",
  "synonym_map": {
    "description": "已知同义字段名映射。命中则视为匹配。",
    "examples": [
      ["title", "name", "heading"],
      ["id", "identifier", "uuid"],
      ["content", "body", "text", "description"],
      ["created_at", "create_time", "timestamp"],
      ["author", "creator", "writer", "owner"]
    ]
  },
  "type_conversion": {
    "allowed": ["string -> number (纯数字字符串)", "number -> string"],
    "forbidden": ["object -> string (信息丢失)", "array -> object (结构不兼容)"],
    "rule": "允许的转换 → 自动匹配。禁止的转换 → 标记 type_mismatch → cp_3 FAIL"
  }
};

// ============================================================
// GAP-10, GAP-11: Phase 5
// ============================================================
data.forward_pass.phase_5.atomicity_standard = {
  "description": "原子性客观标准（V3.9.1 从主观判断升级为 3 条可验证标准）。与 Phase 0 收敛引擎的 L3 原子性标准一致。",
  "source": "convergence_engine.layers.L3_structural.atomicity",
  "criteria": [
    { "id": "ATOM-1", "name": "单一交付物", "rule": "有且仅有一个明确的业务交付物。不是一组东西或若干步骤。", "test": "问：这个节点产出几个文件/文档/函数？回答 > 1 → 不是原子节点" },
    { "id": "ATOM-2", "name": "无跨节点前置依赖", "rule": "可独立启动执行，不依赖其他子节点的中间产出。", "test": "问：启动这个节点前，必须等另一个节点先完成吗？是 → 不是原子节点" },
    { "id": "ATOM-3", "name": "可量化验收", "rule": "产出有清晰、可量化的验收指标（不是好、完整等主观词）。", "test": "问：这个节点的验收标准能用数字表达吗？不能 → 不是原子节点" }
  ],
  "all_must_pass": true,
  "terminal_condition_update": "当前节点同时满足 ATOM-1、ATOM-2、ATOM-3 → 叶节点，去程终点。"
};

data.forward_pass.phase_5.coverage_check = {
  "description": "子节点覆盖度量化校验。父节点所有需求维度必须被子节点完整覆盖。",
  "rule": "对每个父节点，提取其 acceptance_criteria 维度。所有子节点 maps_to_root_goal 字段的并集必须覆盖父节点 100% 的维度。",
  "threshold": 1.0,
  "formula": "coverage = |子节点覆盖的维度并集| / |父节点 acceptance_criteria 维度|",
  "on_insufficient": "coverage < 1.0 → 标记 uncovered_dimensions → 重做 Phase 5，补充缺失维度的子节点"
};

// ============================================================
// GAP-12, GAP-13: Phase 6
// ============================================================
data.backward_pass.phase_6.quality_metrics = {
  "description": "实现质量量化指标。代码/内容产出后必须通过以下检查。",
  "metrics": {
    "test_coverage": { "threshold": 0.80, "description": "开发类：单元测试覆盖率 >= 80%", "applicable": "development" },
    "lint_pass": { "threshold": 1.0, "description": "开发类：lint 检查零错误（warning 允许）", "applicable": "development" },
    "content_word_count": { "threshold": "±30%", "description": "创作类：实际字数与 spec 承诺的字数偏差 <= 30%", "applicable": "creative" },
    "chapter_count": { "threshold": ">= spec 承诺的 80%", "description": "创作类：实际章数与 spec 承诺的章数偏差 <= 20%", "applicable": "creative" },
    "build_pass": { "threshold": 1.0, "description": "开发类：代码能编译/构建成功", "applicable": "development" }
  },
  "on_failure": "任一 applicable 指标不达标 → cp_5 FAIL，标注不达标的指标和实际值"
};

data.backward_pass.phase_6.deviation_classification = {
  "description": "实现偏差分类规则。Agent 在实现时可能偏离蓝图，需区分正向纠偏和偏离。",
  "categories": {
    "positive_correction": {
      "description": "Agent 发现蓝图遗漏重要功能，主动补充。",
      "rule": "补充的功能必须标记为 [ADDED]，附带理由，且不影响蓝图已有功能。cp_5 标注正向纠偏 → 不 FAIL",
      "requires": "supervisor 语义审查确认补充确实必要"
    },
    "deviation": {
      "description": "Agent 未按蓝图实现，或擅自修改蓝图设计。",
      "rule": "任何未标记 [ADDED] 且与蓝图不一致的实现 → cp_5 FAIL",
      "examples": ["跳过蓝图中的 Section", "修改蓝图定义的接口签名", "用不同技术栈实现"]
    }
  }
};

// ============================================================
// GAP-14, GAP-15: Phase 7
// ============================================================
data.backward_pass.phase_7.verification_thresholds = {
  "description": "验证阈值。每层验证的量化通过标准。",
  "thresholds": {
    "leaf_unit_test": { "coverage": 0.80, "min_test_cases": 3, "description": "覆盖率 >= 80%，每个原子节点至少 3 个测试用例（正常/异常/边界）" },
    "sub_node_integration": { "min_test_cases": 3, "pass_rate": 1.0, "description": "至少 3 个集成测试用例，通过率 100%" },
    "module_integration": { "min_test_cases": 3, "pass_rate": 1.0, "description": "至少 3 个模块级集成测试用例，通过率 100%" },
    "macro_node": { "pass_rate": 1.0, "description": "所有模块集成测试通过率 100%" },
    "project_e2e": { "pass_rate": 1.0, "description": "所有端到端测试通过率 100%。全链路通路" }
  }
};

data.backward_pass.phase_7.downgrade_judgment = {
  "description": "降标判定规则。区分合理调整与降标声明。",
  "rule": "偏差 < 10% 且不影响核心 acceptance_criteria → 合理调整，记录偏差。偏差 >= 10% 或影响核心功能 → 降标，cp_6 FAIL",
  "examples": {
    "reasonable": "承诺 400 章，产出 380 章（偏差 5%），且 380 章已覆盖所有核心剧情 → 合理调整",
    "downgrade": "承诺 400 章，产出 200 章（偏差 50%）→ 降标，FAIL",
    "downgrade_wording": "禁止使用 完整 X 章概要已超出单个 HTML 的展示范围 等降标声明。这种声明 = 承认未达标 = cp_6 FAIL"
  }
};

// ============================================================
// GAP-16: Phase 8
// ============================================================
data.backward_pass.phase_8.runnability_check = {
  "description": "交付物可运行性检查。文件完整不等于代码能跑。",
  "checks": {
    "build": { "rule": "代码能编译/构建成功", "applicable": "development", "severity": "hard" },
    "startup": { "rule": "应用能启动，无致命错误", "applicable": "development", "severity": "hard" },
    "key_path": { "rule": "关键路径（登录→核心功能→退出）能跑通", "applicable": "development", "severity": "hard" },
    "content_parse": { "rule": "创作类产出能正常解析（HTML 能打开、Markdown 能渲染）", "applicable": "creative", "severity": "hard" }
  },
  "on_failure": "任一 hard 检查失败 → cp_7 FAIL，标注失败的检查项"
};

// ============================================================
// GAP-17, GAP-18: 监督者
// ============================================================
const cpUpdates = {
  "checkpoint_1": {
    "quantified_standard": {
      "path_node_count": "节点数必须在 Phase 2 structural_parameters 范围内",
      "connectivity": "prev/next 字段形成完整链，无断点",
      "no_cycle": "无循环引用",
      "endpoint_match": "路径终点描述与 spec.one_liner 一致"
    }
  },
  "checkpoint_2": {
    "quantified_standard": {
      "node_count_per_level": "每层级节点数在 Phase 3 structural_parameters 范围内",
      "no_overlap": "overlap_detection 无 redundancy 标记",
      "full_coverage": "acceptance_criteria 每个维度有对应节点"
    }
  },
  "checkpoint_3": {
    "quantified_standard": {
      "field_completeness": "consumer.consumes / producer.outputs >= 0.80",
      "no_type_mismatch": "semantic_match 无 forbidden type_conversion",
      "numeric_consistency": "数值约束与 spec.json scope 一致"
    }
  },
  "checkpoint_4": {
    "quantified_standard": {
      "atomicity": "所有叶节点满足 ATOM-1/2/3 全部三条",
      "coverage": "子节点 coverage >= 1.0",
      "recursion_depth": "递归深度 <= max_depth_by_task_type 且 >= Phase 0 L3 提取的最小层数"
    }
  },
  "checkpoint_5": {
    "quantified_standard": {
      "section_count": "实际 Section 数 >= 蓝图数",
      "quality_metrics": "所有 applicable quality_metrics 达标",
      "deviation": "无 unauthorized deviation（未经标记的偏离）"
    }
  },
  "checkpoint_6": {
    "quantified_standard": {
      "coverage": "测试覆盖率 >= 80%",
      "pass_rate": "所有层级测试 pass_rate = 100%",
      "no_downgrade": "无降标声明，偏差 < 10%"
    }
  },
  "checkpoint_7": {
    "quantified_standard": {
      "all_files": "6 个核心文件全部存在",
      "runnability": "所有 applicable runnability_check 通过",
      "coverage_vs_commitment": "实际产出 >= spec 承诺的 70%"
    }
  }
};

for (const [cp, standard] of Object.entries(cpUpdates)) {
  data.goal_alignment_supervisor.checkpoints[cp].quantified_standard = standard;
}

data.goal_alignment_supervisor.unified_failure_policy = {
  "description": "检查点失败统一处理规则。所有 8 个检查点适用同一套失败处理策略。",
  "retry": { "max_retries": 3, "description": "同一 Phase 同一检查点最多重试 3 次" },
  "on_retry_exhausted": {
    "action": "广播 error.blocked → 记录阻塞原因 → 若为关键路径则上报用户请求决策",
    "critical_paths": ["cp_0", "cp_7"],
    "non_critical_paths": ["cp_1", "cp_2", "cp_3", "cp_4", "cp_5", "cp_6"]
  },
  "escalation": "连续 3 次 fail 且为关键路径 → 上报用户。非关键路径 → 标记 blocked 但允许其他分支继续"
};

// ============================================================
// GAP-19: Sprint Contract
// ============================================================
data.sprint_contract_engine = {
  "description": "Sprint Contract 引擎。每次任务启动时自动生成验收契约。V3.9.1 新增：从 Phase 0 收敛引擎的 L4 硬约束中自动派生 acceptance_criteria。",
  "version": "1.1.0",
  "contract_schema": {
    "task_id": "string",
    "acceptance_criteria": "从 Phase 0 L4 硬约束 + Phase 1 spec.json 自动派生",
    "max_retries": "按领域区分：creative=5, development=3, analysis=3, research=5",
    "timeout": "按领域区分：creative=3600s, development=7200s, analysis=1800s, research=3600s",
    "result_schema": { "status": "pass|fail|blocked", "evidence": "object", "goal_trace": "string" }
  },
  "phase_0_linkage": {
    "description": "Contract 的 acceptance_criteria 自动从 Phase 0 收敛引擎输出中派生。",
    "derivation": {
      "L4_hard_constraints": "Phase 0 L4 的 hard 约束 → Contract 的 must_have 验收项",
      "L4_soft_constraints": "Phase 0 L4 的 soft 约束 → Contract 的 should_have 验收项",
      "L3_structural": "Phase 0 L3 的结构参数 → Contract 的 numeric_targets"
    }
  },
  "validate_function": "orchestrator.js validateContract()",
  "checkpoint": "contract 检查：acceptance_criteria 是否包含 Phase 0 L4 的所有 hard 约束？缺少 → 拒绝 contract"
};

// ============================================================
// GAP-20: 领域变体扩展
// ============================================================
data.domain_variants = {
  "description": "领域变体定义。每个 Phase 在不同领域（创作/开发/分析/研究）有不同的执行标准。V3.9.1 扩展至 Phase 1/2/3/6/8。",
  "version": "1.1.0",
  "phases": {
    "phase_1": {
      "creative": { "question_weights": { "dimension_1": 1.5, "dimension_5": 1.3, "dimension_7": 0.8 }, "note": "创作类：意图锚定和模块拆解权重更高，验证闭环相对灵活" },
      "development": { "question_weights": { "dimension_3": 1.5, "dimension_4": 1.5, "dimension_6": 1.3 }, "note": "开发类：架构和接口权重最高" },
      "analysis": { "question_weights": { "dimension_2": 1.5, "dimension_7": 1.5 }, "note": "分析类：边界划定和验证闭环权重最高" },
      "research": { "question_weights": { "dimension_1": 1.2, "dimension_2": 1.5 }, "note": "研究类：意图和边界最重要" }
    },
    "phase_2": {
      "creative": { "node_count": { "min": 3, "max": 10 }, "node_type": "章节/场景/卷", "note": "创作类路径 = 章节序列" },
      "development": { "node_count": { "min": 3, "max": 15 }, "node_type": "模块/组件/服务", "note": "开发类路径 = 架构拓扑" },
      "analysis": { "node_count": { "min": 3, "max": 8 }, "node_type": "分析步骤/维度/指标", "note": "分析类路径 = 分析管线" },
      "research": { "node_count": { "min": 3, "max": 10 }, "node_type": "调研主题/子课题", "note": "研究类路径 = 研究大纲" }
    },
    "phase_3": {
      "creative": { "per_level": { "macro_node": { "min": 2, "max": 4 }, "module": { "min": 2, "max": 6 }, "sub_node": { "min": 2, "max": 4 } }, "note": "创作类节点更少但更聚焦" },
      "development": { "per_level": { "macro_node": { "min": 2, "max": 5 }, "module": { "min": 2, "max": 8 }, "sub_node": { "min": 2, "max": 6 } }, "note": "开发类节点粒度更细" },
      "analysis": { "per_level": { "macro_node": { "min": 2, "max": 4 }, "module": { "min": 2, "max": 5 }, "sub_node": { "min": 2, "max": 4 } }, "note": "分析类节点更紧凑" },
      "research": { "per_level": { "macro_node": { "min": 2, "max": 5 }, "module": { "min": 2, "max": 6 }, "sub_node": { "min": 2, "max": 5 } }, "note": "研究类结构灵活" }
    },
    "phase_4": {
      "creative": { "simplified": true, "skip_condition": "创作类单文件产出时，可简化接口契约" },
      "development": { "simplified": false, "note": "开发类接口契约必须完整" }
    },
    "phase_5": {
      "creative": { "max_depth": 2, "atomicity": "一章/一个场景", "note": "创作类递归深度较浅" },
      "development": { "max_depth": 4, "atomicity": "一个函数/一个组件", "note": "开发类递归深度较深" }
    },
    "phase_6": {
      "creative": { "quality_metrics": ["content_word_count", "chapter_count"], "note": "创作类关注内容量和章节数" },
      "development": { "quality_metrics": ["test_coverage", "lint_pass", "build_pass"], "note": "开发类关注代码质量和可构建性" },
      "analysis": { "quality_metrics": ["data_accuracy", "visualization_completeness"], "note": "分析类关注数据准确性和可视化完整性" },
      "research": { "quality_metrics": ["source_count", "coverage_completeness"], "note": "研究类关注来源数量和覆盖度" }
    },
    "phase_7": {
      "creative": { "verification": "内容完整性 + 格式正确性", "note": "创作类验证 = 内容+格式" },
      "development": { "verification": "单元测试 + 集成测试 + E2E", "note": "开发类验证 = 全链路测试" }
    },
    "phase_8": {
      "creative": { "runnability": ["content_parse"], "note": "创作类可运行性 = 内容可正常解析" },
      "development": { "runnability": ["build", "startup", "key_path"], "note": "开发类可运行性 = 构建+启动+关键路径" }
    }
  }
};

// ============================================================
// GAP-21, GAP-22: 递归架构
// ============================================================
data.recursive_self_similar = {
  "description": "递归自相似架构。总纲在每个层级重复 Phase 1-8。V3.9.1 新增：递归深度和终止条件与 Phase 0 收敛引擎联动。",
  "version": "1.1.0",
  "principle": "每个节点在它自己的层级上，重复完整的 Phase 1-8 流程。Phase 0 只在项目级执行一次，子节点继承父节点的领域分类。",
  "depth_linkage": {
    "description": "递归深度从 Phase 0 L3 结构参数动态派生，不再硬编码。",
    "derivation": "max_depth = ceil(log2(L3_extracted_chapter_count)) + 1。例：L3 提取 10 章 → max_depth = ceil(log2(10)) + 1 = 5。L3 未提取 → 使用 domain_variants 的默认值",
    "min_depth": 2,
    "override": "domain_variants.phase_5 中的 max_depth 作为 fallback"
  },
  "termination_linkage": {
    "description": "递归终止条件与 Phase 0 L3 原子性标准统一。不再使用两套独立定义。",
    "unified_standard": "forward_pass.phase_5.atomicity_standard（与 convergence_engine.layers.L3_structural.atomicity 一致）",
    "rule": "终止条件 = 原子性标准 ATOM-1/2/3 全部满足。不在 convergence_engine 之外定义第二套原子性标准。"
  },
  "cross_domain_handling": {
    "description": "子节点跨领域边界情况处理。",
    "rule": "若子节点的 maps_to_root_goal 指向的 acceptance_criteria 维度属于不同领域 → 重新执行 Phase 0 收敛引擎对子节点进行领域分类",
    "example": "父节点是 creative（写小说），子节点是 development（开发小说配套网站）→ 子节点重新执行 Phase 0"
  }
};

// ============================================================
// GAP-23: 最小可行链路硬约束
// ============================================================
data.minimum_viable_chain.hard_constraints = {
  "description": "最小可行链路硬约束。定义哪些维度低于阈值时不能进入下一阶段。",
  "stop_thresholds": {
    "phase_1_intent": { "min": 0.50, "description": "意图锚定 < 50% → 无法进入 Phase 2。根目标都不清楚，后续全错" },
    "gate_enforcement": { "min": 0.50, "description": "门禁引擎 < 50% → 无法进入 Phase 2。门禁不执行，后续 Phase 不会触发" },
    "forward_decomposition": { "min": 0.30, "description": "去程拆解 < 30% → 无法进入 Phase 6。蓝图都没画完，不能开始实现" },
    "goal_alignment": { "min": 0.40, "description": "目标对齐 < 40% → 无法进入 Phase 7。没人盯着，验证无意义" },
    "automation_execution": { "min": 0.20, "description": "自动化执行 < 20% → 全链路无法自动跑通。可手动执行，不阻塞" }
  },
  "on_stop": "任一维度低于 min → 标记 blocked，该维度成为当前最高优先级修复项"
};

// ============================================================
// GAP-24: 演进三原则量化
// ============================================================
data.evolution_rules.quantification = {
  "description": "演进三原则量化判定标准。将口号转化为可验证的检查项。",
  "rules": {
    "rule_1": {
      "name": "研究必须有工程锚点",
      "quantified_check": "研究启动前，在 research_proposal.md 中填写 target_file 和 target_function 字段。两者均为空 → 研究被阻止。",
      "verification": "research_proposal.target_file 非空 AND research_proposal.target_function 非空"
    },
    "rule_2": {
      "name": "标准对齐从需求出发",
      "quantified_check": "任何标准引入前，在 standard_adoption.md 中填写 derived_from_requirement 字段。引用总纲中哪个 Phase 的哪个需求驱动了此标准。",
      "verification": "standard_adoption.derived_from_requirement 非空 AND 引用有效"
    },
    "rule_3": {
      "name": "完成度评估用最小可行链路",
      "quantified_check": "完成度评估报告必须基于 minimum_viable_chain 的 8 个维度计算，不得引用外部行业标准框架。",
      "verification": "评估报告来源 = minimum_viable_chain.core_chain.items"
    }
  }
};

// ============================================================
// GAP-25: 双程规则
// ============================================================
data.dual_pass_rule = {
  "description": "双程规则：去程只设计不写代码，回程只实现不设计。V3.9.1 新增：边界违规判定。",
  "version": "1.1.0",
  "forward": {
    "phase": "Phase 1-5",
    "rule": "只设计不写代码",
    "allowed": ["写设计文档", "画架构图", "定义接口", "写伪代码"],
    "forbidden": ["写实现代码", "写测试代码", "写配置文件"]
  },
  "backward": {
    "phase": "Phase 6-8",
    "rule": "只实现不设计",
    "allowed": ["写实现代码", "写测试", "按蓝图集成"],
    "forbidden": ["修改 spec.json", "重新定义接口", "推翻 path.json 重画路径"]
  },
  "boundary_violation": {
    "description": "边界违规判定。回程中发现去程设计错误时的处理。",
    "rule": "回程 Agent 发现设计错误 → 不得自行修改设计。必须：1) 标记 suspect_design_issue → 2) 通过 Bridge 上报 supervisor → 3) supervisor 决定是否回退到去程重新设计",
    "not_violation": "回程中补充蓝图未覆盖的实现细节（如错误处理、日志格式）— 这不属于设计修改",
    "is_violation": "回程中修改 spec.json 的 acceptance_criteria、修改 path.json 的路径结构、修改 interfaces.json 的接口签名 — 这些属于设计修改，必须上报",
    "escalation_path": "Agent → Bridge → supervisor → 评估 → 回退去程 or 标记为 known_issue 继续"
  }
};

// ============================================================
// Update change_log
// ============================================================
data.change_log_v3_9_0.S15_gap_fix = {
  "date": "2026-07-17",
  "changes": [
    "Phase 1: 新增 consistency_check（5 条一致性校验规则）+ hard_constraints（4 条硬约束）",
    "Phase 2: 新增 structural_parameters（节点数量范围+粒度标准）+ hard_constraints（4 条硬约束）",
    "Phase 3: 新增 structural_parameters（每层级节点数量范围）+ overlap_detection（功能重叠检测）",
    "Phase 4: 新增 field_completeness（阈值 80%）+ semantic_match（同义字段映射+类型转换规则）",
    "Phase 5: 新增 atomicity_standard（3 条客观标准，与 Phase 0 L3 统一）+ coverage_check（量化校验）",
    "Phase 6: 新增 quality_metrics（5 项量化指标）+ deviation_classification（正向纠偏 vs 偏离）",
    "Phase 7: 新增 verification_thresholds（5 层验证阈值）+ downgrade_judgment（降标判定规则）",
    "Phase 8: 新增 runnability_check（4 项可运行性检查）",
    "监督者: 新增 cp_1-cp_7 量化标准 + unified_failure_policy（统一失败处理）",
    "Sprint Contract: 新增 sprint_contract_engine + phase_0_linkage（从 Phase 0 自动派生）",
    "领域变体: 扩展至 Phase 1/2/3/6/8（原仅覆盖 Phase 4/5/7）",
    "递归架构: 新增 recursive_self_similar（深度联动+终止条件统一+跨领域处理）",
    "最小可行链路: 新增 hard_constraints（5 项 stop_thresholds）",
    "演进三原则: 新增 quantification（3 条量化判定标准）",
    "双程规则: 新增 dual_pass_rule（边界违规判定+升级路径）"
  ]
};

fs.writeFileSync("/workspace/开发总纲_可执行版.json", JSON.stringify(data, null, 2), "utf8");
console.log("OK: All 25 GAPs fixed in 开发总纲_可执行版.json");
console.log("New keys:", Object.keys(data).filter(k => !["name","version","description","core_contract","mandatory_on_startup","phase_gate_engine","convergence_engine","phase_1_autonomous","forward_pass","backward_pass","goal_alignment_supervisor","minimum_viable_chain","evolution_rules","ontology_reference","change_log_v3_9_0","orchestrator_config","deferred_items","change_log_v3_7_1","change_log_v3_8_0","change_log_v3_6_0"].includes(k)));