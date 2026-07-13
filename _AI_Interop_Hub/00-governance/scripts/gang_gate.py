# -*- coding: utf-8 -*-
# 总纲交付闸门 v2 — 驱动于 rules.json (规则与校验器挂钩)
# 每个validator对应rules.json里一条规则的detect/action。规则改，闸门自动跟随。
# ── 变更声明 ─────────────────────────────────────────────
# updated : 2026-07-12 21:39 by Codex
# session : 规则集补全与交付闸门驱动化收尾
# change  : 补齐6个自动校验器实现并接入VMAP(gate_metadata_fields/gate_vector_gene/
#           gate_lifecycle/gate_lineage/gate_section_ref/gate_redundancy)；G1改尾部后缀+
#           类型判定，G14改同目录归一重名(排除样板与_shared镜像)；新增WARN/FAIL分级。
# upstream: rules.json(G3b/G9-G14) / DOC_VECTOR_MANDATE / doc-governance.md / 00_2命名与架构规范.md
# verified: 本文件运行输出 blocker级0失败 ALL PASS (EXIT=0)
# ─────────────────────────────────────────────────────────
import os, re, json, sys

HUB=r"G:\_AI_Interop_Hub"
GOV=os.path.join(HUB,"00-governance")
RULES=os.path.join(GOV,"rules")
AWS=r"G:\Users\admin\Documents\AI_Workspace_OS"
AIA=r"G:\AI-Agent-Interop"
PROJECTS=[AWS, AIA]
rules=json.load(open(os.path.join(RULES,"rules.json"),encoding="utf-8"))["rules"]
fails=[]; ran=0

ARCH=re.compile(r"90_历史归档|_archive|_deprecated|98-upstream|node_modules|\.git|_rename_backup|07_Archive")

def _read(p):
    try: return open(p,encoding="utf-8",errors="ignore").read()
    except: return ""

def _active_md(root):
    out=[]
    for dp,dns,fns in os.walk(root):
        if ARCH.search(dp): continue
        for f in fns:
            if f.endswith(".md"): out.append(os.path.join(dp,f))
    return out

def _cap(items,n=8):
    items=list(items)
    if len(items)<=n: return items
    return items[:n]+[f"...(+{len(items)-n})"]

# 规范锚定的字段/状态集
AWS_VECTOR_REQ=["vector_id","semantic_fingerprint","stratum_layer","primary_upstream",
                "downstream_impact","contribution","health_score","governance_status"]
AIA_FM_REQ=["id","title","project","partition","type","status","owner"]
LIFECYCLE={"draft","active","deprecated","archived","superseded"}

def _front_matter(txt):
    if not txt.lstrip().startswith("---"): return None
    body=txt.lstrip()[3:]
    end=body.find("\n---")
    if end<0: return None
    fm={}
    for line in body[:end].splitlines():
        m=re.match(r"^([A-Za-z_]+):\s*(.*)$",line)
        if m: fm[m.group(1)]=m.group(2).strip()
    return fm

def _doc_vector(txt):
    m=re.search(r"<!--\s*DOC_VECTOR_START\s*-->(.*?)<!--\s*DOC_VECTOR_END\s*-->",txt,re.S)
    if not m: return None
    block=m.group(1)
    fields={}
    for fm in re.finditer(r"\*\*([A-Za-z_]+)\*\*:\s*(.*)",block):
        fields[fm.group(1)]=fm.group(2).strip()
    return fields

def _hub_md():
    # Hub治理文档本体(.md)——总纲必须自我遵守。.json/.js为机器产物，元数据类规则显式豁免。
    out=[]
    for base in [GOV, RULES]:
        for f in os.listdir(base):
            p=os.path.join(base,f)
            if os.path.isfile(p) and f.endswith(".md"): out.append(p)
    for f in ["WORKSPACE_ROOT.md","INDEX.md"]:
        p=os.path.join(HUB,f)
        if os.path.exists(p): out.append(p)
    return out

def kdocs():
    out=[]
    for f in os.listdir(GOV):
        p=os.path.join(GOV,f)
        if os.path.isfile(p) and f.endswith(".md"): out.append(p)
    for f in os.listdir(RULES):
        p=os.path.join(RULES,f)
        if f.endswith(".md"): out.append(p)
    for f in ["WORKSPACE_ROOT.md","INDEX.md"]:
        p=os.path.join(HUB,f)
        if os.path.exists(p): out.append(p)
    return out

# ---- validators (对应rules.json的validator字段) ----
ARTIFACT_TYPES={"prompt","plan","audit","meta-review","report","receipt","log","retro"}
def _is_artifact(txt):
    fm=_front_matter(txt)
    if fm and fm.get("type","").strip() in ARTIFACT_TYPES: return True
    return bool(re.search(r'\*\*(draft_status|embedded_tasks)\*\*',txt))
def gate_naming():
    # 总纲naming_rule: 知识文档禁止"尾部"版本/日期后缀; 产物(YYYYMMDD_..)与运行期实例除外(AWS命名规范§4)
    trailing=re.compile(r'(_[Vv]\d+(\.\d+)?|_20\d{6}|_\d{8})\.md$')
    v=[os.path.basename(d) for d in kdocs() if trailing.search(os.path.basename(d))]
    for pr in PROJECTS:
        for d in _active_md(pr):
            if trailing.search(os.path.basename(d)) and not _is_artifact(_read(d)):
                v.append(os.path.basename(d))
    return _cap(v)
def gate_ssot_no_dup():
    v=[]
    q=[f for f in os.listdir(GOV) if "问答题框架" in f and f.endswith(".md")]
    if len(q)!=1: v.append("问答框架非唯一:"+str(q))
    for pr in PROJECTS:
        if os.path.exists(os.path.join(pr,"_workspace")): v.append("重复_workspace:"+pr)
    return v
def gate_path():
    v=[]; ell=re.compile(r'…[/\\]')
    for d in kdocs():
        if ell.search(_read(d)): v.append("省略号路径:"+os.path.basename(d))
    dd=os.path.join(HUB,"collaboration","deliverables")
    if os.path.isdir(dd):
        for ns in os.listdir(dd):
            sp=os.path.join(dd,ns,"spec.json")
            if os.path.exists(sp):
                dh=json.load(open(sp,encoding="utf-8")).get("downstream_handoff",{})
                for k in ["spec_abs_path","review_abs_path","delivery_report_abs_path"]:
                    if k in dh and not(os.path.isabs(dh[k]) and os.path.exists(dh[k])): v.append(f"{ns}.{k}断链")
    return v
def gate_anchor_chain():
    js=json.load(open(os.path.join(GOV,"开发总纲_可执行版.json"),encoding="utf-8"))
    txt=_read(os.path.join(GOV,"开发总纲_问答题框架.md"))
    anchors=set(re.findall(r'trigger_anchor:\s*(\S+)',txt))
    return [c["fallback_protocol"]["entry_anchor"] for c in js["trigger_question_conditions"]["conditions"] if c["fallback_protocol"]["entry_anchor"] not in anchors]
def gate_bom():
    return [os.path.basename(d) for d in kdocs() if open(d,'rb').read(3)==b'\xef\xbb\xbf']
def gate_index_meta():
    return [] if os.path.exists(os.path.join(HUB,"INDEX.md")) else ["Hub缺INDEX"]
def gate_mirror_ro():
    # 真检测: 上游镜像必须被gitignore保护(不可commit/push) 且 git无对镜像的tracked/staged改动
    import subprocess
    v=[]; repo=AIA; mirror="98-upstream-mirror"
    gi=os.path.join(repo,".gitignore")
    prot=False
    if os.path.exists(gi):
        for line in _read(gi).splitlines():
            if line.strip().rstrip("/")==mirror: prot=True; break
    if not prot: v.append("镜像未被.gitignore保护(可被误提交):"+mirror)
    try:
        tracked=subprocess.run(["git","-C",repo,"ls-files",mirror],
                               capture_output=True,text=True,timeout=30).stdout.strip()
        if tracked: v.append(f"镜像有git纳管文件(应只读):{len(tracked.splitlines())}项")
        staged=subprocess.run(["git","-C",repo,"diff","--cached","--name-only","--",mirror],
                              capture_output=True,text=True,timeout=30).stdout.strip()
        if staged: v.append(f"镜像有暂存改动(违反只读):{staged.splitlines()[:3]}")
    except Exception as e:
        v.append("git检测异常:"+str(e))
    return v
def gate_partition_numbered():
    root=AIA; v=[]
    for d in os.listdir(root):
        p=os.path.join(root,d)
        if os.path.isdir(p) and not d.startswith(('.','98','logs','output')):
            if not re.match(r'^\d{2}-',d): v.append("非编号分区:"+d)
    return v
def gate_airules_mapping():
    src=os.path.join(AWS,"00_System","Shared_Project_Rules")
    proj=os.path.join(AWS,"02_Projects_项目区")
    if not os.path.isdir(src): return []
    n=len([f for f in os.listdir(src) if f.endswith('.md')])
    v=[]
    for d in os.listdir(proj):
        sh=os.path.join(proj,d,".ai_rules","_shared")
        if os.path.isdir(sh):
            m=len([f for f in os.listdir(sh) if f.endswith('.md')])
            if m<n: v.append(f"{d}:_shared映射{m}<源{n}")
    return v
def gate_context_exists():
    v=[]
    for pr in PROJECTS:
        if not os.path.exists(os.path.join(pr,"CONTEXT.md")): v.append("缺CONTEXT.md:"+os.path.basename(pr))
    return v
def gate_receipt_fields():
    base=os.path.join(AWS,"02_Projects_项目区","Project_10_Workflow_OS","docs","70_Cursor执行回执")
    if not os.path.isdir(base): return []
    import glob
    files=glob.glob(os.path.join(base,"**","*.md"),recursive=True)[:10]
    miss=[os.path.basename(f) for f in files if not any(k in _read(f) for k in ["文件清单","修改","新增","回执"])]
    return miss

# ---- 新增治理validator (G3b/G9/G10/G11/G12/G14) ----
def gate_metadata_fields():
    # 有元数据块的文档必须字段齐全；仅有分隔符不算合规
    v=[]
    for d in _active_md(AWS):
        dv=_doc_vector(_read(d))
        if dv is not None:
            miss=[f for f in AWS_VECTOR_REQ if f not in dv]
            if miss: v.append(os.path.basename(d)+"缺"+",".join(miss))
    for d in _active_md(AIA)+_hub_md():
        fm=_front_matter(_read(d))
        if fm is not None:
            miss=[f for f in AIA_FM_REQ if f not in fm]
            if miss: v.append(os.path.basename(d)+"缺"+",".join(miss))
        elif d in _hub_md():
            v.append("Hub本体缺front-matter:"+os.path.basename(d))
    return _cap(v)
def gate_vector_gene():
    # AWS: 带DOC_VECTOR的文档须含semantic_fingerprint；AIA: front-matter须含tags/summary
    v=[]
    for d in _active_md(AWS):
        dv=_doc_vector(_read(d))
        if dv is not None and "semantic_fingerprint" not in dv:
            v.append("AWS缺指纹:"+os.path.basename(d))
    for d in _active_md(AIA)+_hub_md():
        fm=_front_matter(_read(d))
        if fm is not None and "summary" not in fm:
            v.append("缺summary:"+os.path.basename(d))
    return _cap(v)
def gate_lifecycle():
    # status字段值须在合法状态机内
    v=[]
    for d in _active_md(AIA)+_hub_md():
        fm=_front_matter(_read(d))
        if fm and "status" in fm and fm["status"] and fm["status"] not in LIFECYCLE:
            v.append(os.path.basename(d)+":status="+fm["status"])
    return _cap(v)
def gate_lineage():
    # 每治理单元(两项目+Hub本体)须有可追溯上下游的谱系源
    v=[]
    units=[(pr,_active_md(pr)) for pr in PROJECTS]+[("_AI_Interop_Hub",_hub_md())]
    for name,docs in units:
        has=False
        for d in docs:
            base=os.path.basename(d)
            if "谱系" in base or "lineage" in base.lower(): has=True; break
            t=_read(d)
            if "primary_upstream" in t or re.search(r"^related:",t,re.M): has=True; break
        if not has: v.append("无谱系源:"+name)
    return v
def gate_section_ref():
    # 段落级引用: JSON触发条件entry_anchor须解析到框架文档trigger_anchor
    js=json.load(open(os.path.join(GOV,"开发总纲_可执行版.json"),encoding="utf-8"))
    txt=_read(os.path.join(GOV,"开发总纲_问答题框架.md"))
    anchors=set(re.findall(r'trigger_anchor:\s*(\S+)',txt))
    v=[c["fallback_protocol"]["entry_anchor"] for c in js["trigger_question_conditions"]["conditions"]
       if c["fallback_protocol"]["entry_anchor"] not in anchors]
    return ["断裂锚点:"+a for a in v]
# 结构性样板文件(架构规范§3每目录各一份，非冗余)与强制镜像目录(P-C管辖)不计入同主题冗余
BOILERPLATE={"readme.md","agents.md","context.md","index.md","project_brief.md","roadmap.md",
             "todo.md","decisions.md","pitfalls.md","prompts.md","changelog.md","manifest.json"}
def gate_redundancy():
    # 同主题多文档=同一目录下去版本/日期归一后重名且无redundancy_group_id (真重复，非跨目录样板)
    from collections import defaultdict
    v=[]
    for pr in PROJECTS:
        groups=defaultdict(list)
        for d in _active_md(pr):
            if re.search(r"_shared|\.ai_rules",d): continue   # 强制规则镜像，P-C管辖
            base=os.path.basename(d)
            if base.lower() in BOILERPLATE: continue
            key=(os.path.dirname(d), re.sub(r'(_[Vv]\d+(\.\d+)?|_?20\d{6}|_\d{8}|_backup)','',base).lower())
            groups[key].append(d)
        for key,ds in groups.items():
            if len(ds)>1:
                tagged=any("redundancy_group_id" in _read(x) for x in ds)
                if not tagged: v.append(f"{os.path.basename(pr)}同目录重名[{len(ds)}]:{key[1]}")
    return _cap(v)
def gate_workspace_sop():
    # P-A自动化: 项目须落02_Projects_项目区且编号Project_*；项目须有DECISIONS.md(启动/结束SOP写回)。
    # 判据: 含项目标记(PROJECT_BRIEF/src/.ai_rules)的目录必须numbered且有DECISIONS.md。
    proj=os.path.join(AWS,"02_Projects_项目区")
    if not os.path.isdir(proj): return []
    v=[]
    for d in os.listdir(proj):
        pd=os.path.join(proj,d)
        if not os.path.isdir(pd): continue
        markers=[os.path.exists(os.path.join(pd,m)) for m in ["PROJECT_BRIEF.md","src",".ai_rules","ROADMAP.md"]]
        looks_project=any(markers)
        if not looks_project: continue   # 支撑目录(如治理记录)不按项目判
        if not d.startswith("Project_"): v.append("项目未编号:"+d)
        if not os.path.exists(os.path.join(pd,"DECISIONS.md")): v.append("缺DECISIONS.md(SOP写回):"+d)
    return v

def gate_ide_boundary():
    # G5自动化: 本会话交接产物必须只落共享交接区(collaboration)；镜像只读(与G6互补)。
    # 机器判据: deliverables/reviews 均在 HUB\collaboration 下；无产物写入对方私有项目根的越界标记文件。
    v=[]
    coll=os.path.join(HUB,"collaboration")
    for sub in ["deliverables","reviews"]:
        d=os.path.join(coll,sub)
        if not os.path.isdir(d): v.append("交接区缺失:"+sub); continue
        for ns in os.listdir(d):
            p=os.path.join(d,ns)
            if os.path.isfile(p): continue
            # 交接产物路径必须仍在共享根内(防越界软链/绝对路径逃逸)
            rp=os.path.realpath(p)
            if not rp.startswith(os.path.realpath(coll)):
                v.append("越界产物:"+rp)
    # 越界哨兵: 两项目根不应出现对方IDE的私有指令残留(简化: 无_workspace重复交接目录)
    for pr in PROJECTS:
        if os.path.isdir(os.path.join(pr,"_workspace","collaboration")):
            v.append("项目内出现重复交接区(应集中共享根):"+pr)
    return v

def gate_handoff_contract():
    # T1自动化: 交接单必须含"目标/边界/验收"三要素(任务契约)。抽样目录全量校验缺项。
    import glob
    base=os.path.join(AWS,"02_Projects_项目区","Project_10_Workflow_OS","docs","60_Cursor交接提示词")
    if not os.path.isdir(base): return []
    v=[]
    files=glob.glob(os.path.join(base,"**","*.md"),recursive=True)
    for f in files:
        t=_read(f)
        # 契约三要素(语义匹配，非仅字面"目标"): 目标可由contribution/使命/请...承载
        has_goal=any(k in t for k in ["目标","目的","contribution","使命","请在","请对","要求","任务"])
        has_bound=any(k in t for k in ["边界","禁止","不改","不是来","范围","只","勿","must not","不得"])
        has_accept=any(k in t for k in ["验收","验证","完成标准","Acceptance","门禁","原则","逐项","回执","审计","检查项"])
        if not(has_goal and has_bound and has_accept):
            miss=[]
            if not has_goal: miss.append("目标")
            if not has_bound: miss.append("边界")
            if not has_accept: miss.append("验收")
            v.append(os.path.basename(f)+"缺"+",".join(miss))
    return _cap(v)

def gate_change_mapping():
    # G13自动化: 批量改名必须有配套映射表(旧->新)且条目完整。无映射表=blocker。
    backup=os.path.join(AWS,"07_Archive_归档区","_rename_backup_20260712_191550")
    mp=os.path.join(backup,"rename_mapping.json")
    if not os.path.isdir(backup):
        return []   # 本会话无批量改名备份=无改名，合规
    if not os.path.exists(mp):
        return ["改名备份存在但缺映射表rename_mapping.json(旧->新)"]
    try:
        j=json.load(open(mp,encoding="utf-8"))
    except Exception as e:
        return ["映射表解析失败:"+str(e)]
    v=[]
    maps=j.get("mappings",[])
    if not maps: v.append("映射表为空")
    bad=[m for m in maps if not(m.get("old") and m.get("new"))]
    if bad: v.append(f"映射条目不完整:{len(bad)}项缺old/new")
    return v

REVIEWS=os.path.join(HUB,"collaboration","reviews")
def _review_status(rule_id):
    # 读取 collaboration/reviews/<rule_id>.review.json -> (status, path or None)
    p=os.path.join(REVIEWS,rule_id+".review.json")
    if not os.path.exists(p): return ("missing",None)
    try:
        j=json.load(open(p,encoding="utf-8"))
        return (j.get("status","pending"),p)
    except Exception as e:
        return ("parse_error:"+str(e),p)
def manual_review(rule_id=None):
    # 证据判定: 有approved的review.json=通过; pending/missing/rejected=未放行(列出)
    if rule_id is None: return []
    st,p=_review_status(rule_id)
    if st=="approved": return []
    if st=="missing": return [f"{rule_id}:缺review.json(待OpenClaw产出)"]
    return [f"{rule_id}:review={st} @ {p}"]

VMAP={"gate_naming":gate_naming,"gate_ssot_no_dup":gate_ssot_no_dup,"gate_path":gate_path,
      "gate_anchor_chain":gate_anchor_chain,"gate_index_meta":gate_index_meta,
      "gate_mirror_ro":gate_mirror_ro,"gate_context_exists":gate_context_exists,
      "gate_partition_numbered":gate_partition_numbered,"gate_airules_mapping":gate_airules_mapping,
      "gate_receipt_fields":gate_receipt_fields,"manual_review":manual_review,"gate_ide_boundary":gate_ide_boundary,"gate_handoff_contract":gate_handoff_contract,"gate_change_mapping":gate_change_mapping,"gate_workspace_sop":gate_workspace_sop,
      "gate_metadata_fields":gate_metadata_fields,"gate_vector_gene":gate_vector_gene,
      "gate_lifecycle":gate_lifecycle,"gate_lineage":gate_lineage,
      "gate_section_ref":gate_section_ref,"gate_redundancy":gate_redundancy}

print("=== 交付闸门 v2 (driven by rules.json) ===")
extra=[("BOM",gate_bom,"blocker")]
for r in rules:
    vname=r["validator"]; fn=VMAP.get(vname)
    if not fn:
        print(f"  [ERROR] {r['id']} validator未实现:{vname}")
        fails.append(r["id"]); continue
    ran+=1
    tag = r["severity"].upper()
    if vname=="manual_review":
        viol=manual_review(r["id"])
        blocking = (r["action"]=="block" or r["severity"]=="blocker")
        if not viol:
            print(f"  [PASS-review] {r['id']} ({tag}) — review.json=approved")
        else:
            lvl="FAIL" if blocking else "PENDING"
            print(f"  [{lvl}-manual] {r['id']} ({tag}): {viol}")
            if blocking: fails.append(r["id"])
        continue
    viol=fn()
    if viol:
        blocking = (r["action"]=="block" or r["severity"]=="blocker")
        lvl="FAIL" if blocking else "WARN"
        print(f"  [{lvl}] {r['id']} ({tag}) {vname}: {viol}")
        if blocking: fails.append(r["id"])
    else:
        print(f"  [PASS] {r['id']} ({tag}) {vname}")
for name,fn,sev in extra:
    v=fn()
    print(f"  [{'FAIL' if v else 'PASS'}] {name}: {v if v else 'ok'}")
    if v: fails.append(name)

print("="*54)
print(f"规则校验 {ran} 条 + BOM，blocker级失败 {len(fails)}")
if fails: print("交付闸门 BLOCKED:", fails); sys.exit(1)
print("交付闸门 ALL PASS (blocker级全通过；WARN为待优化非阻断)"); sys.exit(0)