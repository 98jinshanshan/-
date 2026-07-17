#!/usr/bin/env node

/**
 * 三 IDE 通信通车测试脚本
 *
 * 用法：node test-bridge-connection.js
 *
 * 功能：模拟三个角色（OpenClaw / Codex / Cursor）同时连接 Bridge，
 *       跑一遍完整的消息流转，验证通信通路正常。
 */

const WebSocket = require('ws');

const BRIDGE_URL = 'ws://localhost:9527';
const TEST_TASK_ID = 'test_demo_' + Date.now();

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${detail ? '— ' + detail : ''}`);
  }
}

function createClient(role) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BRIDGE_URL);
    const received = [];
    let registered = false;

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'register', payload: { role, name: role.toUpperCase() } }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      // Bridge 返回的是信封格式：{ envelope: {...}, payload: {...} }
      // 统一提取类型
      const msgType = msg.envelope ? msg.envelope.type : msg.type;
      const normalized = {
        ...msg,
        type: msgType,
        msg_id: msg.envelope ? msg.envelope.msg_id : msg.msg_id,
        timestamp: msg.envelope ? msg.envelope.timestamp : msg.timestamp,
        from: msg.envelope ? msg.envelope.from : msg.from,
        to: msg.envelope ? msg.envelope.to : msg.to,
        reply_to: msg.envelope ? msg.envelope.reply_to : msg.reply_to,
      };
      received.push(normalized);

      if (msgType === 'presence.list' && !registered) {
        registered = true;
        resolve({ ws, received });
      }
    });

    ws.on('error', (err) => {
      reject(err);
    });

    setTimeout(() => {
      if (!registered) reject(new Error(`${role} 连接超时`));
    }, 3000);
  });
}

async function runTest() {
  console.log('========================================');
  console.log('  三 IDE 通信通车测试');
  console.log('========================================');
  console.log('');

  // ========== Step 1: 三角色连接 ==========
  console.log('Step 1: 三个角色连接 Bridge...');

  let openclaw, codex, cursor;
  try {
    [openclaw, codex, cursor] = await Promise.all([
      createClient('openclaw'),
      createClient('codex'),
      createClient('cursor'),
    ]);
  } catch (err) {
    console.log(`  ✗ 连接失败: ${err.message}`);
    console.log('\n  请确认 Bridge 已启动: node ide-bridge.js');
    process.exit(1);
  }

  check('OpenClaw 连接成功', openclaw.ws.readyState === WebSocket.OPEN);
  check('Codex 连接成功', codex.ws.readyState === WebSocket.OPEN);
  check('Cursor 连接成功', cursor.ws.readyState === WebSocket.OPEN);

  // 等一下让 presence 同步完成
  await new Promise(r => setTimeout(r, 500));

  const openclawPresence = openclaw.received.filter(m => m.type === 'presence.online').length;
  check('在线感知：OpenClaw 能看到其他角色上线', openclawPresence >= 2);

  console.log('');

  // ========== Step 2: Codex → OpenClaw 审核请求 ==========
  console.log('Step 2: Codex → OpenClaw 审核请求...');

  codex.ws.send(JSON.stringify({
    type: 'checkpoint.request',
    from: 'codex',
    to: 'openclaw',
    payload: {
      checkpoint_id: 'cp_0',
      phase: 1,
      phase_name: '意图锚定',
      task_id: TEST_TASK_ID,
      artifact: 'spec.json',
      artifact_path: '/test/spec.json',
    }
  }));

  await new Promise(r => setTimeout(r, 300));

  const ocReq = openclaw.received.find(
    m => m.type === 'checkpoint.request' && m.from === 'codex'
  );
  check('OpenClaw 收到 Codex 的审核请求', !!ocReq,
    ocReq ? '' : '未收到 checkpoint.request');
  if (ocReq) {
    check('消息信封完整：有 msg_id', !!ocReq.msg_id);
    check('消息信封完整：有 timestamp', !!ocReq.timestamp);
  }

  console.log('');

  // ========== Step 3: OpenClaw → Codex 审核通过 ==========
  console.log('Step 3: OpenClaw → Codex 审核结果...');

  const reqMsgId = ocReq ? ocReq.msg_id : null;
  openclaw.ws.send(JSON.stringify({
    type: 'checkpoint.result',
    from: 'openclaw',
    to: 'codex',
    reply_to: reqMsgId,
    payload: {
      checkpoint_id: 'cp_0',
      phase: 1,
      task_id: TEST_TASK_ID,
      result: 'pass',
      automated_checks: { file_exists: true, has_44_fields: true },
    }
  }));

  await new Promise(r => setTimeout(r, 300));

  const codexResult = codex.received.find(
    m => m.type === 'checkpoint.result' && m.from === 'openclaw'
  );
  check('Codex 收到 OpenClaw 的审核结果', !!codexResult);
  if (codexResult) {
    check('审核结果为 pass', codexResult.payload.result === 'pass');
    check('reply_to 关联正确', codexResult.reply_to === reqMsgId);
  }

  console.log('');

  // ========== Step 4: OpenClaw → Cursor 下发实现任务 ==========
  console.log('Step 4: OpenClaw → Cursor 下发实现任务...');

  openclaw.ws.send(JSON.stringify({
    type: 'task.delegate',
    from: 'openclaw',
    to: 'cursor',
    payload: {
      task_id: TEST_TASK_ID,
      task_type: 'implementation',
      design_dir: '/test/research/',
      spec_path: '/test/research/spec.json',
    }
  }));

  await new Promise(r => setTimeout(r, 300));

  const cursorTask = cursor.received.find(
    m => m.type === 'task.delegate' && m.from === 'openclaw'
  );
  check('Cursor 收到 OpenClaw 的实现任务', !!cursorTask);
  if (cursorTask) {
    check('任务类型为 implementation', cursorTask.payload.task_type === 'implementation');
  }

  console.log('');

  // ========== Step 5: 广播测试 ==========
  console.log('Step 5: 广播消息（task.complete）...');

  openclaw.ws.send(JSON.stringify({
    type: 'task.complete',
    from: 'openclaw',
    to: 'broadcast',
    payload: {
      task_id: TEST_TASK_ID,
      summary: '测试任务完成，10章 23,168字',
    }
  }));

  await new Promise(r => setTimeout(r, 300));

  const codexBroadcast = codex.received.find(m => m.type === 'task.complete');
  const cursorBroadcast = cursor.received.find(m => m.type === 'task.complete');
  check('Codex 收到广播', !!codexBroadcast);
  check('Cursor 收到广播', !!cursorBroadcast);

  console.log('');

  // ========== Step 6: 离线消息测试 ==========
  console.log('Step 6: 离线消息测试...');

  // 关闭 Cursor
  cursor.ws.close();
  await new Promise(r => setTimeout(r, 300));

  // 发一条给 Cursor 的消息（它现在离线了）
  openclaw.ws.send(JSON.stringify({
    type: 'checkpoint.result',
    from: 'openclaw',
    to: 'cursor',
    payload: { checkpoint_id: 'cp_5', phase: 6, result: 'pass', task_id: TEST_TASK_ID }
  }));

  await new Promise(r => setTimeout(r, 300));

  // Cursor 重新连接
  const cursor2 = await createClient('cursor');
  await new Promise(r => setTimeout(r, 500));

  const offlineMsg = cursor2.received.find(
    m => m.type === 'checkpoint.result' && m.payload.checkpoint_id === 'cp_5'
  );
  check('Cursor 重连后收到离线消息', !!offlineMsg);

  cursor2.ws.close();

  console.log('');

  // ========== 清理 ==========
  openclaw.ws.close();
  codex.ws.close();

  // ========== 结果 ==========
  console.log('========================================');
  console.log(`  结果: ${passed} 通过 / ${failed} 失败`);
  console.log('========================================');

  if (failed === 0) {
    console.log('\n🎉 通信通车成功！三 IDE 之间可以正常通信。');
    console.log('\n下一步：在三个真实 IDE 中分别配置 Bridge Client，');
    console.log('        参考文档：三IDE角色自动化联通协议_V2.1.md');
  } else {
    console.log('\n⚠️  有测试项未通过，请检查 Bridge 日志。');
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error('测试异常:', err.message);
  process.exit(1);
});