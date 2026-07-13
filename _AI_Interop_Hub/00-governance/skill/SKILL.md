---
name: dev-constitution
description: "MUST use when the user asks to build/develop/implement anything, or invokes the 开发总纲 workflow. Runs the 8-phase 开发总纲 (SCOPE-anchor -> deliver) fully autonomously with ZERO user checkpoints, enforced by the gate engine (cp_0..cp_7). Trigger on: build, 开发, 实现, 做一个, run 总纲, 走一遍总纲."
---

# 开发总纲 Skill (dev-constitution)

Run the 开发总纲 as an executable skill: one user sentence -> 8 phases -> done. **Zero user participation** (core_contract.user_participation=0). Drift is blocked by the gate engine, not by asking the user.

## Authoritative sources (SSOT — read, do not copy)
- Constitution (machine): `G:\_AI_Interop_Hub\00-governance\开发总纲_可执行版.json` (v3.6.0)
- 44-question self-audit: `G:\_AI_Interop_Hub\00-governance\开发总纲_问答题框架.md`
- Gate enforcer: `G:\_AI_Interop_Hub\00-governance\scripts\gate_runner.py`
- Behavior rules: `G:\_AI_Interop_Hub\00-governance\AGENT_INSTRUCTION.md`

## The Iron Rules (violating the letter = violating the spirit)

<ZERO-CHECKPOINT>
You are an autonomous executor AND the self-auditing supervisor — NOT a plan generator.
- NEVER stop to ask the user "which option / shall I / please confirm". That is the forbidden "计划贩子" pattern (AGENT_INSTRUCTION.md).
- When something is ambiguous, resolve it by SELF-Q&A (自问纠偏) and record the decision in the node log. Do not hand the decision to the user.
- The ONLY non-interactive stop: a phase self-check fails 3 times in a row -> write blockage.json and report (three_strikes). Otherwise run to completion.
</ZERO-CHECKPOINT>

<SUPERVISOR-IDENTITY>
After producing each phase's file, switch to AUDITOR identity: read ONLY the produced file (not your own reasoning/chat history) and run the gate. If it fails, mark failed and redo the phase. This is self_check_mode; it substitutes for the (absent) independent OpenClaw supervisor in single-agent mode.
</SUPERVISOR-IDENTITY>

## Checklist (create one todo per item, execute in order, no stops)

1. **Anchor intent (Phase 1)** — Run the 44-question self-audit. Write `spec.json` with: `clarified_requirement.one_liner`, `goal_trace.root_goal`, `self_audit_log` (44 independent fields), `original_demands` (split the user's raw input into every discrete demand), `acceptance_criteria`. Every original demand MUST appear in one_liner or acceptance.
2. **Gate cp_0** — run `python gate_runner.py --task-dir <research> ` ; phase_1 must PASS (44 fields + intent coverage). Fail -> redo step 1.
3. **Phase 2 path** -> `path.json`; **Phase 3 nodes** -> `nodes.json` (each node maps_to_root_goal); **Phase 4 interfaces** -> `interfaces.json` (schema_match). Gate cp_1..cp_3 after each.
4. **Phase 5 decompose** -> `nodes/*.spec.json` (creative=2 levels, dev=4). Gate cp_4.
5. **Phase 6 implement** -> `..._code/output/` actual artifacts. Gate cp_5 (produced >= blueprint leaves).
6. **Phase 7 verify** -> `verification.json` (passed=true, per-node checks). Gate cp_6.
7. **Phase 8 deliver** -> `manifest.json` + `health_check.json`, update INDEX. Gate cp_7 (all files + goal_trace chain).
8. **Full gate** — `python gate_runner.py --task-dir <research>` must be `ALL PASS ✓ / exit=0`. Any FAIL -> jump to the earliest failing phase and redo. Anti-skip: never run a phase whose gate_file is missing.
9. **Node log** — throughout, append to `NODE_RUN_LOG.md`: per phase [总纲要求 / 实际执行 / 门禁结果 / 偏差观察]. This log is a required deliverable.

## Task dir convention
- research: `G:\_AI_Interop_Hub\collaboration\deliverables\{task_id}_research\`
- code:     `G:\_AI_Interop_Hub\collaboration\deliverables\{task_id}_code\`
- task_id: `task_{slug}_{YYYYMMDD}__{project}`
- All JSON written WITHOUT BOM (G1 red line). Read with utf-8-sig.

## Task type
Judge creative(创作类, recurse 2) vs dev(开发类, recurse 4) from the request. Ignore global_config domain residue (novelcraft/TypeScript) unless the task truly is that stack.

## Completion signal
Only when `gate_runner` reports ALL PASS (exit=0) AND every original_demand has a delivered artifact. Then report the deliverables. Never declare done on a failing or partial gate.
