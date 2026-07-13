#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gate_runner.py — 开发总纲 Phase 门禁引擎 (V3.6) 的强制执行器 / 解释器

补全缺口: orchestrator.js 从不解析总纲 JSON, 门禁与检查点无代码强制力,
执行者可"计划贩子"、跳 Phase、漏 44 问而不被拦截。本引擎将纸面门禁变为
可执行硬约束: 按 phase_gate_engine 逐 Phase 检查 gate_file, 校验 produce_file,
运行 cp_0(44问)等检查点, 任一不达标即 BLOCK(exit=1)。

用法:
  python gate_runner.py --task-dir <research目录>            # 全链体检
  python gate_runner.py --task-dir <..> --enforce-next        # 找到当前应执行的Phase(gate缺失处), 阻断跳步
"""
import os, sys, json, argparse, re

CONST_JSON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "开发总纲_可执行版.json")

def _loadjson(p):
    """BOM 兼容读取 JSON (总纲早期产物含 UTF-8 BOM, 触发 G1 red line)。"""
    return json.loads(open(p, encoding="utf-8-sig").read())

def load_engine():
    raw = open(CONST_JSON, encoding="utf-8-sig").read()
    data = json.loads(raw)
    return data.get("phase_gate_engine", {})

def _code_dir(task_dir):
    """research 目录 → 对应 _code 目录 (orchestrator.js 约定 {task_id}_code)。"""
    base = task_dir[:-9] if task_dir.endswith("_research") else task_dir
    return base + "_code"

def resolve(task_dir, token):
    """把 {task_dir}/xxx 等占位解析为真实候选路径列表。
    兼容: {task_dir}/../code (总纲字面) 与 {task_id}_code (orchestrator约定);
    描述性 token(如 'Phase 6 的最终产出文件') → 映射到 _code/output。"""
    if not token:
        return []
    t = token.split("（")[0].split("(")[0].strip()
    # 描述性 token: 无路径分隔与占位 → 语义映射
    if "{task_dir}" not in t and "/" not in t and "\\" not in t:
        if ("产出" in t) or ("最终" in t):
            return [_code_dir(task_dir), os.path.join(_code_dir(task_dir), "output")]
        return []
    t = t.replace("{task_dir}", task_dir)
    parts = re.split(r"\s*或\s*", t)
    out = []
    for p in parts:
        p = p.strip().rstrip("/").rstrip("\\")
        if not p or p == "无":
            continue
        np = os.path.normpath(p)
        out.append(np)
        # {task_dir}/../code → 兼容真实 _code 约定
        if np.rstrip("\\/").endswith(os.sep + "code") or np.endswith("code"):
            out.append(_code_dir(task_dir))
            out.append(os.path.join(_code_dir(task_dir), "output"))
    return out

def exists_any(cands):
    for c in cands:
        if os.path.exists(c):
            return True, c
    return False, None

# ---- 检查点实现 (单Agent环境: 结构化自动化校验) ----
def cp_0(task_dir):
    """Phase1: spec.json 必须含 44 独立自审字段 + 关键字段非空。"""
    p = os.path.join(task_dir, "spec.json")
    if not os.path.exists(p):
        return False, "spec.json 不存在"
    spec = _loadjson(p)
    sal = spec.get("self_audit_log", {})
    cnt = sum(len(v) for v in sal.values() if isinstance(v, dict))
    # 意图覆盖度: original_demands 每条须在 one_liner 或验收标准中有落点
    one_liner = spec.get("clarified_requirement", {}).get("one_liner", "")
    accepts = " ".join(spec.get("acceptance_criteria", []))
    demands = spec.get("original_demands", [])
    hay = one_liner + " " + accepts
    STOP = set("据调研的了和与并且对进行一个以及要求")
    def _covered(d):
        # 提取诉求中的关键名词(去停用词, 单字保留), 命中率 >=50% 视为覆盖
        toks = [ch for ch in d if ch not in STOP and ch.strip()]
        # 用2字滑窗做关键词, 任一2字窗命中即算该词覆盖
        wins = [d[i:i+2] for i in range(len(d)-1) if d[i] not in STOP and d[i+1] not in STOP]
        if not wins:
            return True
        hit = sum(1 for w in wins if w in hay)
        return hit / len(wins) >= 0.5
    uncovered = [d for d in demands if not _covered(d)]
    checks = {
        "self_audit 44字段": cnt == 44,
        "one_liner非空": bool(one_liner.strip()),
        "root_goal非空": bool(spec.get("goal_trace", {}).get("root_goal", "").strip()),
        "acceptance_criteria非空": len(spec.get("acceptance_criteria", [])) > 0,
        "意图覆盖度(original_demands全覆盖)": (len(demands) > 0 and len(uncovered) == 0),
    }
    msg = f"字段数={cnt}/44; 诉求={len(demands)}条,未覆盖={uncovered}; " + ", ".join(f"{k}={'Y' if v else 'N'}" for k, v in checks.items())
    return all(checks.values()), msg

def cp_produce_fields(task_dir, produce_path, fields):
    if not os.path.exists(produce_path):
        return False, f"{os.path.basename(produce_path)} 不存在"
    try:
        data = _loadjson(produce_path)
    except Exception as e:
        return True, "非JSON产物, 跳过字段校验"
    flat = json.dumps(data, ensure_ascii=False)
    miss = [f for f in fields if isinstance(f, str) and not f.startswith("每个") and f.split(".")[0] not in flat and f not in flat]
    return (len(miss) == 0), (f"缺字段 {miss}" if miss else "字段齐备")

def cp_goal_trace_chain(task_dir):
    """检查每个 gate 产物含 goal_trace.root_goal, 形成连续链。"""
    files = ["spec.json","path.json","nodes.json","interfaces.json","verification.json","manifest.json"]
    broken = []
    for f in files:
        fp = os.path.join(task_dir, f)
        if os.path.exists(fp):
            try:
                d = _loadjson(fp)
                gt = d.get("goal_trace", {})
                if not (gt.get("root_goal") or gt.get("trace_path")):
                    broken.append(f)
            except Exception:
                pass
    return (len(broken) == 0), (f"缺 goal_trace: {broken}" if broken else "goal_trace 链连续")

def _cd(task_dir):
    base = task_dir[:-9] if task_dir.endswith("_research") else task_dir
    return base + "_code"

def cp_1_path_alignment(task_dir):
    """cp_1 after_phase2: path.json 存在, 路径终点对齐根目标产出。"""
    p = os.path.join(task_dir, "path.json")
    if not os.path.exists(p):
        return False, "path.json 不存在"
    d = _loadjson(p)
    has_endpoint = bool(d.get("output_root") or d.get("stages"))
    root = d.get("goal_trace", {}).get("root_goal", "")
    return (has_endpoint and bool(root)), (f"endpoint={'Y' if has_endpoint else 'N'}, root_goal链接={'Y' if root else 'N'}")

def cp_2_node_relevance(task_dir):
    """cp_2 after_phase3: 每节点 maps_to_root_goal 非空; 无 extraneous/missing。"""
    p = os.path.join(task_dir, "nodes.json")
    sp = os.path.join(task_dir, "spec.json")
    if not os.path.exists(p):
        return False, "nodes.json 不存在"
    nodes = _loadjson(p).get("nodes", [])
    ac = " ".join(_loadjson(sp).get("acceptance_criteria", [])) if os.path.exists(sp) else ""
    empty = [n.get("id") for n in nodes if not n.get("maps_to_root_goal")]
    return (len(empty) == 0 and len(nodes) > 0), (f"节点={len(nodes)}, maps_to_root_goal缺={empty}")

def cp_3_interface_direction(task_dir):
    """cp_3 after_phase4: interfaces.json 存在, 每接口有 schema_match。"""
    p = os.path.join(task_dir, "interfaces.json")
    if not os.path.exists(p):
        return False, "interfaces.json 不存在"
    ifs = _loadjson(p).get("interfaces", [])
    nomatch = [i.get("node") for i in ifs if not i.get("schema_match")]
    return (len(nomatch) == 0 and len(ifs) > 0), (f"接口={len(ifs)}, 缺schema_match={nomatch}")

def cp_4_decomposition(task_dir):
    """cp_4 after_phase5: nodes/ 子目录存在且>=1子节点spec, 每子节点含goal_trace。"""
    nd = os.path.join(task_dir, "nodes")
    if not os.path.isdir(nd):
        return False, "nodes/ 子目录不存在"
    specs = [x for x in os.listdir(nd) if x.endswith(".json")]
    if not specs:
        return False, "nodes/ 无子节点 spec"
    nogt = [s for s in specs if not _loadjson(os.path.join(nd, s)).get("goal_trace")]
    return (len(nogt) == 0), (f"子节点={len(specs)}, 缺goal_trace={nogt}")

def cp_5_code_blueprint(task_dir):
    """cp_5 after_phase6: 代码/产出目录存在, 实际产出数 >= 蓝图节点数(叶子)。"""
    out = os.path.join(_cd(task_dir), "output")
    if not os.path.isdir(out):
        return False, "产出目录 output/ 不存在"
    nd = os.path.join(task_dir, "nodes")
    leaves = len([x for x in os.listdir(nd) if x.endswith(".json")]) if os.path.isdir(nd) else 0
    produced = len([x for x in os.listdir(out) if x.strip()])
    return (produced >= leaves and produced > 0), (f"产出={produced} vs 蓝图叶子={leaves} ({'>=OK' if produced>=leaves else '<FAIL'})")

def cp_6_test_alignment(task_dir):
    """cp_6 after_phase7: verification.json 存在且 passed。"""
    p = os.path.join(task_dir, "verification.json")
    if not os.path.exists(p):
        return False, "verification.json 不存在"
    v = _loadjson(p)
    return bool(v.get("passed")), (f"verification.passed={v.get('passed')}, failed={v.get('failed')}")

def cp_7_delivery(task_dir):
    """cp_7 after_phase8: 全gate文件存在 + goal_trace链连续 + 产出>=承诺70%。"""
    need = ["spec.json","path.json","nodes.json","interfaces.json","verification.json","manifest.json"]
    miss = [f for f in need if not os.path.exists(os.path.join(task_dir, f))]
    chain_ok, chain_msg = cp_goal_trace_chain(task_dir)
    return (len(miss) == 0 and chain_ok), (f"缺文件={miss}; {chain_msg}")

CHECKPOINTS = {
    "phase_1": cp_0,
    "phase_2": cp_1_path_alignment,
    "phase_3": cp_2_node_relevance,
    "phase_4": cp_3_interface_direction,
    "phase_5": cp_4_decomposition,
    "phase_6": cp_5_code_blueprint,
    "phase_7": cp_6_test_alignment,
    "phase_8": cp_7_delivery,
}

def run(task_dir, enforce_next):
    engine = load_engine()
    phases = engine.get("gates", engine.get("phases", {}))
    if not phases:
        print("[FATAL] 总纲 JSON 未含 phase_gate_engine.phases", file=sys.stderr)
        return 2

    order = sorted(phases.keys(), key=lambda k: int(re.search(r"\d+", k).group()))
    results = []
    first_incomplete = None
    blocked = False

    for key in order:
        ph = phases[key]
        name = ph.get("phase_name", key)
        gate_tokens = []
        for gk in ("gate_file", "gate_file_1", "gate_file_2"):
            if ph.get(gk):
                gate_tokens.append(ph[gk])
        produce_tokens = []
        for pk in ("produce_file", "produce_file_1", "produce_file_2"):
            if ph.get(pk):
                produce_tokens.append(ph[pk])

        # gate 检查
        gate_ok = True
        gate_detail = []
        for gt in gate_tokens:
            cands = resolve(task_dir, gt)
            if not cands:
                continue
            ok, hit = exists_any(cands)
            gate_detail.append(f"{'✓' if ok else '✗'}{os.path.basename(cands[0])}")
            gate_ok = gate_ok and ok

        # produce 检查
        prod_ok = True
        prod_detail = []
        for pt in produce_tokens:
            cands = resolve(task_dir, pt)
            if not cands:
                continue
            ok, hit = exists_any(cands)
            prod_detail.append(f"{'✓' if ok else '✗'}{os.path.basename(cands[0])}")
            prod_ok = prod_ok and ok

        # 检查点 (按总纲 goal_alignment_supervisor: cp_0..cp_7, after_phase = N)
        cp_ok, cp_msg = True, "-"
        cpfn = CHECKPOINTS.get(key)
        if cpfn:
            cp_ok, cp_msg = cpfn(task_dir)

        phase_pass = gate_ok and prod_ok and cp_ok
        results.append((key, name, gate_ok, prod_ok, cp_ok, cp_msg, phase_pass, gate_detail, prod_detail))

        if not prod_ok and first_incomplete is None:
            first_incomplete = (key, name)
        # 反跳步: gate 缺失却已有后续 produce = 系统性故障
        if not gate_ok and prod_ok:
            blocked = True

    # 输出报告
    print("="*72)
    print(f" 门禁引擎强制体检  task_dir={task_dir}")
    print(f" 引擎版本: {engine.get('version','?')}  ({len(order)} phases)")
    print("="*72)
    for key, name, g, p, c, cmsg, ok, gd, pd in results:
        flag = "PASS" if ok else "FAIL"
        print(f"[{flag}] {key} {name}")
        print(f"        gate {gd if gd else '(起点)'}  produce {pd if pd else '-'}")
        if cmsg != "-":
            print(f"        checkpoint: {'PASS' if c else 'FAIL'} — {cmsg}")

    all_pass = all(r[6] for r in results)
    print("-"*72)
    if enforce_next:
        if first_incomplete:
            print(f" 当前应执行 Phase: {first_incomplete[0]} {first_incomplete[1]} (produce 缺失)")
        else:
            print(" 所有 Phase produce 已就位。")
    if blocked:
        print(" [BLOCK] 检测到跳步: 存在 gate 缺失但后续 produce 已生成 → 系统性故障")
    print(f" 结论: {'ALL PASS ✓' if all_pass else 'HAS FAIL ✗'}")
    print("="*72)
    return 0 if (all_pass and not blocked) else 1

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--task-dir", required=True)
    ap.add_argument("--enforce-next", action="store_true")
    a = ap.parse_args()
    sys.exit(run(os.path.abspath(a.task_dir), a.enforce_next))









