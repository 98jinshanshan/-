# 三 IDE 通信通车指南

> 从 0 到 1，让三个 IDE 真正跑起来的步骤手册

---

## 一、前置条件

| 项 | 要求 |
|----|------|
| 操作系统 | Windows / macOS / Linux |
| Node.js | ≥ 14.0（`node -v` 检查） |
| 工作目录 | 三个 IDE 共享同一个工作区目录 |
| IDE 数量 | 至少 2 个（可以先测 2 个，再上第 3 个） |

---

## 二、Step 0：部署 V3.7 更新包

> **重要**：如果你的 `G:\_AI_Interop_Hub\00-governance\` 里还没有 `ide-bridge.js`，请先完成这一步。

### 方法一：一键更新（推荐）

1. 下载 `总纲更新包_V3.7.0_20260716.zip`
2. 解压到任意目录
3. 右键点击 `总纲更新_V3.7.0_一键更新.ps1` → **使用 PowerShell 运行**
4. 等待更新完成（会自动复制文件 + 安装依赖）

### 方法二：手动更新

```powershell
# 1. 解压更新包后，复制所有文件到目标目录
#    将 00-governance/ 下的所有文件复制到 G:\_AI_Interop_Hub\00-governance\

# 2. 安装依赖
cd G:\_AI_Interop_Hub\00-governance
npm install ws
```

### 验证部署成功

```powershell
cd G:\_AI_Interop_Hub\00-governance
dir ide-bridge.js
```

能看到 `ide-bridge.js` 文件 = 部署成功。

---

## 三、Step 1：启动消息中枢（IDE Bridge）

这是第一步——三个 IDE 都要连到同一个 Bridge 上。

### 3.1 启动 Bridge

```powershell
node ide-bridge.js
```

你会看到：
```
[IDE Bridge] 启动中...
[IDE Bridge] WebSocket 监听端口: 9527
[IDE Bridge] HTTP 状态接口: http://localhost:9528/status
```

**不要关闭这个终端窗口**——Bridge 要一直运行。

### 3.2 验证 Bridge 在线

打开浏览器访问：http://localhost:9528/status

你会看到 JSON 状态信息，说明 Bridge 在运行。

---

## 四、Step 2：跑自动化测试（验证通路）

**先不用管三个 IDE**，先用自动化测试验证 Bridge 本身工作正常。

### 4.1 新开一个终端

```powershell
cd G:\_AI_Interop_Hub\00-governance
node test-bridge-connection.js
```

### 4.2 你会看到的输出

```
========================================
  三 IDE 通信通车测试
========================================

Step 1: 三个角色连接 Bridge...
  ✓ OpenClaw 连接成功
  ✓ Codex 连接成功
  ✓ Cursor 连接成功
  ✓ 在线感知：OpenClaw 能看到其他角色上线

Step 2: Codex → OpenClaw 审核请求...
  ✓ OpenClaw 收到 Codex 的审核请求
  ✓ 消息信封完整：有 msg_id
  ✓ 消息信封完整：有 timestamp

Step 3: OpenClaw → Codex 审核结果...
  ✓ Codex 收到 OpenClaw 的审核结果
  ✓ 审核结果为 pass
  ✓ reply_to 关联正确

Step 4: OpenClaw → Cursor 下发实现任务...
  ✓ Cursor 收到 OpenClaw 的实现任务
  ✓ 任务类型为 implementation

Step 5: 广播消息（task.complete）...
  ✓ Codex 收到广播
  ✓ Cursor 收到广播

Step 6: 离线消息测试...
  ✓ Cursor 重连后收到离线消息

========================================
  结果: 18 通过 / 0 失败
========================================

🎉 通信通车成功！三 IDE 之间可以正常通信。
```

**如果全部通过** → 说明 Bridge 没问题，可以进 Step 3。
**如果有失败** → 检查 Bridge 终端有没有报错，或者端口被占用。

---

## 五、Step 3：在真实 IDE 中接入（逐步来）

不要一次上三个 IDE，**先上一个，再上一个，最后上第三个**。

### 5.1 第一个 IDE：OpenClaw（协调者）

**选择哪个 IDE 当 OpenClaw？** 选你最常盯着看的那个——因为它是"项目经理"，你要通过它看全局状态。

**接入步骤：**

1. 打开 IDE，打开工作目录 `G:\_AI_Interop_Hub`
2. 让 Agent 读取 `AGENT_INSTRUCTION.md`
3. 告诉 Agent："你是 OpenClaw 角色，即协调者+监督者。请连接 IDE Bridge：运行 ide-bridge-client.js 并注册 openclaw 角色。"
4. 检查 Bridge 终端——应该看到 `[IDE Bridge] openclaw 已上线`

**验证：** 浏览器访问 http://localhost:9528/status ，看到 `roles.openclaw = true`

### 5.2 第二个 IDE：Codex（研究员）

**接入步骤：**

1. 打开第二个 IDE 窗口，同样打开工作目录
2. 让 Agent 读取 `AGENT_INSTRUCTION.md`
3. 告诉 Agent："你是 Codex 角色，即研究员。请连接 IDE Bridge 并注册 codex 角色。"
4. 检查 Bridge 终端——应该看到 `[IDE Bridge] codex 已上线`

**发一条测试消息：**

让 Codex 的 Agent 说："通过 Bridge 给 OpenClaw 发一条测试消息，类型是 checkpoint.request，测试 Phase 1。"

然后看 OpenClaw 的 IDE 里有没有收到这条消息。

### 5.3 第三个 IDE：Cursor（开发者）

步骤同上，注册 `cursor` 角色。

---

## 五、Step 4：跑一次完整的迷你任务

三个 IDE 都在线后，可以跑一次极简流程：

### 5.1 发起任务

在 OpenClaw 的 IDE 里说：

> "分配一个测试任务给 Codex：Phase 1 意图锚定，任务内容是'写一个关于时间旅行的短篇故事大纲'。通过 Bridge 发 task.assign 给 codex。"

### 5.2 Codex 执行

Codex 的 Agent 会收到任务，执行 Phase 1，产出 spec.json，然后通过 Bridge 发审核请求给 OpenClaw。

### 5.3 OpenClaw 审核

OpenClaw 收到审核请求，检查 spec.json，回复 pass 或 fail。

### 5.4 继续推进

如果 Phase 1 通过了，Codex 继续 Phase 2... 以此类推。

Phase 5 完成后，OpenClaw 给 Cursor 发 `task.delegate`，让 Cursor 开始实现。

---

## 六、常见问题

### Q1：Bridge 启动失败，端口被占用？

```powershell
# 查看占用 9527 端口的进程
netstat -ano | findstr 9527
# 杀掉进程
taskkill /PID <进程号> /F
```

### Q2：IDE 里的 Agent 不会用 Bridge Client？

没关系，先手动测试。在 IDE 的终端里运行：

```powershell
node -e "const C=require('./ide-bridge-client');const b=new C('codex');b.connect();b.on('connect',()=>console.log('已连接，按 Ctrl+C 断开'));"
```

确认能连上之后，再教 Agent 怎么用。

### Q3：Agent 总是忘记发消息怎么办？

这就是为什么我们要做 Hooks 层——系统自动触发，不需要 Agent 记得。
当前阶段（V3.7），Hooks 层架构已定但未实现，Agent 需要主动调用 Bridge Client。
如果 Agent 经常忘，可以在 Prompt 里反复强调，或者等 Hooks 层实现后就彻底解决了。

### Q4：只想先测两个 IDE，可以吗？

可以。建议先测 **OpenClaw + Codex**，验证设计端能跑通。
Cursor 可以稍后接入。

### Q5：如何查看当前所有在线角色？

```powershell
curl http://localhost:9528/status
```

或者浏览器访问 http://localhost:9528/status

---

## 七、快速检查清单

通车前对照检查：

- [ ] V3.7 更新包已部署到 `G:\_AI_Interop_Hub\00-governance\`
- [ ] `npm install ws` 已执行
- [ ] `node ide-bridge.js` 正在运行
- [ ] `http://localhost:9528/status` 能访问
- [ ] `node test-bridge-connection.js` 全部通过
- [ ] OpenClaw IDE 已连接 Bridge
- [ ] Codex IDE 已连接 Bridge
- [ ] Cursor IDE 已连接 Bridge
- [ ] 跑过一次完整的迷你任务

---

**准备好了就从 Step 0 开始，有问题随时问。**